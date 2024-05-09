// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./Portfolio.sol";
import "./interfaces/IPortfolioSub.sol";
import "./interfaces/IGasStation.sol";
import "./interfaces/IPortfolioMinter.sol";
import "./interfaces/IPortfolioBridgeSub.sol";
import "./interfaces/ITradePairs.sol";
import "./interfaces/IPortfolioSubHelper.sol";

/**
 * @title  Subnet Portfolio
 * @notice Receives messages from mainnet for deposits and sends withdraw requests to mainnet.  It also
   transfers tokens between traders as their orders gets matched.
 * @dev    Allows only the native token to be withdrawn and deposited from/to the subnet wallet. Any other
 * token has to be deposited via PortfolioMain deposit functions that sends a message via the bridge.
 * When the bridge's message receive event emitted PortfolioBridgeSub invokes processXFerPayload \
 * All tokens including ALOT (native) can be withdrawn to mainnet using withdrawToken that will
 * send the holdings back to the user's wallet in the mainnet. \
 * TradePairs needs to have EXECUTOR_ROLE on PortfolioSub contract. \
 * If a trader deposits a token and has 0 ALOT in his subnet wallet, this contract will make a call
 * to GasStation to deposit a small amount of ALOT to the user's wallet to be used for gas.
 * In return, It will deduct a tiny amount of the token transferred. This feature is called AutoFill
 * and it aims shield the clients from gas Token management in the subnet.
 * It is suffice to set usedForGasSwap=false for all tokens to disable autofill using tokens. ALOT can and
 * will always be used for this purpose.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioSub is Portfolio, IPortfolioSub {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    // structure to track an asset
    struct AssetEntry {
        uint256 total;
        uint256 available;
    }
    // account address to assets map
    mapping(address => mapping(bytes32 => AssetEntry)) public assets;
    // bytes32 symbols to uint256(total) token map
    // Used for sanity checks that periodically compares subnet balances to the Mainnet balances.
    // Incremented only with Tx.DEPOSIT
    // Decremented only with Tx.WITHDRAW.
    // It assumes all funds originate from the mainnet without any exceptions. As a result, amounts
    // transferred from/to wallet in the subnet are ignored (add/remove gas)
    // as well as autofill and account to account subnet transfers and Executions(token swaps)
    // 100 ALOT transferred from the mainnet
    // 100 ALOT is logged in tokenTotals. Any autofill that this may trigger(0.1) or any add/remove gas
    // using some of this ALOT(10 AddGas) or tx.IXFERSENT (toAddress: 20) does not change the fact that subnet has
    // 69.99(PortfolioSub) + 0.01(wallet) + 10(again same wallet) + 20(toAddress) = 100 ALOT in total.
    // tokenTotals does not keep track of ALOT being burned as gas. It assumes they are readily available in the
    // users wallet to be redoposited back to PortfolioSub.
    // GasStation & PortfolioBridgeSub should always be funded with ALOT that is sent from the mainnet.
    mapping(bytes32 => uint256) public tokenTotals;

    IGasStation private gasStation;
    IPortfolioMinter private portfolioMinter;
    // account for collecting autoFill transactions and also bridge fees
    address private treasury;
    // account collecting trading fees
    address public feeAddress;
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    // keep track of deposited and burned native tokens
    uint256 public totalNativeBurned;

    // version
    bytes32 public constant VERSION = bytes32("2.5.4");

    IPortfolioSubHelper private portfolioSubHelper;

    /**
     * @notice  Initializer for upgradeable Portfolio Sub
     * @param   _native  Native token of the chain
     * @param   _chainId  ChainId of the chain

     */
    function initialize(bytes32 _native, uint32 _chainId) public override initializer {
        Portfolio.initialize(_native, _chainId);
        // Always Add native with 0 Bridge Fee and 1 gasSwapRatio (1 ALOT for 1 ALOT)
        TokenDetails memory details = TokenDetails(
            18,
            address(0),
            ITradePairs.AuctionMode.OFF,
            _chainId,
            native,
            bytes32(0),
            native,
            false
        );
        addTokenInternal(details, 0, 1 * 10 ** 18);
    }

    /**
     * @notice  Adds the given token to the portfolio
     * @dev     Only callable by admin.
     * We don't allow tokens with the same symbols but different addresses.
     * Native symbol is also added by default with 0 address.
     * @param   _srcChainSymbol  Source Chain Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Decimals of the token
     * @param   _mode  Starting auction mode of the token
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     * @param   _subnetSymbol  Subnet Symbol of the token
     */
    function addToken(
        bytes32 _srcChainSymbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bytes32 _subnetSymbol
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        // Can't add Native Token because it has already been added in the Portfolio initialization
        if (_subnetSymbol != native) {
            TokenDetails memory details = TokenDetails(
                _decimals,
                _tokenAddress,
                _mode, // Auction Mode is ignored as it is irrelevant in the Mainnet
                _srcChainId,
                _subnetSymbol, //symbol
                bytes32(0), //symbolId
                _srcChainSymbol, //sourceChainSymbol
                true // All tokens in the subnet are virtual except native ALOT
            );

            addTokenInternal(details, _fee, _gasSwapRatio);
        }
    }

    /**
     * @notice  Adds the given token to the portfolioSub with 0 address in the subnet.
     * @dev     This function is only callable by admin. \
     * We don't allow tokens with same symbols. \
     * Native symbol is also added as a token with 0 address. \
     * PortfolioSub keeps track of total deposited tokens in tokenTotals for sanity checks against mainnet. It has
     * no ERC20 Contracts hence, it overwrites the addresses with address(0) and isVirtual =true except native ALOT. \
     * It also adds the token to the PortfolioBridgeSub with the proper sourceChainid
     * Tokens in PortfolioSub has ZeroAddress but PortfolioBridgeMain has the proper address from each chain
     * Sample Token List in PortfolioSub: \
     * Symbol, SymbolId, Decimals, address, auction mode (432204: Dexalot Subnet ChainId) \
     * ALOT ALOT432204 18 0x0000000000000000000000000000000000000000 0 \
     * AVAX AVAX432204 18 0x0000000000000000000000000000000000000000 0 \
     * BTC.b BTC.b432204 8 0x0000000000000000000000000000000000000000 0 \
     * DEG DEG432204 18 0x0000000000000000000000000000000000000000 2 \
     * LOST LOST432204 18 0x0000000000000000000000000000000000000000 0 \
     * SLIME SLIME432204 18 0x0000000000000000000000000000000000000000 0 \
     * USDC USDC432204 6 0x0000000000000000000000000000000000000000 0 \
     * USDt USDt432204 6 0x0000000000000000000000000000000000000000 0 \
     * WETH.e WETH.e432204 18 0x0000000000000000000000000000000000000000 0 \
     * @param   _details  Token Details
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT

     */
    function addTokenInternal(TokenDetails memory _details, uint256 _fee, uint256 _gasSwapRatio) internal override {
        address mainnetAddress = _details.tokenAddress;
        uint32 srcChainId = _details.srcChainId;
        if (!tokenList.contains(_details.symbol)) {
            // All tokens from mainnet have 0 address including AVAX because subnet doesn't have ERC20
            _details.tokenAddress = address(0);
            // Subnet symbols are all virtual but need to be added with the subnet chainId
            _details.srcChainId = chainId;
            super.addTokenInternal(_details, _fee, _gasSwapRatio);
            // Tokens are added with default usedForGasSwap=false. They need to be set to true if/when necessary
            // except ALOT. It can always be used for this purpose
            if (_details.symbol == bytes32("ALOT")) {
                setBridgeParamInternal(_details.symbol, _fee, _gasSwapRatio, true);
            } else {
                setBridgeParamInternal(_details.symbol, _fee, 0, false);
            }

            tokenTotals[_details.symbol] = 0; //set totals to 0
        }
        // Don't add native here as PortfolioBridgeSub may not be initialized yet
        // Native added when portfolioBridgeSub.SetPortfolio
        if (_details.symbol != native && address(portfolioBridge) != address(0)) {
            //Adding to PortfolioBridgeSub with the proper mainnet address and srcChainId
            IPortfolioBridgeSub(address(portfolioBridge)).addToken(
                _details.sourceChainSymbol,
                mainnetAddress,
                srcChainId,
                _details.decimals,
                _details.auctionMode,
                _details.symbol,
                _fee
            );
        }
    }

    /**
     * @notice  Sets the bridge provider fee & gasSwapRatio per ALOT for the given token and usedForGasSwap flag
     * @dev     Called by Portfolio.initialize() as well as setBridgeParam()
     * For auction tokens or any non major tokens this needs to be set as gasSwapRatio =0 & usedForGasSwap= false
     * Because we don't want to swap gas with any thinly traded tokens or tokens with high volatility
     * gasSwapRatio will be updated multiple times a day with an offchain app with the current market prices
     * except for ALOT which is always 1 to 1 and minors (usedForGasSwap==false).
     * amount of gas swapped is quite miniscule (0.1 ALOT is set in GasStation $0.014 as of 2022-12-07 )
     * @param   _symbol  Symbol of the token
     * @param   _fee  Fee to be set
     * @param   _gasSwapRatio  Amount of token to swap per ALOT. Always set it to equivalent of 1 ALOT.
     * @param   _usedForGasSwap  bool to control the list of tokens that can be used for gas swap. Mostly majors
     */
    function setBridgeParamInternal(
        bytes32 _symbol,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bool _usedForGasSwap
    ) internal override {
        require(
            // if not used forGasSwap set it with 0 (i.e Auction Tokens, minors)
            (!_usedForGasSwap && _gasSwapRatio == 0) ||
                // if majors gasSwap needs to be >0 when _usedForGasSwap=true
                (_gasSwapRatio > 0 && _usedForGasSwap),
            "P-GSRO-01"
        );
        super.setBridgeParamInternal(_symbol, _fee, _gasSwapRatio, _usedForGasSwap);
    }

    /**
     * @notice  Trading commissions are collected in this account.
     * @dev     Only callable by the owner
     * @param   _feeAddress  Address to collect trading fees
     */
    function setFeeAddress(address _feeAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeAddress != address(0), "P-OACC-02");
        emit AddressSet("PORTFOLIO", "SET_FEEADDRESS", feeAddress, _feeAddress);
        feeAddress = _feeAddress;
    }

    /**
     * @notice  Set auction mode for a token
     * @dev   Only callable by the default admin or TradePairs
     * @param   _symbol  Symbol of the token
     * @param   _mode  New auction mode
     */
    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external {
        require(hasRole(EXECUTOR_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-04");
        uint256 oldValue = uint256(tokenDetailsMap[_symbol].auctionMode);
        tokenDetailsMap[_symbol].auctionMode = _mode;
        emit ParameterUpdated(_symbol, "P-AUCTION", oldValue, uint256(_mode));
    }

    /**
     * @notice  Frontend function to show traders total and available balance for a token
     * @param   _owner  Address of the trader
     * @param   _symbol  Symbol of the token
     * @return  total  Total balance of the trader
     * @return  available  Available balance of the trader
     * @return  assetType  Type of the token
     */
    function getBalance(
        address _owner,
        bytes32 _symbol
    ) external view override returns (uint256 total, uint256 available, AssetType assetType) {
        assetType = AssetType.NONE;
        if (native == _symbol) {
            assetType = AssetType.NATIVE;
        } else if (tokenList.contains(_symbol)) {
            // This includes the native as well
            assetType = AssetType.ERC20;
        }
        AssetEntry storage asset = assets[_owner][_symbol];
        return (asset.total, asset.available, assetType);
    }

    /**
     * @notice  Function for TradePairs to transfer tokens between addresses as a result of an execution
     * @dev     This function calculates the fee to be applied to the orders and it also looks up if
     * a rate override mapping.
     * WHEN Increasing in addExecution the amount is applied to both total and available
     * (so SafeIncrease can be used) as opposed to
     * WHEN Decreasing in addExecution the amount is only applied to total. (SafeDecrease
     * can NOT be used, so we have safeDecreaseTotal instead)
     * i.e. (USDT 100 Total, 50 Available after we send a BUY order of 10 avax at 5$.
     * Partial Exec 5 at $5. Total goes down to 75. Available stays at 50)
     * @param   _tradePair  TradePair struct
     * @param   _makerSide  Side of the maker
     * @param   _makerAddr  Address of the maker
     * @param   _takerAddr  Address of the taker

     * @param   _baseAmount  Amount of the base token
     * @param   _quoteAmount  Amount of the quote token
     * @return  makerfee Maker fee
     * @return  takerfee Taker fee
     */
    function addExecution(
        bytes32 _tradePairId,
        ITradePairs.TradePair calldata _tradePair,
        ITradePairs.Side _makerSide,
        address _makerAddr,
        address _takerAddr,
        uint256 _baseAmount,
        uint256 _quoteAmount
    ) external override returns (uint256 makerfee, uint256 takerfee) {
        // Only TradePairs can call PORTFOLIO addExecution
        require(hasRole(EXECUTOR_ROLE, msg.sender), "P-OACC-03");

        (uint256 makerRate, uint256 takerRate) = portfolioSubHelper.getRates(
            _makerAddr,
            _takerAddr,
            _tradePairId,
            uint256(_tradePair.makerRate),
            uint256(_tradePair.takerRate)
        );
        makerfee = calculateFee(_tradePair, _makerSide, _baseAmount, _quoteAmount, makerRate);
        takerfee = calculateFee(
            _tradePair,
            _makerSide == ITradePairs.Side.BUY ? ITradePairs.Side.SELL : ITradePairs.Side.BUY,
            _baseAmount,
            _quoteAmount,
            takerRate
        );

        // if _maker.side = BUY then _taker.side = SELL
        if (_makerSide == ITradePairs.Side.BUY) {
            // decrease maker quote and incrase taker quote
            transferToken(_makerAddr, _takerAddr, _tradePair.quoteSymbol, _quoteAmount, takerfee, Tx.EXECUTION, true);
            // increase maker base and decrase taker base
            transferToken(_takerAddr, _makerAddr, _tradePair.baseSymbol, _baseAmount, makerfee, Tx.EXECUTION, false);
        } else {
            // increase maker quote and decrease taker quote
            transferToken(_takerAddr, _makerAddr, _tradePair.quoteSymbol, _quoteAmount, makerfee, Tx.EXECUTION, false);
            // decrease maker base and incrase taker base
            transferToken(_makerAddr, _takerAddr, _tradePair.baseSymbol, _baseAmount, takerfee, Tx.EXECUTION, true);
        }
    }

    /**
     * @notice  Calculates the commission
     * @dev     Commissions are rounded down based on evm and display decimals to avoid DUST
     * @param   _tradePair  TradePair struct
     * @param   _side  order side
     * @param   _quantity  execution quantity
     * @param   _quoteAmount  quote amount
     * @param   _rate  taker or maker rate
     */

    function calculateFee(
        ITradePairs.TradePair calldata _tradePair,
        ITradePairs.Side _side,
        uint256 _quantity,
        uint256 _quoteAmount,
        uint256 _rate
    ) private pure returns (uint256 lastFeeRounded) {
        lastFeeRounded = _side == ITradePairs.Side.BUY
            ? UtilsLibrary.floor((_quantity * _rate) / TENK, _tradePair.baseDecimals - _tradePair.baseDisplayDecimals)
            : UtilsLibrary.floor(
                (_quoteAmount * _rate) / TENK,
                _tradePair.quoteDecimals - _tradePair.quoteDisplayDecimals
            );
    }

    /**
     * @notice  Processes the message coming from the bridge
     * @dev     DEPOSIT message is the only message that can be sent to portfolioSub for the moment
     * Even when the contract is paused, this method is allowed for the messages that
     * are in flight to complete properly.
     * CAUTION: if Paused for upgrade, wait to make sure no messages are in flight, then upgrade.
     * @param   _xfer  Transfer message
     */
    function processXFerPayload(
        IPortfolio.XFER calldata _xfer
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        // Should not avoid revert if symbol not found. This will block the bridge
        require(tokenList.contains(_xfer.symbol), "P-ETNS-01");
        require(_xfer.quantity > 0, "P-ZETD-01");
        // Only allow deposits in the subnet from PortfolioBridgeSub that has
        // PORTFOLIO_BRIDGE_ROLE and not from the users
        if (_xfer.transaction == Tx.DEPOSIT) {
            // Deposit the entire amount to the portfolio first
            safeIncrease(_xfer.trader, _xfer.symbol, _xfer.quantity, 0, _xfer.transaction, _xfer.trader);
            // Use some of the newly deposited portfolio holding to fill up Gas Tank
            autoFillPrivate(_xfer.trader, _xfer.symbol, _xfer.transaction);
        } else {
            revert("P-PTNS-01");
        }
    }

    /**
     * @notice  Deposits small amount of gas Token (ALOT) to trader's wallet in exchange of the token
     * held in the trader's portfolio. (It can by any token including ALOT)
     * @dev     Only called by TradePairs from doCancelOrder. Cancels makes tokens available.
     * doCancelOrder is a good place to auto Fill Gas Tank with newly available funds.
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol to be used in exchange of Gas Token. ALOT or any other
     */
    function autoFill(address _trader, bytes32 _symbol) external override whenNotPaused {
        require(hasRole(EXECUTOR_ROLE, msg.sender), "P-OACC-03");
        // Trade pairs listed in TradePairs are guaranteed to be synched with Portfolio tokens at
        // when adding exchange.addTradePair. No need for a require check here.
        autoFillPrivate(_trader, _symbol, Tx.AUTOFILL);
    }

    /**
     * @notice  Deposits small amount of gas Token (ALOT) to trader's wallet in exchange of the token
     * held in the trader's portfolio. (It can be any token including ALOT)
     * @dev     Allow only when the traders total ALOT holdings < gasAmount
     * Minimal use of require statements, and lots of if checks to avoid blocking the bridge as it is
     * also called by processXFerPayload \
     * Users will always have some ALOT deposited to their gasTank if they start from the mainnet with any token
     * Hence it is not possible to have a portfolioSub holding without gas in the GasTank
     * In other words: if assets[_trader][_symbol].available > 0 then _trader.balance will be > 0 \
     * Same in the scenario when person A sends tokens to person B who has no gas in his gasTank
     * using transferToken in the subnet because autoFillPrivate is also called
     * if the recipient has ALOT in his portfolio, his ALOT inventory is used to deposit to wallet even when a
     * different token is sent, so swap doesn't happen in this case. \
     * Swap happens using the token sent only when there is not enough ALOT in the recipient portfolio and wallet
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token. ALOT or any other
     * @param   _transaction  Transaction type
     * @return  tankFull  Trader's Gas Tank status
     */
    function autoFillPrivate(address _trader, bytes32 _symbol, Tx _transaction) private returns (bool tankFull) {
        // Default amount of ALOT to be transferred into traders Subnet Wallet(Gas Tank)
        uint256 gasAmount = gasStation.gasAmount();
        // Start refilling at 50%
        if (_trader.balance <= ((gasAmount * 5) / 10)) {
            // User has enough ALOT in his portfolio, no need to swap ALOT with the token sent
            // Just withdraw ALOT from his portfolio to his wallet
            if (gasAmount <= assets[_trader][native].available) {
                withdrawNativePrivate(_trader, gasAmount);
                tankFull = true;
            } else if (address(gasStation).balance >= gasAmount) {
                // if the swap rate is not set for the token or canUseForSwap is false then getSwapAmount returns 0
                // and no gas is deposited to the users wallet Unless it is a DEPOSIT transaction from the mainnet
                // amountToSwap : Amount of token to be deducted from trader's portfolio and transferred to treasury
                // in exchange for the replenishmentAmount(ALOT) deposited in trader's wallet
                uint256 amountToSwap = getSwapAmount(_symbol, gasAmount);
                if (amountToSwap > 0) {
                    if (amountToSwap <= assets[_trader][_symbol].available) {
                        transferToken(_trader, treasury, _symbol, amountToSwap, 0, Tx.AUTOFILL, false);
                        gasStation.requestGas(_trader, gasAmount);
                        tankFull = true;
                    }
                    // Always deposit some ALOT for any tokens coming from the mainnet, if the trader has 0 balance
                    // We don't want the user to through the hassle of acquiring our subnet gas token ALOT first in
                    // order to initiate a transaction. This is equivalent of an airdrop
                    // but can't be exploited because the gas fee paid by the user in terms of mainnet gas token
                    // for this DEPOSIT transaction (AVAX) is well above the airdrop they get.
                } else if (_transaction == Tx.DEPOSIT && _trader.balance == 0) {
                    gasStation.requestGas(_trader, gasAmount);
                    tankFull = true;
                }
            }
        } else {
            tankFull = true;
        }
    }

    /**
     * @notice   This function is only used to deposit native ALOT from the subnet wallet to
     * the portfolio. Also referred as RemoveGas
     * @param   _from  Address of the depositor
     */
    function depositNative(
        address payable _from,
        IPortfolioBridge.BridgeProvider
    ) external payable override whenNotPaused nonReentrant {
        require(_from == msg.sender || msg.sender == address(this), "P-OOWN-02"); // calls made by super.receive()
        require(allowDeposit, "P-NTDP-01");
        // We burn the deposit amount but still credit the user account because we minted the ALOT with withdrawNative
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = address(0).call{value: msg.value}("");
        require(sent, "P-BF-01");
        // the ending balance cannot be lower than the twice the gasAmount that we would deposit
        // using autoFill. Currently 0.1*2= 0.2 ALOT
        require(_from.balance >= gasStation.gasAmount() * 2, "P-BLTH-01");
        totalNativeBurned += msg.value;
        safeIncrease(_from, native, msg.value, 0, Tx.REMOVEGAS, _from);
    }

    /**
     * @notice   This function is used to withdraw only native ALOT from the portfolio
     * into the subnet wallet. Also referred as AddGas
     * @dev      This function decreases ALOT balance of the user and calls the PortfolioMinter to mint the native ALOT
     * @param   _to  Address of the withdrawer
     * @param   _quantity  Amount of the native ALOT to withdraw
     */
    function withdrawNative(address payable _to, uint256 _quantity) external override whenNotPaused nonReentrant {
        require(_to == msg.sender, "P-OOWN-01");
        withdrawNativePrivate(_to, _quantity);
    }

    /**
     * @notice  See withdrawNative
     * @param   _to  Address of the withdrawer
     * @param   _quantity  Amount of the native ALOT to withdraw
     */
    function withdrawNativePrivate(address _to, uint256 _quantity) private {
        safeDecrease(_to, native, _quantity, 0, Tx.ADDGAS, _to);
        portfolioMinter.mint(_to, _quantity);
    }

    /**
     * @notice  Withdraws token to the default destination chain. Keeping it for backward compatibility
     * @param   _to  Address of the withdrawer
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     * @param   _bridge  Enum bridge type
     */
    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external override {
        require(_to == msg.sender, "P-OOWT-01");
        this.withdrawToken(_to, _symbol, _quantity, _bridge, portfolioBridge.getDefaultDestinationChain());
    }

    /**
     * @notice  Withdraws token to a destination chain
     * @param   _to  Address of the withdrawer
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     * @param   _bridge  Enum bridge type
     * @param   _dstChainListOrgChainId  Destination chain the token is being withdrawn
     */
    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId
    ) external override whenNotPaused nonReentrant {
        require(tokenDetailsMap[_symbol].auctionMode == ITradePairs.AuctionMode.OFF, "P-AUCT-01");
        require(_to == msg.sender || msg.sender == address(this), "P-OOWT-01");
        require(tokenList.contains(_symbol), "P-ETNS-01");
        // bridgeFee = bridge Fees both in the Mainnet the subnet
        // no bridgeFees for treasury and feeCollector (isAdminAccountForRates)
        // bridgeParams[_symbol].fee is redundant in the subnet and has been replaced
        // with portfolioBridge.getBridgeFee which uses
        // portfolioBridgeSub.tokenInfoMapBySymbolChainId mapping as of Apr 1, 2024 CD
        uint256 bridgeFee = portfolioSubHelper.isAdminAccountForRates(_to)
            ? 0
            : portfolioBridge.getBridgeFee(_bridge, _dstChainListOrgChainId, _symbol, _quantity);
        // We need to safeDecrease with the original(non-converted _symbol)
        safeDecrease(_to, _symbol, _quantity, bridgeFee, Tx.WITHDRAW, _to);
        portfolioBridge.sendXChainMessage(
            _dstChainListOrgChainId,
            _bridge,
            XFER(
                0, // Nonce to be assigned in PBridge
                Tx.WITHDRAW,
                _to,
                _symbol,
                // Send the Net amount to Mainnet
                _quantity - bridgeFee,
                block.timestamp,
                bytes28(0)
            ),
            _to
        );
    }

    /**
     * @notice  Increases the balance of the user
     * @dev     `_feeCharged` is deducted from the `_amount` before it is reflected in the user's balance
     * `_feeCharged` is transferred to feeAddress
     * Adds to tokenTotals: cumulative deposits per symbol for sanity checks with the mainnet
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _amount  Amount of the token
     * @param   _feeCharged  Fee charged for the _transaction
     * @param   _transaction  Transaction type
     */
    function safeIncrease(
        address _trader,
        bytes32 _symbol,
        uint256 _amount,
        uint256 _feeCharged,
        Tx _transaction,
        address _traderOther
    ) private {
        require(_amount > 0 && _amount >= _feeCharged, "P-TNEF-01");
        uint256 quantityLessFee = _amount - _feeCharged;
        AssetEntry storage asset = assets[_trader][_symbol];
        asset.total = asset.total + quantityLessFee;
        asset.available = asset.available + quantityLessFee;
        //Commissions are always taken from incoming currency. This takes care of ALL EXECUTION and DEPOSIT and INTXFER
        safeTransferFee(feeAddress, _symbol, _feeCharged);
        if (_transaction == Tx.DEPOSIT) {
            tokenTotals[_symbol] = tokenTotals[_symbol] + _amount;
        }
        emitPortfolioEvent(_trader, _symbol, _amount, _feeCharged, _transaction, _traderOther);
    }

    /**
     * @notice  Decreases the total balance of the user
     * @dev     `_feeCharged` is passed here for information purposes to be included in the event
     * `_feeCharged` does not change the user balance inside this function
     * Removes from tokenTotals: cumulative deposits per symbol for sanity checks with the mainnet
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _amount  Amount of the token
     * @param   _feeCharged  Fee charged for the transaction
     * @param   _transaction  Transaction type
     */
    function safeDecreaseTotal(
        address _trader,
        bytes32 _symbol,
        uint256 _amount,
        uint256 _feeCharged,
        Tx _transaction,
        address _traderOther
    ) private {
        AssetEntry storage asset = assets[_trader][_symbol];
        require(_amount > 0 && _amount > _feeCharged, "P-WUTH-01");
        require(_amount <= asset.total, "P-TFNE-01");
        // decrease the total quantity from the user balances.
        asset.total = asset.total - _amount;
        // This is bridge fee going to treasury. Commissions go to feeAddress
        safeTransferFee(treasury, _symbol, _feeCharged);
        if (_transaction == Tx.WITHDRAW) {
            require(_amount <= tokenTotals[_symbol], "P-AMVL-01");
            // _feeCharged is still left in the subnet
            tokenTotals[_symbol] = tokenTotals[_symbol] - (_amount - _feeCharged);
        }
        emitPortfolioEvent(_trader, _symbol, _amount, _feeCharged, _transaction, _traderOther);
    }

    /**
     * @notice  Decreases the available balance of the user
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _amount  Amount of the token
     * @param   _feeCharged  Fee charged for the transaction
     * @param   _transaction  Transaction type
     */
    function safeDecrease(
        address _trader,
        bytes32 _symbol,
        uint256 _amount,
        uint256 _feeCharged,
        Tx _transaction,
        address _traderOther
    ) private {
        AssetEntry storage asset = assets[_trader][_symbol];
        require(_amount <= asset.available, "P-AFNE-02");
        asset.available = asset.available - _amount;
        safeDecreaseTotal(_trader, _symbol, _amount, _feeCharged, _transaction, _traderOther);
    }

    /**
     * @notice  Function for TradePairs to adjust total and available as a result of an order update
     * @param   _transaction  Transaction type
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _amount  Amount of the token
     */
    function adjustAvailable(Tx _transaction, address _trader, bytes32 _symbol, uint256 _amount) external override {
        // Only TradePairs can call PORTFOLIO adjustAvailable
        require(hasRole(EXECUTOR_ROLE, msg.sender), "P-OACC-03");
        AssetEntry storage asset = assets[_trader][_symbol];
        if (_transaction == Tx.INCREASEAVAIL) {
            asset.available = asset.available + _amount;
        } else if (_transaction == Tx.DECREASEAVAIL) {
            require(_amount <= asset.available, "P-AFNE-01");
            asset.available = asset.available - _amount;
        } else {
            revert("P-WRTT-02");
        }
        emitPortfolioEvent(_trader, _symbol, _amount, 0, _transaction, _trader);
    }

    /**
     * @param   _from  Address of the sender
     * @param   _to  Address of the receiver
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     * @param   _feeCharged  Fee charged for the transaction
     * @param   _transaction  Transaction type
     * @param   _decreaseTotalOnly  If true, only total balance is decreased
     */
    function transferToken(
        address _from,
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _feeCharged,
        Tx _transaction,
        bool _decreaseTotalOnly
    ) private {
        // _feeCharged is always in incoming currency when transferring as a part of EXECUTION
        // Hence both safeDecreaseTotal and safeDecrease that handle outgoing currency, overwrite _feeCharged to 0.
        _decreaseTotalOnly
            ? safeDecreaseTotal(_from, _symbol, _quantity, 0, _transaction, _to)
            : safeDecrease(_from, _symbol, _quantity, 0, _transaction, _to);

        // Replaced with IXFERREC in SafeIncrease because we want this event to be captured and showed to the recipient
        safeIncrease(
            _to,
            _symbol,
            _quantity,
            _feeCharged,
            _transaction == Tx.IXFERSENT ? Tx.IXFERREC : _transaction,
            _from
        );
    }

    /**
     * @notice  Transfers token from the `msg.sender`'s portfolio to `_to`'s portfolio
     * @dev     This is not a ERC20 transfer, this is a balance transfer between portfolios
     * @param   _to  Address of the receiver
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     */
    function transferToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity
    ) external override whenNotPaused nonReentrant {
        require(tokenList.contains(_symbol), "P-ETNS-01");
        require(_to != msg.sender, "P-DOTS-01");
        //Can not transfer auction tokens
        require(tokenDetailsMap[_symbol].auctionMode == ITradePairs.AuctionMode.OFF, "P-AUCT-01");
        transferToken(msg.sender, _to, _symbol, _quantity, 0, Tx.IXFERSENT, false);
        autoFillPrivate(_to, _symbol, Tx.AUTOFILL);
    }

    /**
     * @notice  Transfers the fees collected to the fee or treasury address
     * @param   _to  fee or treasury address
     * @param   _symbol  Symbol of the token
     * @param   _feeCharged  Fee charged for the transaction
     */
    function safeTransferFee(address _to, bytes32 _symbol, uint256 _feeCharged) private {
        if (_feeCharged > 0) {
            AssetEntry storage asset = assets[_to][_symbol];
            asset.total = asset.total + _feeCharged;
            asset.available = asset.available + _feeCharged;
        }
    }

    /**
     * @notice  Function to show Trader's balances for all available tokens.
     * @dev     If you pass pageNo == 0 it will scan all available tokens but as the tokenlist grows,
     * it may eventually run out of gas. Use _pageNo in this case to get 50 tokens at a time.
     * The returned arrays will be ordered to have the tokens with balances first then empty entries
     * next. You can discard all the entries starting from when symbols[i] == bytes32(0)
     * or total[i] == 0
     * @param   _owner  Address of the trader
     * @param   _pageNo  Page no for pagination
     * @return  symbols  Array of Symbol
     * @return  total    Array of Totals
     * @return  available  Array of availables
     */
    function getBalances(
        address _owner,
        uint256 _pageNo
    ) external view returns (bytes32[] memory symbols, uint256[] memory total, uint256[] memory available) {
        uint256 nbrOfTokens = tokenList.length();
        uint256 pageSize = 50;
        // Default to all available tokens if _pageNo==0. Otherwise either 50 or the last page's count
        if (_pageNo == 0) {
            //returns all tokens in a single page
            _pageNo = 1;
        } else {
            uint256 maxPageNo = nbrOfTokens % pageSize == 0 ? nbrOfTokens / pageSize : (nbrOfTokens / pageSize) + 1;
            // Override the pageNo if it is not possible
            _pageNo = _pageNo > maxPageNo ? maxPageNo : _pageNo;
            nbrOfTokens = _pageNo == maxPageNo && nbrOfTokens % pageSize != 0 ? nbrOfTokens % pageSize : pageSize;
        }

        symbols = new bytes32[](nbrOfTokens);
        total = new uint256[](nbrOfTokens);
        available = new uint256[](nbrOfTokens);

        uint256 i;
        bytes32 symbol;
        uint256 tokenLocation = (_pageNo - 1) * pageSize;
        while (nbrOfTokens > 0) {
            symbol = tokenList.at(nbrOfTokens + tokenLocation - 1);
            AssetEntry storage asset = assets[_owner][symbol];
            if (asset.total > 0) {
                symbols[i] = symbol;
                total[i] = asset.total;
                available[i] = asset.available;
                unchecked {
                    i++;
                }
            }
            unchecked {
                nbrOfTokens--;
            }
        }
        return (symbols, total, available);
    }

    /**
     * @notice  Returns the amount of token to be deducted from user's holding for a given gas amount(in ALOT terms)
     * @dev     Calculates the swap amount for each token for the given gas amount
     * @param   _symbol  Symbol of the token
     * @param   _gasAmount  Amount of gas to be swapped (in ALOT terms)
     * @return  uint256  Amount of the token to be swapped
     */
    function getSwapAmount(bytes32 _symbol, uint256 _gasAmount) private view returns (uint256) {
        BridgeParams storage bridgeParam = bridgeParams[_symbol];
        return bridgeParam.usedForGasSwap ? (bridgeParam.gasSwapRatio * _gasAmount) / 10 ** 18 : 0;
    }

    /**
     * @notice  Sets the Rebate Accounts contract
     * @dev     Only admin can call this function
     * @param   _portfolioSubHelper  Rebate Accounts contract to be set
     */
    function setPortfolioSubHelper(IPortfolioSubHelper _portfolioSubHelper) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(_portfolioSubHelper) != address(0), "P-OACC-02");
        emit AddressSet("PORTFOLIO", "SET_SUBNETHELPER", address(portfolioSubHelper), address(_portfolioSubHelper));
        portfolioSubHelper = _portfolioSubHelper;
    }

    /**
     * @return  IPortfolioSubHelper  PortfolioSubHelper contract
     */
    function getPortfolioSubHelper() external view returns (IPortfolioSubHelper) {
        return portfolioSubHelper;
    }

    /**
     * @return  IGasStation  Gas station contract
     */
    function getGasStation() external view returns (IGasStation) {
        return gasStation;
    }

    /**
     * @notice  Sets the gas station contract
     * @dev     Only admin can call this function
     * @param   _gasStation  Gas station contract to be set
     */
    function setGasStation(IGasStation _gasStation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(_gasStation) != address(0), "P-OACC-02");
        emit AddressSet("PORTFOLIO", "SET_GASSTATION", address(gasStation), address(_gasStation));
        gasStation = _gasStation;
    }

    /**
     * @return  address  Address of the treasury wallet
     */
    function getTreasury() external view returns (address) {
        return treasury;
    }

    /**
     * @notice  Sets the treasury wallet. Tokens collected here for ALOT deposited in clients GasTank
     * @dev     Only admin can call this function
     * @param   _treasury  Address of the treasury wallet
     */
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "P-OACC-02");
        emit AddressSet("PORTFOLIO", "SET_TREASURY", treasury, _treasury);
        treasury = _treasury;
    }

    /**
     * @return  IPortfolioMinter  Portfolio minter contract
     */
    function getPortfolioMinter() external view returns (IPortfolioMinter) {
        return portfolioMinter;
    }

    /**
     * @notice  Sets the portfolio minter contract
     * @dev     Only admin can call this function
     * @param   _portfolioMinter  Portfolio minter contract to be set
     */
    function setPortfolioMinter(IPortfolioMinter _portfolioMinter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(_portfolioMinter) != address(0), "P-OACC-02");
        emit AddressSet("PORTFOLIO", "SET_PORTFOLIOMINTER", address(portfolioMinter), address(_portfolioMinter));
        portfolioMinter = _portfolioMinter;
    }

    /**
     * @notice  Returns the bridge fees for all the host chain tokens of a given subnet token
     * @dev     Calls the PortfolioBridgeSub contract to get the bridge fees
     * @param   _symbol  subnet symbol of the token
     * @param   _quantity  quantity of the token to withdraw
     * @return  bridgeFees  Array of bridge fees for each corresponding chainId
     * @return  chainIds  Array of chainIds for each corresponding bridgeFee
     */
    function getAllBridgeFees(
        bytes32 _symbol,
        uint256 _quantity
    ) external view returns (uint256[] memory bridgeFees, uint32[] memory chainIds) {
        return IPortfolioBridgeSub(address(portfolioBridge)).getAllBridgeFees(_symbol, _quantity);
    }

    /**
     * @notice  Wrapper for emit event
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token used in the transaction
     * @param   _feeCharged  Fee charged for the transaction
     * @param   _transaction  Transaction type
     */
    function emitPortfolioEvent(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _feeCharged,
        Tx _transaction,
        address _traderOther
    ) private {
        emit PortfolioUpdated(
            _transaction,
            _trader,
            _symbol,
            _quantity,
            _feeCharged,
            assets[_trader][_symbol].total,
            assets[_trader][_symbol].available,
            _traderOther
        );
    }

    /**
     * @notice  Remove token from the tokenMap
     * @dev     tokenTotals for the symbol should be 0 before it can be removed
     * Make sure that there are no in-flight deposit messages.
     * Calling this function also removes the token from portfolioBridge. If multiple tokens in the
     * portfolioBridgeSub shares the subnet symbol, the symbol is not deleted from the PortfolioSub
     * @param   _srcChainSymbol  Source Chain Symbol of the token
     * @param   _srcChainId  Source Chain id of the token to be removed. Used by PortfolioBridgeSub.
     * Don't use the subnet id here. Always use the chain id that the token is being removed. Otherwise
     * it will silently fail as it can't find the token to delete in PortfolioBridgeSub
     * @param   _subnetSymbol  Subnet Symbol of the token
     */
    function removeToken(
        bytes32 _srcChainSymbol,
        uint32 _srcChainId,
        bytes32 _subnetSymbol
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenTotals[_subnetSymbol] == 0, "P-TTNZ-01");
        require(_subnetSymbol != native || (_subnetSymbol == native && _srcChainId != chainId), "P-TTNZ-02");

        bool deleted = IPortfolioBridgeSub(address(portfolioBridge)).removeToken(
            _srcChainSymbol,
            _srcChainId,
            _subnetSymbol
        );
        //Nothing found in PBridge to delete, no need to continue
        if (!deleted) {
            return;
        }
        bytes32[] memory tokenListById = portfolioBridge.getTokenList();
        for (uint256 i = 0; i < tokenListById.length; ++i) {
            TokenDetails memory tokenDetails = IPortfolioBridgeSub(address(portfolioBridge)).getTokenDetails(
                tokenListById[i]
            );
            if (tokenDetails.symbol == _subnetSymbol) {
                // There is another PB Bridge token using the _subnetSymbol. Can not delete. Return
                return;
            }
        }
        // Can never remove subnet ALOT token from PortfolioSub nor from PortfolioBridgeSub
        //, or other ALOTs from any other chainId
        if (tokenList.contains(_subnetSymbol) && _subnetSymbol != native) {
            delete (tokenTotals[_subnetSymbol]);
        }

        super.removeToken(_subnetSymbol, _srcChainId);
    }
}
