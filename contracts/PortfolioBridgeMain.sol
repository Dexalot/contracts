// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableMapUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/IPortfolioBridge.sol";
import "./interfaces/IBridgeProvider.sol";
import "./interfaces/IMainnetRFQ.sol";
import "./library/UtilsLibrary.sol";

/**
 * @title PortfolioBridgeMain. Bridge aggregator and message relayer for mainnet using multiple different bridges.
 * Dexalot is bridge agnostic and currently supports ICM and LayerZero. Additional bridge providers will be added
 * as needed.
 * @notice The default bridge provider is ICM (Avalanche's Interchain Messaging) within Avalanche echosystem &
 * LayerZero for any other chains. The default bridge can't be disabled.
 * You can deposit with Avalanche's ICM and withdraw with LayerZero.
 * This contract does not hold any users funds. it is responsible for paying the bridge fees in form of
 * the chain’s gas token to 3rd party bridge providers whenever a new cross chain message is sent out by
 * the user. Hence the project deposit gas tokens to this contract. And the project can withdraw
 * the gas tokens from this contract whenever it finds it necessary.
 * @dev PortfolioBridgeSub & PortfolioSub are Dexalot L1 contracts and they can't be deployed anywhere else.
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
 * In addition, we introduced a new cross chain swap flow(originally referred to as GUN Flow) where
 * any user can buy GUN token from any network with a single click. This is particularly
 * beneficial for Avalanche L1s that have certain token restrictions. For example Gunzilla prohibits ERC20s just
 * like Dexalat L1 and they don't allow their gas token in any network but in Gunzilla.
 * When Buying GUN from Avalanche(or Arb,...) with counter token USDC, USDC is kept in MainnetRFQ(Avax)
 * and GUN is deposited to the buyer's wallet via MainnetRFQ(Gun). The flow is : \
 * MainnetRFQ(Avax) => PortfolioBridgeMain(Avax) => ICM => PortfolioBridgeMain(Gun) => MainnetRFQ(Gun) \
 * When Selling GUN from Gunzilla with counter token USDC. GUN is kept in MainnetRFQ(Gun) and USDC is deposited
 * to the buyer's wallet via MainnetRFQ(Avax) The flow is : \
 * MainnetRFQ(Gun) => PortfolioBridgeMain(Gun) => ICM => PortfolioBridgeMain(Avax) => MainnetRFQ(Avax) \
 * Similarly a Cross Chain Swaps Betwen Avalanche & Arb would work as follows exchanging AVAX & ETH
 * MainnetRFQ(Avax) => PortfolioBridgeMain(Avax) => LayerZero => PortfolioBridgeMain(Arb) => MainnetRFQ(Arb) \
 * MainnetRFQ(Arb) => PortfolioBridgeMain(Arb) => LayerZero => PortfolioBridgeMain(Avax) => MainnetRFQ(Avax) \
 * PortfolioBridgeMain always sends the ERC20 Symbol from its own network and expects the same back
 * i.e USDt sent & received in Avalanche Mainnet whereas USDT is sent & received in Arbitrum.
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
    using EnumerableMapUpgradeable for EnumerableMapUpgradeable.UintToUintMap;

    IPortfolio internal portfolio;
    IMainnetRFQ internal mainnetRfq;
    // Maps supported bridge providers to their contract implementations
    mapping(BridgeProvider => IBridgeProvider) public enabledBridges;
    // chainListOrgChainId => bridge type => bool mapping to control user pays fee for each destination and bridge
    mapping(uint32 => mapping(BridgeProvider => bool)) public userPaysFee;

    BridgeProvider internal defaultBridgeProvider; // ICM for avalanche eco, Layer0 for other chains
    uint32 internal defaultChainId; // c-chain for Dexalot L1, Dexalot L1 for other chains

    uint8 private constant XCHAIN_XFER_MESSAGE_VERSION = 3;

    // Controls actions that can be executed on the contract. PortfolioM or MainnetRFQ are the current users.
    bytes32 public constant BRIDGE_USER_ROLE = keccak256("BRIDGE_USER_ROLE");
    // Controls setting of bridge fees and executing delayed transfers.
    bytes32 public constant BRIDGE_ADMIN_ROLE = keccak256("BRIDGE_ADMIN_ROLE");
    // Allows access to processPayload for bridge providers e.g. LayerZero, ICM.
    bytes32 public constant BRIDGE_PROVIDER_ROLE = keccak256("BRIDGE_PROVIDER_ROLE");

    uint32 private constant SOL_CHAIN_ID = 0x534f4c;
    // Symbol => chainListOrgChainId ==> address mapping to control xchain swaps allowed symbols for each destination
    // stores spl token mint address for sending messages to solana
    mapping(bytes32 => mapping(uint32 => bytes32)) public xChainAllowedDestinations;

    uint64 public outNonce;
    // chainId => bridgeProviders bitmap (3 storage slots)
    EnumerableMapUpgradeable.UintToUintMap internal supportedChains;
    uint256 public gasAirdrop;
    // chainId => symbol mapping to control supported native tokens for each destination
    mapping(uint32 => bytes32) public supportedChainNative;

    // storage gap for upgradeability
    uint256[48] __gap;
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event DefaultChainIdUpdated(uint32 destinationChainId);
    event UserPaysFeeForDestinationUpdated(BridgeProvider bridge, uint32 destinationChainId, bool userPaysFee);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure virtual override returns (bytes32) {
        return bytes32("4.1.5");
    }

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin, pauser and msg_sender role to the sender. Enable _defaultBridgeProviderAddress as default.
     * @param   _defaultBridgeProvider  Default bridge provider
     * @param   _defaultBridgeProviderAddress  Address of the default bridge provider contract
     * @param   _owner  Owner of the contract
     */
    function initialize(
        BridgeProvider _defaultBridgeProvider,
        address _defaultBridgeProviderAddress,
        address _owner
    ) external initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);

        defaultBridgeProvider = _defaultBridgeProvider;
        enabledBridges[_defaultBridgeProvider] = IBridgeProvider(_defaultBridgeProviderAddress);
        _setupRole(BRIDGE_PROVIDER_ROLE, _defaultBridgeProviderAddress);
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
     * @notice  Enables/disables given bridge. Default bridge cannot be removed.
     * @dev     Only admin can enable/disable bridge. Default bridge can only be updated to new contract when paused
     * @param   _bridge  Bridge to enable/disable
     * @param   _bridgeProvider  Address of bridge provider contract, 0 address if not exists
     */
    function enableBridgeProvider(
        BridgeProvider _bridge,
        address _bridgeProvider
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bridge != defaultBridgeProvider || (paused() && _bridgeProvider != address(0)), "PB-DBCD-01");
        if (_bridgeProvider != address(0)) {
            grantRole(BRIDGE_PROVIDER_ROLE, _bridgeProvider);
        }
        enabledBridges[_bridge] = IBridgeProvider(_bridgeProvider);
    }

    /**
     * @notice  Removes an bridge provider's access to processPayload
     * @dev     Only admin can remove bridge provider. Executed when a bridge provider is disabled
     * or updated and has no inflight messages.
     * @param   _bridge  Bridge type to remove
     * @param   _bridgeProvider  Address of old bridge provider contract
     */
    function removeBridgeProvider(
        BridgeProvider _bridge,
        address _bridgeProvider
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(enabledBridges[_bridge]) != _bridgeProvider, "PB-OBSA-01");
        revokeRole(BRIDGE_PROVIDER_ROLE, _bridgeProvider);
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
     * @dev Default bridge provider can only be changed to an enabled bridge provider
     * @param  _bridge  Bridge Provider type
     */
    function setDefaultBridgeProvider(BridgeProvider _bridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bridge != defaultBridgeProvider && address(enabledBridges[_bridge]) != address(0), "PB-DBCD-01");
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
     * @param   _tokenAddress  Token address on the destination chain, 0 address if not exists
     */
    function enableXChainSwapDestination(
        bytes32 _symbol,
        uint32 _chainListOrgChainId,
        bytes32 _tokenAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        xChainAllowedDestinations[_symbol][_chainListOrgChainId] = _tokenAddress;
    }

    /**
     * @notice  Enables/disables a native token for a given destination for cross chain swaps
     * @dev     Only admin can enable/disable
     * @param   _chainListOrgChainId  Remote Chainlist.org chainid
     * @param   _symbol  Native symbol of the token
     */
    function enableSupportedNative(uint32 _chainListOrgChainId, bytes32 _symbol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        supportedChainNative[_chainListOrgChainId] = _symbol;
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
        (, uint256 currentBridges) = supportedChains.tryGet(_chainListOrgChainId);
        uint256 newBridges = currentBridges | (1 << uint8(_bridge));
        if (currentBridges != newBridges) {
            supportedChains.set(_chainListOrgChainId, newBridges);
        }
        bridgeContract.setRemoteChain(_chainListOrgChainId, _dstChainIdBridgeAssigned, _remoteAddress);
    }

    /**
     * @notice  Sets default destination chain id for the cross-chain communication
     * @dev     Allow DEFAULT_ADMIN to set it multiple times. For PortfolioBridgeSub it is avalanche C-Chain
     * For other blockchains it is Dexalot L1
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
     * @notice   List of the tokens in the PortfolioBridgeMain
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view virtual override returns (bytes32[] memory) {
        return portfolio.getTokenList();
    }

    /**
     * @notice  Returns the bridgeFee charged by the bridge for the targetChainId.
     * @dev     The fee is in terms of current chain's gas token.
     * LZ charges based on the payload size and gas px at
     * @param   _bridge  Bridge
     * @param   _dstChainListOrgChainId  destination chain id
     *           _symbol  symbol of the token, not relevant in for this function
     *           _quantity quantity of the token, not relevant in for this function
     *           _options custom options for the transaction, not relevant in this function
     * @return  bridgeFee  bridge fee for the destination
     */

    function getBridgeFee(
        BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId,
        bytes32,
        uint256,
        address,
        bytes1
    ) external view virtual override returns (uint256 bridgeFee) {
        IBridgeProvider bridgeProvider = enabledBridges[_bridge];
        require(address(bridgeProvider) != address(0), "PB-RBNE-03");
        bridgeFee = bridgeProvider.getBridgeFee(_dstChainListOrgChainId);
    }

    /**
     * @notice Returns an array of chainIds that are supported by the selected bridge
     * @param _bridge Bridge provider
     * @return chainIds Array of chainIds
     */
    function getSupportedChainIds(BridgeProvider _bridge) external view returns (uint32[] memory chainIds) {
        chainIds = new uint32[](supportedChains.length());
        for (uint256 i = 0; i < supportedChains.length(); i++) {
            (uint256 chainId256, uint256 supportedBridges) = supportedChains.at(i);
            if ((supportedBridges & (1 << uint8(_bridge))) > 0) {
                chainIds[i] = uint32(chainId256);
            }
        }
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
        XChainMsgType msgType = XChainMsgType(uint8(slot0));
        // only unpack normal xfer message (xferSolana handled on solana side)
        require(msgType == XChainMsgType.XFER, "PB-UM-01");
        slot0 >>= 8;
        xfer.transaction = IPortfolio.Tx(uint8(slot0));
        slot0 >>= 8;
        xfer.nonce = uint64(slot0);
        slot0 >>= 64;
        xfer.timestamp = uint32(slot0);
        xfer.customdata = bytes18(uint144(uint256(slot0) >> 32));
        xfer.trader = msgData[1];
        xfer.symbol = msgData[2];
        xfer.quantity = uint256(msgData[3]);
    }

    /**
     * @notice  Maps symbol to symbolId and encodes XFER message
     * @dev     It is packed as follows:
     * slot0: customdata(18), timestamp(4), nonce(8), transaction(1), XChainMsgType(1)
     * slot1: trader(32)
     * slot1: symbol(32)
     * slot2: quantity(32)
     * @param   _xfer  XFER message to encode
     * @return  message  Encoded XFER message
     */
    function packXferMessage(IPortfolio.XFER memory _xfer) private pure returns (bytes memory message) {
        bytes32 slot0 = bytes32(
            (uint256(uint144(_xfer.customdata)) << 112) |
                (uint256(uint32(_xfer.timestamp)) << 80) |
                (uint256(_xfer.nonce) << 16) |
                (uint256(uint8(_xfer.transaction)) << 8) |
                uint8(XChainMsgType.XFER)
        );
        bytes32 slot1 = bytes32(_xfer.trader);
        bytes32 slot2 = bytes32(_xfer.symbol);
        bytes32 slot3 = bytes32(_xfer.quantity);
        message = bytes.concat(slot0, slot1, slot2, slot3);
    }

    /**
     * @notice  Maps symbol to symbolId and encodes XFERSolana message
     * @dev     It is packed as follows:
     * slot0: customdata(10), timestamp(4), nonce(8), transaction(1), XChainMsgType(1)
     * slot1: trader(32)
     * slot1: tokenAddress(32)
     * slot2: quantity(8)
     * @param   _xfer  XFER message to encode
     * @return  message  Encoded XFERSolana message
     */
    function packXferMessageSolana(IPortfolio.XFER memory _xfer) private view returns (bytes memory message) {
        bytes32 slot0 = bytes32(
            (uint256(uint144(_xfer.customdata)) << 112) |
                (uint256(uint32(_xfer.timestamp)) << 80) |
                (uint256(_xfer.nonce) << 16) |
                (uint256(uint8(_xfer.transaction)) << 8) |
                uint8(XChainMsgType.XFER_SOLANA)
        );
        bytes32 slot1 = bytes32(_xfer.trader);
        bytes32 tokenAddress = xChainAllowedDestinations[_xfer.symbol][SOL_CHAIN_ID];
        bytes32 slot2 = bytes32(tokenAddress);
        bytes8 slot3 = bytes8(uint64(_xfer.quantity));
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
        // Validate for Cross Chain Trade
        if (_xfer.transaction == IPortfolio.Tx.CCTRADE) {
            // Symbol allowed at destination
            require(
                xChainAllowedDestinations[_xfer.symbol][_dstChainListOrgChainId] != bytes32(0) ||
                    supportedChainNative[_dstChainListOrgChainId] == _xfer.symbol,
                "PB-CCTR-02"
            );
        }
        // No need to validate the symbol for DEPOSIT/ WITHDRAWALS again as it is being sent by the Portfolio
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
            outNonce += 1;
            _xfer.nonce = outNonce;
        }
        bytes memory _payload = _dstChainListOrgChainId == SOL_CHAIN_ID
            ? packXferMessageSolana(_xfer)
            : packXferMessage(_xfer);
        bool isUserFeePayer = userPaysFee[_dstChainListOrgChainId][_bridge];
        IBridgeProvider.CrossChainMessageType msgType = getCrossChainMessageType(_xfer.transaction);
        uint256 fee = bridgeContract.getBridgeFee(_dstChainListOrgChainId, msgType);
        if (isUserFeePayer) {
            require(_userFeePayer != address(0), "PB-UFPE-01");
            require(msg.value >= fee, "PB-IUMF-01");
        } else {
            if (_userFeePayer != address(0)) {
                (bool success, ) = _userFeePayer.call{value: msg.value}("");
                require(success, "PB-UFPR-01");
                require(address(this).balance > fee, "PB-CBIZ-01");
            }
            _userFeePayer = address(this);
        }
        bridgeContract.sendMessage{value: fee}(_dstChainListOrgChainId, _payload, msgType, _userFeePayer);
        emit XChainXFerMessage(
            XCHAIN_XFER_MESSAGE_VERSION,
            _bridge,
            Direction.SENT,
            _dstChainListOrgChainId,
            fee,
            _xfer
        );
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
    ) external virtual onlyRole(BRIDGE_PROVIDER_ROLE) {
        IPortfolio.XFER memory xfer = processPayloadShared(_bridge, _srcChainListOrgChainId, _payload);
        // check the validity of the symbol
        IPortfolio.TokenDetails memory details = portfolio.getTokenDetails(xfer.symbol);
        require(details.symbol != bytes32(0), "PB-ETNS-02");
        processGasAirdrop(xfer.customdata[0], xfer.trader);
        xfer.transaction == IPortfolio.Tx.CCTRADE
            ? mainnetRfq.processXFerPayload(xfer)
            : portfolio.processXFerPayload(xfer);
    }

    function processGasAirdrop(bytes1 options, bytes32 trader) internal {
        if (options == 0) return;
        if (UtilsLibrary.isOptionSet(options, uint8(IPortfolio.Options.GASAIRDROP)) && gasAirdrop != 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = UtilsLibrary.bytes32ToAddress(trader).call{value: gasAirdrop}("");
            require(success, "PB-GASF-01");
        }
    }

    /**
     * @notice  Sets the gas airdrop amount for withdrawals with GASAIRDROP option
     * @dev     Only admin can set the gas airdrop amount
     * @param   _gasAirdrop  Amount of gas to airdrop
     */
    function setGasAirdrop(uint256 _gasAirdrop) external onlyRole(DEFAULT_ADMIN_ROLE) {
        gasAirdrop = _gasAirdrop;
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
