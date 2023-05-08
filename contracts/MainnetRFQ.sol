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
    EIP712Upgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ECDSAUpgradeable for bytes32;

    // version
    bytes32 public constant VERSION = bytes32("1.0.0");

    // rebalancer admin role
    bytes32 public constant REBALANCER_ADMIN_ROLE = keccak256("REBALANCER_ADMIN_ROLE");

    // address used to sign transactions from Paraswap API
    address public swapSigner;

    // max slippage tolerance for updated quote in BIPs
    uint256 public slippageTolerance;

    // keeps track of trade nonces executed
    mapping(uint256 => bool) private nonceUsed;
    // keeps track of trade nonces that had an updated expiry
    mapping(uint256 => uint256) public quoteMakerAmountUpdated;
    // keeps track of trade nonces that had slippage applied to their quoted price
    mapping(uint256 => uint256) public quoteExpiryUpdated;

    // whitelisted smart contracts. Only applicable if msg.sender is not _quote.taker
    mapping(address => bool) public trustedContracts;

    // contract address to integrator organization name
    mapping(address => string) public trustedContractToIntegrator;

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
     * @dev slippageTolerance is initially set to 9700. slippageTolerance is represented in BIPs, 
     * therefore slippageTolerance is effectively set to 97%. This means that the price of a firm quote
     * can not drop more than 3% initially.
     * @param _swapSigner Address of swap signer, rebalancer is also defaulted to swap signer
     * but it can be changed later
     */
    function initialize(address _swapSigner) external initializer {
        require(_swapSigner != address(0), "RF-SAZ-01");
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("Dexalot", "1.0.0");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REBALANCER_ADMIN_ROLE, _swapSigner);

        swapSigner = _swapSigner;
        slippageTolerance = 9700;
    }

    /**
     * @notice Swaps two Assets, based off a predetermined swap price.
     * @dev This function can only be called after generating a firm quote from the RFQ API.
     * All parameters are generated from the RFQ API. Prices are determined based off of trade
     * prices from the Dexalot subnet.
     * @param _quote Trade parameters for swap generated from /api/rfq/firm
     * @param _signature Signature of trade parameters generated from /api/rfq/firm
     **/
    function simpleSwap(Quote calldata _quote, bytes calldata _signature) external payable whenNotPaused nonReentrant {
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

        // verifies if quote expiry updated by checking in mapping
        // if the expiry is less than the current timestamp, then 
        // the transaction reverts 
        if(quoteExpiryUpdated[_quote.nonceAndMeta] != 0) {
            require(block.timestamp <= quoteExpiryUpdated[_quote.nonceAndMeta], "RF-QE-01");
        } else {
            require(block.timestamp <= _quote.expiry, "RF-QE-01");
        }

        // verifies if slippage was applied to the quoted makerAmount
        // by checking in the mapping. If not, the original quoted price
        // is used for the trade
        uint256 makerAmount = quoteMakerAmountUpdated[_quote.nonceAndMeta];
        if(makerAmount == 0) {
            makerAmount = _quote.makerAmount;
        } 
        
        if (_quote.makerAsset == address(0)) {
            // swap NATIVE <=> ERC-20
            IERC20Upgradeable(_quote.takerAsset).safeTransferFrom(_quote.taker, address(this), _quote.takerAmount);
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = payable(_quote.taker).call{value: makerAmount}("");
            require(success, "RF-TF-01");
        } else if (_quote.takerAsset == address(0)) {
            // swap ERC-20 <=> NATIVE
            require(msg.value == _quote.takerAmount, "RF-IMV-01");
            IERC20Upgradeable(_quote.makerAsset).safeTransfer(_quote.taker, makerAmount);
        } else {
            // swap ERC-20 <=> ERC-20
            IERC20Upgradeable(_quote.takerAsset).safeTransferFrom(_quote.taker, address(this), _quote.takerAmount);
            IERC20Upgradeable(_quote.makerAsset).safeTransfer(_quote.taker, makerAmount);
        }
        
        emit SwapExecuted(
            _quote.nonceAndMeta,
            _quote.maker,
            _quote.taker,
            _quote.makerAsset,
            _quote.takerAsset,
            makerAmount,
            _quote.takerAmount
        );
    }

    /**
     * @notice Updates the expiry of a quote. The new expiry
     * is the deadline a trader has to execute the swap.
     * @dev Only rebalancer can call this function.
     * @param _nonceAndMeta nonce of quote
     * @param _newExpiry new expiry for quote
     **/
    function updateQuoteExpiry(uint256 _nonceAndMeta, uint256 _newExpiry) external onlyRole(REBALANCER_ADMIN_ROLE) {
        quoteExpiryUpdated[_nonceAndMeta] = _newExpiry;
        emit ExpiryUpdated(_nonceAndMeta, _newExpiry);
    }

    /**
     * @notice Updates the makerAmount of a quote.
     * The new makerAmount can not be lower than the percentage 
     * of slippageTolerance from the previous quoted price.
     * @dev Only rebalancer can call this function.
     * @param _nonceAndMeta nonce of quote
     * @param _newMakerAmount new makerAmount for quote
     **/
    function updateQuoteMakerAmount(uint256 _nonceAndMeta, uint256 _newMakerAmount, uint256 _oldMakerAmount) external onlyRole(REBALANCER_ADMIN_ROLE) {
        uint256 lowestAllowedPriceAfterSlippage = _oldMakerAmount * slippageTolerance / 10000;
        require(lowestAllowedPriceAfterSlippage < _newMakerAmount, "RF-TMS"); 
        quoteMakerAmountUpdated[_nonceAndMeta] = _newMakerAmount;
        emit SlippageApplied(_nonceAndMeta, _newMakerAmount);
    }

    /**
     * @notice Updates the slippageTolerance for a quote update. 
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
     * @param   _address  address to check
     * @return  bool    true if address has Rebalancer Admin role
     */
    function isRebalancer(address _address) external view returns (bool) {
        return hasRole(REBALANCER_ADMIN_ROLE, _address);
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
        require(_contract != address(0), "RF-SAZ-01");
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
    function batchClaimBalance(address[] calldata _assets, uint256[] calldata _amounts) external onlyRole(REBALANCER_ADMIN_ROLE) nonReentrant {
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
     * @dev  Used to rebalance rfq contract
     */
    receive() external payable onlyRole(REBALANCER_ADMIN_ROLE) { }
}
