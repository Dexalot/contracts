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
import "./interfaces/IWrappedToken.sol";
import "./library/UtilsLibrary.sol";

/**
 * @title   Request For Quote smart contract
 * @notice  This contract takes advantage of prices from the Dexalot L1 to provide
 * token swaps on EVM compatible chains. Users must request a quote via our RFQ API.
 * Using this quote they can execute a swap on the current chain using simpleSwap() or partialSwap().
 * The contract also supports cross chain swaps using xChainSwap() which locks funds in the current
 * chain and sends a message to the destination chain to release funds.
 * @dev After getting a firm quote from our off chain RFQ API, call the simpleSwap() function with
 * the quote. This will execute a swap, exchanging the taker asset (asset you provide) with
 * the maker asset (asset we provide). In times of high volatility, the API may adjust the expiry of your quote.
 * The Api may also add slippage to all orders for a particular tradepair during times of high volatility.
 * Monitor the SwapExpired event to verify if a swap has been adjusted. Adjusting the quote is rare, and
 * only resorted to in periods of high volatility for quotes that do not properly represent the liquidity
 * of the Dexalot L1.
 * IThis contract also supports a new cross chain swap flow(originally referred to as GUN Flow) where
 * any user can buy GUN token from any network with a single click. This is particularly
 * beneficial for Avalanche L1s that have certain token restrictions. For example Gunzilla prohibits ERC20s just
 * like Dexalat L1 and they don't allow their gas token in any network but in Gunzilla.
 * When Buying GUN from Avalanche(or Arb,...) with counter token USDC, USDC is kept in MainnetRFQ(Avax)
 * and GUN is deposited to the buyer's wallet via MainnetRFQ(Gun). The flow is : \
 * MainnetRFQ(Avax) => PortfolioBridgeMain(Avax) => ICM => PortfolioBridgeMain(Gun) => MainnetRFQ(Gun) \
 * When Selling GUN from Gunzilla with counter token USDC. GUN is kept in MainnetRFQ(Gun) and USDC is deposited
 * to the buyer's wallet via MainnetRFQ(Avax) The flow is : \
 * MainnetRFQ(Gun) => PortfolioBridgeMain(Gun) => ICM => PortfolioBridgeMain(Avax) => MainnetRFQ(Avax) \
 * Similarly a Cross Chain Swaps Betwen Avalanche & Arb would work as follows exchanging AVAX & ETH
 * MainnetRFQ(Avax) => PortfolioBridgeMain(Avax) => LayerZero => PortfolioBridgeMain(Arb) => MainnetRFQ(Arb) \
 * MainnetRFQ(Arb) => PortfolioBridgeMain(Arb) => LayerZero => PortfolioBridgeMain(Avax) => MainnetRFQ(Avax) \
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
    bytes32 public constant VERSION = bytes32("1.2.4");

    // rebalancer admin role
    bytes32 public constant REBALANCER_ADMIN_ROLE = keccak256("REBALANCER_ADMIN_ROLE");
    // portfolio bridge role
    bytes32 public constant PORTFOLIO_BRIDGE_ROLE = keccak256("PORTFOLIO_BRIDGE_ROLE");
    // volatility admin role
    bytes32 public constant VOLATILITY_ADMIN_ROLE = keccak256("VOLATILITY_ADMIN_ROLE");
    // trusted forwarder role
    bytes32 public constant TRUSTED_FORWARDER_ROLE = keccak256("TRUSTED_FORWARDER_ROLE");
    // typehash for same chain swaps
    bytes32 private constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 nonceAndMeta,uint128 expiry,address makerAsset,address takerAsset,address maker,address taker,uint256 makerAmount,uint256 takerAmount)"
        );
    // typehash for cross chain swaps
    bytes32 private constant XCHAIN_SWAP_TYPEHASH =
        keccak256(
            "XChainSwap(bytes32 from,bytes32 to,bytes32 makerSymbol,bytes32 makerAsset,bytes32 takerAsset,uint256 makerAmount,uint256 takerAmount,uint96 nonce,uint32 expiry,uint32 destChainId,uint8 bridgeProvider)"
        );
    // mask for nonce in cross chain transfer customdata, last 12 bytes
    uint96 private constant NONCE_MASK = 0xffffffffffffffffffffffff;
    // precision for slippage bps (2 decimal places of bps)
    uint256 private constant SLIP_PRECISION = 1000000;
    // mask for slippage bps in slipInfo, last 3 bytes
    uint8 private constant SLIP_BPS_MASK = 0x7;
    // number of bits to shift for slippage bps in slipInfo
    uint8 private constant SLIP_BPS_SHIFT = 3;
    // max slippage bps
    uint24 private constant MAX_SLIP_BPS = 50000;
    // bytes length of an address
    uint256 private constant ADDRESS_LENGTH = 20;
    // bytes of the order structure + signature in calldata
    uint256 private constant ORDER_SIG_LENGTH = 256 + 65;
    // name hash for EIP712 domain
    bytes32 private constant EIP712_NAME_HASH = keccak256("Dexalot");
    // version hash for EIP712 domain
    bytes32 private constant EIP712_VERSION_HASH = keccak256("1");

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
        bytes32 from;
        bytes32 to;
        bytes32 makerSymbol;
        bytes32 makerAsset;
        bytes32 takerAsset;
        uint256 makerAmount;
        uint256 takerAmount;
        uint96 nonce;
        uint32 expiry;
        uint32 destChainId;
        IPortfolioBridge.BridgeProvider bridgeProvider;
    }

    struct SwapData {
        uint256 nonceAndMeta;
        // originating user
        address taker;
        // aggregator or destination user
        bytes32 destTrader;
        uint32 destChainId;
        address srcAsset;
        bytes32 destAsset;
        uint256 srcAmount;
        uint256 destAmount;
        address msgSender;
        bool isDirect;
    }

    // data structure for swaps unable to release funds on destination chain due to lack of inventory
    struct PendingSwap {
        address trader;
        uint256 quantity;
        bytes32 symbol;
    }

    struct WrappedInfo {
        IWrappedToken wrappedNative;
        bool keepWrapped;
    }

    // address used to sign and verify swap orders
    address public swapSigner;

    // (no longer in use, kept for upgradeability)
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
    // (no longer in use, kept for upgradeability)
    mapping(uint256 => uint256) private expiredSwaps;
    // keeps track of swaps that have been queued on the destination chain due to lack of inventory
    mapping(uint256 => PendingSwap) public swapQueue;

    // portfolio bridge contract, sends + receives cross chain messages
    IPortfolioBridge public portfolioBridge;
    // portfolio main contract, used to get token addresses on destination chain
    address public portfolioMain;
    // (no longer in use, kept for upgradeability)
    uint256 public volatilePairs;
    // wrapped info for the given chain, used to unwrap/wrap in a swap
    WrappedInfo public wrappedInfo;
    // number of bps to slip quote by to 2 decimal places
    // key = [ slipBpsEnum ] or [ expiryTime | slipBpsEnum ]
    mapping(uint256 => uint24) public slippagePoints;
    // rfq forwarder contract address for eip-2771 support
    address public trustedForwarder;

    // storage gap for upgradeability
    uint256[40] __gap;

    event SwapSignerUpdated(address newSwapSigner);
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event AddressSet(string indexed name, string actionName, address newAddress);
    event SwapExecuted(
        uint256 indexed nonceAndMeta,
        address taker,
        bytes32 destTrader,
        uint32 destChainId,
        address srcAsset,
        bytes32 destAsset,
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
    receive() external payable override {
        require(
            hasRole(REBALANCER_ADMIN_ROLE, msg.sender) || msg.sender == address(wrappedInfo.wrappedNative),
            "RF-RAOW-01"
        );
    }

    /**
     * @notice Swaps two assets for another smart contract or EOA, based off a predetermined swap price.
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot L1.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     **/
    function simpleSwap(Order calldata _order, bytes calldata _signature) external payable nonReentrant {
        address sender = _msgSender();
        address destTrader = _verifyOrder(_order, _signature, sender);

        _executeOrder(_order, _order.makerAmount, _order.takerAmount, destTrader, sender);
    }

    /**
     * @notice Swaps two assets for another smart contract or EOA, based off a predetermined swap price.
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot L1. This function is used for multi hop swaps and will partially fill
     * at the original quoted price.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @param _takerAmount Actual amount of takerAsset utilized in swap
     **/
    function partialSwap(
        Order calldata _order,
        bytes calldata _signature,
        uint256 _takerAmount
    ) external payable nonReentrant {
        address sender = _msgSender();
        address destTrader = _verifyOrder(_order, _signature, sender);

        uint256 makerAmount = _order.makerAmount;
        if (_takerAmount < _order.takerAmount) {
            makerAmount = (makerAmount * _takerAmount) / _order.takerAmount;
        }

        _executeOrder(_order, makerAmount, _takerAmount, destTrader, sender);
    }

    /**
     * @notice Swaps two assets cross chain, based on a predetermined swap price
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot L1. This function is called on the source chain where is locks
     * funds and sends a cross chain message to release funds on the destination chain.
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     */
    function xChainSwap(
        XChainSwap calldata _order,
        bytes calldata _signature
    ) external payable whenNotPaused nonReentrant {
        uint256 nonceAndMeta = _verifyXSwap(_order, _signature);

        _executeXSwap(_order, nonceAndMeta);

        _sendCrossChainTrade(_order);
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
        address destTrader = UtilsLibrary.bytes32ToAddress(_xfer.trader);
        require(destTrader != address(0), "RF-ZADDR-01");
        require(_xfer.quantity > 0, "RF-ZETD-01");
        uint256 nonceAndMeta = (uint256(_xfer.trader) << 96) | (uint144(_xfer.customdata) & NONCE_MASK);
        _processXFerPayloadInternal(destTrader, _xfer.symbol, _xfer.quantity, nonceAndMeta);
    }

    /**
     * @notice Sets the wrapped info for the given chain
     * @dev Only callable by admin
     * @param _wrappedToken Address of the wrapped token
     * @param _keepWrapped Boolean to keep wrapped token or false for native token
     */
    function setWrapped(address _wrappedToken, bool _keepWrapped) external onlyRole(DEFAULT_ADMIN_ROLE) {
        wrappedInfo = WrappedInfo(IWrappedToken(_wrappedToken), _keepWrapped);
        emit AddressSet("MAINNETRFQ", "SET-WRAPPED", _wrappedToken);
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
     * @notice  Sets the trusted forwarder address for routed txs
     * @dev     Only callable by admin
     * @param   _trustedForwarder  New trusted forwarder address
     */
    function setTrustedForwarder(address _trustedForwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_trustedForwarder != address(0), "RF-SAZ-01");
        trustedForwarder = _trustedForwarder;
        grantRole(TRUSTED_FORWARDER_ROLE, _trustedForwarder);
        emit AddressSet("MAINNETRFQ", "SET-TRUSTEDFORWARDER", _trustedForwarder);
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
     * @notice  Sets the slippage points for a given key
     * @dev     Only callable by volatility admin
     * @param   _slipBpsKeys  Array of keys for slippage points
     * @param   _slipBpsPoints  Array of slippage points
     */
    function setSlippagePoints(
        uint256[] calldata _slipBpsKeys,
        uint24[] calldata _slipBpsPoints
    ) external onlyRole(VOLATILITY_ADMIN_ROLE) {
        require(_slipBpsKeys.length == _slipBpsPoints.length, "RF-SPAM-01");
        for (uint256 i = 0; i < _slipBpsKeys.length; i++) {
            require(_slipBpsPoints[i] <= MAX_SLIP_BPS, "RF-SPMB-01");
            slippagePoints[_slipBpsKeys[i]] = _slipBpsPoints[i];
        }
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
     * @notice  Adds Volatility Admin role to the address
     * @param   _address  address to add role to
     */
    function addVolatilityAdmin(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_address != address(0), "RF-SAZ-01");
        emit RoleUpdated("RFQ", "ADD-ROLE", VOLATILITY_ADMIN_ROLE, _address);
        grantRole(VOLATILITY_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Removes Volatility Admin role from the address
     * @param   _address  address to remove role from
     */
    function removeVolatilityAdmin(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(getRoleMemberCount(VOLATILITY_ADMIN_ROLE) > 1, "RF-ALOA-01");
        emit RoleUpdated("RFQ", "REMOVE-ROLE", VOLATILITY_ADMIN_ROLE, _address);
        revokeRole(VOLATILITY_ADMIN_ROLE, _address);
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
     * @dev Returns the sender of the message. If the message was sent through the trusted forwarder,
     * returns the original sender.
     * @return address The address of the sender
     */
    function _msgSender() internal view virtual override returns (address) {
        if (msg.data.length >= ORDER_SIG_LENGTH && hasRole(TRUSTED_FORWARDER_ROLE, msg.sender)) {
            return address(bytes20(msg.data[msg.data.length - ADDRESS_LENGTH:]));
        } else {
            return msg.sender;
        }
    }

    /**
     * @dev Returns the hash of the name parameter for the EIP712 domain.
     * Overriding this function to return a constant value to save gas.
     * @return bytes32 The hash of the name parameter
     */
    function _EIP712NameHash() internal view virtual override returns (bytes32) {
        return EIP712_NAME_HASH;
    }

    /**
     * @dev Returns the hash of the version parameter for the EIP712 domain.
     * Overriding this function to return a constant value to save gas.
     * @return bytes32 The hash of the version parameter
     */
    function _EIP712VersionHash() internal view virtual override returns (bytes32) {
        return EIP712_VERSION_HASH;
    }

    /**
     * @notice Verifies that a XChainSwap order is valid and has not been executed already.
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @return nonceAndMeta The nonce of the swap
     */
    function _verifyXSwap(
        XChainSwap calldata _order,
        bytes calldata _signature
    ) private returns (uint256 nonceAndMeta) {
        bytes32 hashedStruct = keccak256(
            abi.encode(
                XCHAIN_SWAP_TYPEHASH,
                _order.from,
                _order.to,
                _order.makerSymbol,
                _order.makerAsset,
                _order.takerAsset,
                _order.makerAmount,
                _order.takerAmount,
                _order.nonce,
                _order.expiry,
                _order.destChainId,
                _order.bridgeProvider
            )
        );
        nonceAndMeta = ((uint256(_order.from) << 96) | _order.nonce);
        _verifySwapInternal(
            nonceAndMeta,
            _order.expiry,
            UtilsLibrary.bytes32ToAddress(_order.from),
            msg.sender,
            false,
            hashedStruct,
            _signature
        );
    }

    /**
     * @notice Handles the exchange of assets based on swap type and
     * if the assets are ERC-20's or native tokens. Transfer assets in on the source chain
     * and sends a cross chain message to release assets on the destination chain
     * @param _order Trade parameters for cross chain swap generated from /api/rfq/firm
     * @param _nonceAndMeta Nonce of swap
     **/
    function _executeXSwap(XChainSwap calldata _order, uint256 _nonceAndMeta) private {
        SwapData memory swapData = SwapData({
            nonceAndMeta: _nonceAndMeta,
            taker: UtilsLibrary.bytes32ToAddress(_order.from),
            destTrader: _order.to,
            destChainId: _order.destChainId,
            srcAsset: UtilsLibrary.bytes32ToAddress(_order.takerAsset),
            destAsset: _order.makerAsset,
            srcAmount: _order.takerAmount,
            destAmount: _order.makerAmount,
            msgSender: msg.sender,
            isDirect: true
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
    function _verifyOrder(Order calldata _order, bytes calldata _signature, address _sender) private returns (address) {
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
            uint32(_order.expiry),
            _order.taker,
            _sender,
            destTrader == _sender,
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
        address _destTrader,
        address _sender
    ) private {
        uint8 slipInfo = uint8(_order.nonceAndMeta >> 88);
        if (slipInfo > SLIP_BPS_MASK) {
            _makerAmount = _slipQuote(slipInfo, _order.expiry, _makerAmount);
        }
        SwapData memory swapData = SwapData({
            nonceAndMeta: _order.nonceAndMeta,
            taker: _order.taker,
            destTrader: UtilsLibrary.addressToBytes32(_destTrader),
            destChainId: uint32(block.chainid),
            srcAsset: _order.takerAsset,
            destAsset: UtilsLibrary.addressToBytes32(_order.makerAsset),
            srcAmount: _takerAmount,
            destAmount: _makerAmount,
            msgSender: _sender,
            isDirect: _sender == msg.sender
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
        address _sender,
        bool _isAggregator,
        bytes32 _hashedStruct,
        bytes calldata _signature
    ) private {
        require(block.timestamp <= _expiry, "RF-QE-02");
        require(_taker == _sender || _isAggregator, "RF-IMS-01");

        uint256 bucket = _nonceAndMeta >> 8;
        uint256 mask = 1 << (_nonceAndMeta & 0xff);
        uint256 bitmap = completedSwaps[bucket];

        require(bitmap & mask == 0, "RF-IN-01");
        require(isValidSignature(_hashTypedDataV4(_hashedStruct), _signature) == 0x1626ba7e, "RF-IS-01");

        completedSwaps[bucket] = bitmap | mask;
    }

    /**
     * @notice Pulls funds for a swap from the msg.sender
     * @param _swapData Struct containing all information for executing a swap
     * @param _wrappedInfo Struct containing wrapped token info
     */
    function _takeFunds(SwapData memory _swapData, WrappedInfo memory _wrappedInfo) private {
        if (_swapData.srcAsset == address(0)) {
            require(msg.value >= _swapData.srcAmount, "RF-IMV-01");
            if (_wrappedInfo.keepWrapped) {
                _wrappedInfo.wrappedNative.deposit{value: _swapData.srcAmount}();
            }
            return;
        }

        require(msg.value == 0, "RF-NSIV-01");

        if (_swapData.isDirect) {
            IERC20Upgradeable(_swapData.srcAsset).safeTransferFrom(
                _swapData.msgSender,
                address(this),
                _swapData.srcAmount
            );
        }
        if (!_wrappedInfo.keepWrapped && _swapData.srcAsset == address(_wrappedInfo.wrappedNative)) {
            _wrappedInfo.wrappedNative.withdraw(_swapData.srcAmount);
        }
    }

    /**
     * @notice Release funds for a swap to the destTrader
     * @param _swapData Struct containing all information for executing a swap
     * @param _wrappedInfo Struct containing wrapped token info
     */
    function _releaseFunds(SwapData memory _swapData, WrappedInfo memory _wrappedInfo) private {
        address destAsset = UtilsLibrary.bytes32ToAddress(_swapData.destAsset);
        address destTrader = UtilsLibrary.bytes32ToAddress(_swapData.destTrader);

        if (destAsset == address(0)) {
            if (_wrappedInfo.keepWrapped) {
                _wrappedInfo.wrappedNative.withdraw(_swapData.destAmount);
            }
            (bool success, ) = payable(destTrader).call{value: _swapData.destAmount}("");
            require(success, "RF-TF-01");
        } else {
            if (!_wrappedInfo.keepWrapped && destAsset == address(_wrappedInfo.wrappedNative)) {
                _wrappedInfo.wrappedNative.deposit{value: _swapData.destAmount}();
            }
            IERC20Upgradeable(destAsset).safeTransfer(destTrader, _swapData.destAmount);
        }
    }

    /**
     * @notice Refunds remaining native token to the msg.sender
     * @param _swapData Struct containing all information for executing a swap
     */
    function _refundNative(SwapData memory _swapData) private {
        if (_swapData.srcAsset == address(0) && msg.value > _swapData.srcAmount) {
            (bool success, ) = payable(_swapData.msgSender).call{value: msg.value - _swapData.srcAmount}("");
            require(success, "RF-TF-02");
        }
    }

    /**
     * @notice Executes a swap by taking funds from the msg.sender and if the swap is not cross chain
     * funds are released to the destTrader. Emits SwapExecuted event upon completion.
     * @param _swapData Struct containing all information for executing a swap
     * @param isNotXChain True if the swap is not cross chain
     */
    function _executeSwapInternal(SwapData memory _swapData, bool isNotXChain) private {
        WrappedInfo memory _wrappedInfo;
        if (_swapData.isDirect) {
            _wrappedInfo = wrappedInfo;
        }

        _takeFunds(_swapData, _wrappedInfo);
        if (isNotXChain) {
            _releaseFunds(_swapData, _wrappedInfo);
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
     */
    function _sendCrossChainTrade(XChainSwap calldata _order) private {
        bytes18 customdata = bytes18(uint144(_order.nonce));
        uint256 nativeAmount = _order.takerAsset == bytes32(0) ? _order.takerAmount : 0;
        uint256 gasFee = msg.value - nativeAmount;
        // Nonce to be assigned in PBridge
        portfolioBridge.sendXChainMessage{value: gasFee}(
            _order.destChainId,
            _order.bridgeProvider,
            IPortfolio.XFER(
                0,
                IPortfolio.Tx.CCTRADE,
                _order.to,
                _order.makerSymbol,
                _order.makerAmount,
                block.timestamp,
                customdata
            ),
            UtilsLibrary.bytes32ToAddress(_order.from)
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

    /**
     * @notice  Slips the quote based on the slippage points and expiry
     * @param   slipInfo  Slip info bitmap
     * @param   expiry    Expiry of the quote
     * @param   amount    Original maker amount
     * @return  uint256   Slipped maker amount
     */
    function _slipQuote(uint8 slipInfo, uint128 expiry, uint256 amount) private view returns (uint256) {
        uint8 slipBpsKey = (slipInfo & SLIP_BPS_MASK);

        // slipInfo = always slip (1) | quote ttl (4) | slippage bps (3)
        if (slipInfo & 0x80 != 0) {
            return (amount * (SLIP_PRECISION - slippagePoints[slipBpsKey])) / SLIP_PRECISION;
        }

        uint256 quoteTtl = 5 * (slipInfo >> SLIP_BPS_SHIFT);
        uint256 expiryMinusTtl = expiry - quoteTtl;
        // If block.timestamp < expiry - quoteTtl, return the original amount
        if (block.timestamp <= expiryMinusTtl) {
            return amount;
        }

        uint256 activeQuoteTs = block.timestamp - expiryMinusTtl;

        if (activeQuoteTs > 15) {
            uint256 slipBps = slippagePoints[(activeQuoteTs << SLIP_BPS_SHIFT) | slipBpsKey];
            if (slipBps == 0) {
                slipBps = slippagePoints[slipBpsKey];
            }
            return (amount * (SLIP_PRECISION - slipBps)) / SLIP_PRECISION;
        }

        return amount;
    }

    // solhint-disable-next-line payable-fallback
    fallback() external {
        revert("RF-NFUN-01");
    }
}
