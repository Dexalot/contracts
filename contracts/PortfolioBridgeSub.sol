// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./interfaces/IPortfolioBridgeSub.sol";
import "./interfaces/IDelayedTransfers.sol";
import "./PortfolioBridgeMain.sol";
import "./interfaces/IInventoryManager.sol";

/**
 * @title PortfolioBridgeSub: Bridge aggregator and message relayer for subnet using multiple different bridges
 * @notice This contracts checks volume and threshold limits for withdrawals if they are enabled in the
 * DelayedTransfers Contract that implements delayedTransfers as well as volume caps per epoch per token
 * @dev Unlike PortfolioBridgeMain, PortfolioBridgeSub has its own internal list of tokenDetailsMapById and
 * tokenInfoMapBySymbolChainId because it has to keep track of the tokenDetails from each chain independently.
 * As a result the PortfolioSub tokenDetails are quite different than the PortfolioBridgeSub tokenDetails.
 * PortfolioBridgeSub always maps the symbol that it receives into a subnet symbol and also attaches the source
 * chainId to the source Symbol to construct a symbolId to facilitate inventory management on receipt.
 * PortfolioSub expects the subnet symbol. i.e USDt is mapped to (USDT43113, USDT) as symbolId and subnet symbol
 * respectively. Similarly USDTx from another chain can also be mapped to USDC. This way liquidity can
 * be combined and traded together in a multichain implementation.
 * Similarly it keeps track of the token positions from each chain independently and it will have a different bridge
 * fee depending on the available inventory at the target chain (where the token will be withdrawn).
 * When sending back to the target chain, it maps the subnet symbol back to the expected symbol by the target chain,
 * i.e ETH to ETH if sent back to Ethereum, ETH to WETH.e if sent to Avalanche. \
 * Symbol mapping happens in sendXChainMessageInternal on the way out. sendXChainMessageInternal uses getDestChainSymbol.
 * On the receival, the symbol mapping will happen in processPayload. getSymbolMappings is used where
 * xfer.symbol is overridden with symbolId (sourceSymbol + sourceChainId) and also the subnet symbol is returned. \
 * The XChainXFerMessage always contains the host chain's ERC20 Symbol in xfer.symbol & source Chain id in
 * remoteChainId on the way in and out.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridgeSub is PortfolioBridgeMain, IPortfolioBridgeSub {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    // key is symbolId (symbol + srcChainId)
    mapping(bytes32 => IPortfolio.TokenDetails) private tokenDetailsMapById;

    // key is subnet subnet symbol then chainlistOrgid of the mainnet the token is added from.
    // the symbolId and bridgeFee of each destination is different
    // symbol => chainId => { symbolId, bridgeFee }
    mapping(bytes32 => mapping(uint32 => TokenDestinationInfo)) private tokenInfoMapBySymbolChainId;

    // Add by symbolId rather than symbol
    EnumerableSetUpgradeable.Bytes32Set private tokenListById;
    IDelayedTransfers public delayedTransfers;
    IInventoryManager public inventoryManager;

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure override returns (bytes32) {
        return bytes32("3.2.3");
    }

    /**
     * @notice  Adds the given token to the PortfolioBridgeSub. PortfolioBridgeSub the list will be bigger as they could
     * be from different mainnet chains
     * @dev     `addToken` is only callable by admin or from Portfolio when a new subnet symbol is added for the
     * first time. The same subnet symbol but a different symbolId is required when adding a token to
     * PortfolioBridgeSub. \
     * Sample Token List in PortfolioBridgeSub: (BTC & ALOT Listed twice with 2 different chain ids) \
     * Native symbol is also added as a token with 0 address \
     * Symbol, SymbolId, Decimals, address, auction mode (432204: Dexalot Subnet ChainId, 43114: Avalanche C-ChainId) \
     * ALOT ALOT432204 18 0x0000000000000000000000000000000000000000 0 (Native ALOT) \
     * ALOT ALOT43114 18 0x5FbDB2315678afecb367f032d93F642f64180aa3 0 (Avalanche ALOT) \
     * AVAX AVAX43114 18 0x0000000000000000000000000000000000000000 0 (Avalanche Native AVAX) \
     * BTC.b BTC.b43114 8 0x59b670e9fA9D0A427751Af201D676719a970857b 0 (Avalanche BTC.b) \
     * BTC BTC1 18  0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6 0 (Ethereum BTC) \
     * DEG DEG43114 18 0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf 2 \
     * LOST LOST43114 18 0x162A433068F51e18b7d13932F27e66a3f99E6890 0 \
     * SLIME SLIME43114 18 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5 0 \
     * USDC USDC43114 6 0xD5ac451B0c50B9476107823Af206eD814a2e2580 0 \
     * USDt USDt43114 6 0x38a024C0b412B9d1db8BC398140D00F5Af3093D4 0 \
     * WETH.e WETH.e43114 18 0x02b0B4EFd909240FCB2Eb5FAe060dC60D112E3a4 0 \
     * Note:
     * ALOT from the Avalanche Mainnet (Line 2 in the list) will be added with a direct function call
     * to PortfolioBridgeSub.addToken as a part of the deployment script. All other tokens have be
     * added via PortfolioSub.addToken which also calls the same PortfolioBridgeSub function. \
     * Similarly, ALOT from the Avalanche Mainnet can only be removed by PortfolioBridgeSub.removeToken
     * if it was added by mistake. All other tokens should be removed with PortfolioSub.removeToken.
     * @param   _srcChainSymbol  Source Chain Symbol of the token
     * @param   _tokenAddress  Mainnet token address the symbol or zero address for AVAX
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Decimals of the token
     * param   ITradePairs.AuctionMode  irrelevant for PBridge
     * @param   _subnetSymbol  Subnet Symbol of the token (Shared Symbol of the same token from different chains)
     * @param   _bridgeFee  Bridge Fee
     */
    function addToken(
        bytes32 _srcChainSymbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode,
        bytes32 _subnetSymbol,
        uint256 _bridgeFee
    ) external override {
        require(
            hasRole(BRIDGE_USER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
                msg.sender == address(this), // called by addNativeToken function
            "PB-OACC-01"
        );

        IPortfolio.TokenDetails memory subnetToken = portfolio.getTokenDetails(_subnetSymbol);
        //subnetToken.symbol from PortfolioSub is the subnet symbol in all mappings in the PortfolioBridgeSub
        require(subnetToken.symbol == _subnetSymbol, "PB-SDMP-01");
        bytes32 symbolId = UtilsLibrary.getIdForToken(_srcChainSymbol, _srcChainId);

        if (!tokenListById.contains(symbolId)) {
            tokenListById.add(symbolId);

            IPortfolio.TokenDetails storage tokenDetails = tokenDetailsMapById[symbolId];
            //tokenDetails.auctionMode = _mode; //irrelevant in this context
            tokenDetails.decimals = _decimals;
            tokenDetails.tokenAddress = _tokenAddress;
            tokenDetails.srcChainId = _srcChainId;
            tokenDetails.symbol = _subnetSymbol;
            tokenDetails.symbolId = symbolId;
            tokenDetails.sourceChainSymbol = _srcChainSymbol;
            // All subnet tokens in the portfolioBridgeSub are not virtual
            tokenDetails.isVirtual = _subnetSymbol == portfolio.getNative() && _srcChainId == portfolio.getChainId()
                ? false
                : true;
            tokenInfoMapBySymbolChainId[_subnetSymbol][_srcChainId] = TokenDestinationInfo(symbolId, _bridgeFee);
        }
    }

    /**
     * @notice  Remove the token from the tokenDetailsMapById and tokenInfoMapBySymbolChainId
     * @dev     Make sure that there are no in-flight messages
     * @param   _srcChainSymbol  Source Chain Symbol of the token
     * @param   _srcChainId  Source Chain id
     * @param   _subnetSymbol  symbol of the token
     */
    function removeToken(
        bytes32 _srcChainSymbol,
        uint32 _srcChainId,
        bytes32 _subnetSymbol
    ) external override whenPaused returns (bool deleted) {
        require(hasRole(BRIDGE_USER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "PB-OACC-01");
        bytes32 symbolId = UtilsLibrary.getIdForToken(_srcChainSymbol, _srcChainId);
        if (
            // We can't remove the native that was added from current chainId,
            // but the native symbol added from a mainnet can be removed.
            // ALOT added from Avalanche ALOT43114 can be removed not ALOT added from the subnet
            tokenListById.contains(symbolId) &&
            !(_subnetSymbol == portfolio.getNative() && _srcChainId == portfolio.getChainId())
        ) {
            require(inventoryManager.remove(_subnetSymbol, symbolId), "PB-INVZ-01");
            delete (tokenDetailsMapById[symbolId]);
            delete (tokenInfoMapBySymbolChainId[_srcChainSymbol][_srcChainId]);
            tokenListById.remove(symbolId);
            deleted = true;
        }
    }

    /**
     * @notice  private function that handles the addition of native token
     * @dev     gets the native token details from portfolio
     */
    function addNativeToken() internal override {
        IPortfolio.TokenDetails memory t = portfolio.getTokenDetails(portfolio.getNative());
        this.addToken(t.symbol, t.tokenAddress, t.srcChainId, t.decimals, ITradePairs.AuctionMode.OFF, t.symbol, 0);
    }

    /**
     * @notice  Returns the target symbol & symbolId given the destination chainId
     * @dev     PortfolioBridgeSub uses its internal token list & the defaultTargetChain to resolve the mapping
     * When sending from Mainnet to Subnet we send out the symbol of the sourceChain. BTC.b => BTC.b
     * When sending messages back to mainnet we use this function to resolve the symbol.
     * BTC could be resolved to BTC.b for avalanche and WBTC for Arbitrum
     * @param   _dstChainListOrgChainId destination chain id
     * @param   _subnetSymbol  subnet symbol of the token
     * @return  dstSymbol  symbol of the target chain
     * @return  dstSymbolId  symbolId of the target chain used for inventory management
     */

    function getDestChainSymbol(
        uint32 _dstChainListOrgChainId,
        bytes32 _subnetSymbol
    ) private view returns (bytes32 dstSymbol, bytes32 dstSymbolId) {
        dstSymbolId = tokenInfoMapBySymbolChainId[_subnetSymbol][_dstChainListOrgChainId].symbolId;
        dstSymbol = tokenDetailsMapById[dstSymbolId].sourceChainSymbol;
        require(dstSymbol != bytes32(0), "PB-ETNS-01");
    }

    /**
     * @notice  Returns the bridge fees for all the host chain tokens of a given subnet token
     * @param   _symbol  subnet symbol of the token
     * @param   _quantity  quantity of the token to withdraw
     * @return  bridgeFees  Array of bridge fees for each corresponding chainId
     * @return  chainIds  Array of chainIds for each corresponding bridgeFee
     */
    function getAllBridgeFees(
        bytes32 _symbol,
        uint256 _quantity
    ) external view returns (uint256[] memory bridgeFees, uint32[] memory chainIds) {
        uint256 numTokens = tokenListById.length();
        bridgeFees = new uint256[](numTokens);
        chainIds = new uint32[](numTokens);
        for (uint256 i = 0; i < numTokens; ++i) {
            bytes32 symbolId = tokenListById.at(i);
            IPortfolio.TokenDetails memory tokenDetails = tokenDetailsMapById[symbolId];
            if (tokenDetails.symbol != _symbol || tokenDetails.srcChainId == block.chainid) {
                continue;
            }
            chainIds[i] = tokenDetails.srcChainId;
            bridgeFees[i] = getBridgeFee(
                defaultBridgeProvider,
                tokenDetails.srcChainId,
                tokenDetails.symbol,
                _quantity
            );
        }
    }

    /**
     * @notice  Sets the bridge fee for each token calculated offChain for the targetChainId
     * @dev     Only admin can call this function
     * @param   _dstChainListOrgChainId  destination chain id
     * @param   _tokens  Array of Subnet Symbol
     * @param   _bridgeFees  Array of  bridge fees
     */
    function setBridgeFees(
        uint32 _dstChainListOrgChainId,
        bytes32[] calldata _tokens,
        uint256[] calldata _bridgeFees
    ) external override onlyRole(BRIDGE_ADMIN_ROLE) {
        require(_tokens.length == _bridgeFees.length, "PB-LENM-01");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            tokenInfoMapBySymbolChainId[_tokens[i]][_dstChainListOrgChainId].bridgeFee = _bridgeFees[i];
        }
    }

    /**
     * @notice  Returns the subnet symbol & symbolId given the chainListOrgChainId & source chain symbol
     * @dev     Mainnet receives the messages in the same format that it sent out, by its ERC20 symbol
     * Subnet has its own standardized list of symbols i.e. BTC.b in the mainnet may be mapped to BTC
     * in the subnet. \
     * The subnet knows which chain the message is coming from and will tag the chainId to the sourceSymbol
     * to keep track of the inventory coming from different mainnets.
     * @param   _chainListOrgChainId source/Destination chain id
     * @param   _symbol source symbol
     * @return  subnetSymbol subnetSymbol
     * @return  symbolId symbolId of the source/destination Chain, symbol + chainId
     */
    function getSymbolMappings(
        uint32 _chainListOrgChainId,
        bytes32 _symbol
    ) private view returns (bytes32 subnetSymbol, bytes32 symbolId) {
        symbolId = UtilsLibrary.getIdForToken(_symbol, _chainListOrgChainId);
        subnetSymbol = tokenDetailsMapById[symbolId].symbol;
        require(subnetSymbol != bytes32(0), "PB-ETNS-01");
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
     * @notice  List of the tokens in the PortfolioBridgeSub
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view override returns (bytes32[] memory) {
        bytes32[] memory tokens = new bytes32[](tokenListById.length());
        for (uint256 i = 0; i < tokenListById.length(); ++i) {
            tokens[i] = tokenListById.at(i);
        }
        return tokens;
    }

    /**
     * @notice  Sends XFER message to the destination chain
     * @dev     This is a wrapper to check volume and threshold while withdrawing
     * @param   _dstChainListOrgChainId   destination ChainListOrg chain id
     * @param   _bridge  Bridge type to send over
     * @param   _xfer  XFER message to send
     */
    function sendXChainMessage(
        uint32 _dstChainListOrgChainId,
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer,
        address _userFeePayer
    ) external payable virtual override nonReentrant whenNotPaused onlyRole(BRIDGE_USER_ROLE) {
        // Cross chain transfers are not supported in the subnet currently
        require(_xfer.transaction != IPortfolio.Tx.CCTRADE, "PB-CCTR-01");
        // Volume threshold check for multiple small transfers within a given amount of time
        // Used only for withdrawals from the subnet.
        // Reverts if breached. Does not add to delayTranfer.
        delayedTransfers.updateVolume(_xfer.symbol, _xfer.quantity);

        //Check individual thresholds again for withdrawals. And set them in delayed transfer if necessary.
        if (delayedTransfers.checkThresholds(_xfer, _dstChainListOrgChainId)) {
            sendXChainMessageInternal(_dstChainListOrgChainId, _bridge, _xfer, _userFeePayer);
        }
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
    ) internal virtual override {
        bytes32 subnetSymbol = _xfer.symbol;
        bytes32 destSymbolId;
        //_xfer.symbol is overridden with the symbol the destination expects in the below method
        (_xfer.symbol, destSymbolId) = getDestChainSymbol(_dstChainListOrgChainId, _xfer.symbol);
        super.sendXChainMessageInternal(_dstChainListOrgChainId, _bridge, _xfer, _userFeePayer);
        // overrite the _xfer.symbol with symbolId for proper inventory calculations
        _xfer.symbol = destSymbolId;
        updateInventoryBySource(subnetSymbol, _xfer);
    }

    /**
     * @notice  Update the inventory by each chain only in the Subnet.
     * @dev     Inventory available per host chain. i.e. USDC may exist in both Avalanche and Arbitrum
     * @param  _subnetSymbol subnet Symbol
     * @param  _xfer  Transfer Message
     */
    function updateInventoryBySource(bytes32 _subnetSymbol, IPortfolio.XFER memory _xfer) private {
        if (_xfer.transaction == IPortfolio.Tx.WITHDRAW) {
            inventoryManager.decrement(_subnetSymbol, _xfer.symbol, _xfer.quantity);
        } else if (_xfer.transaction == IPortfolio.Tx.DEPOSIT) {
            inventoryManager.increment(_subnetSymbol, _xfer.symbol, _xfer.quantity);
        }
    }

    /**
     * @notice  Processes message received from source chain via bridge in the subnet.
     * @dev     if bridge is disabled or PAUSED and there are messages in flight, we still need to
                process them when received at the destination.
                Resolves the subnetSymbol and updates the inventory
     * @param   _bridge  Bridge to receive message from
     * @param   _srcChainListOrgChainId  Source chain ID
     * @param   _payload  Payload received
     */
    function processPayload(
        BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        bytes calldata _payload
    ) internal override {
        IPortfolio.XFER memory xfer = processPayloadShared(_bridge, _srcChainListOrgChainId, _payload);
        bytes32 subnetSymbol;
        // overwrite the xfer.symbol with the sourceSymbol + chainId
        (subnetSymbol, xfer.symbol) = getSymbolMappings(_srcChainListOrgChainId, xfer.symbol);
        // Update the totals by symbolId for multichain inventory management.
        // Add xfer.quantity to the totals by SymbolId. It will be used to see how much the user
        // can withdraw from the target chain.
        updateInventoryBySource(subnetSymbol, xfer);
        //After the inventory is updated, process the XFer with the subnet symbol that Portfolio needs
        xfer.symbol = subnetSymbol;
        portfolio.processXFerPayload(xfer);
    }

    /**
     * @notice  Set DelayedTransfers address
     * @dev     Only admin can set DelayedTransfers address.
     * @param   _delayedTransfers  DelayedTransfers address
     */
    function setDelayedTransfer(address _delayedTransfers) external onlyRole(DEFAULT_ADMIN_ROLE) {
        delayedTransfers = IDelayedTransfers(_delayedTransfers);
    }

    /**
     * @notice  Executes delayed transfer if the delay period has passed
     * @dev     Only admin can call this function
     * @param   _id  Transfer ID
     */
    function executeDelayedTransfer(bytes32 _id) external override nonReentrant onlyRole(BRIDGE_ADMIN_ROLE) {
        (IPortfolio.XFER memory xfer, uint32 dstChainListOrgChainId) = delayedTransfers.executeDelayedTransfer(_id);
        sendXChainMessageInternal(dstChainListOrgChainId, defaultBridgeProvider, xfer, address(0));
    }

    function setInventoryManager(address _inventoryManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        inventoryManager = IInventoryManager(_inventoryManager);
    }

    /**
     * @notice  Returns the minimum bridgeFee calculated offChain for the targetChainId, in addition to the
     * inventoryManager calculated withdrawal fee
     * @dev     This is in terms of token transferred. LZ charges us using based on the payload size and gas px at
     * destination. Our offchain app monitors the gas at the destination and sets the gas using LZ based estimation
     * and the Token/ALOT parity at that point. The inventoryManager calculates the withdrawal fee based on the
     * quantity of the token to be withdrawn, current inventory in the receiving chain and other chains.
     * @param   _bridge  Bridge provider to use
     * @param   _dstChainListOrgChainId  destination chain id
     * @param   _symbol  subnet symbol of the token
     * @param   _quantity  quantity of the token to withdraw
     * @return  bridgeFee  bridge fee for the destination
     */

    function getBridgeFee(
        BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId,
        bytes32 _symbol,
        uint256 _quantity
    ) public view override returns (uint256 bridgeFee) {
        if (_bridge == BridgeProvider.LZ) {
            bridgeFee = tokenInfoMapBySymbolChainId[_symbol][_dstChainListOrgChainId].bridgeFee;
        }
        (, bytes32 symbolId) = getDestChainSymbol(_dstChainListOrgChainId, _symbol);
        bridgeFee += inventoryManager.calculateWithdrawalFee(_symbol, symbolId, _quantity);
    }
}
