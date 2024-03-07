// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/IPortfolioBridge.sol";
import "./interfaces/IMainnetRFQ.sol";

import "./bridgeApps/LzApp.sol";

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
 * MainnetRFQ(Avax) => PortfolioBridgeMain(Avax) => BridgeProviderA/B/n => PortfolioBridgeMain(Gun) => MainnetRFQ(Gun) \
 * Buy GUN from Avalanche with counter token USDC. USDC is kept in MainnetRFQ(Avax) and GUN is deposited to the buyer's
 * wallet via MainnetRFQ(Gun)
 * MainnetRFQ(Gun) => PortfolioBridgeMain(Gun) => BridgeProviderA/B/n => PortfolioBridgeMain(Avax)  => MainnetRFQ(Avax) \
 * Sell GUN from Gunzilla with counter token USDC. GUN is kept in MainnetRFQ(Gun) and USDC is deposited to the buyer's
 * wallet via MainnetRFQ(Avax)
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
    IPortfolioBridge,
    LzApp
{
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    IPortfolio internal portfolio;
    IMainnetRFQ internal mainnetRfq;
    mapping(BridgeProvider => bool) public bridgeEnabled;
    mapping(uint32 => uint16) internal lzDestinationMap; // chainListOrgChainId ==> lzChainId

    BridgeProvider internal defaultBridgeProvider; //Layer0
    uint8 private constant XCHAIN_XFER_MESSAGE_VERSION = 2;

    // Controls actions that can be executed on the contract. PortfolioM or MainnetRFQ are the current users.
    bytes32 public constant BRIDGE_USER_ROLE = keccak256("BRIDGE_USER_ROLE");
    // Controls all bridge implementations access. Currently only LZ
    bytes32 public constant BRIDGE_ADMIN_ROLE = keccak256("BRIDGE_ADMIN_ROLE");
    // 128 bytes payload used for XFER Messages
    bytes private constant DEFAULT_PAYLOAD =
        "0x90f79bf6eb2c4f870365e785982e1f101e93b906000000000000000100000000414c4f543433313133000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000029a2241af62c00000000000000000000000000000000000000000000000000000000000065c5098c";
    // storage gap for upgradeability
    uint256[50] __gap;
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event DefaultChainIdUpdated(BridgeProvider bridge, uint32 destinationLzChainId);
    event GasForDestinationLzReceiveUpdated(
        BridgeProvider bridge,
        uint32 destinationChainId,
        uint256 gasForDestination
    );
    event UserPaysFeeForDestinationUpdated(BridgeProvider bridge, uint32 destinationChainId, bool userPaysFee);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure virtual override returns (bytes32) {
        return bytes32("3.1.1");
    }

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin, pauser and msg_sender role to the sender. Set gas for lz. Set endpoint and enable bridge
     * @param   _endpoint  Endpoint of the LZ bridge
     */
    function initialize(address _endpoint) external initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        lzEndpoint = ILayerZeroEndpoint(_endpoint);
        defaultBridgeProvider = BridgeProvider.LZ;
        bridgeEnabled[BridgeProvider.LZ] = true;
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
     * @param   _enable  True to enable, false to disable
     */
    function enableBridgeProvider(BridgeProvider _bridge, bool _enable) external override onlyRole(BRIDGE_USER_ROLE) {
        require(_bridge != defaultBridgeProvider, "PB-DBCD-01");
        bridgeEnabled[_bridge] = _enable;
    }

    /**
     * @param   _bridge  Bridge to check
     * @return  bool  True if bridge is enabled, false otherwise
     */
    function isBridgeProviderEnabled(BridgeProvider _bridge) external view override returns (bool) {
        return bridgeEnabled[_bridge];
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
     * @param   _bridge  Bridge
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
        if (defaultBridgeProvider == BridgeProvider.LZ) {
            chainListOrgChainId = remoteParams[defaultLzRemoteChainId].chainListOrgChainId;
        }
    }

    /**
     * @notice  Sets trusted remote address for the cross-chain communication. It also sets the defaultLzDestination
     * if it is not setup yet.
     * @dev     Allow DEFAULT_ADMIN to set it multiple times.
     * @param   _bridge  Bridge
     * @param   _dstChainIdBridgeAssigned  Remote chain id
     * @param   _remoteAddress  Remote contract address
     * @param   _chainListOrgChainId  Remote Chainlist.org chainid
     * @param   _gasForDestination  max gas that can be used at the destination chain after message delivery
     */
    function setTrustedRemoteAddress(
        BridgeProvider _bridge,
        uint32 _dstChainIdBridgeAssigned,
        bytes calldata _remoteAddress,
        uint32 _chainListOrgChainId,
        uint256 _gasForDestination,
        bool _userPaysFee
    ) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_bridge == BridgeProvider.LZ) {
            uint16 _dstChainId = uint16(_dstChainIdBridgeAssigned);
            lzTrustedRemoteLookup[_dstChainId] = abi.encodePacked(_remoteAddress, address(this));
            lzDestinationMap[_chainListOrgChainId] = _dstChainId;
            Destination storage destination = remoteParams[_dstChainId];
            destination.lzRemoteChainId = _dstChainId;
            destination.chainListOrgChainId = _chainListOrgChainId;
            destination.gasForDestination = _gasForDestination;
            destination.userPaysFee = _userPaysFee;
            if (defaultLzRemoteChainId == 0) {
                defaultLzRemoteChainId = _dstChainId;
                emit DefaultChainIdUpdated(BridgeProvider.LZ, _dstChainId);
            }
            emit LzSetTrustedRemoteAddress(
                _dstChainId,
                _remoteAddress,
                _chainListOrgChainId,
                _gasForDestination,
                _userPaysFee
            );
        }
    }

    /**
     * @notice  Sets default destination (remote) address for the cross-chain communication
     * @dev     Allow DEFAULT_ADMIN to set it multiple times. For PortfolioBridgeSub it is avalanche C-Chain
     * For other blockchains it is Dexalot Subnet
     * @param   _bridge  Bridge
     * @param   _dstChainIdBridgeAssigned Remote chain id assigned by the Bridge (lz)
     */

    function setDefaultDestinationChain(
        BridgeProvider _bridge,
        uint32 _dstChainIdBridgeAssigned
    ) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_bridge == BridgeProvider.LZ) {
            uint16 _dstChainId = uint16(_dstChainIdBridgeAssigned);
            require(remoteParams[_dstChainId].lzRemoteChainId > 0, "PB-DDCS-01");
            defaultLzRemoteChainId = _dstChainId;
            emit DefaultChainIdUpdated(BridgeProvider.LZ, _dstChainIdBridgeAssigned);
        }
    }

    /**
     * @notice  Set max gas that can be used at the destination chain after message delivery
     * @dev     Only admin can set gas for destination chain
     * @param   _bridge  Bridge
     * @param   _dstChainIdBridgeAssigned Remote chain id assigned by the Bridge (lz)
     * @param   _gas  Gas for destination chain
     */
    function setGasForDestination(
        BridgeProvider _bridge,
        uint32 _dstChainIdBridgeAssigned,
        uint256 _gas
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_gas >= 50000, "PB-MING-01");
        if (_bridge == BridgeProvider.LZ) {
            remoteParams[uint16(_dstChainIdBridgeAssigned)].gasForDestination = _gas;
            emit GasForDestinationLzReceiveUpdated(BridgeProvider.LZ, _dstChainIdBridgeAssigned, _gas);
        }
    }

    /**
     * @notice  Set whether a user must pay the brigde fee for message delivery at the destination chain
     * @dev     Only admin can set user pays fee for destination chain
     * @param   _bridge  Bridge
     * @param   _dstChainIdBridgeAssigned Remote chain id assigned by the Bridge (lz)
     * @param   _userPaysFee  True if user must pay the bridge fee, false otherwise
     */
    function setUserPaysFeeForDestination(
        BridgeProvider _bridge,
        uint32 _dstChainIdBridgeAssigned,
        bool _userPaysFee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_bridge == BridgeProvider.LZ) {
            remoteParams[uint16(_dstChainIdBridgeAssigned)].userPaysFee = _userPaysFee;
            emit UserPaysFeeForDestinationUpdated(BridgeProvider.LZ, _dstChainIdBridgeAssigned, _userPaysFee);
        }
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
     * @param   _bridge  Bridge to increment nonce for. Placeholder for multiple bridge implementation
     * @param   _dstChainIdBridgeAssigned the destination chain identifier
     * @return  nonce  New nonce
     */
    function incrementOutNonce(
        BridgeProvider _bridge,
        uint32 _dstChainIdBridgeAssigned
    ) private view returns (uint64 nonce) {
        // Not possible to send any messages from a bridge other than LZ
        // because no other is implemented. Add other bridge nonce functions here.
        if (_bridge == BridgeProvider.LZ) {
            nonce = getOutboundNonce(uint16(_dstChainIdBridgeAssigned)) + 1; // LZ generated nonce
        }
    }

    /**
     * @notice   List of the tokens in the PortfolioBridgeMain
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view virtual override returns (bytes32[] memory) {
        return portfolio.getTokenList();
    }

    /**
     * @notice  Returns the symbol & symbolId given the destination chainId
     * @dev    Returns ERC20 Symbol in the host chain for both symbol & symbolId as long
     * as the token has been added to the Portfolio
     * Overridden in PortfolioBridgeSub
     * @param   _symbol  symbol of the token
     * @return  dstSymbol  destination symbol
     * @return  dstSymbolId  symbolId of the target chain
     */

    function getDestChainSymbol(
        uint32,
        bytes32 _symbol
    ) internal view virtual returns (bytes32 dstSymbol, bytes32 dstSymbolId) {
        IPortfolio.TokenDetails memory details = portfolio.getTokenDetails(_symbol); //returns _symbol
        dstSymbol = details.symbol; // dest Symbol is equal to _symbol
        dstSymbolId = dstSymbol; // dest SymbolId is equal to _symbol for host chains
        require(dstSymbol != bytes32(0), "PB-ETNS-01");
    }

    /**
     * @notice  Returns the locally used symbol, and source symbolId given the chainListOrgChainId
     * @dev     Returns ERC20 Symbol in the host chain for both symbol & symbolId as long
     * as the token has been added to the Portfolio
     * Host chain expect to receive the symbol in the same format that it sent out.(ERC20 Symbol)
     * Overridden in PortfolioBridgeSub
     * @return  localSymbol
     * @return  symbolId
     */
    function getMappedSymbols(
        uint32,
        bytes32 _symbol
    ) internal view virtual returns (bytes32 localSymbol, bytes32 symbolId) {
        IPortfolio.TokenDetails memory details = portfolio.getTokenDetails(_symbol); //returns _symbol
        localSymbol = details.symbol; // Local Symbol is equal to _symbol
        symbolId = localSymbol; // symbolId is equal to _symbol for host chains
        require(localSymbol != bytes32(0), "PB-ETNS-01");
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
        if (_bridge == BridgeProvider.LZ) {
            uint16 dstChainId = lzDestinationMap[_dstChainListOrgChainId];
            (bridgeFee, ) = lzEstimateFees(dstChainId, DEFAULT_PAYLOAD);
        }
    }

    /**
     * @notice  Send message to destination chain via LayerZero
     * @dev     Only called by sendXChainMessageInternal that can be called by Portfolio
     * @param   _dstLzChainId Lz destination chain identifier
     * @param   _payload  Payload to send
     * @param   _userFeePayer  Address of the user who pays the bridge fee, zero address for PortfolioBridge
     * @return  uint256  Message Fee
     */
    function _lzSend(uint16 _dstLzChainId, bytes memory _payload, address _userFeePayer) private returns (uint256) {
        require(address(this).balance > 0, "PB-CBIZ-01");
        address payable _refundAddress = payable(this);
        if (remoteParams[_dstLzChainId].userPaysFee) {
            require(_userFeePayer != address(0), "PB-UFPE-01");
            _refundAddress = payable(_userFeePayer);
        } else if (_userFeePayer != address(0)) {
            // if user fee payer is set but no fee is required then refund the user
            (bool success, ) = _userFeePayer.call{value: msg.value}("");
            require(success, "PB-UFPR-01");
        }
        return
            lzSend(
                _dstLzChainId,
                _payload, // bytes payload
                _refundAddress
            );
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
    ) external payable virtual override onlyRole(BRIDGE_USER_ROLE) {
        sendXChainMessageInternal(_dstChainListOrgChainId, _bridge, _xfer, _userFeePayer);
    }

    /**
     * @notice  Actual internal function that implements the message sending.
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
    ) internal nonReentrant whenNotPaused {
        require(bridgeEnabled[_bridge], "PB-RBNE-01");
        uint16 dstChainId = lzDestinationMap[_dstChainListOrgChainId];
        require(dstChainId != 0, "PB-DDNS-02");

        if (_xfer.nonce == 0) {
            _xfer.nonce = incrementOutNonce(_bridge, dstChainId);
        }
        bytes32 localSymbol = _xfer.symbol;
        bytes32 destSymbolId;
        //_xfer.symbol is overridden with the symbol the destination expects in the below method
        (_xfer.symbol, destSymbolId) = getDestChainSymbol(_dstChainListOrgChainId, _xfer.symbol);

        bytes memory _payload = packXferMessage(_xfer);
        if (_bridge == BridgeProvider.LZ) {
            uint256 messageFee = _lzSend(dstChainId, _payload, _userFeePayer);
            emit XChainXFerMessage(
                XCHAIN_XFER_MESSAGE_VERSION,
                _bridge,
                Direction.SENT,
                _dstChainListOrgChainId,
                messageFee,
                _xfer
            );
        } else {
            // Just in case a bridge other than LZ is enabled accidentally
            revert("PB-RBNE-02");
        }
        // If this is NOT a cross chain transfer, update the inventory
        if (_xfer.transaction != IPortfolio.Tx.CCTRADE) {
            // overrite the symbol with symbolId for proper inventory calculations
            _xfer.symbol = destSymbolId;
            updateInventoryBySource(localSymbol, _xfer);
        }
    }

    /**
     * @notice  Retries the stuck message in the bridge, if any
     * @dev     Only BRIDGE_ADMIN_ROLE can call this function
     * Reverts if there is no storedPayload in the bridge or the supplied payload doesn't match the storedPayload
     * @param   _srcChainId  Source chain id
     * @param   _payload  Payload to retry
     */
    function lzRetryPayload(uint16 _srcChainId, bytes calldata _payload) external onlyRole(BRIDGE_ADMIN_ROLE) {
        lzEndpoint.retryPayload(_srcChainId, lzTrustedRemoteLookup[_srcChainId], _payload);
    }

    /**
     * @notice  This is a destructive, secondary option. Always try lzRetryPayload first.
     * if this function still fails call LzApp.forceResumeReceive directly with DEFAULT_ADMIN_ROLE as the last resort
     * Destroys the message that is blocking the bridge and calls processPayload
     * Effectively completing the message trajectory from originating chain to the target chain.
     * if successful, the funds are processed at the target chain. If not, no funds are recovered and
     * the bridge is still in blocked status and additional messages are queued behind.
     * @dev     Only recover/process message if forceResumeReceive() successfully completes.
     * Only the BRIDGE_ADMIN_ROLE can call this function.
     * If there is no storedpayload (stuck message), this function will revert, _payload parameter will be ignored and
     * will not be processed. If this function keeps failing due to an error condition after the forceResumeReceive call
     * then forceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress) has to be called directly with
     * DEFAULT_ADMIN_ROLE and the funds will have to be recovered manually
     * @param   _srcChainId  Source chain id
     * @param   _payload  Payload of the message
     */
    function lzDestroyAndRecoverFunds(
        uint16 _srcChainId,
        bytes calldata _payload
    ) external nonReentrant onlyRole(BRIDGE_ADMIN_ROLE) {
        // Destroys the message. This will revert if no message is blocking the bridge
        lzEndpoint.forceResumeReceive(_srcChainId, lzTrustedRemoteLookup[_srcChainId]);
        processPayload(BridgeProvider.LZ, remoteParams[_srcChainId].chainListOrgChainId, _payload);
    }

    /**
     * @notice  Processes message received from source chain via bridge
     * @dev     if bridge is disabled or PAUSED and there are messages in flight, we still need to
                process them when received at the destination. This also updates the receival timestamp
     * @param   _bridge  Bridge to receive message from
     * @param   _srcChainListOrgChainId  Source chain ID
     * @param   _payload  Payload received
     */
    function processPayload(BridgeProvider _bridge, uint32 _srcChainListOrgChainId, bytes calldata _payload) private {
        IPortfolio.XFER memory xfer = this.unpackXFerMessage(_payload);

        xfer.timestamp = block.timestamp; // log receival/process timestamp
        emit XChainXFerMessage(
            XCHAIN_XFER_MESSAGE_VERSION,
            _bridge,
            Direction.RECEIVED,
            _srcChainListOrgChainId,
            0,
            xfer
        );
        bytes32 localSymbol;
        // check the validity of the symbol(mainnet) or overwrite the xfer.symbol with the
        // sourceSymbol + chainId (in the subnet)
        (localSymbol, xfer.symbol) = getMappedSymbols(_srcChainListOrgChainId, xfer.symbol);
        if (xfer.transaction == IPortfolio.Tx.CCTRADE) {
            mainnetRfq.processXFerPayload(xfer);
        } else {
            // Update the totals by symbolId for multichain inventory management.
            // Add xfer.quantity to the totals by SymbolId. It will be used to see how much the user
            // can withdraw from the target chain.
            updateInventoryBySource(localSymbol, xfer);
            //After the inventory is updated, process the XFer with the local symbol that Portfolio needs
            portfolio.processXFerPayload(xfer.trader, localSymbol, xfer.quantity, xfer.transaction);
        }
    }

    /**
     * @notice  Receive message from source chain via LayerZero
     * @dev     Only trusted LZ endpoint can call
     * @param   _srcChainId  Source chain ID
     * @param   _srcAddress  Source address
     * @param   _payload  Payload received
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64,
        bytes calldata _payload
    ) external virtual override nonReentrant {
        bytes memory trustedRemote = lzTrustedRemoteLookup[_srcChainId];
        require(_msgSender() == address(lzEndpoint), "PB-IVEC-01");
        require(trustedRemote.length != 0 && keccak256(_srcAddress) == keccak256(trustedRemote), "PB-SINA-01");
        processPayload(BridgeProvider.LZ, remoteParams[_srcChainId].chainListOrgChainId, _payload);
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
     * @notice  Overridden by PortfolioBridgeSub
     * @dev     Update the inventory by each chain only in the Subnet.
     * Inventory in the host chains are already known and don't need to be calculated
     */
    function updateInventoryBySource(bytes32 _localSymbol, IPortfolio.XFER memory _xfer) internal virtual {}

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
