// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./interfaces/IPortfolioBridgeSub.sol";
import "./PortfolioBridge.sol";

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
 * different implementations in PortfolioBridgeMain & PortfolioBridgeSub. On the receival, the symbol mapping
 * will happen in different functions, either in processPayload or in getXFerMessage.
 * We need to raise the XChainXFerMessage before xfer.symbol is mapped in processPayload function so the
 * incoming and the outgoing xfer messages always contain the symbolId rather than symbol. \
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridgeSub is PortfolioBridge, IPortfolioBridgeSub {
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
    uint32 public defaultTargetChainId; // Avalanche

    uint256 public delayPeriod; // in seconds
    uint256 public epochLength; // in seconds

    mapping(bytes32 => IPortfolio.XFER) public delayedTransfers;
    mapping(bytes32 => uint256) public delayThresholds; // key is token
    mapping(bytes32 => uint256) public epochVolumes; // key is token
    mapping(bytes32 => uint256) public epochVolumeCaps; // key is token
    mapping(bytes32 => uint256) public lastOpTimestamps; // key is token

    event DelayedTransfer(string action, bytes32 id, IPortfolio.XFER xfer);
    event DelayPeriodUpdated(uint256 period);
    event DelayThresholdUpdated(bytes32 symbol, uint256 threshold);
    event EpochLengthUpdated(uint256 length);
    event EpochVolumeUpdated(bytes32 token, uint256 cap);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure override returns (bytes32) {
        return bytes32("2.2.2");
    }

    /**
     * @notice  Adds the given token to the portfolioBridge. PortfolioBridgeSub the list will be bigger as they could
     * be from different mainnet chains
     * @dev     `addToken` is only callable by admin or from Portfolio when a new subnet symbol is added for the
     * first time. The same subnet symbol but different symbolId are required when adding a token to
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

        IPortfolio.TokenDetails memory subnetToken = portfolio.getTokenDetails(_symbol);
        //subnetToken.symbol from PortfolioSub is the subnet symbol in all mappings in the PortfolioBridgeSub
        require(subnetToken.symbol == _symbol, "PB-SDMP-01");
        bytes32 symbolId = UtilsLibrary.getIdForToken(_symbol, _srcChainId);

        if (!tokenListById.contains(symbolId)) {
            tokenListById.add(symbolId);

            IPortfolio.TokenDetails storage tokenDetails = tokenDetailsMapById[symbolId];
            require(tokenDetails.symbol == "", "PB-TAEX-01");
            //tokenDetails.auctionMode = _mode; //irrelevant in this context
            tokenDetails.decimals = _decimals;
            tokenDetails.tokenAddress = _tokenAddress;
            tokenDetails.srcChainId = _srcChainId;
            tokenDetails.symbol = _symbol;
            tokenDetails.symbolId = symbolId;

            tokenDetailsMapBySymbolChainId[_symbol][_srcChainId] = symbolId;
        }
    }

    /**
     * @notice  Remove the token from the tokenDetailsMapById and tokenDetailsMapBySymbolChainId
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
            tokenListById.contains(symbolId) &&
            !(_symbol == portfolio.getNative() && _srcChainId == portfolio.getChainId())
        ) {
            delete (tokenDetailsMapById[symbolId]);
            delete (tokenDetailsMapBySymbolChainId[_symbol][_srcChainId]);
            tokenListById.remove(symbolId);
        }
    }

    /**
     * @notice  private function that handles the addition of native token
     * @dev     gets the native token details from portfolio
     */
    function addNativeToken() internal override {
        IPortfolio.TokenDetails memory t = portfolio.getTokenDetails(portfolio.getNative());
        this.addToken(t.symbol, t.tokenAddress, t.srcChainId, t.decimals, ITradePairs.AuctionMode.OFF);
    }

    /**
     * @notice  Returns the symbolId used the subnet given the targetChainId
     * @dev     PortfolioBridgeSub uses its internal token list & the defaultTargetChain to resolve the mapping
     * When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC43114
     * Because the subnet needs to know about different ids from different mainnets.
     * When sending messages Subnet to Mainnet, it resolves it back to the symbolId the target chain expects
     * @param   _symbol  symbol of the token
     * @return  bytes32  symbolId
     */

    function getTokenId(bytes32 _symbol) internal view override returns (bytes32) {
        return tokenDetailsMapBySymbolChainId[_symbol][defaultTargetChainId];
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
     * @notice  Sets the default target chain id. To be extended with multichain implementation
     * @dev   Only admin can call this function
     * @param   _chainId  Default Chainid to use
     */
    function setDefaultTargetChain(uint32 _chainId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        defaultTargetChainId = _chainId;
        emit DefaultChainIdUpdated(defaultTargetChainId);
    }

    /**
     * @notice  List of the tokens in the portfolioBridge
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
     * @param   _bridge  Bridge type to send over
     * @param   _xfer  XFER message to send
     */
    function sendXChainMessage(
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer
    ) external override onlyRole(PORTFOLIO_ROLE) {
        // Volume treshold check for multiple small transfers within a given amount of time
        // Used only for withdrawals from the subnet.
        updateVolume(_xfer.symbol, _xfer.quantity); // Reverts if breached. Does not add to delayTranfer.

        //Check individual treasholds again for withdrawals. And set them in delayed transfer if necessary.
        if (checkTresholds(_xfer)) {
            sendXChainMessageInternal(_bridge, _xfer);
        }
    }

    /**
     * @notice  Checks the volume and thresholds to delay or execute immediately
     * @dev     This function is called both in processPayload (deposits coming from mainnet)
     * as well as sendXChainMessage (withdrawals from the subnet)
     * Not bridge specific! Delayed messages will be processed by the defaultBridge
     * symbolId has already been mapped to symbol for the portfolio to properly process it
     * @param   _xfer  XFER message
     * @return  bool  True if the transfer can be executed immediately, false if it is delayed
     */
    function checkTresholds(IPortfolio.XFER memory _xfer) internal override returns (bool) {
        uint256 delayThreshold = delayThresholds[_xfer.symbol];
        if (delayThreshold > 0 && _xfer.quantity > delayThreshold) {
            bytes32 id = keccak256(
                abi.encodePacked(_xfer.nonce, _xfer.transaction, _xfer.trader, _xfer.symbol, _xfer.quantity)
            );
            addDelayedTransfer(id, _xfer);
            return false;
        } else {
            return true;
        }
    }

    /**
     * @notice  Sets delay thresholds for tokens
     * @dev     Only admin can call this function
     * @param   _tokens  Array of tokens
     * @param   _thresholds  Array of thresholds
     */
    function setDelayThresholds(
        bytes32[] calldata _tokens,
        uint256[] calldata _thresholds
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokens.length == _thresholds.length, "PB-LENM-01");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            delayThresholds[_tokens[i]] = _thresholds[i];
            emit DelayThresholdUpdated(_tokens[i], _thresholds[i]);
        }
    }

    /**
     * @notice  Sets delay period for delayed transfers
     * @dev   Only admin can call this function
     * @param   _period  Delay period in seconds
     */
    function setDelayPeriod(uint256 _period) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        delayPeriod = _period;
        emit DelayPeriodUpdated(_period);
    }

    /**
     * @notice  Adds transfer to delayed queue
     * @param   _id  Transfer ID
     * @param   _xfer  XFER message
     */
    function addDelayedTransfer(bytes32 _id, IPortfolio.XFER memory _xfer) private {
        require(delayedTransfers[_id].timestamp == 0, "PB-DTAE-01");
        delayedTransfers[_id] = _xfer;
        emit DelayedTransfer("ADDED", _id, _xfer);
    }

    /**
     * @notice  Executes delayed transfer if the delay period has passed
     * @dev     Only admin can call this function
     * @param   _id  Transfer ID
     */
    function executeDelayedTransfer(bytes32 _id) external override onlyRole(BRIDGE_ADMIN_ROLE) {
        IPortfolio.XFER storage xfer = delayedTransfers[_id];
        require(xfer.timestamp > 0, "PB-DTNE-01");
        require(block.timestamp > xfer.timestamp + delayPeriod, "PB-DTSL-01");

        if (xfer.transaction == IPortfolio.Tx.DEPOSIT) {
            portfolio.processXFerPayload(xfer.trader, xfer.symbol, xfer.quantity, xfer.transaction);
        } else if (xfer.transaction == IPortfolio.Tx.WITHDRAW) {
            sendXChainMessageInternal(defaultBridgeProvider, xfer);
        }

        emit DelayedTransfer("EXECUTED", _id, xfer);
        delete delayedTransfers[_id];
    }

    /**
     * @notice  Sets epoch length for volume control
     * @dev    Only admin can call this function
     * @param   _length  Epoch length in seconds
     */
    function setEpochLength(uint256 _length) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        epochLength = _length;
        emit EpochLengthUpdated(_length);
    }

    /**
     * @notice  Sets volume cap for tokens
     * @dev     Only admin can call this function
     * @param   _tokens  Array of tokens
     * @param   _caps  Array of caps
     */
    function setEpochVolumeCaps(
        bytes32[] calldata _tokens,
        uint256[] calldata _caps
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokens.length == _caps.length, "PB-LENM-02");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            epochVolumeCaps[_tokens[i]] = _caps[i];
            emit EpochVolumeUpdated(_tokens[i], _caps[i]);
        }
    }

    /**
     * @notice  Updates volume for token. Used only for withdrawals from the subnet.
     * @dev     Does nothing if there is no cap/limit for the token
     * Volume treshold check for multiple small transfers within a epoch.
     * @param   _token  Token symbol
     * @param   _amount  Amount to add to volume
     */
    function updateVolume(bytes32 _token, uint256 _amount) private {
        if (epochLength == 0) {
            return;
        }
        uint256 cap = epochVolumeCaps[_token];
        if (cap == 0) {
            // Default behavior no cap on any tokens
            return;
        }
        uint256 volume = epochVolumes[_token];
        uint256 timestamp = block.timestamp;
        uint256 epochStartTime = (timestamp / epochLength) * epochLength;
        if (lastOpTimestamps[_token] < epochStartTime) {
            volume = _amount;
        } else {
            volume += _amount;
        }
        require(volume <= cap, "PB-VCAP-01");
        epochVolumes[_token] = volume;
        lastOpTimestamps[_token] = timestamp;
    }
}
