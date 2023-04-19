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

/**
 * @title   Request For Quote smart contract
 * @notice  This contract takes advantages of prices from the dexalot subnet to provide
 * token swaps on C-Chain. Currently, users must perform a simple swap via our RFQ API.
 * @dev After getting a firm quote from our off chain RFQ API, call the simpleSwap() function with
 * the quote. This will execute a swap, exchanging the taker asset (asset you provide) with
 * the maker asset (asset we provide).
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.
contract MainnetRFQ is
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ECDSAUpgradeable for bytes32;

    // version
    bytes32 public constant VERSION = bytes32("1.0.0");

    // address used to sign transactions from Paraswap API
    address public swapSigner;
    address public rebalancer;

    // keeps track of trade nonces
    mapping(uint256 => bool) private nonceUsed;

    // whitelisted smart contracts. Only applicable if msg.sender is not _quote.taker
    mapping(address => bool) public trustedContracts;

    // contract address to integrator organization name
    mapping(address => string) public trustedContractToIntegrator;

    event SwapSignerUpdated(address _newSwapSigner);
    event RebalancerUpdated(address _rebalancer);
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);
    event AddressSet(string indexed name, string actionName, address newAddress);
    event SwapExecuted(
        address maker,
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makerAmountReceived,
        uint256 takerAmountReceived
    );
    event RebalancerWithdraw(address _asset, uint256 _amount);

    // firm quote data structure sent to user from Paraswap API
    struct Quote {
        uint256 nonceAndMeta;
        uint256 expiry;
        address makerAsset;
        address takerAsset;
        address maker;
        address taker;
        uint256 makerAmount;
        uint256 takerAmount;
    }

    /**
     * @notice  initializer function for Upgradeable RFQ
     * @param _swapSigner Address of swap signer, rebalancer is also defaulted to swap signer
     * but it can be changed later
     */
    function initialize(address _swapSigner) public initializer {
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("Dexalot", "1.0.0");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        swapSigner = _swapSigner;
        rebalancer = _swapSigner;
    }

    /**
     * @notice Swaps two ERC-20 tokens.
     * @dev This function can only be called after generating a firm quote from the Paraswap API.
     * All parameters are generated from the Paraswap API.
     * @param _quote Trade parameters for swap generated from /api/ps/firm
     * @param _signature Signature of trade parameters generated from /api/ps/firm
     **/

    function simpleSwap(Quote calldata _quote, bytes calldata _signature) external payable whenNotPaused nonReentrant {
        require(block.timestamp <= _quote.expiry, "RF-QE-01");
        require(nonceUsed[_quote.nonceAndMeta] == false, "RF-IN-01");
        require(_quote.taker == msg.sender || trustedContracts[msg.sender], "RF-IMS-01");

        // adds nonce to nonce used mapping
        nonceUsed[_quote.nonceAndMeta] = true;

        bytes32 structType = keccak256(
            "Quote(uint256 nonceAndMeta,uint256 expiry,address makerAsset,address takerAsset,address maker,address taker,uint256 makerAmount,uint256 takerAmount)"
        );
        bytes32 hashedStruct = keccak256(
            abi.encode(
                structType,
                _quote.nonceAndMeta,
                _quote.expiry,
                _quote.makerAsset,
                _quote.takerAsset,
                _quote.maker,
                _quote.taker,
                _quote.makerAmount,
                _quote.takerAmount
            )
        );
        bytes32 digest = _hashTypedDataV4(hashedStruct);
        address messageSigner = digest.recover(_signature);
        require(messageSigner == swapSigner, "RF-IS-01");

        if (_quote.makerAsset == address(0)) {
            // swap NATIVE <=> ERC-20
            IERC20Upgradeable(_quote.takerAsset).safeTransferFrom(_quote.taker, address(this), _quote.takerAmount);
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = payable(_quote.taker).call{value: _quote.makerAmount}("");
            require(success == true, "RF-TF-01");
        } else if (_quote.takerAsset == address(0)) {
            // swap ERC-20 <=> NATIVE
            require(msg.value == _quote.takerAmount, "RF-IMV-01");
            IERC20Upgradeable(_quote.makerAsset).safeTransfer(_quote.taker, _quote.makerAmount);
        } else {
            // swap ERC-20 <=> ERC-20
            IERC20Upgradeable(_quote.takerAsset).safeTransferFrom(_quote.taker, address(this), _quote.takerAmount);
            IERC20Upgradeable(_quote.makerAsset).safeTransfer(_quote.taker, _quote.makerAmount);
        }

        emit SwapExecuted(
            _quote.maker,
            _quote.taker,
            _quote.makerAsset,
            _quote.takerAsset,
            _quote.makerAmount,
            _quote.takerAmount
        );
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
     * @notice Updates the rebalancer address.
     * @dev Only DEFAULT_ADMIN can call this function.
     * @param _rebalancer Address of new rebalancer
     **/
    function setRebalancer(address _rebalancer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_rebalancer != address(0), "RF-SAZ-01");
        rebalancer = _rebalancer;
        emit RebalancerUpdated(_rebalancer);
    }

    /**
     * @notice  Adds Default Admin role to the address
     * @param   _address  address to add role to
     */
    function addAdmin(address _address) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
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
     * @param   _address  address to check
     * @return  bool    true if address has Default Admin role
     */
    function isAdmin(address _address) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Adds the given contract to trusted contracts in order to provide excluded functionality
     * @dev     Only callable by admin
     * @param   _contract  Address of the contract to be added
     * @param   _organization  Organization of the contract to be added
     */
    function addTrustedContract(
        address _contract,
        string calldata _organization
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        trustedContracts[_contract] = true;
        trustedContractToIntegrator[_contract] = _organization;
        emit AddressSet(_organization, "RF-ADD-TRUSTEDCONTRACT", _contract);
    }

    /**
     * @notice  Removes the given contract from trusted contracts
     * @dev     Only callable by admin
     * @param   _contract  Address of the contract to be removed
     */
    function removeTrustedContract(address _contract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        trustedContracts[_contract] = false;
        emit AddressSet(trustedContractToIntegrator[_contract], "RF-REMOVE-TRUSTED-CONTRACT", _contract);
    }

    /**
     * @param   _contract  Address of the contract
     * @return  bool  True if the contract is trusted
     */
    function isTrustedContract(address _contract) external view returns (bool) {
        return trustedContracts[_contract];
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
    function claimBalance(address _asset, uint256 _amount) external nonReentrant {
        address _rebalancer = rebalancer;
        require(msg.sender == _rebalancer, "RF-OCR-01");

        if (_asset == address(0)) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = payable(_rebalancer).call{value: _amount}("");
            require(success == true, "RF-TF-01");
        } else {
            IERC20Upgradeable(_asset).safeTransfer(_rebalancer, _amount);
        }
        emit RebalancerWithdraw(_asset, _amount);
    }

    /**
     * @notice  Allows rebalancer to withdraw multiple assets from smart contract
     * @dev     Only callable by admin
     * @param   _assets  Array of addresses of the asset to be withdrawn
     * @param   _amounts  Array of Amount of assets to be withdrawn
     */
    function batchClaimBalance(address[] calldata _assets, uint256[] calldata _amounts) external nonReentrant {
        require(msg.sender == rebalancer, "RF-OCR-01");
        uint256 i;

        while (i < _assets.length) {
            if (_assets[i] == address(0)) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = payable(rebalancer).call{value: _amounts[i]}("");
                require(success == true, "RF-TF-01");
            } else {
                IERC20Upgradeable(_assets[i]).safeTransfer(rebalancer, _amounts[i]);
            }
            emit RebalancerWithdraw(_assets[i], _amounts[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev  Used to rebalance rfq contract
     */
    receive() external payable {
        require(msg.sender == rebalancer, "RF-OCR-01");
    }
}
