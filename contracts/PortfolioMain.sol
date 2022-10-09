// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import "./Portfolio.sol";
import "./interfaces/ITradePairs.sol";

/**
 * @title Mainnet Portfolio
 * @dev This contract prevalidates the PortfolioSub checks and allows deposits to be sent to the subnet.
 * ExchangeMain needs to have DEFAULT_ADMIN_ROLE on PortfolioMain.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioMain is Portfolio {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // version
    bytes32 public constant VERSION = bytes32("2.1.0");

    // bytes32 symbols to ERC20 token map
    mapping(bytes32 => IERC20Upgradeable) public tokenMap;

    // bytes32 symbols to amount of bridge fee collected
    mapping(bytes32 => uint256) public bridgeFeeCollected;

    function initialize(bytes32 _native, uint32 _chainId) public override initializer {
        Portfolio.initialize(_native, _chainId);
    }

    /**
     * @notice  Add IERC20 token to the tokenMap. Only in the mainnet
     * @param   _symbol   symbol of the token
     * @param   _tokenaddress  address of the token
     * @param   _decimals  decimals of the token
     */
    function addIERC20(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode
    ) internal override {
        //In the mainnet sourceChain should be the same as the chainId specified in the contract
        require(_srcChainId == chainId, "P-SCEM-01");

        if (_symbol != native) {
            require(_tokenaddress != address(0), "P-CNAT-01");
            IERC20MetadataUpgradeable assetIERC20 = IERC20MetadataUpgradeable(_tokenaddress);
            require(UtilsLibrary.stringToBytes32(assetIERC20.symbol()) == _symbol, "P-TSDM-01");
            require(assetIERC20.decimals() == _decimals, "P-TDDM-01");
            tokenMap[_symbol] = IERC20MetadataUpgradeable(_tokenaddress);
        } else {
            // Both Avax & ALOT has 18 decimals
            require(_decimals == 18 && _tokenaddress == address(0), "P-CNAT-01");
        }
    }

    /**
     * @notice  Remove IERC20 token from the tokenMap
     * @dev     tokenMap balance for the symbol should be 0 before it can be removed.
                Make sure that there are no in-flight withdraw messages coming from the subnet
     * @param   _symbol  symbol of the token
     */
    function removeIERC20(bytes32 _symbol) internal override {
        if (tokenList.contains(_symbol) && _symbol != native) {
            // Native doesn't exist in tokenMap
            require(tokenMap[_symbol].balanceOf(address(this)) == 0, "P-NZBL-01");
            delete (tokenMap[_symbol]);
        }
    }

    /**
     * @notice  Frontend function to get the ERC20 token
     * @param   _symbol  symbol of the token
     * @return  IERC20Upgradeable  ERC20 token
     */
    function getToken(bytes32 _symbol) external view override returns (IERC20Upgradeable) {
        return tokenMap[_symbol];
    }

    /**
     * @param   _from  Address of the depositor
     * @param   _bridge  Enum for bridge type
     */
    function depositNative(address payable _from, IPortfolioBridge.BridgeProvider _bridge)
        external
        payable
        override
        whenNotPaused
        nonReentrant
    {
        require(_from == msg.sender || msg.sender == address(this), "P-OOWN-02"); // calls made by super.receive()
        require(allowDeposit, "P-NTDP-01");
        require(msg.value >= bridgeSwapAmount[native], "P-DUTH-01");
        require(msg.value > bridgeFee[native], "PB-RALB-01");
        bridgeFeeCollected[native] += bridgeFee[native];
        emitPortfolioEvent(_from, native, msg.value, bridgeFee[native], IPortfolio.Tx.DEPOSIT);
        portfolioBridge.sendXChainMessage(
            _bridge,
            XFER(
                0, // Nonce to be assigned in PBridge
                IPortfolio.Tx.DEPOSIT,
                _from,
                native,
                msg.value - bridgeFee[native],
                block.timestamp
            )
        );
    }

    /**
     * @param   _from  Address of the depositor
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token to deposit
     * @param   _bridge  Enum for bridge type
     */
    function depositToken(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external override whenNotPaused nonReentrant {
        require(
            _from == msg.sender ||
                msg.sender == address(this) || // calls made by depsitfromContract
                trustedContracts[msg.sender], // keeping it for backward compatibility
            "P-OODT-01"
        );
        require(tokenList.contains(_symbol), "P-ETNS-01");
        depositTokenChecks(_quantity);
        require(_quantity <= tokenMap[_symbol].balanceOf(_from), "P-NETD-01");
        require(_quantity >= bridgeSwapAmount[_symbol], "P-DUTH-01");
        require(_quantity > bridgeFee[_symbol], "PB-RALB-01");
        tokenMap[_symbol].safeTransferFrom(_from, address(this), _quantity);
        bridgeFeeCollected[_symbol] += bridgeFee[_symbol];
        emitPortfolioEvent(_from, _symbol, _quantity, bridgeFee[_symbol], IPortfolio.Tx.DEPOSIT);
        portfolioBridge.sendXChainMessage(
            _bridge,
            XFER(0, IPortfolio.Tx.DEPOSIT, _from, _symbol, _quantity - bridgeFee[_symbol], block.timestamp)
        );
    }

    /**
     * @notice  Allows deposits from trusted contracts
     * @dev     Used by Avalaunch for DD deposits and Vesting Contracts.
     * Keeping for backward compatibility instead of using ON_BEHALF_ROLE.
     * @param   _from  Address of the depositor
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token to deposit
     */
    function depositTokenFromContract(
        address _from,
        bytes32 _symbol,
        uint256 _quantity
    ) external override {
        require(trustedContracts[msg.sender], "P-AOTC-01"); // keeping it for backward compatibility
        this.depositToken(_from, _symbol, _quantity, portfolioBridge.getDefaultBridgeProvider());
    }

    /**
     * @notice  Processes the message coming from the bridge
     * @dev     Only process WITHDRAW messages as it is the only message that can be sent to the portfolio main
     * Even when the contract is paused, this method is allowed for the messages that
     * are in flight to complete properly. Pause for upgrade, then wait to make sure no messages are in
     * flight then upgrade
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token in form of _symbol + chainId
     * @param   _quantity  Amount of token to be withdrawn
     * @param   _transaction  Transaction type
     */
    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolio.Tx _transaction
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        if (_transaction == Tx.WITHDRAW) {
            require(_quantity > 0, "P-ZETD-01");
            if (_symbol == native) {
                //Withdraw native
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = _trader.call{value: _quantity}("");
                require(success, "P-WNFA-01");
            } else {
                //Withdraw Token
                //We don't check the AuctionMode of the token in the mainnet. If Subnet allows the message to be sent
                //Then the token is no longer is auction
                require(tokenList.contains(_symbol), "P-ETNS-02");
                tokenMap[_symbol].safeTransfer(_trader, _quantity);
            }
            emitPortfolioEvent(_trader, _symbol, _quantity, 0, IPortfolio.Tx.WITHDRAW);
        } else {
            revert("P-PTNS-01");
        }
    }

    /**
     * @notice  Recovers the stucked message from the LZ bridge, returns the funds to the depositor/withdrawer
     * @dev     Only call this just before calling force resume receive function for the LZ bridge. \
     * Only the DEFAULT_ADMIN can call this function.
     * @param   _payload  Payload of the message
     */
    function lzRecoverPayload(bytes calldata _payload) external override nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        (address trader, bytes32 symbol, uint256 quantity) = getXFer(_payload);

        if (symbol == native) {
            //Withdraw native
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = trader.call{value: quantity}("");
            require(success, "P-WNFA-01");
        } else {
            //Withdraw Token
            require(tokenList.contains(symbol), "P-ETNS-02");
            tokenMap[symbol].safeTransfer(trader, quantity);
        }
        emitPortfolioEvent(trader, symbol, quantity, 0, IPortfolio.Tx.RECOVER);
    }

    /**
     * @notice  Allows the owner to withdraw the fees collected from the bridge
     * @dev     Collect fees to pay for the bridge as native token
     * @dev     Only the owner can call this function
     * @param   _symbols  Array of symbols of tokens to withdraw
     */
    function collectBridgeFees(bytes32[] calldata _symbols) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _symbols.length; i++) {
            require(tokenList.contains(_symbols[i]), "P-ETNS-02");
            uint256 bcf = bridgeFeeCollected[_symbols[i]];
            bridgeFeeCollected[_symbols[i]] = 0;
            tokenMap[_symbols[i]].safeTransfer(msg.sender, bcf);
        }
    }

    /**
     * @notice  Allows the owner to withdraw the fees collected in AVAX from the bridge
     * @dev     Collect fees to pay for the bridge as native token
     * @dev     Only the owner can call this function
     */
    function collectNativeBridgeFees() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 bcf = bridgeFeeCollected[native];
        bridgeFeeCollected[native] = 0;
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = msg.sender.call{value: bcf}("");
        require(success, "P-CNFF-01");
    }

    /**
     * @notice  Wrapper for emit event
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token used in the transaction
     * @param   _feeCharged  Fee charged for the transaction
     * @param   transaction  Transaction type
     */
    function emitPortfolioEvent(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _feeCharged,
        IPortfolio.Tx transaction
    ) private {
        emit IPortfolio.PortfolioUpdated(transaction, _trader, _symbol, _quantity, _feeCharged, 0, 0);
    }

    // solhint-disable no-empty-blocks

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function updateTransferFeeRate(uint256 _rate, Tx _rateType) external override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function withdrawNative(address payable _to, uint256 _quantity) external override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider
    ) external override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
     */
    function adjustAvailable(
        IPortfolio.Tx _transaction,
        address _trader,
        bytes32 _symbol,
        uint256 _amount
    ) external override {}

    /**
     * @dev     Only valid for the subnet. Implemented with an empty block here.
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
    ) external override {}

    // solhint-enable no-empty-blocks
}
