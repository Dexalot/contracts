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

/**
 * @title   Request For Quote smart contract
 * @notice  This contract takes advantage of prices from the Dexalot subnet to provide
 * token swaps on C-Chain. Currently, users must perform a simple swap via our RFQ API.
 * @dev After getting a firm quote from our off chain RFQ API, call the simpleSwap() function with
 * the quote. This will execute a swap, exchanging the taker asset (asset you provide) with
 * the maker asset (asset we provide). In times of high volatility, the API may adjust your quoted
 * price. The price will never be lower than slippageTolerance, which represents a percentage of the
 * original quoted price. To check if your quoted price has been affected by slippage, monitor the SlippageApplied
 * event. The expiry of your quote may also be adjusted during times of high volatility. Monitor the ExpiryUpdated
 * event to verify if the deadline has been updated. It is highly unlikely that your quotes's makerAmount and expiry
 * are updated. Adjusting the quote is rare, and only resorted to in periods of high volatility for quotes that do
 * not properly represent the liquidity of the Dexalot subnet.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2023 Dexalot.

contract MainnetRFQ is
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable,
    IERC1271
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ECDSAUpgradeable for bytes32;

    // version
    bytes32 public constant VERSION = bytes32("1.0.4");

    // rebalancer admin role
    bytes32 public constant REBALANCER_ADMIN_ROLE = keccak256("REBALANCER_ADMIN_ROLE");

    // firm order data structure sent to user from RFQ API
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

    // address used to sign transactions from Paraswap API
    address public swapSigner;

    // max slippage tolerance for updated order in BIPs
    uint256 public slippageTolerance;

    // keeps track of trade nonces executed
    mapping(uint256 => bool) private nonceUsed;
    // keeps track of trade nonces that had an updated expiry
    mapping(uint256 => uint256) public orderMakerAmountUpdated;
    // keeps track of trade nonces that had slippage applied to their quoted price
    mapping(uint256 => uint256) public orderExpiryUpdated;

    // storage gap for upgradeability
    uint256[50] __gap;

    event SwapSignerUpdated(address newSwapSigner);
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event AddressSet(string indexed name, string actionName, address newAddress);
    event SwapExecuted(
        uint256 nonceAndMeta,
        address maker,
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makerAmountReceived,
        uint256 takerAmountReceived
    );
    event RebalancerWithdraw(address asset, uint256 amount);
    event SlippageApplied(uint256 nonceAndMeta, uint256 newMakerAmount);
    event ExpiryUpdated(uint256 nonceAndMeta, uint256 newExpiry);
    event SlippageToleranceUpdated(uint256 newSlippageTolerance);

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
    receive() external payable onlyRole(REBALANCER_ADMIN_ROLE) {}

    /**
     * @notice Swaps two assets for another smart contract or EOA, based off a predetermined swap price.
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot subnet.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     **/
    function simpleSwap(Order calldata _order, bytes calldata _signature) external payable whenNotPaused nonReentrant {
        uint256 makerAmount = _verifyOrder(_order, _signature);

        _executeSwap(_order, makerAmount, _order.takerAmount);
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
        uint256 makerAmount = _verifyOrder(_order, _signature);

        if (_takerAmount < _order.takerAmount) {
            makerAmount = (makerAmount * _takerAmount) / _order.takerAmount;
        }

        _executeSwap(_order, makerAmount, _takerAmount);
    }

    /**
     * @notice Updates the expiry of a order. The new expiry
     * is the deadline a trader has to execute the swap.
     * @dev Only rebalancer can call this function.
     * @param _nonceAndMeta nonce of order
     * @param _newExpiry new expiry for order
     **/
    function updateOrderExpiry(uint256 _nonceAndMeta, uint256 _newExpiry) external onlyRole(REBALANCER_ADMIN_ROLE) {
        orderExpiryUpdated[_nonceAndMeta] = _newExpiry;
        emit ExpiryUpdated(_nonceAndMeta, _newExpiry);
    }

    /**
     * @notice Updates the makerAmount of a order.
     * The new makerAmount can not be lower than the percentage
     * of slippageTolerance from the previous quoted price.
     * @dev Only rebalancer can call this function.
     * @param _nonceAndMeta nonce of order
     * @param _newMakerAmount new makerAmount for order
     **/
    function updateOrderMakerAmount(
        uint256 _nonceAndMeta,
        uint256 _newMakerAmount,
        uint256 _oldMakerAmount
    ) external onlyRole(REBALANCER_ADMIN_ROLE) {
        uint256 lowestAllowedPriceAfterSlippage = (_oldMakerAmount * slippageTolerance) / 10000;
        require(lowestAllowedPriceAfterSlippage < _newMakerAmount, "RF-TMS");
        orderMakerAmountUpdated[_nonceAndMeta] = _newMakerAmount;
        emit SlippageApplied(_nonceAndMeta, _newMakerAmount);
    }

    /**
     * @notice Updates the slippageTolerance for a order update.
     * i.e. slippageTolerance = 9700 (97%), _oldMakerAmount = 100
     * _newMakerAmount must be greater than if not equal to 97
     * 97 = 100 * 9700 / 10000
     * @dev Only default admin can call this function.
     * @param _newSlippageTolerance lowest percent of original makerAmount allowed in BIPs
     **/
    function setSlippageTolerance(uint256 _newSlippageTolerance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        slippageTolerance = _newSlippageTolerance;
        emit SlippageToleranceUpdated(_newSlippageTolerance);
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
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpause contract
     * @dev     Only callable by admin
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
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
    function isValidSignature(bytes32 _hash, bytes memory _signature) public view override returns (bytes4) {
        address signer = _recoverSigner(_hash, _signature);

        if (signer == swapSigner) {
            return 0x1626ba7e;
        } else {
            return 0x00000000;
        }
    }

    /**
     * @notice Verifies that an order is valid and has not been executed already.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @return uint256 The proper makerAmount to use for the trade.
     **/
    function _verifyOrder(Order calldata _order, bytes calldata _signature) private returns (uint256) {
        require(!nonceUsed[_order.nonceAndMeta], "RF-IN-01");
        require(_order.taker == msg.sender, "RF-IMS-01");
        // adds nonce to nonce used mapping
        nonceUsed[_order.nonceAndMeta] = true;

        bytes32 digest = _calculateOrderDigest(_order);
        bytes4 magicNumber = isValidSignature(digest, _signature);
        require(magicNumber == 0x1626ba7e, "RF-IS-01");

        return _verifyTradeParameters(_order);
    }

    /**
     * @notice Handles the exchange of assets based on swap type and
     * if the assets are ERC-20's or native tokens.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @param _makerAmount the proper makerAmount for the trade
     * @param _takerAmount the proper takerAmount for the trade
     **/
    function _executeSwap(Order calldata _order, uint256 _makerAmount, uint256 _takerAmount) private {
        if (_order.makerAsset == address(0)) {
            // swap NATIVE <=> ERC-20
            IERC20Upgradeable(_order.takerAsset).safeTransferFrom(_order.taker, address(this), _takerAmount);
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = payable(_order.taker).call{value: _makerAmount}("");
            require(success, "RF-TF-01");
        } else if (_order.takerAsset == address(0)) {
            // swap ERC-20 <=> NATIVE
            require(msg.value >= _takerAmount, "RF-IMV-01");
            IERC20Upgradeable(_order.makerAsset).safeTransfer(_order.taker, _makerAmount);
            if (msg.value > _takerAmount) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = payable(msg.sender).call{value: msg.value - _takerAmount}("");
                require(success, "RF-TF-02");
            }
        } else {
            // swap ERC-20 <=> ERC-20
            IERC20Upgradeable(_order.takerAsset).safeTransferFrom(_order.taker, address(this), _takerAmount);
            IERC20Upgradeable(_order.makerAsset).safeTransfer(_order.taker, _makerAmount);
        }

        emit SwapExecuted(
            _order.nonceAndMeta,
            _order.maker,
            _order.taker,
            _order.makerAsset,
            _order.takerAsset,
            _makerAmount,
            _takerAmount
        );
    }

    /**
     * @notice Calculates the digest of the transaction's order.
     * @dev The digest is then used to determine the validity of the signature passed
     * to a swap function.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @return bytes32   The digest of the _order.
     **/
    function _calculateOrderDigest(Order calldata _order) private view returns (bytes32) {
        bytes32 structType = keccak256(
            "Order(uint256 nonceAndMeta,uint128 expiry,address makerAsset,address takerAsset,address maker,address taker,uint256 makerAmount,uint256 takerAmount)"
        );

        bytes32 hashedStruct = keccak256(
            abi.encode(
                structType,
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
        return _hashTypedDataV4(hashedStruct);
    }

    /**
     * @notice Checks if the trade parameters have been updated. If so,
     * this function updates the parameters for the trade. Additionally, this
     * function checks if the trade expiry has past.
     * @param _order Trade parameters for swap generated from /api/rfq/firm
     * @return uint256 The proper makerAmount to use for the trade.
     **/
    function _verifyTradeParameters(Order calldata _order) private view returns (uint256) {
        // verifies if order expiry updated by checking in mapping
        // if the expiry is less than the current timestamp, then
        // the transaction reverts
        if (orderExpiryUpdated[_order.nonceAndMeta] != 0) {
            require(block.timestamp <= orderExpiryUpdated[_order.nonceAndMeta], "RF-QE-01");
        } else {
            require(block.timestamp <= _order.expiry, "RF-QE-02");
        }

        // verifies if slippage was applied to the quoted makerAmount
        // by checking in the mapping. If not, the original quoted price
        // is used for the trade
        uint256 makerAmount = orderMakerAmountUpdated[_order.nonceAndMeta];
        if (makerAmount == 0) {
            makerAmount = _order.makerAmount;
        }
        return makerAmount;
    }

    /**
     * @notice Helper function used to verify signature
     * @param _messageHash Hash of order data
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     * @return signer   The address of the signer of the signature.
     **/
    function _recoverSigner(bytes32 _messageHash, bytes memory _signature) private pure returns (address) {
        (address signer, ) = ECDSAUpgradeable.tryRecover(_messageHash, _signature);
        return signer;
    }
}
