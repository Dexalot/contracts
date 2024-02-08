// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./interfaces/IPortfolioBridgeSub.sol";
import "./interfaces/IDelayedTransfers.sol";
import "./PortfolioBridgeMain.sol";

/**
 * @title PortfolioBridgeSub: Bridge aggregator and message relayer for subnet using multiple different bridges
 * @notice This contracts checks volume and threshold limits for withdrawals if they are enabled
 * @dev It implements delayedTransfers as well as volume caps per epoch per token
 * Unlike PortfolioBridgeMain, PortfolioBridgeSub has its own internal list of tokenDetailsMapById and
 * tokenDetailsMapBySymbolChainId because it has to keep track of the tokenDetails from each chain independently.
 * As a result the PortfolioSub tokenDetails are quite different than the PortfolioBridgeSub tokenDetails.
 * PortfolioBridgeSub always maps the symbol that it receives into a subnet symbol on receipt, that PortfolioSub
 * expects. i.e USDC43114 is mapped to USDC. Similarly USDC1 can also be mapped to USDC. This way liquidity can
 * be combined and traded together in a multichain implementation.
 * When sending back to the target chain, it maps it back to the expected symbol by the target chain,
 * i.e USDC to USDC1 if sent back to Ethereum, USDC43114 if sent to Avalanche. \
 * Symbol mapping happens in packXferMessage on the way out. packXferMessage calls getTokenId that has
 * different implementations in PortfolioBridgeMain & PortfolioBridgeSub. On the receival, the symbol
 * mapping will happen in processPayload. getSymbolForId is called by getXFerMessage and it returns the
 * Xfer Message as is but also returns the reverse mapped local symbol. \
 * We need to raise the XChainXFerMessage & update the inventory with the symbolId so the
 * incoming and the outgoing xfer messages always contain the symbolId rather than symbol and then processPayload
 * can use the local symbol when calling portfolio methods \
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridgeSub is PortfolioBridgeMain, IPortfolioBridgeSub {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    // key is symbolId (symbol + srcChainId)
    mapping(bytes32 => IPortfolio.TokenDetails) public tokenDetailsMapById;
    // Will be more relevant once the same token symbol from different mainnet chains are sent to subnet
    // key is subnet symbol in the subnet (local symbol in the mainnet), then chainid of the
    // mainnet the token is added from.
    // symbol => chain => symbolId
    mapping(bytes32 => mapping(uint32 => bytes32)) public tokenDetailsMapBySymbolChainId;

    // Add by symbolId rather than symbol
    EnumerableSetUpgradeable.Bytes32Set private tokenListById;
    mapping(bytes32 => uint256) public inventoryBySymbolId; // key is symbolId
    IDelayedTransfers public delayedTransfers;
    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure override returns (bytes32) {
        return bytes32("3.0.0");
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
     * @param   _subnetSymbol  Subnet Symbol of the token (Shared Symbol of the same token from different chains)

     */
    function addToken(
        bytes32 _srcChainSymbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode,
        bytes32 _subnetSymbol
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
            require(tokenDetails.symbol == "", "PB-TAEX-01");
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
            tokenDetailsMapBySymbolChainId[_subnetSymbol][_srcChainId] = symbolId;
        }
    }

    /**
     * @notice  Remove the token from the tokenDetailsMapById and tokenDetailsMapBySymbolChainId
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
        require(inventoryBySymbolId[symbolId] == 0, "PB-INVZ-01");
        if (
            // We can't remove the native that was added from current chainId,
            // but the native symbol added from a mainnet can be removed.
            // ALOT added from Avalanche ALOT43114 can be removed not ALOT added from the subnet
            tokenListById.contains(symbolId) &&
            !(_subnetSymbol == portfolio.getNative() && _srcChainId == portfolio.getChainId())
        ) {
            delete (inventoryBySymbolId[symbolId]);
            delete (tokenDetailsMapById[symbolId]);
            delete (tokenDetailsMapBySymbolChainId[_srcChainSymbol][_srcChainId]);
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
        this.addToken(t.symbol, t.tokenAddress, t.srcChainId, t.decimals, ITradePairs.AuctionMode.OFF, t.symbol);
    }

    /**
     * @notice  Returns the symbolId used the subnet given the targetChainId
     * @dev     PortfolioBridgeSub uses its internal token list & the defaultTargetChain to resolve the mapping
     * When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC43114
     * Because the subnet needs to know about different ids from different mainnets.
     * When sending messages Subnet to Mainnet, it resolves it back to the symbolId the target chain expects
     * @param   _dstChainListOrgChainId  destination chain id
     * @param   _symbol  symbol of the token
     * @return  bytes32  symbolId for the destination
     */

    function getTokenId(uint32 _dstChainListOrgChainId, bytes32 _symbol) internal view override returns (bytes32) {
        return tokenDetailsMapBySymbolChainId[_symbol][_dstChainListOrgChainId];
    }

    /**
     * @notice  Returns the locally used symbol given the symbolId
     * @dev     Mainnet receives the messages in the same format that it sent out, by symbolId
     * @return  bytes32  symbolId
     */
    function getSymbolForId(bytes32 _id) internal view override returns (bytes32) {
        bytes32 symbol = tokenDetailsMapById[_id].symbol;
        require(symbol != bytes32(0), "PB-ETNS-01");
        return symbol;
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
        IPortfolio.XFER memory _xfer
    ) external override onlyRole(BRIDGE_USER_ROLE) returns (uint256 messageFee) {
        // Volume treshold check for multiple small transfers within a given amount of time
        // Used only for withdrawals from the subnet.
        delayedTransfers.updateVolume(_xfer.symbol, _xfer.quantity); // Reverts if breached. Does not add to delayTranfer.

        //Check individual treasholds again for withdrawals. And set them in delayed transfer if necessary.
        if (delayedTransfers.checkTresholds(_xfer)) {
            messageFee = sendXChainMessageInternal(_dstChainListOrgChainId, _bridge, _xfer);
        }
    }

    /**
     * @notice  Overriding empty function from PortfolioBridgeMain
     * @dev     Update the inventory by each chain only in the Subnet.
     * Inventory in the host chains are already known and don't need to be calculated
     */
    function updateInventoryBySource(IPortfolio.XFER memory _xfer) internal override {
        uint256 inventory = inventoryBySymbolId[_xfer.symbol];
        if (_xfer.transaction == IPortfolio.Tx.WITHDRAW) {
            require(_xfer.quantity <= inventory, "PB-INVT-01");
            inventoryBySymbolId[_xfer.symbol] = inventory - _xfer.quantity;
        } else if (_xfer.transaction == IPortfolio.Tx.DEPOSIT) {
            inventoryBySymbolId[_xfer.symbol] = inventory + _xfer.quantity;
        }
    }

    /**
     * @notice  Sets host chains inventories for each token
     * @dev     Only admin can call this function
     * @param   _tokens  Array of tokens in the from of SYMBOL + srcChainId
     * @param   _quantities  Array of quantities
     */
    function setInventoryBySymbolId(
        bytes32[] calldata _tokens,
        uint256[] calldata _quantities
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokens.length == _quantities.length, "PB-LENM-01");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            inventoryBySymbolId[_tokens[i]] = _quantities[i];
        }
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
     * @param   _dstChainId  lz destination chain id
     * @param   _id  Transfer ID
     */
    function executeDelayedTransfer(uint16 _dstChainId, bytes32 _id) external override onlyRole(BRIDGE_ADMIN_ROLE) {
        IPortfolio.XFER memory xfer = delayedTransfers.executeDelayedTransfer(_id);
        sendXChainMessageInternal(_dstChainId, defaultBridgeProvider, xfer);
    }

}
