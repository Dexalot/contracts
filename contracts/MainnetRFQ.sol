// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./interfaces/IERC1271.sol";
import "./interfaces/IPortfolioBridge.sol";
import "./interfaces/IPortfolio.sol";
import "./interfaces/IPortfolioMain.sol";
import "./interfaces/IMainnetRFQ.sol";

/**
 * @title   Request For Quote smart contract
 * @notice  This contract takes advantage of prices from the Dexalot subnet to provide
 * token swaps on EVM compatible chains. Users must request a quote via our RFQ API.
 * Using this quote they can execute a swap on the current chain using simpleSwap() or partialSwap().
 * The contract also supports cross chain swaps using xChainSwap() which locks funds in the current
 * chain and sends a message to the destination chain to release funds.
 * @dev After getting a firm quote from our off chain RFQ API, call the simpleSwap() function with
 * the quote. This will execute a swap, exchanging the taker asset (asset you provide) with
 * the maker asset (asset we provide). In times of high volatility, the API may adjust the expiry of your quote.
 * may also be adjusted during times of high volatility. Monitor the SwapExpired event to verify if a swap has been
 * adjusted. Adjusting the quote is rare, and only resorted to in periods of high volatility for quotes that do
 * not properly represent the liquidity of the Dexalot subnet.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2023 Dexalot.

contract MainnetRFQ is
    IMainnetRFQ,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable,
    IERC1271
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ECDSAUpgradeable for bytes32;

    // version
    bytes32 public constant VERSION = bytes32("1.1.3");

    // rebalancer admin role
    bytes32 public constant REBALANCER_ADMIN_ROLE = keccak256("REBALANCER_ADMIN_ROLE");
    // portfolio bridge role
    bytes32 public constant PORTFOLIO_BRIDGE_ROLE = keccak256("PORTFOLIO_BRIDGE_ROLE");
    // typehash for same chain swaps
    bytes32 private constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 nonceAndMeta,uint128 expiry,address makerAsset,address takerAsset,address maker,address taker,uint256 makerAmount,uint256 takerAmount)"
        );
    // typehash for cross chain swaps
    bytes32 private constant XCHAIN_SWAP_TYPEHASH =
        keccak256(
            "XChainSwap(uint256 nonceAndMeta,uint32 expiry,address taker,uint32 destChainId,bytes32 makerSymbol,address makerAsset,address takerAsset,uint256 makerAmount,uint256 takerAmount)"
        );
    // mask for nonce in cross chain transfer customdata, last 12 bytes
    uint96 private constant NONCE_MASK = 0xffffffffffffffffffffffff;

    // firm order data structure sent to user for regular swap from RFQ API
    struct Order {
        uint256 nonceAndMeta;
        uint128 expiry;
        address makerAsset;
        address takerAsset;
        address maker;
        address taker;
        uint256 makerAmount;
        uint256 takerAmount;
    }

    // firm order data structure sent to user for cross chain swap from RFQ API
    struct XChainSwap {
        uint256 nonceAndMeta;
        uint32 expiry;
        address taker;
        uint32 destChainId;
        bytes32 makerSymbol;
        address makerAsset;
        address takerAsset;
        uint256 makerAmount;
        uint256 takerAmount;
    }

    struct SwapData {
        uint256 nonceAndMeta;
        // originating user
        address taker;
        // aggregator or destination user
        address destTrader;
        uint256 destChainId;
        address srcAsset;
        address destAsset;
        uint256 srcAmount;
        uint256 destAmount;
    }

    // data structure for swaps unable to release funds on destination chain due to lack of inventory
    struct PendingSwap {
        address trader;
        uint256 quantity;
        bytes32 symbol;
    }

    // address used to sign and verify swap orders
    address public swapSigner;

    // no longer in use, kept for upgradeability)
    uint256 public slippageTolerance;

    // (no longer in use, kept for upgradeability)
    mapping(uint256 => bool) private nonceUsed;
    // (no longer in use, kept for upgradeability)
    mapping(uint256 => uint256) private orderMakerAmountUpdated;
    // (no longer in use, kept for upgradeability)
    mapping(uint256 => uint256) private orderExpiryUpdated;
    // (no longer in use, kept for upgradeability)
    mapping(address => bool) private trustedContracts;
    // uses a bitmap to keep track of nonces used in executed swaps
    mapping(uint256 => uint256) public completedSwaps;
    // uses a bitmap to keep track of nonces of swaps that have been set to expire prior to execution
    mapping(uint256 => uint256) public expiredSwaps;
    // keeps track of swaps that have been queued on the destination chain due to lack of inventory
    mapping(uint256 => PendingSwap) public swapQueue;

    // portfolio bridge contract, sends + receives cross chain messages
    IPortfolioBridge public portfolioBridge;
    // portfolio main contract, used to get token addresses on destination chain
    address public portfolioMain;
    // storage gap for upgradeability
    uint256[44] __gap;

    event SwapSignerUpdated(address newSwapSigner);
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event AddressSet(string indexed name, string actionName, address newAddress);
    event SwapExecuted(
        uint256 indexed nonceAndMeta,
        // originating user
        address taker,
        // aggregator or destination user
        address destTrader,
        uint256 destChainId,
        address srcAsset,
        address destAsset,
        uint256 srcAmount,
        uint256 destAmount
    );
    event XChainFinalized(
        uint256 indexed nonceAndMeta,
        address trader,
        bytes32 symbol,
        uint256 amount,
        uint256 timestamp
    );
    event RebalancerWithdraw(address asset, uint256 amount);
    event SwapExpired(uint256 nonceAndMeta, uint256 timestamp);
    event SwapQueue(string action, uint256 nonceAndMeta, PendingSwap pendingSwap);

    /**
     * @notice  initializer function for Upgradeable RFQ
     * @dev slippageTolerance is initially set to 9800. slippageTolerance is represented in BIPs,
     * therefore slippageTolerance is effectively set to 98%. This means that the price of a firm quote
     * can not drop more than 2% initially.
     * @param _swapSigner Address of swap signer, rebalancer is also defaulted to swap signer
     * but it can be changed later
     */
    function initialize(address _swapSigner) external initializer {
        require(_swapSigner != address(0), "RF-SAZ-01");
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("Dexalot", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REBALANCER_ADMIN_ROLE, _swapSigner);

        swapSigner = _swapSigner;
        slippageTolerance = 9800;
    }

    /**
     * @notice  Used to rebalance native token on rfq contract
     */
    // solhint-disable-next-line no-empty-blocks
    receive() external payable override onlyRole(REBALANCER_ADMIN_ROLE) {}

    /**
     * @notice Swaps two assets for another smart contract or EOA, based off a predetermined swap price.
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot subnet.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     **/
    function simpleSwap(Order calldata _order, bytes calldata _signature) external payable whenNotPaused nonReentrant {
        address destTrader = _verifyOrder(_order, _signature);

        _executeOrder(_order, _order.makerAmount, _order.takerAmount, destTrader);
    }

    /**
     * @notice Swaps two assets for another smart contract or EOA, based off a predetermined swap price.
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot subnet. This function is used for multi hop swaps and will partially fill
     * at the original quoted price.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @param _takerAmount Actual amount of takerAsset utilized in swap
     **/
    function partialSwap(
        Order calldata _order,
        bytes calldata _signature,
        uint256 _takerAmount
    ) external payable whenNotPaused nonReentrant {
        address destTrader = _verifyOrder(_order, _signature);

        uint256 makerAmount = _order.makerAmount;
        if (_takerAmount < _order.takerAmount) {
            makerAmount = (makerAmount * _takerAmount) / _order.takerAmount;
        }

        _executeOrder(_order, makerAmount, _takerAmount, destTrader);
    }

    /**
     * @notice Swaps two assets cross chain, based on a predetermined swap price
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot subnet. This function is called on the source chain where is locks
     * funds and sends a cross chain message to release funds on the destination chain.
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     */
    function xChainSwap(XChainSwap calldata _order, bytes calldata _signature) external payable whenNotPaused {
        address destTrader = _verifyXSwap(_order, _signature);

        _executeXSwap(_order, destTrader);

        _sendCrossChainTrade(_order, destTrader);
    }

    /**
     * @notice  Processes the message coming from the bridge
     * @dev     CCTRADE Cross Chain Trade message is the only message that can be processed.
     * Even when the contract is paused, this method is allowed for the messages that
     * are in flight to complete properly. Pause for upgrade, then wait to make sure no messages are in
     * flight then upgrade
     * @param  _xfer  XFER message
     */
    function processXFerPayload(
        IPortfolio.XFER calldata _xfer
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        require(_xfer.transaction == IPortfolio.Tx.CCTRADE, "RF-PTNS-01");
        require(_xfer.trader != address(0), "RF-ZADDR-01");
        require(_xfer.quantity > 0, "RF-ZETD-01");
        uint256 nonceAndMeta = (uint256(uint160(_xfer.trader)) << 96) | (uint224(_xfer.customdata) & NONCE_MASK);
        _processXFerPayloadInternal(_xfer.trader, _xfer.symbol, _xfer.quantity, nonceAndMeta);
    }

    /**
     * @notice  Sets the portfolio bridge contract address
     * @dev     Only callable by admin
     * @param   _portfolioBridge  New portfolio bridge contract address
     */
    function setPortfolioBridge(address _portfolioBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //Can't have multiple portfolioBridge using the same portfolio
        if (hasRole(PORTFOLIO_BRIDGE_ROLE, address(portfolioBridge)))
            super.revokeRole(PORTFOLIO_BRIDGE_ROLE, address(portfolioBridge));
        portfolioBridge = IPortfolioBridge(_portfolioBridge);
        grantRole(PORTFOLIO_BRIDGE_ROLE, _portfolioBridge);
        emit AddressSet("MAINNETRFQ", "SET-PORTFOLIOBRIDGE", _portfolioBridge);
    }

    /**
     * @notice  Sets the portfolio main contract address
     * @dev     Only callable by admin
     */
    function setPortfolioMain() external onlyRole(DEFAULT_ADMIN_ROLE) {
        address _portfolioMain = address(portfolioBridge.getPortfolio());
        portfolioMain = _portfolioMain;
        emit AddressSet("MAINNETRFQ", "SET-PORTFOLIOMAIN", _portfolioMain);
    }

    /**
     * @notice Updates the expiry of a order. The new expiry
     * is the deadline a trader has to execute the swap.
     * @dev Only rebalancer can call this function.
     * @param _nonceAndMeta nonce of order
     **/
    function updateSwapExpiry(uint256 _nonceAndMeta) external onlyRole(REBALANCER_ADMIN_ROLE) {
        expiredSwaps[_nonceAndMeta >> 8] |= 1 << (_nonceAndMeta & 0xff);
        emit SwapExpired(_nonceAndMeta, block.timestamp);
    }

    /**
     * @notice Updates the signer address.
     * @dev Only DEFAULT_ADMIN can call this function.
     * @param _swapSigner Address of new swap signer
     **/
    function setSwapSigner(address _swapSigner) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_swapSigner != address(0), "RF-SAZ-01");
        swapSigner = _swapSigner;
        emit SwapSignerUpdated(_swapSigner);
    }

    /**
     * @notice  Pause contract
     * @dev     Only callable by admin
     */
    function pause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpause contract
     * @dev     Only callable by admin
     */
    function unpause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice  Allows rebalancer to withdraw an asset from smart contract
     * @dev     Only callable by admin
     * @param   _asset  Address of the asset to be withdrawn
     * @param   _amount  Amount of asset to be withdrawn
     */
    function claimBalance(address _asset, uint256 _amount) external onlyRole(REBALANCER_ADMIN_ROLE) nonReentrant {
        if (_asset == address(0)) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = payable(msg.sender).call{value: _amount}("");
            require(success, "RF-TF-01");
        } else {
            IERC20Upgradeable(_asset).safeTransfer(msg.sender, _amount);
        }
        emit RebalancerWithdraw(_asset, _amount);
    }

    /**
     * @notice  Allows rebalancer to withdraw multiple assets from smart contract
     * @dev     Only callable by admin
     * @param   _assets  Array of addresses of the assets to be withdrawn
     * @param   _amounts  Array of amounts of assets to be withdrawn
     */
    function batchClaimBalance(
        address[] calldata _assets,
        uint256[] calldata _amounts
    ) external onlyRole(REBALANCER_ADMIN_ROLE) nonReentrant {
        require(_assets.length == _amounts.length, "RF-BCAM-01");
        uint256 i;

        while (i < _assets.length) {
            if (_assets[i] == address(0)) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = payable(msg.sender).call{value: _amounts[i]}("");
                require(success, "RF-TF-01");
            } else {
                IERC20Upgradeable(_assets[i]).safeTransfer(msg.sender, _amounts[i]);
            }
            emit RebalancerWithdraw(_assets[i], _amounts[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Releases funds which have been queued on the destination chain due to lack of inventory
     * @dev Only worth calling once inventory has been replenished
     * @param _nonceAndMeta Nonce of order
     */
    function removeFromSwapQueue(uint256 _nonceAndMeta) external nonReentrant {
        PendingSwap memory pendingSwap = swapQueue[_nonceAndMeta];
        bool success = _processXFerPayloadInternal(
            pendingSwap.trader,
            pendingSwap.symbol,
            pendingSwap.quantity,
            _nonceAndMeta
        );
        require(success, "RF-INVT-01");
        delete swapQueue[_nonceAndMeta];
        emit SwapQueue("REMOVED", _nonceAndMeta, pendingSwap);
    }

    /**
     * @notice  Adds Rebalancer Admin role to the address
     * @param   _address  address to add role to
     */
    function addRebalancer(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_address != address(0), "RF-SAZ-01");
        emit RoleUpdated("RFQ", "ADD-ROLE", REBALANCER_ADMIN_ROLE, _address);
        grantRole(REBALANCER_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Removes Rebalancer Admin role from the address
     * @param   _address  address to remove role from
     */
    function removeRebalancer(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(getRoleMemberCount(REBALANCER_ADMIN_ROLE) > 1, "RF-ALOA-01");
        emit RoleUpdated("RFQ", "REMOVE-ROLE", REBALANCER_ADMIN_ROLE, _address);
        revokeRole(REBALANCER_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Adds Default Admin role to the address
     * @param   _address  address to add role to
     */
    function addAdmin(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_address != address(0), "RF-SAZ-01");
        emit RoleUpdated("RFQ", "ADD-ROLE", DEFAULT_ADMIN_ROLE, _address);
        grantRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Removes Default Admin role from the address
     * @param   _address  address to remove role from
     */
    function removeAdmin(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(getRoleMemberCount(DEFAULT_ADMIN_ROLE) > 1, "RF-ALOA-01");
        emit RoleUpdated("RFQ", "REMOVE-ROLE", DEFAULT_ADMIN_ROLE, _address);
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Checks if address has Rebalancer Admin role
     * @param   _address  address to check
     * @return  bool    true if address has Rebalancer Admin role
     */
    function isRebalancer(address _address) external view returns (bool) {
        return hasRole(REBALANCER_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Checks if address has Default Admin role
     * @param   _address  address to check
     * @return  bool    true if address has Default Admin role
     */
    function isAdmin(address _address) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice Verifies Signature in accordance of ERC1271 standard
     * @param _hash Hash of order data
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @return bytes4   The Magic Value based on ERC1271 standard. 0x1626ba7e represents
     * a valid signature, while 0x00000000 represents an invalid signature.
     **/
    function isValidSignature(bytes32 _hash, bytes calldata _signature) public view override returns (bytes4) {
        (address signer, ) = ECDSAUpgradeable.tryRecover(_hash, _signature);

        if (signer == swapSigner) {
            return 0x1626ba7e;
        } else {
            return 0x00000000;
        }
    }

    /**
     * @notice Verifies that a XChainSwap order is valid and has not been executed already.
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @return address The address where the funds will be transferred.
     */
    function _verifyXSwap(XChainSwap calldata _order, bytes calldata _signature) private returns (address) {
        bytes32 hashedStruct = keccak256(
            abi.encode(
                XCHAIN_SWAP_TYPEHASH,
                _order.nonceAndMeta,
                _order.expiry,
                _order.taker,
                _order.destChainId,
                _order.makerSymbol,
                _order.makerAsset,
                _order.takerAsset,
                _order.makerAmount,
                _order.takerAmount
            )
        );
        _verifySwapInternal(_order.nonceAndMeta, _order.expiry, _order.taker, false, hashedStruct, _signature);

        address destTrader = address(uint160(_order.nonceAndMeta >> 96));
        return (destTrader);
    }

    /**
     * @notice Handles the exchange of assets based on swap type and
     * if the assets are ERC-20's or native tokens. Transfer assets in on the source chain
     * and sends a cross chain message to release assets on the destination chain
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _destTrader The address to transfer funds to on destination chain
     **/
    function _executeXSwap(XChainSwap calldata _order, address _destTrader) private {
        SwapData memory swapData = SwapData({
            nonceAndMeta: _order.nonceAndMeta,
            taker: _order.taker,
            destTrader: _destTrader,
            destChainId: _order.destChainId,
            srcAsset: _order.takerAsset,
            destAsset: _order.makerAsset,
            srcAmount: _order.takerAmount,
            destAmount: _order.makerAmount
        });
        _executeSwapInternal(swapData, false);
    }

    /**
     * @notice Verifies that an order is valid and has not been executed already.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @return address The address where the funds will be transferred. It is an Aggregator address if
     * the address in the nonceAndMeta matches the msg.sender
     **/
    function _verifyOrder(Order calldata _order, bytes calldata _signature) private returns (address) {
        address destTrader = address(uint160(_order.nonceAndMeta >> 96));

        bytes32 hashedStruct = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                _order.nonceAndMeta,
                _order.expiry,
                _order.makerAsset,
                _order.takerAsset,
                _order.maker,
                _order.taker,
                _order.makerAmount,
                _order.takerAmount
            )
        );
        _verifySwapInternal(
            _order.nonceAndMeta,
            _order.expiry,
            _order.taker,
            destTrader == msg.sender,
            hashedStruct,
            _signature
        );
        return destTrader;
    }

    /**
     * @notice Handles the exchange of assets based on swap type and
     * if the assets are ERC-20's or native tokens.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _makerAmount The proper makerAmount for the trade
     * @param _takerAmount The proper takerAmount for the trade
     * @param _destTrader The address to transfer funds to
     **/
    function _executeOrder(
        Order calldata _order,
        uint256 _makerAmount,
        uint256 _takerAmount,
        address _destTrader
    ) private {
        SwapData memory swapData = SwapData({
            nonceAndMeta: _order.nonceAndMeta,
            taker: _order.taker,
            destTrader: _destTrader,
            destChainId: block.chainid,
            srcAsset: _order.takerAsset,
            destAsset: _order.makerAsset,
            srcAmount: _takerAmount,
            destAmount: _makerAmount
        });
        _executeSwapInternal(swapData, true);
    }

    /**
     * @notice Verifies that a swap has a valid signature, nonce and expiry
     * @param _nonceAndMeta Nonce of swap
     * @param _expiry Expiry of swap
     * @param _taker Address of originating user
     * @param _isAggregator True if swap initiated by contract i.e. aggregator
     * @param _hashedStruct Hashed swap struct, required for signature verification
     * @param _signature Signature of swap
     *
     */
    function _verifySwapInternal(
        uint256 _nonceAndMeta,
        uint256 _expiry,
        address _taker,
        bool _isAggregator,
        bytes32 _hashedStruct,
        bytes calldata _signature
    ) private {
        uint256 bucket = _nonceAndMeta >> 8;
        uint256 mask = 1 << (_nonceAndMeta & 0xff);
        uint256 bitmap = completedSwaps[bucket];

        require(bitmap & mask == 0, "RF-IN-01");
        require(expiredSwaps[bucket] & mask == 0, "RF-QE-01");
        require(block.timestamp <= _expiry, "RF-QE-02");
        require(_taker == msg.sender || _isAggregator, "RF-IMS-01");
        require(isValidSignature(_hashTypedDataV4(_hashedStruct), _signature) == 0x1626ba7e, "RF-IS-01");

        completedSwaps[bucket] = bitmap | mask;
    }

    /**
     * @notice Pulls funds for a swap from the msg.sender
     * @param _swapData Struct containing all information for executing a swap
     */
    function _takeFunds(SwapData memory _swapData) private {
        if (_swapData.srcAsset == address(0)) {
            require(msg.value >= _swapData.srcAmount, "RF-IMV-01");
        } else {
            IERC20Upgradeable(_swapData.srcAsset).safeTransferFrom(msg.sender, address(this), _swapData.srcAmount);
        }
    }

    /**
     * @notice Release funds for a swap to the destTrader
     * @param _swapData Struct containing all information for executing a swap
     */
    function _releaseFunds(SwapData memory _swapData) private {
        if (_swapData.destAsset == address(0)) {
            (bool success, ) = payable(_swapData.destTrader).call{value: _swapData.destAmount}("");
            require(success, "RF-TF-01");
        } else {
            IERC20Upgradeable(_swapData.destAsset).safeTransfer(_swapData.destTrader, _swapData.destAmount);
        }
    }

    /**
     * @notice Refunds remaining native token to the msg.sender
     * @param _swapData Struct containing all information for executing a swap
     */
    function _refundNative(SwapData memory _swapData) private {
        if (_swapData.srcAsset == address(0) && msg.value > _swapData.srcAmount) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - _swapData.srcAmount}("");
            require(success, "RF-TF-02");
        }
    }

    /**
     * @notice Executes a swap by taking funds from the msg.sender and if the swap is not cross chain
     * funds are released to the destTrader. Emits SwapExecuted event upon completion.
     * @param _swapData Struct containing all information for executing a swap
     */
    function _executeSwapInternal(SwapData memory _swapData, bool isNotXChain) private {
        _takeFunds(_swapData);
        if (isNotXChain) {
            _releaseFunds(_swapData);
            _refundNative(_swapData);
        }

        emit SwapExecuted(
            _swapData.nonceAndMeta,
            _swapData.taker,
            _swapData.destTrader,
            _swapData.destChainId,
            _swapData.srcAsset,
            _swapData.destAsset,
            _swapData.srcAmount,
            _swapData.destAmount
        );
    }

    /**
     * @notice Sends a cross chain message to PortfolioBridge containing the destination token amount,
     * symbol and trader. Sends remaining native token as gas fee for cross chain message. Refund for
     * gas fee is handled in PortfolioBridge.
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _to Trader address to receive funds on destination chain
     */
    function _sendCrossChainTrade(XChainSwap calldata _order, address _to) private {
        bytes28 customdata = bytes28(uint224(_order.nonceAndMeta) & NONCE_MASK);
        uint256 nativeAmount = _order.takerAsset == address(0) ? _order.takerAmount : 0;
        uint256 gasFee = msg.value - nativeAmount;
        // Nonce to be assigned in PBridge
        portfolioBridge.sendXChainMessage{value: gasFee}(
            _order.destChainId,
            IPortfolioBridge.BridgeProvider.LZ,
            IPortfolio.XFER(
                0,
                IPortfolio.Tx.CCTRADE,
                _to,
                _order.makerSymbol,
                _order.makerAmount,
                block.timestamp,
                customdata
            ),
            _order.taker
        );
    }

    /**
     * @notice Adds unfulfilled swaps (due to lack of inventory) to a queue
     * @param _trader Trader address to transfer to
     * @param _symbol Token symbol to transfer
     * @param _quantity Quantity of token to transfer
     * @param _nonceAndMeta Nonce of the swap
     */
    function _addToSwapQueue(address _trader, bytes32 _symbol, uint256 _quantity, uint256 _nonceAndMeta) private {
        PendingSwap memory pendingSwap = PendingSwap({trader: _trader, symbol: _symbol, quantity: _quantity});
        swapQueue[_nonceAndMeta] = pendingSwap;
        emit SwapQueue("ADDED", _nonceAndMeta, pendingSwap);
    }

    /**
     * @notice  Using the bridge message, releases the remaining swap funds to the trader on the
     * destination chain and sets nonce to used. If not enough inventory swap is added to queue.
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token to be withdrawn
     * @param   _nonceAndMeta  Nonce of the swap
     */
    function _processXFerPayloadInternal(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _nonceAndMeta
    ) private returns (bool) {
        uint256 bucket = _nonceAndMeta >> 8;
        uint256 mask = 1 << (_nonceAndMeta & 0xff);
        require(completedSwaps[bucket] & mask == 0, "RF-IN-02");

        bool success = false;
        if (_symbol == IPortfolio(portfolioMain).getNative()) {
            // Send native
            // solhint-disable-next-line avoid-low-level-calls
            (success, ) = _trader.call{value: _quantity}("");
        } else {
            IERC20Upgradeable token = IPortfolioMain(portfolioMain).getToken(_symbol);
            require(address(token) != address(0), "RF-DTNF-01");

            (bool erc20Success, bytes memory data) = address(token).call(
                abi.encodeWithSelector(token.transfer.selector, _trader, _quantity)
            );
            success = (erc20Success && (data.length == 0 || abi.decode(data, (bool))));
        }
        if (!success) {
            _addToSwapQueue(_trader, _symbol, _quantity, _nonceAndMeta);
            return false;
        }
        completedSwaps[bucket] |= mask;
        emit XChainFinalized(_nonceAndMeta, _trader, _symbol, _quantity, block.timestamp);
        return true;
    }
}
