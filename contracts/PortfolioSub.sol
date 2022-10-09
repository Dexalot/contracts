// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./Portfolio.sol";
import "./interfaces/IGasStation.sol";
import "./interfaces/IPortfolioMinter.sol";

/**
 * @title  Subnet Portfolio
 * @notice Receives messages from mainnet for deposits and sends withdraw requests to mainnet.  It also
   transfers tokens between traders as their orders gets matched.
 * @dev    Allows one to withdraw and deposit native token from/to the subnet wallet. Any other token has to be
 * deposited via PortfolioBridge using processXFerPayload function. It can only be invoked by a bridge
 * provider's message receive event. \
 * Any other token including ALOT (native) can be withdrawn to mainnet using withdrawToken that will
 * send the holdings back to the user's wallet in the mainnet. \
 * TradePairs needs to have EXECUTOR_ROLE on PortfolioSub contract. \
 * If a trader deposits a token and has 0 ALOT in his subnet wallet, this contract will make a call
 * to GasStation to deposit a small amount of ALOT to the user's wallet to be used for gas.
 * In return, It will deduct a tiny amount of the token transferred.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioSub is Portfolio {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    // structure to track an asset
    struct AssetEntry {
        uint256 total;
        uint256 available;
    }
    // account address to assets map
    mapping(address => mapping(bytes32 => AssetEntry)) public assets;
    // bytes32 symbols to uint256(total) token map
    mapping(bytes32 => uint256) public tokenTotals;

    IGasStation private gasStation;
    IPortfolioMinter private portfolioMinter;

    uint256 public walletBalanceDepositThreshold; // Threshold to check subnet wallet when depositing from subnet
    // numerator for rate % to be used with a denominator of 10000
    uint256 public depositFeeRate;
    uint256 public withdrawFeeRate;
    // account for collecting tokens received against ALOT deposited in clients GasTank
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
    bytes32 public constant VERSION = bytes32("2.1.1");

    /**
     * @notice  Initializer for upgradeable Portfolio Sub
     * @dev     Initializes with the native deposit threshold, users can deposit ALOT if they at least have 0.05 ALOT.
     * @param   _native  Native token of the chain
     */
    function initialize(bytes32 _native, uint32 _chainId) public override initializer {
        Portfolio.initialize(_native, _chainId);
        walletBalanceDepositThreshold = 5 * 10**16;
        //depositFeeRate = 0;    // evm initialized depositFeeRate=0 (0% = 0/10000)
        //withdrawFeeRate = 0;   // evm initialized withdrawFeeRate=0 (0% = 0/10000)
    }

    /**
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
     * @dev   Only callable by the default admin
     * @param   _symbol  Symbol of the token
     * @param   _mode  New auction mode
     */
    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
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
    function getBalance(address _owner, bytes32 _symbol)
        external
        view
        returns (
            uint256 total,
            uint256 available,
            AssetType assetType
        )
    {
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
     * @dev     WHEN Increasing in addExectuion the amount is applied to both total and available
     * (so SafeIncrease can be used) as opposed to
     * WHEN Decreasing in addExectuion the amount is only applied to total. (SafeDecrease
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
        require(hasRole(EXECUTOR_ROLE, msg.sender), "P-OACC-04");
        // if _maker.side = BUY then _taker.side = SELL
        if (_makerSide == ITradePairs.Side.BUY) {
            // decrease maker quote and incrase taker quote
            transferToken(
                _makerAddr,
                _takerAddr,
                _quoteSymbol,
                _quoteAmount,
                _takerfeeCharged,
                IPortfolio.Tx.EXECUTION,
                true
            );
            // increase maker base and decrase taker base
            transferToken(
                _takerAddr,
                _makerAddr,
                _baseSymbol,
                _baseAmount,
                _makerfeeCharged,
                IPortfolio.Tx.EXECUTION,
                false
            );
        } else {
            // increase maker quote & decrease taker quote
            transferToken(
                _takerAddr,
                _makerAddr,
                _quoteSymbol,
                _quoteAmount,
                _makerfeeCharged,
                IPortfolio.Tx.EXECUTION,
                false
            );
            // decrease maker base and incrase taker base
            transferToken(
                _makerAddr,
                _takerAddr,
                _baseSymbol,
                _baseAmount,
                _takerfeeCharged,
                IPortfolio.Tx.EXECUTION,
                true
            );
        }
    }

    /**
     * @notice  Processes the message coming from the bridge
     * @dev     DEPOSIT messages are the only message that can be sent to the portfolio sub for the moment
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
        IPortfolio.Tx _transaction
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        // Only allow deposits in the subnet from PortfolioBridge that has PORTFOLIO_BRIDGE_ROLE and not from the users
        if (_transaction == Tx.DEPOSIT) {
            depositTokenChecks(_quantity);
            require(tokenList.contains(_symbol), "P-ETNS-01");
            uint256 feeCharged;
            uint256 amountToSwap = 0;
            uint256 gasAmount = gasStation.gasAmount();
            if (depositFeeRate > 0) {
                feeCharged = (_quantity * depositFeeRate) / TENK;
            }
            if (_trader.balance < gasAmount) {
                TokenDetails storage token = tokenDetailsMap[_symbol];
                if (
                    token.auctionMode == ITradePairs.AuctionMode.OFF ||
                    token.auctionMode == ITradePairs.AuctionMode.LIVETRADING
                ) {
                    // if not dexalot discovery
                    if (_symbol == native) {
                        amountToSwap = gasAmount - _trader.balance;
                    } else {
                        amountToSwap = getSwapAmount(_symbol, gasAmount - _trader.balance);
                    }
                    if (amountToSwap != 0) {
                        safeIncrease(treasury, _symbol, amountToSwap, 0, _transaction);
                    }
                }
                gasStation.requestGas(_trader);
            }
            uint256 netAmount = _quantity - amountToSwap;
            if (netAmount != 0) {
                safeIncrease(_trader, _symbol, netAmount, feeCharged, _transaction); // reverts if transfer fails
            }
        } else {
            revert("P-PTNS-02");
        }
    }

    /**
     * @notice  Recovers the stucked message from the LZ bridge, returns the funds to the depositor/withdrawer
     * @dev     Only call this just before calling force resume receive function for the LZ bridge. \
     * Only the DEFAULT_ADMIN can call this function.
     * @param   _payload  Payload of the message
     */
    function lzRecoverPayload(bytes calldata _payload) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        (address trader, bytes32 symbol, uint256 quantity) = getXFer(_payload);

        require(tokenList.contains(symbol), "P-ETNS-02");
        safeIncrease(trader, symbol, quantity, 0, IPortfolio.Tx.RECOVER);
    }

    /**
     * @notice   This function is only used to deposit native ALOT from the subnet wallet
     * @param   _from  Address of the depositor
     */
    function depositNative(address payable _from, IPortfolioBridge.BridgeProvider)
        external
        payable
        override
        whenNotPaused
        nonReentrant
    {
        require(_from == msg.sender || msg.sender == address(this), "P-OOWN-02"); // calls made by super.receive()
        require(allowDeposit, "P-NTDP-01");
        // balance cannot be lower than deposit threshold
        require(_from.balance >= walletBalanceDepositThreshold, "P-BLTH-01");
        //We are not charging any fees for depositing native tokens

        //We burn the deposit amount but still credit the user account because we minted the ALOT with withdrawNative
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = address(0).call{value: msg.value}("");
        require(sent, "P-BF-01");

        totalNativeBurned += msg.value;
        safeIncrease(_from, native, msg.value, 0, IPortfolio.Tx.DEPOSIT);
    }

    /**
     * @notice   This function is used to withdraw only native ALOT to the subnet wallet
     * @dev      This function decreases ALOT balance of the user and calls the PortfolioMinter to mint the native ALOT
     * @param   _to  Address of the withdrawer
     * @param   _quantity  Amount of the native ALOT to withdraw
     */
    function withdrawNative(address payable _to, uint256 _quantity) external override whenNotPaused nonReentrant {
        require(_to == msg.sender, "P-OOWN-01");
        //We are not charging any fees for withdrawing native tokens
        safeDecrease(_to, native, _quantity, 0, IPortfolio.Tx.WITHDRAW); // does not decrease if transfer fails
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
        require(_quantity > 0, "P-ZTQW-01");
        require(tokenDetailsMap[_symbol].auctionMode == ITradePairs.AuctionMode.OFF, "P-AUCT-02");
        require(_to == msg.sender || msg.sender == address(this), "P-OOWT-01");
        require(tokenList.contains(_symbol), "P-ETNS-02");

        uint256 quantityLessFee = _quantity;
        uint256 feeCharged;
        if (withdrawFeeRate > 0 && _to != feeAddress) {
            feeCharged = (_quantity * withdrawFeeRate) / TENK;
            safeTransferFee(_symbol, feeCharged);
            quantityLessFee -= feeCharged;
        }

        require(quantityLessFee > bridgeFee[_symbol], "PB-RALB-01");
        // feeCharged has only bridgeFees in the Mainnet. But it also contains the % withdraw fee
        // in addition to bridgeFee in the subnet
        if (bridgeFee[_symbol] > 0 && _to != feeAddress) {
            quantityLessFee -= bridgeFee[_symbol];
            feeCharged += bridgeFee[_symbol];
            safeIncrease(treasury, _symbol, bridgeFee[_symbol], 0, IPortfolio.Tx.DEPOSIT);
        }

        // we decrease the total quantity from the user balances. feeCharged is for information purposes
        // that gets emitted in an event
        safeDecrease(_to, _symbol, _quantity, feeCharged, IPortfolio.Tx.WITHDRAW);
        portfolioBridge.sendXChainMessage(
            _bridge,
            IPortfolio.XFER(
                0, // Nonce to be assigned in PBridge
                IPortfolio.Tx.WITHDRAW,
                _to,
                _symbol,
                // Send the Net amount to Mainnet
                quantityLessFee,
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
        IPortfolio.Tx _transaction
    ) private {
        require(_amount > 0 && _amount >= _feeCharged, "P-TNEF-01");
        uint256 quantityLessFee = _amount - _feeCharged;
        AssetEntry storage asset = assets[_trader][_symbol];
        asset.total += quantityLessFee;
        asset.available += quantityLessFee;
        //Commissions are always taken from incoming currency. This takes care of ALL EXECUTION & DEPOSIT & INTXFER
        safeTransferFee(_symbol, _feeCharged);
        if (_transaction == IPortfolio.Tx.DEPOSIT || _transaction == IPortfolio.Tx.RECOVER) {
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
        IPortfolio.Tx _transaction
    ) private {
        AssetEntry storage asset = assets[_trader][_symbol];
        require(_amount <= asset.total, "P-TFNE-01");
        asset.total -= _amount;
        //c probably redundant check
        require(_amount <= tokenTotals[_symbol], "P-AMVL-01");

        if (_transaction == IPortfolio.Tx.WITHDRAW) {
            tokenTotals[_symbol] -= _amount;
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
        IPortfolio.Tx _transaction
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
    function adjustAvailable(
        IPortfolio.Tx _transaction,
        address _trader,
        bytes32 _symbol,
        uint256 _amount
    ) external override {
        // Only TradePairs can call PORTFOLIO adjustAvailable
        require(hasRole(EXECUTOR_ROLE, msg.sender), "P-OACC-03");
        AssetEntry storage asset = assets[_trader][_symbol];
        if (_transaction == IPortfolio.Tx.INCREASEAVAIL) {
            asset.available += _amount;
        } else if (_transaction == IPortfolio.Tx.DECREASEAVAIL) {
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
        IPortfolio.Tx _transaction,
        bool _decreaseTotalOnly
    ) private {
        //_feeCharged is always in incoming currency when transfering as a part of EXECUTION
        // Hence safeDecreaseTotal safeDecrease overwrites _feeCharged to 0.
        if (_decreaseTotalOnly) {
            safeDecreaseTotal(_from, _symbol, _quantity, 0, _transaction);
        } else {
            safeDecrease(_from, _symbol, _quantity, 0, _transaction);
        }
        if (_transaction == IPortfolio.Tx.IXFERSENT) {
            safeIncrease(_to, _symbol, _quantity, _feeCharged, IPortfolio.Tx.IXFERREC);
        } else {
            safeIncrease(_to, _symbol, _quantity, _feeCharged, _transaction);
        }
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
    ) external whenNotPaused nonReentrant {
        require(tokenList.contains(_symbol) || _symbol == native, "P-ETNS-01");
        require(_to != msg.sender, "P-DOTS-01");
        //Can not transfer auction tokens
        require(tokenDetailsMap[_symbol].auctionMode == ITradePairs.AuctionMode.OFF, "P-AUCT-02");
        transferToken(msg.sender, _to, _symbol, _quantity, 0, IPortfolio.Tx.IXFERSENT, false);
    }

    /**
     * @notice  Transfers the fees collected to the fee address
     * @param   _symbol  Symbol of the token
     * @param   _feeCharged  Fee charged for the transaction
     */
    function safeTransferFee(bytes32 _symbol, uint256 _feeCharged) private {
        if (_feeCharged > 0) {
            AssetEntry storage asset = assets[feeAddress][_symbol];
            asset.total += _feeCharged;
            asset.available += _feeCharged;
        }
    }

    /**
     * @notice  Withdraws collected fees to the mainnet
     * @dev     Only admin can call this function
     */
    function withdrawFees() external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        bytes32 symbol;
        uint256 feeAccumulated = assets[feeAddress][native].available;
        if (feeAccumulated > 0) {
            this.withdrawToken(feeAddress, native, feeAccumulated, portfolioBridge.getDefaultBridgeProvider());
        }
        for (uint256 i = 0; i < tokenList.length(); i++) {
            symbol = tokenList.at(i);
            feeAccumulated = assets[feeAddress][symbol].available;
            if (feeAccumulated > 0) {
                this.withdrawToken(feeAddress, symbol, feeAccumulated, portfolioBridge.getDefaultBridgeProvider());
            }
        }
    }

    /**
     * @notice  Returns the swap amount for the given gas amount
     * @dev     Calculates the swap amount for each token for the given gas amount
     * @param   _symbol  Symbol of the token
     * @param   _gasAmount  Amount of gas to be swapped
     * @return  uint256  Amount of the token to be swapped
     */
    function getSwapAmount(bytes32 _symbol, uint256 _gasAmount) internal view returns (uint256) {
        return (bridgeSwapAmount[_symbol] * _gasAmount) / 10**18;
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
     * @notice  Sets the treasury wallet
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
     * @notice  Sets wallet balance deposit thresholds
     * @dev     This threshold checks the users remaining native balance while depositing native from subnet wallet.
     * @param   _amount  Amount of native token to be set as threshold
     */
    function setWalletBalanceDepositThreshold(uint256 _amount) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        walletBalanceDepositThreshold = _amount;
        emit ParameterUpdated(bytes32("Portfolio"), "SET_WALLETBALANCE_DEPTHRESHOLD", 0, _amount);
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
        IPortfolio.Tx _transaction
    ) private {
        emit IPortfolio.PortfolioUpdated(
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
     * @notice  Adds the given token to the portfolioSub with 0 address in the subnet.
     * @dev     This function is only callable by admin. \
     * We don't allow tokens with same symbols. \
     * Native symbol is also added as a token with 0 address. \
     * PortfolioSub keeps track of total deposited tokens in tokenTotals for sanity checks against mainnet
     * It has no ERC20 Contracts hence, it overwrites the addresses with address(0). \
     * But PortfolioBridgeSub keeps all the symbols added from all different mainnet chains separately with
     * their original details including the addresses
     * except AVAX which is passed with address(0).
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _srcChainId  Source Chain id, overwritten by srcChain of Portolio. Only used by PortfolioBridgeSub.
     * @param   _decimals  Decimals of the token
     * @param   _mode  Starting auction mode of the token
     */
    function addToken(
        bytes32 _symbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        // not adding address(0) here because it adds to portfolioBridge with the mainnet address
        super.addToken(_symbol, _tokenAddress, _srcChainId, _decimals, _mode);
        TokenDetails storage tokenDetails = tokenDetailsMap[_symbol];
        tokenDetails.auctionMode = _mode;
        // All tokens from mainnet have 0 address. In the subnet AVAX is treated like the other ERC20
        // Overwrites with address(0) in the subnet because subnet doesn't have ERC20
        tokenDetails.tokenAddress = address(0);
        tokenTotals[_symbol] = 0; //set totals to 0
    }

    /**
     * @notice  Remove IERC20 token from the tokenMap
     * @dev     tokenTotals for the symbol should be 0 before it can be removed
                Make sure that there are no in-flight deposit messages
     * @param   _symbol  symbol of the token
     */
    function removeToken(bytes32 _symbol) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenTotals[_symbol] == 0, "P-TTNZ-01");
        if (tokenList.contains(_symbol) && _symbol != native) {
            delete (tokenDetailsMap[_symbol]);
            delete (tokenTotals[_symbol]);
        }
        super.removeToken(_symbol);
    }

    /**
     * @notice  Updates the transfer fee rate for the given Tx type
     * @dev     Only admin can call this function
     * @param   _rate  Transfer fee rate to be set
     * @param   _rateType  Tx type for which the transfer fee rate is to be set
     */
    function updateTransferFeeRate(uint256 _rate, IPortfolio.Tx _rateType)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_rateType == IPortfolio.Tx.WITHDRAW) {
            emit ParameterUpdated(bytes32("Portfolio"), "P-DEPFEE", depositFeeRate, _rate);
            depositFeeRate = _rate; // (_rate/100)% = _rate/10000: _rate=10 => 0.10%
        } else if (_rateType == IPortfolio.Tx.DEPOSIT) {
            emit ParameterUpdated(bytes32("Portfolio"), "P-WITFEE", withdrawFeeRate, _rate);
            withdrawFeeRate = _rate; // (_rate/100)% = _rate/10000: _rate=20 => 0.20%
        } else {
            revert("P-WRTT-01");
        }
    }

    // solhint-disable no-empty-blocks
    /**
     * @notice  Add IERC20 token to the tokenMap
     * @param   _symbol  Token symbol
     * @param   _tokenaddress  Mainnet token address or zero address for AVAX
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Token decimals
     */

    function addIERC20(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode
    ) internal override {}

    /**
     * @dev     Only valid for the mainnet. Implemented with an empty block here.
     */
    function getToken(bytes32 _symbol) external view override returns (IERC20Upgradeable) {}

    /**
     * @dev     Only valid for the mainnet. Implemented with an empty block here.
     */
    function depositToken(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider
    ) external override {}

    /**
     * @dev     Only valid for the mainnet. Implemented with an empty block here.
     */
    function depositTokenFromContract(
        address _from,
        bytes32 _symbol,
        uint256 _quantity
    ) external override {}

    /**
     * @dev     Only valid for the mainnet. Implemented with an empty block here.
     */
    function removeIERC20(bytes32 _symbol) internal override {}

    // solhint-enable no-empty-blocks
}
