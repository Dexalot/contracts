// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/IPortfolioBridge.sol";
import "./interfaces/IBridgeProvider.sol";
import "./interfaces/IMainnetRFQ.sol";

/**
 * @title PortfolioBridgeMain. Bridge aggregator and message relayer for mainnet using multiple different bridges
 * @notice The default bridge provider is LayerZero and it can't be disabled. Additional bridge providers
 * will be added as needed. This contract encapsulates all bridge provider implementations that Portfolio
 * doesn't need to know about. \
 * This contract does not hold any users funds. it is responsible for paying the bridge fees in form of
 * the chain’s gas token to 3rd party bridge providers whenever a new cross chain message is sent out by
 * the user. Hence the project deposit gas tokens to this contract. And the project can withdraw
 * the gas tokens from this contract whenever it finds it necessary.
 * @dev PortfolioBridgeSub & PortfolioSub are Dexalot Subnet contracts and they can't be deployed anywhere else.
 * Contracts with *Main* in their name can be deployed to any evm compatible blockchain.
 * Here are the potential flows:
 * DEPOSITS: \
 * PortfolioMain(Avax) => PortfolioBridgeMain(Avax) => BridgeProviderA/B/n => PortfolioBridgeSub => PortfolioSub \
 * PortfolioMain(Arb) => PortfolioBridgeMain(Arb) => BridgeProviderA/B/n => PortfolioBridgeSub => PortfolioSub \
 * PortfolioMain(Gun) => PortfolioBridgeMain(Gun) => BridgeProviderA/B/n => PortfolioBridgeSub => PortfolioSub \
 * WITHDRAWALS (reverse flows): \
 * PortfolioSub => PortfolioBridgeSub => BridgeProviderA/B/n => PortfolioBridgeMain(Avax) => PortfolioMain(Avax) \
 * PortfolioSub => PortfolioBridgeSub => BridgeProviderA/B/n => PortfolioBridgeMain(Arb) => PortfolioMain(Arb) \
 * PortfolioSub => PortfolioBridgeSub => BridgeProviderA/B/n => PortfolioBridgeMain(Gun) => PortfolioMain(Gun) \
 *
 * In addition, to be able to support cross chain trades for subnets like Gunzilla that only has their gas token
 * and no ERC20 available, we introduced a new flow where you provide the counter token in an L1 and receive your GUN
 * in Gunzilla network. Similarly you can sell your GUN in Gunzilla network and receive your counter token in any L1.
 * When Buying GUN from Avalanche with counter token USDC, USDC is kept in MainnetRFQ(Avax) and GUN is deposited
 * to the buyer's wallet via MainnetRFQ(Gun). The flow is : \
 * MainnetRFQ(Avax) => PortfolioBridgeMain(Avax) => BridgeProviderA/B/n => PortfolioBridgeMain(Gun) => MainnetRFQ(Gun) \
 * When Selling GUN from Gunzilla with counter token USDC. GUN is kept in MainnetRFQ(Gun) and USDC is deposited
 * to the buyer's wallet via MainnetRFQ(Avax) The flow is : \
 * MainnetRFQ(Gun) => PortfolioBridgeMain(Gun) => BridgeProviderA/B/n => PortfolioBridgeMain(Avax) => MainnetRFQ(Avax) \
 * The same flow can be replicated with any other L1 like Arb as well. \
 * PortfolioBridgeMain always sends the ERC20 Symbol from its own network and expects the same back
 * i.e USDt sent & received in Avalanche Mainnet whereas USDT is sent & received in Arbitrum.
 * Use multiple inheritance to add additional bridge implementations in the future. Currently LzApp only.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridgeMain is
    Initializable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlEnumerableUpgradeable,
    IPortfolioBridge
{
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    IPortfolio internal portfolio;
    IMainnetRFQ internal mainnetRfq;
    // Maps supported bridge providers to their contract implementations
    mapping(BridgeProvider => IBridgeProvider) public enabledBridges;
    // chainListOrgChainId => bridge type => bool mapping to control user pays fee for each destination and bridge
    mapping(uint32 => mapping(BridgeProvider => bool)) public userPaysFee;

    BridgeProvider internal defaultBridgeProvider; //Layer0
    uint32 internal defaultChainId; // c-chain for Dexalot L1, Dexalot L1 for other chains

    uint8 private constant XCHAIN_XFER_MESSAGE_VERSION = 2;

    // Controls actions that can be executed on the contract. PortfolioM or MainnetRFQ are the current users.
    bytes32 public constant BRIDGE_USER_ROLE = keccak256("BRIDGE_USER_ROLE");
    // Controls all bridge implementations access. Currently only LZ
    bytes32 public constant BRIDGE_ADMIN_ROLE = keccak256("BRIDGE_ADMIN_ROLE");
    // Symbol => chainListOrgChainId ==> bool mapping to control xchain swaps allowed symbols for each destination
    mapping(bytes32 => mapping(uint32 => bool)) public xChainAllowedDestinations;

    // storage gap for upgradeability
    uint256[50] __gap;
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event DefaultChainIdUpdated(uint32 destinationChainId);
    event UserPaysFeeForDestinationUpdated(BridgeProvider bridge, uint32 destinationChainId, bool userPaysFee);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure virtual override returns (bytes32) {
        return bytes32("4.0.0");
    }

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin, pauser and msg_sender role to the sender. Enable lz bridge contract as default.
     */
    function initialize(address _lzBridgeProvider, address _owner) external initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);

        defaultBridgeProvider = BridgeProvider.LZ;
        enabledBridges[BridgeProvider.LZ] = IBridgeProvider(_lzBridgeProvider);
    }

    /**
     * @notice  Pauses bridge operations
     * @dev     Only pauser can pause
     */
    function pause() external onlyRole(BRIDGE_USER_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpauses bridge operations
     * @dev     Only pauser can unpause
     */
    function unpause() external onlyRole(BRIDGE_USER_ROLE) {
        _unpause();
    }

    /**
     * @notice  Enables/disables given bridge. Default bridge's state can't be modified
     * @dev     Only admin can enable/disable bridge
     * @param   _bridge  Bridge to enable/disable
     * @param   _bridgeProvider  Address of bridge provider contract, 0 address if not exists
     */
    function enableBridgeProvider(BridgeProvider _bridge, address _bridgeProvider) external onlyRole(BRIDGE_USER_ROLE) {
        require(_bridge != defaultBridgeProvider || paused(), "PB-DBCD-01");
        enabledBridges[_bridge] = IBridgeProvider(_bridgeProvider);
    }

    /**
     * @param   _bridge  Bridge to check
     * @return  bool  True if bridge is enabled, false otherwise
     */
    function isBridgeProviderEnabled(BridgeProvider _bridge) external view override returns (bool) {
        return address(enabledBridges[_bridge]) != address(0);
    }

    /**
     * @notice Returns default bridge Provider
     * @return  BridgeProvider
     */
    function getDefaultBridgeProvider() external view override returns (BridgeProvider) {
        return defaultBridgeProvider;
    }

    /**
     * @notice Sets the default bridge Provider
     * @param   _bridge  Bridge Provider type
     */
    function setDefaultBridgeProvider(BridgeProvider _bridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bridge != defaultBridgeProvider, "PB-DBCD-01");
        defaultBridgeProvider = _bridge;
    }

    /**
     * @notice Returns Default Lz Destination chain
     * @return chainListOrgChainId Default Destination Chainlist.org Chain Id
     */
    function getDefaultDestinationChain() external view returns (uint32 chainListOrgChainId) {
        chainListOrgChainId = defaultChainId;
    }

    /**
     * @notice  Enables/disables a symbol for a given destination for cross chain swaps
     * @dev     Only admin can enable/disable
     * @param   _symbol  Symbol of the token
     * @param   _chainListOrgChainId  Remote Chainlist.org chainid
     * @param   _enable  True to enable, false to disable
     */
    function enableXChainSwapDestination(
        bytes32 _symbol,
        uint32 _chainListOrgChainId,
        bool _enable
    ) external onlyRole(BRIDGE_USER_ROLE) {
        xChainAllowedDestinations[_symbol][_chainListOrgChainId] = _enable;
    }

    /**
     * @notice  Sets trusted remote address for the cross-chain communication. I
     * @dev     Allow DEFAULT_ADMIN to set it multiple times.
     * @param   _bridge  Bridge
     * @param   _chainListOrgChainId  Remote Chainlist.org chainid
     * @param   _dstChainIdBridgeAssigned  Bytes32 chain id assigned by the bridge provider
     * @param   _remoteAddress  Remote contract address on the destination chain
     * @param   _userPaysFee  True if user must pay the bridge fee, false otherwise
     */
    function setTrustedRemoteAddress(
        BridgeProvider _bridge,
        uint32 _chainListOrgChainId,
        bytes32 _dstChainIdBridgeAssigned,
        bytes32 _remoteAddress,
        bool _userPaysFee
    ) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        IBridgeProvider bridgeContract = enabledBridges[_bridge];
        require(address(bridgeContract) != address(0), "PB-BCNE-01");
        userPaysFee[_chainListOrgChainId][_bridge] = _userPaysFee;
        bridgeContract.setRemoteChain(_chainListOrgChainId, _dstChainIdBridgeAssigned, _remoteAddress);
    }

    /**
     * @notice  Sets default destination chain id for the cross-chain communication
     * @dev     Allow DEFAULT_ADMIN to set it multiple times. For PortfolioBridgeSub it is avalanche C-Chain
     * For other blockchains it is Dexalot Subnet
     * @param   _chainListOrgChainId Default Destination Chainlist.org chainid
     */

    function setDefaultDestinationChain(uint32 _chainListOrgChainId) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_chainListOrgChainId > 0, "PB-DDNZ-01");
        defaultChainId = _chainListOrgChainId;
        emit DefaultChainIdUpdated(_chainListOrgChainId);
    }

    /**
     * @notice  Set whether a user must pay the bridge fee for message delivery at the destination chain
     * @dev     Only admin can set user pays fee for destination chain
     * @param   _bridge  Bridge
     * @param   _chainListOrgChainId Destination Chainlist.org chainid
     * @param   _userPaysFee  True if user must pay the bridge fee, false otherwise
     */
    function setUserPaysFeeForDestination(
        BridgeProvider _bridge,
        uint32 _chainListOrgChainId,
        bool _userPaysFee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        userPaysFee[_chainListOrgChainId][_bridge] = _userPaysFee;
        emit UserPaysFeeForDestinationUpdated(_bridge, _chainListOrgChainId, _userPaysFee);
    }

    /**
     * @notice  Wrapper for revoking roles
     * @dev     Only admin can revoke role. BRIDGE_ADMIN_ROLE will remove additional roles to the parent contract(s)
     * Currently LZ_BRIDGE_ADMIN_ROLE is removed from the LzApp
     * @param   _role  Role to revoke
     * @param   _address  Address to revoke role from
     */
    function revokeRole(
        bytes32 _role,
        address _address
    ) public override(AccessControlUpgradeable, IAccessControlUpgradeable) onlyRole(DEFAULT_ADMIN_ROLE) {
        // We need to have at least one admin in DEFAULT_ADMIN_ROLE
        if (_role == DEFAULT_ADMIN_ROLE) {
            require(getRoleMemberCount(_role) > 1, "PB-ALOA-01");
        } else if (_role == BRIDGE_USER_ROLE) {
            //Can't remove Portfolio from BRIDGE_USER_ROLE. Need to use setPortfolio
            require(getRoleMemberCount(_role) > 1, "PB-ALOA-02");
        }

        super.revokeRole(_role, _address);
        emit RoleUpdated("PORTFOLIOBRIDGE", "REMOVE-ROLE", _role, _address);
    }

    /**
     * @notice  Set portfolio address to grant role
     * @dev     Only admin can set portfolio address.
     * There is a one to one relationship between Portfolio and PortfolioBridgeMain.
     * @param   _portfolio  Portfolio address
     */
    function setPortfolio(address _portfolio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //Can't have multiple portfolio's using the same bridge
        if (hasRole(BRIDGE_USER_ROLE, address(portfolio))) super.revokeRole(BRIDGE_USER_ROLE, address(portfolio));
        portfolio = IPortfolio(_portfolio);
        grantRole(BRIDGE_USER_ROLE, _portfolio);
        addNativeToken();
    }

    /**
     * @notice  Set MainnetRFQ address and grant role
     * @dev     Only admin can set MainnetRFQ address.
     * There is a one to one relationship between MainnetRFQ and PortfolioBridgeMain.
     * @param   _mainnetRfq  MainnetRFQ address
     */
    function setMainnetRFQ(address payable _mainnetRfq) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //Can't have multiple mainnetRfq's using the same bridge
        if (hasRole(BRIDGE_USER_ROLE, address(mainnetRfq))) super.revokeRole(BRIDGE_USER_ROLE, address(mainnetRfq));
        mainnetRfq = IMainnetRFQ(_mainnetRfq);
        grantRole(BRIDGE_USER_ROLE, _mainnetRfq);
    }

    /**
     * @notice  Sets the bridge provider fee & gasSwapRatio per ALOT for the given token and usedForGasSwap flag
     * @dev     External function to be called by BRIDGE_ADMIN_ROLE
     * @param   _symbol  Symbol of the token
     * @param   _fee  Fee to be set
     * @param   _gasSwapRatio  Amount of token to swap per ALOT. Always set it to equivalent of 1 ALOT.
     * @param   _usedForGasSwap  bool to control the list of tokens that can be used for gas swap. Mostly majors
     */
    function setBridgeParam(
        bytes32 _symbol,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bool _usedForGasSwap
    ) external onlyRole(BRIDGE_ADMIN_ROLE) {
        portfolio.setBridgeParam(_symbol, _fee, _gasSwapRatio, _usedForGasSwap);
    }

    /**
     * @return  IPortfolio  Portfolio contract
     */
    function getPortfolio() external view override returns (IPortfolio) {
        return portfolio;
    }

    /**
     * @return  IMainnetRFQ  MainnetRFQ contract
     */
    function getMainnetRfq() external view override returns (IMainnetRFQ) {
        return mainnetRfq;
    }

    /**
     * @notice  Increments bridge nonce
     * @dev     Only portfolio can call
     * @param   _bridgeProvider  Bridge to increment nonce for
     * @param   _dstChainListOrgChainId Destination Chainlist.org chainid
     * @return  nonce  New nonce
     */
    function incrementOutNonce(
        IBridgeProvider _bridgeProvider,
        uint32 _dstChainListOrgChainId
    ) private view returns (uint64 nonce) {
        return _bridgeProvider.getOutboundNonce(_dstChainListOrgChainId) + 1;
    }

    /**
     * @notice   List of the tokens in the PortfolioBridgeMain
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view virtual override returns (bytes32[] memory) {
        return portfolio.getTokenList();
    }

    /**
     * @notice  Validates the symbol from portfolio and transaction type
     * @dev     This function is called both when sending & receiving a message.
     * Deposit/ Withdraw Tx can only be done with non-virtual tokens.
     * When using CCTRADE received token has to be a non-virtual token at the destination,.
     * @param   _symbol  symbol of the token
     * @param   _transaction transaction type
     * @param   _direction direction of the message (SENT-0 || RECEIVED-1)
     */

    function validateSymbol(bytes32 _symbol, IPortfolio.Tx _transaction, Direction _direction) private view {
        //Validate the symbol
        IPortfolio.TokenDetails memory details = portfolio.getTokenDetails(_symbol);
        require(details.symbol != bytes32(0), "PB-ETNS-02");
        //Validate symbol & transaction type;
        if (_transaction == IPortfolio.Tx.CCTRADE && _direction == Direction.RECEIVED) {
            require(!details.isVirtual, "PB-CCTR-03"); // Virtual tokens can't be released to user
        } else if (_transaction == IPortfolio.Tx.WITHDRAW) {
            //Withdraw check only. Deposit check in Portfolio.depositToken
            require(!details.isVirtual, "PB-VTNS-02"); // Virtual tokens can't be withdrawn
        }
    }

    /**
     * @notice  Returns the bridgeFee charged by the bridge for the targetChainId.
     * @dev     The fee is in terms of current chain's gas token.
     * LZ charges based on the payload size and gas px at
     * @param   _bridge  Bridge
     * @param   _dstChainListOrgChainId  destination chain id
     *           _symbol  symbol of the token, not relevant in for this function
     *           _quantity quantity of the token, not relevant in for this function
     * @return  bridgeFee  bridge fee for the destination
     */

    function getBridgeFee(
        BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId,
        bytes32,
        uint256
    ) external view virtual override returns (uint256 bridgeFee) {
        IBridgeProvider bridgeProvider = enabledBridges[_bridge];
        require(address(bridgeProvider) != address(0), "PB-RBNE-03");
        bridgeFee = bridgeProvider.getBridgeFee(_dstChainListOrgChainId);
    }

    /**
     * @notice  Unpacks XChainMsgType & XFER message from the payload and returns the local symbol and symbolId
     * @dev     Currently only XChainMsgType.XFER possible. For more details on payload packing see packXferMessage
     * @param   _payload  Payload passed from the bridge
     * @return  xfer IPortfolio.XFER  Xfer Message
     */
    function unpackXFerMessage(bytes calldata _payload) external pure returns (IPortfolio.XFER memory xfer) {
        // There is only a single type in the XChainMsgType enum.
        bytes32[4] memory msgData = abi.decode(_payload, (bytes32[4]));
        uint256 slot0 = uint256(msgData[0]);
        // will revert if anything else other than XChainMsgType.XFER is passed
        XChainMsgType(uint16(slot0));
        slot0 >>= 16;
        xfer.transaction = IPortfolio.Tx(uint16(slot0));
        slot0 >>= 16;
        xfer.nonce = uint64(slot0);
        xfer.trader = address(uint160(slot0 >> 64));
        xfer.symbol = msgData[1];
        xfer.quantity = uint256(msgData[2]);
        xfer.timestamp = uint32(bytes4(msgData[3]));
        xfer.customdata = bytes28(uint224(uint256(msgData[3]) >> 32));
    }

    /**
     * @notice  Maps symbol to symbolId and encodes XFER message
     * @dev     It is packed as follows:
     * slot0: trader(20), nonce(8), transaction(2), XChainMsgType(2)
     * slot1: symbol(32)
     * slot2: quantity(32)
     * slot3: customdata(28), timestamp(4)
     * @param   _xfer  XFER message to encode
     * @return  message  Encoded XFER message
     */
    function packXferMessage(IPortfolio.XFER memory _xfer) private pure returns (bytes memory message) {
        bytes32 slot0 = bytes32(
            (uint256(uint160(_xfer.trader)) << 96) |
                (uint256(_xfer.nonce) << 32) |
                (uint256(uint16(_xfer.transaction)) << 16) |
                uint16(XChainMsgType.XFER)
        );
        bytes32 slot1 = bytes32(_xfer.symbol);
        bytes32 slot2 = bytes32(_xfer.quantity);
        bytes32 slot3 = bytes32((uint256(uint224(_xfer.customdata)) << 32) | uint32(_xfer.timestamp));
        message = bytes.concat(slot0, slot1, slot2, slot3);
    }

    /**
     * @notice  Wrapper function to send message to destination chain via bridge
     * @dev     Only BRIDGE_USER_ROLE can call (PortfolioMain or MainnetRFQ)
     * @param   _dstChainListOrgChainId the destination chain identifier
     * @param   _bridge  Bridge to send message to
     * @param   _xfer XFER message to send
     * @param   _userFeePayer  Address of the user who pays the bridge fee
     */
    function sendXChainMessage(
        uint32 _dstChainListOrgChainId,
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer,
        address _userFeePayer
    ) external payable virtual override nonReentrant whenNotPaused onlyRole(BRIDGE_USER_ROLE) {
        if (_xfer.transaction == IPortfolio.Tx.CCTRADE) {
            require(xChainAllowedDestinations[_xfer.symbol][_dstChainListOrgChainId], "PB-CCTR-02");
        }
        validateSymbol(_xfer.symbol, _xfer.transaction, Direction.SENT);
        sendXChainMessageInternal(_dstChainListOrgChainId, _bridge, _xfer, _userFeePayer);
    }

    /**
     * @notice  Actual internal function that implements the message sending.
     * @dev     Handles the fee payment and message sending to the bridge contract implementation
     * @param   _dstChainListOrgChainId the destination chain identifier
     * @param   _bridge  Bridge to send message to
     * @param   _xfer XFER message to send
     * @param   _userFeePayer  Address of the user who pays the bridge fee, zero address for PortfolioBridge
     */
    function sendXChainMessageInternal(
        uint32 _dstChainListOrgChainId,
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer,
        address _userFeePayer
    ) internal virtual {
        IBridgeProvider bridgeContract = enabledBridges[_bridge];
        require(address(bridgeContract) != address(0), "PB-RBNE-01");
        if (_xfer.nonce == 0) {
            _xfer.nonce = incrementOutNonce(bridgeContract, _dstChainListOrgChainId);
        }
        bytes memory _payload = packXferMessage(_xfer);
        bool isUserFeePayer = userPaysFee[_dstChainListOrgChainId][_bridge];
        IBridgeProvider.CrossChainMessageType msgType = getCrossChainMessageType(_xfer.transaction);
        uint256 fee = bridgeContract.getBridgeFee(_dstChainListOrgChainId, msgType);
        if (isUserFeePayer) {
            require(_userFeePayer != address(0), "PB-UFPE-01");
            require(msg.value >= fee, "PB-IUMF-01");
        } else if (_userFeePayer != address(0)) {
            (bool success, ) = _userFeePayer.call{value: msg.value}("");
            require(success, "PB-UFPR-01");
            require(address(this).balance > fee, "PB-CBIZ-01");
            // TODO: check if user fee payer logic is correct
            _userFeePayer = address(this);
        }
        bridgeContract.sendMessage{value: fee}(_dstChainListOrgChainId, _payload, msgType, _userFeePayer);
    }

    /**
     * @notice  Processes message received from source chain via bridge
     * @dev     Unpacks the message and updates the receival timestamp
     * @param   _bridge  Bridge to receive message from
     * @param   _srcChainListOrgChainId  Source chain ID
     * @param   _payload  Payload received
     */
    function processPayloadShared(
        BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        bytes calldata _payload
    ) internal returns (IPortfolio.XFER memory xfer) {
        require(address(enabledBridges[_bridge]) == msg.sender, "PB-RBNE-02");
        xfer = this.unpackXFerMessage(_payload);
        xfer.timestamp = block.timestamp; // log receival/process timestamp
        emit XChainXFerMessage(
            XCHAIN_XFER_MESSAGE_VERSION,
            _bridge,
            Direction.RECEIVED,
            _srcChainListOrgChainId,
            0,
            xfer
        );
    }

    function getCrossChainMessageType(
        IPortfolio.Tx _transaction
    ) private pure returns (IBridgeProvider.CrossChainMessageType) {
        if (_transaction == IPortfolio.Tx.CCTRADE) {
            return IBridgeProvider.CrossChainMessageType.CCTRADE;
        }
        if (_transaction == IPortfolio.Tx.DEPOSIT) {
            return IBridgeProvider.CrossChainMessageType.DEPOSIT;
        }
        if (_transaction == IPortfolio.Tx.WITHDRAW) {
            return IBridgeProvider.CrossChainMessageType.WITHDRAW;
        }
        revert("PB-GCMT-01");
    }

    /**
     * @notice  Processes message received from source chain via bridge in the host chain.
     * @dev     If bridge is disabled or PAUSED and there are messages in flight, we still need to
                process them when received at the destination. Only callable by the bridge implementation contracts.
                Overrides in the subnet
     * @param   _bridge  Bridge to receive message from
     * @param   _srcChainListOrgChainId  Source chain ID
     * @param   _payload  Payload received
     */
    function processPayload(
        BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        bytes calldata _payload
    ) external virtual {
        IPortfolio.XFER memory xfer = processPayloadShared(_bridge, _srcChainListOrgChainId, _payload);
        // check the validity of the symbol
        validateSymbol(xfer.symbol, xfer.transaction, Direction.RECEIVED);
        xfer.transaction == IPortfolio.Tx.CCTRADE
            ? mainnetRfq.processXFerPayload(xfer)
            : portfolio.processXFerPayload(xfer);
    }

    /**
     * @notice  Refunds the native balance inside contract
     * @dev     Only admin can call
     */
    function refundNative() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = (msg.sender).call{value: address(this).balance}("");
        require(sent, "PB-FRFD-01");
    }

    /**
     * @notice  private function that handles the addition of native token
     * @dev     gets the native token details from portfolio
     */
    function addNativeToken() internal virtual {}

    // solhint-enable no-empty-blocks

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    // we revert transaction if a non-existing function is called
    fallback() external payable {
        revert("PB-NFUN-01");
    }
}
