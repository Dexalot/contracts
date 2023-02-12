// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/IPortfolioBridge.sol";

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
 * @dev The information flow for messages between PortfolioMain and PortfolioSub is as follows: \
 * PortfolioMain => PortfolioBridgeMain => BridgeProviderA/B/n => PortfolioBridgeSub => PortfolioSub \
 * PortfolioSub => PortfolioBridgeSub => BridgeProviderA/B/n => PortfolioBridgeMain => PortfolioMain \
 * PortfolioBridgeMain also serves as a symbol mapper to support multichain symbol handling.
 * PortfolioBridgeMain always maps the symbol as SYMBOL + portolio.srcChainId and expects the same back,
 * i.e USDC43114 if USDC is from Avalanche Mainnet.
 * It makes use of the PortfolioMain's tokenDetailsMap when mapping symbol to symbolId back
 * and forth as token details can not be different when in the mainnet.
 * Symbol mapping happens in packXferMessage on the way out. packXferMessage calls getTokenId that has
 * different implementations in PortfolioBridgeMain & PortfolioBridgeSub. On the receival, the symbol mapping
 * will happen in different functions, either in processPayload or in getXFerMessage.
 * We need to raise the XChainXFerMessage before xfer.symbol is mapped in processPayload function so the
 * incoming and the outgoing xfer messages always contain the symbolId rather than symbol. \
 * getXFerMessage is called by lzDestroyAndRecoverFunds to handle a stuck message from the LZ bridge,
 * and to return the funds to the depositor/withdrawer. Hence, getXFerMessage maps the symbolId to symbol.
 * Use multiple inheritance to add additional bridge implementations in the future. Currently LzApp only.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridge is Initializable, PausableUpgradeable, ReentrancyGuardUpgradeable, IPortfolioBridge, LzApp {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    IPortfolio internal portfolio;

    uint8 private constant XCHAIN_XFER_MESSAGE_VERSION = 1;

    mapping(BridgeProvider => bool) public bridgeEnabled;

    BridgeProvider internal defaultBridgeProvider; //Layer0

    // Controls actions that can be executed the the PORTFOLIO
    bytes32 public constant PORTFOLIO_ROLE = keccak256("PORTFOLIO_ROLE");
    // Controls all bridge implementations access. Currently only LZ
    bytes32 public constant BRIDGE_ADMIN_ROLE = keccak256("BRIDGE_ADMIN_ROLE");

    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event GasForDestinationLzReceiveUpdated(uint256 gasForDestinationLzReceive);
    event DefaultChainIdUpdated(uint32 chainId);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure virtual override returns (bytes32) {
        return bytes32("2.2.1");
    }

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin, pauser and msg_sender role to the sender. Set gas for lz. Set endpoint and enable bridge
     * @param   _endpoint  Endpoint of the LZ bridge
     */
    function initialize(address _endpoint) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        //Max Gas amount to be used at the destination chain after delivered by Layer0
        gasForDestinationLzReceive = 450000;
        lzEndpoint = ILayerZeroEndpoint(_endpoint);
        defaultBridgeProvider = BridgeProvider.LZ;
        bridgeEnabled[BridgeProvider.LZ] = true;
    }

    /**
     * @notice  Pauses bridge operations
     * @dev     Only pauser can pause
     */
    function pause() external onlyRole(PORTFOLIO_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpauses bridge operations
     * @dev     Only pauser can unpause
     */
    function unpause() external onlyRole(PORTFOLIO_ROLE) {
        _unpause();
    }

    /**
     * @notice  Enables/disables given bridge. Default bridge's state can't be modified
     * @dev     Only admin can enable/disable bridge
     * @param   _bridge  Bridge to enable/disable
     * @param   _enable  True to enable, false to disable
     */
    function enableBridgeProvider(BridgeProvider _bridge, bool _enable) external override onlyRole(PORTFOLIO_ROLE) {
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
        } else if (_role == PORTFOLIO_ROLE) {
            //Can't remove Portfolio from PORTFOLIO_ROLE. Need to use setPortfolio
            require(getRoleMemberCount(_role) > 1, "PB-ALOA-02");
        }

        super.revokeRole(_role, _address);
        emit RoleUpdated("PORTFOLIOBRIDGE", "REMOVE-ROLE", _role, _address);
    }

    /**
     * @notice  Set portfolio address to grant role
     * @dev     Only admin can set portfolio address.
     * There is a one to one relationship between Portfolio and PortfolioBridge.
     * @param   _portfolio  Portfolio address
     */
    function setPortfolio(address _portfolio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //Can't have multiple portfolio's using the same bridge
        if (hasRole(PORTFOLIO_ROLE, address(portfolio))) super.revokeRole(PORTFOLIO_ROLE, address(portfolio));
        portfolio = IPortfolio(_portfolio);
        grantRole(PORTFOLIO_ROLE, _portfolio);
        addNativeToken();
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
    function getPortfolio() external view returns (IPortfolio) {
        return portfolio;
    }

    /**
     * @notice  Increments bridge nonce
     * @dev     Only portfolio can call
     * @param   _bridge  Bridge to increment nonce for. Placeholder for multiple bridge implementation
     * @return  nonce  New nonce
     */
    function incrementOutNonce(BridgeProvider _bridge) private view returns (uint64 nonce) {
        // Not possible to send any messages from a bridge other than LZ
        // because no other is implemented. Add other bridge nonce functions here.
        if (_bridge == BridgeProvider.LZ) {
            nonce = getOutboundNonce() + 1; // LZ generated nonce
        }
    }

    /**
     * @notice  Set max gas that can be used at the destination chain after message delivery
     * @dev     Only admin can set gas for destination chain
     * @param   _gas  Gas for destination chain
     */
    function setGasForDestinationLzReceive(uint256 _gas) external onlyRole(BRIDGE_ADMIN_ROLE) {
        require(_gas >= 200000, "PB-MING-01");
        gasForDestinationLzReceive = _gas;
        emit GasForDestinationLzReceiveUpdated(gasForDestinationLzReceive);
    }

    /**
     * @notice   List of the tokens in the portfolioBridge
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view virtual returns (bytes32[] memory) {
        return portfolio.getTokenList();
    }

    /**
     * @notice  Returns the symbolId used in the mainnet given the srcChainId
     * @dev     It uses PortfolioMain's token list to get the symbolId,
     * On the other hand, PortfolioBridgeSub uses its internal list & the defaultTargetChain
     * When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC1337
     * When receiving messages back it expects the same symbolId if USDC1337 sent, USDC1337 to receive
     * Because the subnet needs to know about different ids from different mainnets.
     * @param   _symbol  symbol of the token
     * @return  bytes32  symbolId
     */

    function getTokenId(bytes32 _symbol) internal view virtual returns (bytes32) {
        return portfolio.getTokenDetails(_symbol).symbolId;
    }

    /**
     * @notice  Returns the locally used symbol given the symbolId
     * @dev     Mainnet receives the messages in the same format that it sent out, by symbolId
     * @return  bytes32  symbolId
     */
    function getSymbolForId(bytes32 _symbolId) internal view virtual returns (bytes32) {
        return portfolio.getTokenDetailsById(_symbolId).symbol;
    }

    /**
     * @notice  Send message to destination chain via LayerZero
     * @dev     Only called by sendXChainMessageInternal that can be called by Portfolio
     * @param   _payload  Payload to send
     * @return  uint256  Message Fee
     */
    function lzSend(bytes memory _payload) private returns (uint256) {
        require(address(this).balance > 0, "PB-CBIZ-01");
        return
            lzSend(
                _payload, // bytes payload
                payable(this)
            );
    }

    /**
     * @notice  Unpacks XFER message from the payload and replaces the symbol with the local symbol
     * @dev     It is called by lzDestroyAndRecoverFunds to handle a stuck message
     * @param   _payload  Payload passed from the bridge
     * @return  address  Address of the trader
     * @return  bytes32  Symbol of the token
     * @return  uint256  Amount of the token
     */
    function getXFerMessage(bytes calldata _payload) external view returns (address, bytes32, uint256) {
        // There is only a single type in the XChainMsgType enum.
        (, bytes memory msgdata) = unpackMessage(_payload);
        // unpackMessage will revert if anything else other than XChainMsgType.XFER is in the _payload
        // to support additional message types in the future implement something
        // like if (xchainMsgType == XChainMsgType.XFER) ...
        IPortfolio.XFER memory xfer = unpackXFerMessage(msgdata);
        xfer.symbol = getSymbolForId(xfer.symbol);
        return (xfer.trader, xfer.symbol, xfer.quantity);
    }

    /**
     * @notice  Maps symbol to symbolId and encodes XFER message
     * @param   _xfer  XFER message to encode
     * @return  message  Encoded XFER message
     */
    function packXferMessage(IPortfolio.XFER memory _xfer) internal view returns (bytes memory message) {
        //overwrite with the symbol+chainid
        _xfer.symbol = getTokenId(_xfer.symbol);
        // Future task for multichain. This is a good place to update the totals by symbolId.
        // Remove _xfer.quantity from the totals. Totals by SymbolId can be used to see how much the
        // user can withdraw to the target chain.
        bytes memory m = abi.encode(_xfer);
        message = abi.encode(XChainMsgType.XFER, m);
    }

    /**
     * @notice  Decodes XChainMsgType from the message
     * @param   _data  Encoded message that has the msg type + msg
     * @return  _xchainMsgType  XChainMsgType. Currently only XChainMsgType.XFER possible
     * @return  msgdata  Still encoded message data. XFER in our case. Other message types not supported yet.
     */
    function unpackMessage(
        bytes calldata _data
    ) private pure returns (XChainMsgType _xchainMsgType, bytes memory msgdata) {
        (_xchainMsgType, msgdata) = abi.decode(_data, (XChainMsgType, bytes));
    }

    /**
     * @notice  Decodes XFER message & updates the receival timestamp
     * @param   _data  XFER message
     * @return  xfer  Unpacked XFER message
     */
    function unpackXFerMessage(bytes memory _data) private view returns (IPortfolio.XFER memory xfer) {
        xfer = abi.decode(_data, (IPortfolio.XFER));
        xfer.timestamp = block.timestamp; // log receival timestamp
    }

    /**
     * @notice  Wrapper function to send message to destination chain via bridge
     * @dev     Only PORTFOLIO_ROLE can call
     * @param   _bridge  Bridge to send message to
     * @param   _xfer XFER message to send
     */
    function sendXChainMessage(
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer
    ) external virtual override onlyRole(PORTFOLIO_ROLE) {
        sendXChainMessageInternal(_bridge, _xfer);
    }

    /**
     * @notice  Actual internal function that implements the message sending.
     * @param   _bridge  Bridge to send message to
     * @param   _xfer XFER message to send
     */
    function sendXChainMessageInternal(
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer
    ) internal nonReentrant whenNotPaused {
        require(bridgeEnabled[_bridge], "PB-RBNE-01");

        if (_xfer.nonce == 0) {
            _xfer.nonce = incrementOutNonce(_bridge);
        }
        bytes memory _payload = packXferMessage(_xfer);

        if (_bridge == BridgeProvider.LZ) {
            uint256 messageFee = lzSend(_payload);

            emit XChainXFerMessage(
                XCHAIN_XFER_MESSAGE_VERSION,
                _bridge,
                Direction.SENT,
                lzRemoteChainId,
                messageFee,
                _xfer
            );
        } else {
            // Just in case a bridge other than LZ is enabled accidentally
            revert("PB-RBNE-02");
        }
    }

    /**
     * @notice  Retries the stuck message in the bridge, if any
     * @dev     Only BRIDGE_ADMIN_ROLE can call this function
     * Reverts if there is no storedPayload in the bridge or the supplied payload doesn't match the storedPayload
     * @param   _payload  Payload to retry
     */
    function lzRetryPayload(bytes calldata _payload) external onlyRole(BRIDGE_ADMIN_ROLE) {
        lzEndpoint.retryPayload(lzRemoteChainId, lzTrustedRemoteLookup[lzRemoteChainId], _payload);
    }

    /**
     * @notice  This is a destructive, secondary option. Always try lzRetryPayload first.
     * if this function still fails call LzApp.forceResumeReceive directly with DEFAULT_ADMIN_ROLE as the last resort
     * Destroys the message that is blocking the bridge and calls portfolio.processXFerPayload
     * Effectively completing the message trajectory from originating chain to the target chain.
     * if successful, the funds are processed at the target chain. If not no funds are recovered and
     * the bridge is still in blocked status and additional messages are queued behind.
     * @dev     Only recover/process message if forceResumeReceive() successfully completes.
     * Only the BRIDGE_ADMIN_ROLE can call this function.
     * If there is no storedpayload (stuck message), this function will revert, _payload parameter will be ignored and
     * will not be processed. If this function keeps failing due to an error condition after the forceResumeReceive call
     * then forceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress) has to be called directly with
     * DEFAULT_ADMIN_ROLE and the funds will have to be recovered manually
     * @param   _payload  Payload of the message
     */
    function lzDestroyAndRecoverFunds(bytes calldata _payload) external nonReentrant onlyRole(BRIDGE_ADMIN_ROLE) {
        // Destroys the message. This will revert if no message is blocking the bridge
        lzEndpoint.forceResumeReceive(lzRemoteChainId, lzTrustedRemoteLookup[lzRemoteChainId]);
        (address trader, bytes32 symbol, uint256 quantity) = this.getXFerMessage(_payload);
        portfolio.processXFerPayload(trader, symbol, quantity, IPortfolio.Tx.RECOVERFUNDS); //Recover it
    }

    /**
     * @notice  Processes message received from source chain via bridge
     * @dev     if bridge is disabled or PAUSED and there are messages in flight, we still need to
                process them when received at the destination
     * @param   _bridge  Bridge to receive message from
     * @param   _srcChainId  Source chain ID
     * @param   _payload  Payload received
     */
    function processPayload(BridgeProvider _bridge, uint32 _srcChainId, bytes calldata _payload) private {
        //Get the message Type & the msgdata but there is only a single type in the XChainMsgType enum.
        (, bytes memory msgdata) = unpackMessage(_payload);

        // unpackMessage will revert if anything else other than XChainMsgType.XFER is in the _payload
        // to support additional message types in the future implement something like
        // if (_xchainMsgType == XChainMsgType.XFER) {
        // }
        // else if (_xchainMsgType == XChainMsgType.GAS) {
        // }
        IPortfolio.XFER memory xfer = unpackXFerMessage(msgdata);
        bytes32 symbol = getSymbolForId(xfer.symbol);

        emit XChainXFerMessage(XCHAIN_XFER_MESSAGE_VERSION, _bridge, Direction.RECEIVED, _srcChainId, 0, xfer);
        // Future task for multichain. This is a good place to update the totals by symbolId.
        // Add xfer.quantity to the totals by SymbolId. It can be used to see how much the user
        // can withdraw from the target chain.

        //After the event is raised, replace the symbol with the local symbol that is going to be used.
        xfer.symbol = symbol;

        if (checkTresholds(xfer)) {
            portfolio.processXFerPayload(xfer.trader, xfer.symbol, xfer.quantity, xfer.transaction);
        }
    }

    /**
     * @notice  Overridden by PortfolioBridgeSub
     * @dev     Tresholds are not checked in the Mainnet neither for Incoming nor outgoing messages.
     * But they are checked in the subnet for both.
     * @return  bool  True
     */
    function checkTresholds(IPortfolio.XFER memory) internal virtual returns (bool) {
        return true;
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
    ) external override nonReentrant {
        bytes memory trustedRemote = lzTrustedRemoteLookup[_srcChainId];
        require(_msgSender() == address(lzEndpoint), "PB-IVEC-01");
        require(trustedRemote.length != 0 && keccak256(_srcAddress) == keccak256(trustedRemote), "PB-SINA-01");
        processPayload(BridgeProvider.LZ, _srcChainId, _payload);
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
     * @notice  Refunds the ERC20 balance inside contract
     * @dev     Only admin can call
     * @param   _tokens  Array of ERC20 tokens to refund
     */
    function refundTokens(address[] calldata _tokens) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _tokens.length; ++i) {
            IERC20Upgradeable(_tokens[i]).transfer(msg.sender, IERC20Upgradeable(_tokens[i]).balanceOf(address(this)));
        }
    }

    // solhint-disable no-empty-blocks

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
