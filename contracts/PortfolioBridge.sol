// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/IPortfolioBridge.sol";
import "./bridgeApps/LzApp.sol";

/**
 * @title Bridge aggregator and message relayer for multiple different bridges
 * @notice The default bridge provider is LayerZero and it can't be disabled. Additional bridge providers
 * will be added as needed. This contract encapsulates all bridge provider implementations that Portfolio
 * doesn't need to know about.
 * @dev The information flow for messages between PortfolioMain and PortfolioSub is as follows: \
 * PortfolioMain => PortfolioBridgeMain => BridgeProviderA/B/n => PortfolioBridgeSub => PortfolioSub \
 * PortfolioSub => PortfolioBridgeSub => BridgeProviderA/B/n => PortfolioBridgeMain => PortfolioMain \
 * PortfolioBridge also serves as a symbol mapper to support multichain symbol handling. \
 * PortfolioBridgeMain always maps the symbol as SYMBOL + portolio.srcChainId and expects the same back,
 * i.e USDC43114 if USDC is from Avalanche Mainnet. USDC1 if it is from Etherum.
 * PortfolioBridgeSub always maps the symbol that it receives into a common symbol on receipt,
 * i.e USDC43114 is mapped to USDC.
 * When sending back to the target chain, it maps it back to the expected symbol by the target chain,
 * i.e USDC to USDC1 if sent back to Etherum, USDC43114 if sent to Avalache.
 * Symbol mapping happens in packXferMessage on the way out. packXferMessage calls getTokenId that has
 * different implementations in PortfolioBridgeMain & PortfolioBridgeSub. On the receival, the symbol mapping
 * will happen in different functions, either in processPayload or in getXFerMessage.
 * We need to raise the XChainXFerMessage before xfer.symbol is mapped in processPayload function so the
 * incoming and the outgoing xfer messages always contain the symbolId rather than symbol.
 * getXFerMessage is called by the portfolio to recover a stucked message from the LZ bridge, and to return
 * the funds to the depositor/withdrawer. Hence, getXFerMessage maps the symbolId to symbol.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridge is Initializable, PausableUpgradeable, ReentrancyGuardUpgradeable, IPortfolioBridge, LzApp {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    IPortfolio internal portfolio;

    uint8 private constant XCHAIN_XFER_MESSAGE_VERSION = 1;

    bytes32 public constant PORTFOLIO_ROLE = keccak256("PORTFOLIO_ROLE");

    mapping(BridgeProvider => bool) public bridgeEnabled;

    // key is symbolId (symbol + srcChainId)
    mapping(bytes32 => IPortfolio.TokenDetails) public tokenDetailsMapById;

    // Will be more relevant once the same token symbol from different mainnet chains are sent to subnet
    // key is common symbol in the subnet (local symbol in the mainnet), then chainid of the
    // mainnet the token is added from.
    // symbol => chain => symbolId
    mapping(bytes32 => mapping(uint32 => bytes32)) public tokenDetailsMapBySymbol;

    // Add by symbolId rather than symbol
    EnumerableSetUpgradeable.Bytes32Set internal tokenList;
    uint32 public defaultTargetChainId; //PortfolioBridge = Dexalot Subnet,   PortfolioBridgeSub = Avalanche
    BridgeProvider internal defaultBridgeProvider; //Layer0

    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event GasForDestinationLzReceiveUpdated(uint256 gasForDestinationLzReceive);
    event DefaultChainIdUpdated(uint32 chainId);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure virtual override returns (bytes32) {
        return bytes32("2.1.2");
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
     * @dev     Only admin can revoke role
     * @param   _role  Role to revoke
     * @param   _address  Address to revoke role from
     */
    function revokeRole(bytes32 _role, address _address)
        public
        override(AccessControlUpgradeable, IAccessControlUpgradeable)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
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
     * @return  IPortfolio  Portfolio contract
     */
    function getPortfolio() external view returns (IPortfolio) {
        return portfolio;
    }

    /**
     * @notice  Increments bridge nonce
     * @dev     Only portfolio can call
     * @param   _bridge  Bridge to increment nonce for. For future use for multiple bridge use
     * @return  nonce  New nonce
     */
    function incrementOutNonce(BridgeProvider _bridge) private returns (uint64 nonce) {
        // Not possible to send any messages from a bridge other than LZ
        // because no other is implemented.
        if (_bridge == BridgeProvider.LZ) {
            nonce = ++lzOutNonce;
        }
    }

    /**
     * @notice  Set max gas that can be used at the destination chain after message delivery
     * @dev     Only admin can set gas for destination chain
     * @param   _gas  Gas for destination chain
     */
    function setGasForDestinationLzReceive(uint256 _gas) external onlyRole(DEFAULT_ADMIN_ROLE) {
        gasForDestinationLzReceive = _gas;
        emit GasForDestinationLzReceiveUpdated(gasForDestinationLzReceive);
    }

    /**
     * @notice  Adds the given token to the portfolioBridge. PortfolioBrigeSub the list will be bigger as they could
     * be from different mainnet chains
     * @dev     `addToken` is only callable by admin or from Portfolio when a new common symbol is added for the
     * first time. The same common symbol but different symbolId are required when adding a token to
     * PortfolioBrigeSub. \
     * Native symbol is also added as a token with 0 address
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Mainnet token address the symbol or zero address for AVAX
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Decimals of the token
     */
    function addToken(
        bytes32 _symbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode
    ) external override {
        require(
            hasRole(PORTFOLIO_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
                msg.sender == address(this), // called by addNativeToken function
            "PB-OACC-01"
        );

        IPortfolio.TokenDetails memory commonToken = portfolio.getTokenDetails(_symbol);
        //commonToken.symbol from Portfolio is the common symbol in all mappings in the PortfolioBridgeSub
        require(commonToken.symbol == _symbol, "PB-SDMP-01");
        bytes32 symbolId = UtilsLibrary.getIdForToken(_symbol, _srcChainId);

        if (!tokenList.contains(symbolId)) {
            tokenList.add(symbolId);

            IPortfolio.TokenDetails storage tokenDetails = tokenDetailsMapById[symbolId];
            require(tokenDetails.symbol == "", "PB-TAEX-01");
            //tokenDetails.auctionMode = _mode; //irrelavant in this context
            tokenDetails.decimals = _decimals;
            tokenDetails.tokenAddress = _tokenAddress;
            tokenDetails.srcChainId = _srcChainId;
            tokenDetails.symbol = _symbol;
            tokenDetails.symbolId = symbolId;

            tokenDetailsMapBySymbol[_symbol][_srcChainId] = symbolId;
        }
    }

    /**
     * @notice  private function that handles the addition of native token
     * @dev     gets the native token details from portfolio
     */
    function addNativeToken() private {
        IPortfolio.TokenDetails memory t = portfolio.getTokenDetails(portfolio.getNative());
        this.addToken(t.symbol, t.tokenAddress, t.srcChainId, t.decimals, ITradePairs.AuctionMode.OFF);
    }

    /**
     * @notice  Remove the token from the tokenDetailsMapById and tokenDetailsMapBySymbol
     * @dev     Make sure that there are no in-flight messages
     * @param   _symbol  symbol of the token
     * @param   _srcChainId  Source Chain id
     */
    function removeToken(bytes32 _symbol, uint32 _srcChainId) external override whenPaused {
        require(hasRole(PORTFOLIO_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "PB-OACC-01");
        bytes32 symbolId = UtilsLibrary.getIdForToken(_symbol, _srcChainId);
        if (
            // We can't remove the native that was added from current chainId,
            // but the native symbol added from a mainnet can be removed.
            // ALOT added from Avalanche ALOT43114 can be removed not ALOT added from the subnet
            tokenList.contains(symbolId) && !(_symbol == portfolio.getNative() && _srcChainId == portfolio.getChainId())
        ) {
            delete (tokenDetailsMapById[symbolId]);
            delete (tokenDetailsMapBySymbol[_symbol][_srcChainId]);
            tokenList.remove(symbolId);
        }
    }

    /**
     * @notice  Returns the symbolId used in the mainnet given the srcChainId
     * @dev     PortfolioBridgeSub uses the defaultTargetChain instead of portfolio.getChainId()
     * When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC1337
     * When receiving messages back it expects the same symbolId if USDC1337 sent, USDC1337 to recieve
     * Because the subnet needs to know about different ids from different mainnets.
     * @param   _symbol  symbol of the token
     * @return  bytes32  symbolId
     */
    function getTokenId(bytes32 _symbol) internal view virtual returns (bytes32) {
        return tokenDetailsMapBySymbol[_symbol][portfolio.getChainId()];
    }

    /**
     * @notice  Returns the locally used symbol given the symbolId
     * @dev     Mainnet receives the messages in the same format that it sent out, by symbolId
     * @return  bytes32  symbolId
     */
    function getSymbolForId(bytes32 _id) internal view returns (bytes32) {
        return tokenDetailsMapById[_id].symbol;
    }

    /**
     * @notice  Returns the token details.
     * @dev     Will always return here as actionMode.OFF as auctionMode is controlled in PortfolioSub.
     * Subnet does not have any ERC20s, hence the tokenAddress is token's mainnet address.
     * See the TokenDetails struct in IPortfolio for the full type information of the return variable.
     * @param   _symbolId  SymbolId of the token.
     * @return  TokenDetails decimals (Identical to mainnet), tokenAddress (Token address at the mainnet)
     */
    function getTokenDetails(bytes32 _symbolId) external view returns (IPortfolio.TokenDetails memory) {
        return tokenDetailsMapById[_symbolId];
    }

    /**
     * @notice  Sets the default target chain id. To be extended with multichain implementation
     * @dev   Only admin can call this function
     * @param   _chainId  Default Chainid to use
     */
    function setDefaultTargetChain(uint32 _chainId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        defaultTargetChainId = _chainId;
        emit DefaultChainIdUpdated(defaultTargetChainId);
    }

    /**
     * @notice  Frontend function to get all the tokens in the portfolio
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view returns (bytes32[] memory) {
        bytes32[] memory tokens = new bytes32[](tokenList.length());
        for (uint256 i = 0; i < tokenList.length(); i++) {
            tokens[i] = tokenList.at(i);
        }
        return tokens;
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
     * @return  _xchainMsgType  XChainMsgType
     * @return  msgdata  Still encoded message data. XFER in our case. Other message type not supported yet.
     */
    function unpackMessage(bytes calldata _data)
        public
        pure
        override
        returns (XChainMsgType _xchainMsgType, bytes memory msgdata)
    {
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
     * @notice  Unpacks XFER message and replaces the symbol with the local symbol
     * @param   _data  XFER message
     * @return  xfer  Unpacked XFER message
     */
    function getXFerMessage(bytes memory _data) external view override returns (IPortfolio.XFER memory xfer) {
        xfer = unpackXFerMessage(_data);
        xfer.symbol = getSymbolForId(xfer.symbol);
    }

    /**
     * @notice  Wrapper function to send message to destination chain via bridge
     * @dev     Only PORTFOLIO_ROLE can call
     * @param   _bridge  Bridge to send message to
     * @param   _xfer XFER message to send
     */
    function sendXChainMessage(BridgeProvider _bridge, IPortfolio.XFER memory _xfer)
        external
        virtual
        override
        onlyRole(PORTFOLIO_ROLE)
    {
        sendXChainMessageInternal(_bridge, _xfer);
    }

    /**
     * @notice  Actual internal function that implements the message sending.
     * @param   _bridge  Bridge to send message to
     * @param   _xfer XFER message to send
     */
    function sendXChainMessageInternal(BridgeProvider _bridge, IPortfolio.XFER memory _xfer)
        internal
        nonReentrant
        whenNotPaused
    {
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
            require(1 == 0, "PB-RBNE-02");
        }
    }

    /**
     * @notice  Processes message received from source chain via bridge
     * @dev     if bridge is disabled or PAUSED and there are messages in flight, we still need to
                process them when received at the destination
     * @param   _bridge  Bridge to receive message from
     * @param   _srcChainId  Source chain ID
     * @param   _payload  Payload received
     */
    function processPayload(
        BridgeProvider _bridge,
        uint32 _srcChainId,
        bytes calldata _payload
    ) private {
        //Get the message Type
        (XChainMsgType _xchainMsgType, bytes memory msgdata) = unpackMessage(_payload);
        IPortfolio.XFER memory xfer;
        if (_xchainMsgType == XChainMsgType.XFER) {
            xfer = unpackXFerMessage(msgdata);
        }

        //For future use
        // else if (_xchainMsgType == XChainMsgType.GAS) {
        // }

        // Not possible to receive any messages from a bridge other than LZ
        // because no other is implemented. Add inside of an if statement in the future
        lzInNonce = xfer.nonce;

        emit XChainXFerMessage(XCHAIN_XFER_MESSAGE_VERSION, _bridge, Direction.RECEIVED, _srcChainId, 0, xfer);
        // Future task for multichain. This is a good place to update the totals by symbolId.
        // Add xfer.quantity to the totals by SymbolId. It can be used to see how much the user
        // can withdraw from the target chain.

        //After the event is raised, replace the symbol with the local symbol that is going to be used.
        xfer.symbol = getSymbolForId(xfer.symbol);

        if (checkTreshholds(xfer)) {
            portfolio.processXFerPayload(xfer.trader, xfer.symbol, xfer.quantity, xfer.transaction);
        }
    }

    /**
     * @notice  Overriden by PortfolioBridgeSub
     * @dev     Tresholds are not checked in the Mainnet neither for Incoming nor outgoing messages.
     * But they are checked in the subnet for both.
     * @return  bool  True
     */
    function checkTreshholds(IPortfolio.XFER memory) internal virtual returns (bool) {
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
        for (uint256 i = 0; i < _tokens.length; i++) {
            IERC20Upgradeable(_tokens[i]).transfer(msg.sender, IERC20Upgradeable(_tokens[i]).balanceOf(address(this)));
        }
    }

    // solhint-disable no-empty-blocks

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function executeDelayedTransfer(bytes32 _id) external virtual override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function setDelayThresholds(bytes32[] calldata _tokens, uint256[] calldata _thresholds) external virtual override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function setDelayPeriod(uint256 _period) external virtual override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function setEpochLength(uint256 _length) external virtual override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function setEpochVolumeCaps(bytes32[] calldata _tokens, uint256[] calldata _caps) external virtual override {}

    // solhint-enable no-empty-blocks

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    // we revert transaction if a non-existing function is called
    fallback() external payable {
        revert("PB-NFUN-01");
    }
}
