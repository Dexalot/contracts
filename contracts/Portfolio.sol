// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import "hardhat/console.sol";
import "./interfaces/IPortfolio.sol";
import "./interfaces/ITradePairs.sol";

import "./Fee.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "Portfolio: a contract to implement portfolio functionality for all traders."
*   @dev "The main data structure, assets, is implemented as a nested map from an address and symbol to an AssetEntry struct."
*   @dev "Assets keeps track of all assets on DEXALOT per user address per symbol."
*/

contract Portfolio is Initializable, AccessControlEnumerableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, IPortfolio {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using SafeERC20 for IERC20;

    // version
    bytes32 constant public VERSION = bytes32('0.9.1');

    // denominator for rate calculations
    uint public constant TENK = 10000;

    // reference to fee contract
    Fee public fee;

    // bytes32 variable to hold native token of DEXALOT
    bytes32 constant public native = bytes32('AVAX');

    // bytes32 array of all ERC20 tokens traded on DEXALOT
    EnumerableSetUpgradeable.Bytes32Set tokenList;

    // structure to track an asset
    struct AssetEntry {
        uint total;
        uint available;
    }

    enum AssetType {NATIVE, ERC20, NONE}

    // bytes32 symbols to ERC20 token map
    mapping (bytes32 => IERC20) tokenMap;

    // account address to assets map
    mapping (address => mapping (bytes32 => AssetEntry)) public assets;

    // boolean to control deposit functionality
    bool allowDeposit;

    // numerator for rate % to be used with a denominator of 10000
    uint public depositFeeRate;
    uint public withdrawFeeRate;

    event ParameterUpdated(bytes32 indexed pair, string _param, uint _oldValue, uint _newValue);

    function initialize() public initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        // intitialize the admins
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // set deployment account to have DEFAULT_ADMIN_ROLE
        allowDeposit = true;
        depositFeeRate = 10;   // depositFeeRate=0 (0.10% = 0/10000)
        withdrawFeeRate = 20;  // withdrawFeeRate=20 (0.20% = 20/10000)
    }

    function owner() public view returns(address) {
        return getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }

    function addAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        grantRole(DEFAULT_ADMIN_ROLE, _address);
    }
    // FIXME POSSIBLY SHOULD NOT BE ABLE TO REMOVE HIMSELF WE MAY END UP WITH AN EMPTY GROUP,
    // OR ADMIN COUNT SHOULD BE >=2 AT ALL TIMES! ALSO MAYBE ONLY SUPERADMIN FUNCTIONS??
    function removeAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-02");
        require(getRoleMemberCount(DEFAULT_ADMIN_ROLE)>1, "P-ALOA-01");
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function isAdmin(address _address) public view returns(bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function pause() public override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-03");
        _pause();
    }

    function unpause() public override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-04");
        _unpause();
    }

    function pauseDeposit(bool _allowDeposit) public override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-05");
        allowDeposit = _allowDeposit;
    }

    function setFee(Fee _fee) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-06");
        fee = _fee;
    }

    function getFee() public view returns(Fee) {
        return fee;
    }

    function updateTransferFeeRate(uint _rate, IPortfolio.Tx _rateType) public override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-07");
        if (_rateType == IPortfolio.Tx.WITHDRAW) {
            emit ParameterUpdated(bytes32("Portfolio"), "P-DEPFEE", depositFeeRate, _rate);
            depositFeeRate = _rate; // (_rate/100)% = _rate/10000: _rate=10 => 0.10%
        } else if (_rateType == IPortfolio.Tx.DEPOSIT) {
            emit ParameterUpdated(bytes32("Portfolio"), "P-WITFEE", withdrawFeeRate, _rate);
            withdrawFeeRate = _rate; // (_rate/100)% = _rate/10000: _rate=20 => 0.20%
        } // Ignore the rest for now
    }

    function getDepositFeeRate() public view returns(uint) {
        return depositFeeRate;
    }

    function getWithdrawFeeRate() public view returns(uint) {
        return withdrawFeeRate;
    }

    // function to add an ERC20 token
    function addToken(bytes32 _symbol, IERC20 _token) public override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-08");
        if (!tokenList.contains(_symbol)) {
            tokenList.add(_symbol);
            tokenMap[_symbol] = _token;
            fee.addToken(_symbol, _token);
        }
    }

    // FRONTEND FUNCTION TO GET ERC20 TOKEN LIST
    function getTokenList() public view returns(bytes32[] memory) {
        bytes32[] memory tokens = new bytes32[](tokenList.length());
        for (uint i=0; i<tokenList.length(); i++) {
            tokens[i] = tokenList.at(i);
        }
        return tokens;
    }

    // FRONTEND FUNCTION TO GET AN ERC20 TOKEN
    function getToken(bytes32 _symbol) public view returns(IERC20) {
        return tokenMap[_symbol];
    }

    // FRONTEND FUNCTION TO GET PORTFOLIO BALANCE FOR AN ACCOUNT AND TOKEN SYMBOL
    function getBalance(address _owner, bytes32 _symbol) public view
        returns(uint total, uint available, AssetType assetType) {
            // FIXME only account owner can view
            // require(_owner == msg.sender, "P-OOQB-01");
            assetType = AssetType.NONE;
            if (native == _symbol) {
                assetType = AssetType.NATIVE;
            }
            if (tokenList.contains(_symbol)) {
                assetType = AssetType.ERC20;
            }
            total = assets[_owner][_symbol].total;
            available = assets[_owner][_symbol].available;
            return (total, available, assetType);
    }

    // we revert transaction if a non-existing function is called
    fallback() external {
        revert();
    }

    // handle native token deposit and withdrawal

    // FRONTEND FUNCTION TO DEPOSIT NATIVE TOKEN WITH WEB3 SENDTRANSACTION
    receive() external payable whenNotPaused nonReentrant {
        require(allowDeposit, "P-NTDP-01");
        uint _quantityLessFee = msg.value;
        uint feeCharged;
        if (depositFeeRate>0) {
            feeCharged = (msg.value * depositFeeRate) / TENK;
            safeTransferFee(native, feeCharged);
            _quantityLessFee -= feeCharged;
        }
        safeIncrease(msg.sender, native, _quantityLessFee, 0, IPortfolio.Tx.DEPOSIT);
        emitPortfolioEvent(msg.sender, native, msg.value, feeCharged, IPortfolio.Tx.DEPOSIT);
    }

    // FRONTEND FUNCTION TO WITHDRAW A QUANTITY FROM PORTFOLIO BALANCE FOR AN ACCOUNT AND NATIVE SYMBOL
    function withdrawNative(address payable _to, uint _quantity) public whenNotPaused nonReentrant {
        require(_to == msg.sender, "P-OOWN-01");
        safeDecrease(_to, native, _quantity, IPortfolio.Tx.WITHDRAW); // does not decrease if transfer fails
        uint _quantityLessFee = _quantity;
        uint feeCharged;
        if (withdrawFeeRate>0) {
            feeCharged = (_quantity * withdrawFeeRate) / TENK;
            safeTransferFee(native, feeCharged);
            _quantityLessFee -= feeCharged;
        }
        (bool success, ) = _to.call{value: _quantityLessFee}('');
        require(success, "P-WNF-01");
        emitPortfolioEvent(msg.sender, native, _quantity, feeCharged, IPortfolio.Tx.WITHDRAW);
    }

    // handle ERC20 token deposit and withdrawal
    // FRONTEND FUNCTION TO DEPOSIT A QUANTITY TO PORTFOLIO BALANCE FOR AN ACCOUNT AND TOKEN SYMBOL
    function depositToken(address _from, bytes32 _symbol, uint _quantity) public whenNotPaused nonReentrant {
        require(_from == msg.sender, "P-OODT-01");
        require(allowDeposit, "P-ETDP-01");
        require(_quantity > 0, "P-ZETD-01");
        require(tokenList.contains(_symbol), "P-ETNS-01");
        uint feeCharged;
        if (depositFeeRate>0) {
            feeCharged = (_quantity * depositFeeRate) / TENK;
        }
        uint _quantityLessFee = _quantity - feeCharged;
        safeIncrease(_from, _symbol, _quantityLessFee, 0, IPortfolio.Tx.DEPOSIT); // reverts if transfer fails
        require(_quantity <= tokenMap[_symbol].balanceOf(_from), "P-NETD-01");
        tokenMap[_symbol].safeTransferFrom(_from, address(this), _quantity);
        if (depositFeeRate>0) {
            safeTransferFee(_symbol, feeCharged);
        }
        emitPortfolioEvent(_from, _symbol, _quantity, feeCharged, IPortfolio.Tx.DEPOSIT);
    }

    // FRONTEND FUNCTION TO WITHDRAW A QUANTITY FROM PORTFOLIO BALANCE FOR AN ACCOUNT AND TOKEN SYMBOL
    function withdrawToken(address _to, bytes32 _symbol, uint _quantity) public whenNotPaused nonReentrant {
        require(_to == msg.sender, "P-OOWT-01");
        require(_quantity > 0, "P-ZTQW-01");
        require(tokenList.contains(_symbol), "P-ETNS-02");
        safeDecrease(_to, _symbol, _quantity, IPortfolio.Tx.WITHDRAW); // does not decrease if transfer fails
        uint _quantityLessFee = _quantity;
        uint feeCharged;
        if (withdrawFeeRate>0) {
            feeCharged = (_quantity * withdrawFeeRate) / TENK;
            safeTransferFee(_symbol, feeCharged);
            _quantityLessFee -= feeCharged;
        }
        tokenMap[_symbol].safeTransfer(_to, _quantityLessFee);
        emitPortfolioEvent(_to, _symbol, _quantity, feeCharged, IPortfolio.Tx.WITHDRAW);
    }

    function emitPortfolioEvent(address _trader, bytes32 _symbol, uint _quantity, uint _feeCharged,  IPortfolio.Tx transaction) private {
        emit IPortfolio.PortfolioUpdated(transaction, _trader, _symbol, _quantity, _feeCharged, assets[_trader][_symbol].total, assets[_trader][_symbol].available);
    }

    // WHEN Increasing in addExectuion the amount is applied to both Total & Available(so SafeIncrease can be used) as opposed to
    // WHEN Decreasing in addExectuion the amount is only applied to Total.(SafeDecrease can NOT be used, so we have safeDecreaseTotal instead)
    // i.e. (USDT 100 Total, 50 Available after we send a BUY order of 10 avax @5$. Partial Exec 5@10. Total goes down to 75. Available stays at 50 )
    function addExecution(ITradePairs.Order memory _maker, address _takerAddr, bytes32 _baseSymbol, bytes32 _quoteSymbol,
                          uint _baseAmount, uint _quoteAmount, uint _makerfeeCharged, uint _takerfeeCharged)
            public override {
        // TRADEPAIRS SHOULD HAVE ADMIN ROLE TO INITIATE PORTFOLIO addExecution
        //****require (address(tradePairs[ITradePairs(msg.sender).getTradePair()]) == address(ITradePairs(msg.sender)), "E3");
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-10");
        // if _maker.side = BUY then _taker.side = SELL
        if (_maker.side == ITradePairs.Side.BUY) {
            // decrease maker quote and incrase taker quote
            safeDecreaseTotal(_maker.traderaddress, _quoteSymbol, _quoteAmount, IPortfolio.Tx.EXECUTION);
            // console.log(_takerAddr, bytes32ToString(_quoteSymbol), "BUY Increase quoteAmount =", _quoteAmount );
            safeIncrease(_takerAddr, _quoteSymbol, _quoteAmount, _takerfeeCharged, IPortfolio.Tx.EXECUTION);
            // increase maker base and decrase taker base
            safeIncrease(_maker.traderaddress, _baseSymbol, _baseAmount, _makerfeeCharged, IPortfolio.Tx.EXECUTION);
            safeDecrease(_takerAddr,_baseSymbol, _baseAmount, IPortfolio.Tx.EXECUTION);
        } else {
            // increase maker quote & decrease taker quote
            safeIncrease(_maker.traderaddress, _quoteSymbol, _quoteAmount, _makerfeeCharged, IPortfolio.Tx.EXECUTION);
            // console.log(_takerAddr, bytes32ToString(_quoteSymbol), "SELL Decrease quoteAmount =", _quoteAmount );
            safeDecrease(_takerAddr, _quoteSymbol, _quoteAmount, IPortfolio.Tx.EXECUTION);
            // decrease maker base and incrase taker base
            safeDecreaseTotal(_maker.traderaddress, _baseSymbol, _baseAmount, IPortfolio.Tx.EXECUTION);
            safeIncrease(_takerAddr, _baseSymbol, _baseAmount, _takerfeeCharged, IPortfolio.Tx.EXECUTION);
        }
    }

    function adjustAvailable(IPortfolio.Tx _transaction, address _trader, bytes32 _symbol, uint _amount) public override  {
        // TRADEPAIRS SHOULD HAVE ADMIN ROLE TO INITIATE PORTFOLIO adjustAvailable
        //****require (address(tradePairs[ITradePairs(msg.sender).getTradePair()]) == address(ITradePairs(msg.sender)), "E1");
        // console.log("adjustAvailable = ", _amount);
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-09");
        if (_transaction == IPortfolio.Tx.INCREASEAVAIL) {
            // console.log(_trader, bytes32ToString(_symbol), "AdjAvailable Increase =", _amount );
            assets[_trader][_symbol].available += _amount;
        } else if (_transaction == IPortfolio.Tx.DECREASEAVAIL)  {
            require(_amount <= assets[_trader][_symbol].available, "P-AFNE-01");
            // console.log(_trader, bytes32ToString(_symbol), "AdjAvailable Decrease =", _amount );
            assets[_trader][_symbol].available -= _amount;
        } // IGNORE OTHER types of _transactions
        emitPortfolioEvent(_trader, _symbol, _amount, 0, _transaction);
    }

    function safeTransferFee(bytes32 _symbol, uint _feeCharged) private {
        // console.log (bytes32ToString(_symbol), "safeTransferFee = Fee ", _feeCharged );
        bool feesuccess = true;
        if (native == _symbol) {
            (feesuccess, ) = payable(fee).call{value: _feeCharged}('');
            require(feesuccess, "P-STFF-01");
        } else {
            tokenMap[_symbol].safeTransfer(payable(fee), _feeCharged);
        }
    }

    // Only called from addExecution
    function safeDecreaseTotal(address _trader, bytes32 _symbol, uint _amount, IPortfolio.Tx transaction) private {
      require(_amount <= assets[_trader][_symbol].total, "P-TFNE-01");
      assets[_trader][_symbol].total -= _amount;
      if (transaction ==  IPortfolio.Tx.EXECUTION) { // The methods that call safeDecrease are already emmiting this event anyways
        emitPortfolioEvent(_trader, _symbol,_amount, 0, transaction);
      }
    }

    // Only called from DEPOSIT/WITHDRAW
    function safeDecrease(address _trader, bytes32 _symbol, uint _amount, IPortfolio.Tx transaction) private {
      require(_amount <= assets[_trader][_symbol].available, "P-AFNE-02");
      assets[_trader][_symbol].available -= _amount;
      safeDecreaseTotal(_trader, _symbol, _amount, transaction);
    }

    // Called from DEPOSIT/ WITHDRAW AND ALL OTHER TX
    // WHEN called from DEPOSIT/ WITHDRAW emitEvent = false because for some reason the event has to be raised at the end of the
    // corresponding Deposit/ Withdraw functions to be able to capture the state change in the chain value.
    function safeIncrease(address _trader, bytes32 _symbol, uint _amount, uint _feeCharged, IPortfolio.Tx transaction) private {
      require(_amount > 0 && _amount >= _feeCharged, "P-TNEF-01");
      // console.log (bytes32ToString(_symbol), "safeIncrease = Amnt/Fee ", _amount, _feeCharged );
      // console.log (bytes32ToString(_symbol), "safeIncrease Before Total/Avail= ", assets[_trader][_symbol].total, assets[_trader][_symbol].available );
      assets[_trader][_symbol].total += _amount - _feeCharged;
      assets[_trader][_symbol].available += _amount - _feeCharged;
      // console.log (bytes32ToString(_symbol), "safeIncrease After Total/Avail= ", assets[_trader][_symbol].total, assets[_trader][_symbol].available );

      if (_feeCharged > 0 ) {
        safeTransferFee(_symbol, _feeCharged);
      }
      if (transaction != IPortfolio.Tx.DEPOSIT && transaction != IPortfolio.Tx.WITHDRAW) {
        emitPortfolioEvent(_trader, _symbol, _amount, _feeCharged, transaction);
      }
    }

    // FIXME REMOVE the below utility function
    // utility function
    // function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
    //     uint8 i = 0;
    //     while(i < 32 && _bytes32[i] != 0) {
    //         i++;
    //     }
    //     bytes memory bytesArray = new bytes(i);
    //     for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
    //         bytesArray[i] = _bytes32[i];
    //     }
    //     return string(bytesArray);
    // }



}
