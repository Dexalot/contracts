// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./Portfolio.sol";
import "./interfaces/IPortfolioSub.sol";
import "./interfaces/IGasStation.sol";
import "./interfaces/IPortfolioMinter.sol";
import "./interfaces/IPortfolioBridgeSub.sol";

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
    // Incremented only with Tx.DEPOSIT and Tx.RECOVERFUNDS
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

    enum AssetType {
        NATIVE,
        ERC20,
        NONE
    }

    // keep track of deposited and burned native tokens
    uint256 public totalNativeBurned;

    // version
    bytes32 public constant VERSION = bytes32("2.2.1");

    /**
     * @notice  Initializer for upgradeable Portfolio Sub
     * @param   _native  Native token of the chain
     * @param   _chainId  ChainId of the chain

     */
    function initialize(bytes32 _native, uint32 _chainId) public override initializer {
        Portfolio.initialize(_native, _chainId);
        // Always Add native with 0 Bridge Fee and 1 gasSwapRatio (1 ALOT for 1 ALOT)
        addTokenInternal(native, address(0), _chainId, 18, ITradePairs.AuctionMode.OFF, 0, 1 * 10 ** 18);
    }

    /**
     * @notice  Adds the given token to the portfolioSub with 0 address in the subnet.
     * @dev     This function is only callable by admin. \
     * We don't allow tokens with same symbols. \
     * Native symbol is also added as a token with 0 address. \
     * PortfolioSub keeps track of total deposited tokens in tokenTotals for sanity checks against mainnet.
     * It has no ERC20 Contracts hence, it overwrites the addresses with address(0). \
     * It also adds the token to the PortfolioBridgeSub with the proper sourceChainid
     * Tokens in PortfolioSub has ZeroAddress but PortfolioBridge has the proper address from each chain
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
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _srcChainId  Source Chain Id, overwritten by srcChain of Portolio but used when adding
     * it to PortfolioBridgeSub.
     * @param   _decimals  Decimals of the token
     * @param   _mode  Starting auction mode of the token
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     */
    function addTokenInternal(
        bytes32 _symbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode,
        uint256 _fee,
        uint256 _gasSwapRatio
    ) internal override {
        super.addTokenInternal(
            _symbol,
            // All tokens from mainnet have 0 address including AVAX because subnet doesn't have ERC20
            address(0),
            _srcChainId,
            _decimals,
            _mode,
            _fee,
            _gasSwapRatio
        );

        // Tokens are added with default usedForGasSwap=false. They need to be set to true if/when necessary
        // except ALOT. It can always be used for this purpose
        if (_symbol == bytes32("ALOT")) {
            setBridgeParamInternal(_symbol, _fee, _gasSwapRatio, true);
        } else {
            setBridgeParamInternal(_symbol, _fee, 0, false);
        }

        tokenTotals[_symbol] = 0; //set totals to 0
        // Don't add native here as portfolioBridge may not be initialized yet
        // Native added when portfolioBridgeSub.SetPortfolio
        if (_symbol != native && address(portfolioBridge) != address(0)) {
            //Adding to portfolioBridge with the proper mainnet address and srcChainId
            IPortfolioBridgeSub(address(portfolioBridge)).addToken(
                _symbol,
                _tokenAddress,
                _srcChainId,
                _decimals,
                _mode
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
    ) external view returns (uint256 total, uint256 available, AssetType assetType) {
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
     * @dev     WHEN Increasing in addExecution the amount is applied to both total and available
     * (so SafeIncrease can be used) as opposed to
     * WHEN Decreasing in addExecution the amount is only applied to total. (SafeDecrease
     * can NOT be used, so we have safeDecreaseTotal instead)
     * i.e. (USDT 100 Total, 50 Available after we send a BUY order of 10 avax at 5$.
     * Partial Exec 5 at $5. Total goes down to 75. Available stays at 50)
     * @param   _makerSide  Side of the maker
     * @param   _makerAddr  Address of the maker
     * @param   _takerAddr  Address of the taker
     * @param   _baseSymbol  Symbol of the base token
     * @param   _quoteSymbol  Symbol of the quote token
     * @param   _baseAmount  Amount of the base token
     * @param   _quoteAmount  Amount of the quote token
     * @param   _makerfeeCharged  Fee charged to the maker
     * @param   _takerfeeCharged  Fee charged to the taker
     */
    function addExecution(
        ITradePairs.Side _makerSide,
        address _makerAddr,
        address _takerAddr,
        bytes32 _baseSymbol,
        bytes32 _quoteSymbol,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        uint256 _makerfeeCharged,
        uint256 _takerfeeCharged
    ) external override {
        // Only TradePairs can call PORTFOLIO addExecution
        require(hasRole(EXECUTOR_ROLE, msg.sender), "P-OACC-03");
        // if _maker.side = BUY then _taker.side = SELL
        if (_makerSide == ITradePairs.Side.BUY) {
            // decrease maker quote and incrase taker quote
            transferToken(_makerAddr, _takerAddr, _quoteSymbol, _quoteAmount, _takerfeeCharged, Tx.EXECUTION, true);
            // increase maker base and decrase taker base
            transferToken(_takerAddr, _makerAddr, _baseSymbol, _baseAmount, _makerfeeCharged, Tx.EXECUTION, false);
        } else {
            // increase maker quote and decrease taker quote
            transferToken(_takerAddr, _makerAddr, _quoteSymbol, _quoteAmount, _makerfeeCharged, Tx.EXECUTION, false);
            // decrease maker base and incrase taker base
            transferToken(_makerAddr, _takerAddr, _baseSymbol, _baseAmount, _takerfeeCharged, Tx.EXECUTION, true);
        }
    }

    /**
     * @notice  Processes the message coming from the bridge
     * @dev     DEPOSIT/RECOVERFUNDS messages are the only messages that can be sent to the portfolio sub for the moment
     * Even when the contract is paused, this method is allowed for the messages that
     * are in flight to complete properly.
     * CAUTION: if Paused for upgrade, wait to make sure no messages are in flight, then upgrade.
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     * @param   _transaction  Transaction type
     */
    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        Tx _transaction
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        // Should not avoid revert if symbol not found. This will block the bridge
        require(tokenList.contains(_symbol), "P-ETNS-01");
        require(_quantity > 0, "P-ZETD-01");
        // Only allow deposits in the subnet from PortfolioBridge that has PORTFOLIO_BRIDGE_ROLE and not from the users
        if (_transaction == Tx.DEPOSIT) {
            // Deposit the entire amount to the portfolio first
            safeIncrease(_trader, _symbol, _quantity, 0, _transaction);
            // Use some of the newly deposited portfolio holding to fill up Gas Tank
            autoFillPrivate(_trader, _symbol, _transaction);
        } else if (_transaction == Tx.RECOVERFUNDS) {
            safeIncrease(_trader, _symbol, _quantity, 0, _transaction);
        } else {
            revert("P-PTNS-02");
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
        // the ending balance cannot be lower than the twice the gasAmount that we would deposit. Currently 0.1*2 ALOT
        require(_from.balance >= msg.value + (gasStation.gasAmount() * 2), "P-BLTH-01");

        // We burn the deposit amount but still credit the user account because we minted the ALOT with withdrawNative
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = address(0).call{value: msg.value}("");
        require(sent, "P-BF-01");

        totalNativeBurned += msg.value;
        safeIncrease(_from, native, msg.value, 0, Tx.REMOVEGAS);
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
        safeDecrease(_to, native, _quantity, 0, Tx.ADDGAS);
        portfolioMinter.mint(_to, _quantity);
    }

    /**
     * @notice  Withdraws the token to the mainnet
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
    ) external override whenNotPaused nonReentrant {
        require(tokenDetailsMap[_symbol].auctionMode == ITradePairs.AuctionMode.OFF, "P-AUCT-01");
        require(_to == msg.sender || msg.sender == address(this), "P-OOWT-01");
        require(tokenList.contains(_symbol), "P-ETNS-02");

        // bridgeFee = bridge Fees both in the Mainnet the subnet
        // no bridgeFees for treasury and feeCollector
        uint256 bridgeFee = (_to != feeAddress && _to != treasury) ? bridgeParams[_symbol].fee : 0;
        safeDecrease(_to, _symbol, _quantity, bridgeFee, Tx.WITHDRAW);
        portfolioBridge.sendXChainMessage(
            _bridge,
            XFER(
                0, // Nonce to be assigned in PBridge
                Tx.WITHDRAW,
                _to,
                _symbol,
                // Send the Net amount to Mainnet
                _quantity - bridgeFee,
                block.timestamp
            )
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
        Tx _transaction
    ) private {
        require(_amount > 0 && _amount >= _feeCharged, "P-TNEF-01");
        uint256 quantityLessFee = _amount - _feeCharged;
        AssetEntry storage asset = assets[_trader][_symbol];
        asset.total += quantityLessFee;
        asset.available += quantityLessFee;
        //Commissions are always taken from incoming currency. This takes care of ALL EXECUTION and DEPOSIT and INTXFER
        safeTransferFee(feeAddress, _symbol, _feeCharged);
        if (_transaction == Tx.DEPOSIT || _transaction == Tx.RECOVERFUNDS) {
            tokenTotals[_symbol] += _amount;
        }
        emitPortfolioEvent(_trader, _symbol, _amount, _feeCharged, _transaction);
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
        Tx _transaction
    ) private {
        AssetEntry storage asset = assets[_trader][_symbol];
        require(_amount > 0 && _amount >= _feeCharged, "P-WUTH-01");
        require(_amount <= asset.total, "P-TFNE-01");
        // decrease the total quantity from the user balances.
        asset.total -= _amount;
        // This is bridge fee going to treasury. Commissions go to feeAddress
        safeTransferFee(treasury, _symbol, _feeCharged);
        if (_transaction == Tx.WITHDRAW) {
            //cd probably redundant check because _amount can never be > tokenTotals amount
            require(_amount <= tokenTotals[_symbol], "P-AMVL-01");
            tokenTotals[_symbol] -= (_amount - _feeCharged); // _feeCharged is still left in the subnet
        }
        emitPortfolioEvent(_trader, _symbol, _amount, _feeCharged, _transaction);
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
        Tx _transaction
    ) private {
        AssetEntry storage asset = assets[_trader][_symbol];
        require(_amount <= asset.available, "P-AFNE-02");
        asset.available -= _amount;
        safeDecreaseTotal(_trader, _symbol, _amount, _feeCharged, _transaction);
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
            asset.available += _amount;
        } else if (_transaction == Tx.DECREASEAVAIL) {
            require(_amount <= asset.available, "P-AFNE-01");
            asset.available -= _amount;
        } else {
            revert("P-WRTT-02");
        }
        emitPortfolioEvent(_trader, _symbol, _amount, 0, _transaction);
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
            ? safeDecreaseTotal(_from, _symbol, _quantity, 0, _transaction)
            : safeDecrease(_from, _symbol, _quantity, 0, _transaction);

        // Replaced with IXFERREC in SafeIncrease because we want this event to be captured and showed to the recipient
        _transaction == Tx.IXFERSENT
            ? safeIncrease(_to, _symbol, _quantity, _feeCharged, Tx.IXFERREC)
            : safeIncrease(_to, _symbol, _quantity, _feeCharged, _transaction);
    }

    /**
     * @notice  Transfers token from the `msg.sender`'s portfolio to `_to`'s portfolio
     * @dev     This is not a ERC20 transfer, this is a balance transfer between portfolios
     * @param   _to  Address of the receiver
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     */
    function transferToken(address _to, bytes32 _symbol, uint256 _quantity) external whenNotPaused nonReentrant {
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
            asset.total += _feeCharged;
            asset.available += _feeCharged;
        }
    }

    /**
     * @notice  Withdraws collected fees from the feeAddress or treasury to the mainnet
     * @dev     Only admin can call this function
     * @param   _from  address that can withdraw collected fees
     * @param   _maxCount  maximum number of ERC20 tokens with a non-zero balance to process at one time
     */
    function withdrawFees(address _from, uint8 _maxCount) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        require(_from == feeAddress || _from == treasury, "P-OWTF-01");
        bytes32 symbol;
        uint256 feeAccumulated = assets[_from][native].available;
        if (feeAccumulated > 0) {
            this.withdrawToken(_from, native, feeAccumulated, portfolioBridge.getDefaultBridgeProvider());
        }
        uint256 tokenCount = tokenList.length();
        uint256 i;
        while (_maxCount > 0) {
            symbol = tokenList.at(i);
            feeAccumulated = assets[_from][symbol].available;
            if (feeAccumulated > 0) {
                this.withdrawToken(_from, symbol, feeAccumulated, portfolioBridge.getDefaultBridgeProvider());
                _maxCount--;
            }
            unchecked {
                i++;
            }
            if (i == tokenCount) {
                _maxCount = 0;
            }
        }
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
    function setGasStation(IGasStation _gasStation) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
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
    function setTreasury(address _treasury) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
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
    function setPortfolioMinter(IPortfolioMinter _portfolioMinter) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        require(address(_portfolioMinter) != address(0), "P-OACC-02");
        emit AddressSet("PORTFOLIO", "SET_PORTFOLIOMINTER", address(portfolioMinter), address(_portfolioMinter));
        portfolioMinter = _portfolioMinter;
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
        Tx _transaction
    ) private {
        emit PortfolioUpdated(
            _transaction,
            _trader,
            _symbol,
            _quantity,
            _feeCharged,
            assets[_trader][_symbol].total,
            assets[_trader][_symbol].available
        );
    }

    /**
     * @notice  Remove token from the tokenMap
     * @dev     tokenTotals for the symbol should be 0 before it can be removed
     * Make sure that there are no in-flight deposit messages.
     * Calling this function also removes the token from portfolioBridge.
     * @param   _symbol  symbol of the token
     * @param   _srcChainId  Source Chain id of the token to be removed. Used by PortfolioBridgeSub.
     */
    function removeToken(bytes32 _symbol, uint32 _srcChainId) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenTotals[_symbol] == 0, "P-TTNZ-01");
        // Can never remove subnet ALOT token from PortfolioSub nor from PortfolioBridgeSub
        //, or other ALOTs from any other chainId
        if (tokenList.contains(_symbol) && _symbol != native) {
            IPortfolioBridgeSub(address(portfolioBridge)).removeToken(_symbol, _srcChainId);
            delete (tokenTotals[_symbol]);
        }
        super.removeToken(_symbol, _srcChainId);
    }
}
