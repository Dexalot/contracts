// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin-upgradeable-v5/access/AccessControlUpgradeable.sol";
import "@openzeppelin-v5/token/ERC20/IERC20.sol";
import "@openzeppelin-v5/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IOmniVaultExecutor.sol";

/**
 * @title OmniVaultExecutor
 * @notice The OmniVaultExecutor acts as an executor for OmniVaults by allowing an EOA trading bot to interact with trusted
 *         contracts via whitelisted function calls. Used on Dexalot L1 to place orders on TradePairs, withdraw funds
 *         via PortfolioSub & claim rewards from IncentiveDistributor. Used on Mainnets to deposit funds via
 *         PortfolioMain, rebalance liquidity on DexalotRFQ & manage assets from OmniVaults.  Supports sending native
 *         currency and approving ERC20 tokens to trusted contracts based on their access levels.
 */
contract OmniVaultExecutor is IOmniVaultExecutor, AccessControlUpgradeable {
    using SafeERC20 for IERC20;

    // Role for EOA trading bot
    bytes32 public constant OMNITRADER_ROLE = keccak256("OMNITRADER_ROLE");

    // bytes4 function signature => target contract, if address(0) then not whitelisted
    mapping(bytes4 => address) public whitelistedFunctions;
    // Trusted contracts to interact with + corresponding token access level
    mapping(address => ContractAccess) public trustedContracts;

    // Storage gap for upgradability
    bytes32[50] private __gap;

    /**
     * @notice Initializes the OmniVaultExecutor contract
     * @param _admin The address to be granted the default admin role
     * @param _omniTrader The EOA address to be granted the OMNITRADER_ROLE
     */
    function initialize(address _admin, address _omniTrader) public initializer {
        require(_admin != address(0), "OT-SAZ-01");
        require(_omniTrader != address(0), "OT-SAZ-02");

        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OMNITRADER_ROLE, _omniTrader);
    }

    /**
     * @notice Allows the contract to receive native currency
     */
    receive() external payable {}

    /**
     * @notice Fallback function to delegate calls to whitelisted contracts based on function signatures
     * @dev Only callable by addresses with the OMNITRADER_ROLE
     */
    fallback() external payable onlyRole(OMNITRADER_ROLE) {
        require(msg.data.length >= 4, "OT-FSNV-01");
        address impl = whitelistedFunctions[msg.sig];
        require(impl != address(0), "OT-FSNW-01");

        (bool success, ) = impl.call{value: msg.value}(msg.data);

        // Forward the revert reason if the call failed
        _returnData(success);
    }

    /**
     * @notice Sends native token to a trusted contract
     * @dev Only transferrable to contracts with NATIVE or NATIVE_AND_ERC20 access
     * @param _to The address of the trusted contract
     * @param _amount The amount of native to send
     */
    function sendNative(address payable _to, uint256 _amount) external onlyRole(OMNITRADER_ROLE) {
        ContractAccess access = trustedContracts[_to];
        require(access == ContractAccess.NATIVE || access == ContractAccess.NATIVE_AND_ERC20, "OT-IVCA-01");
        (bool success, ) = _to.call{value: _amount}("");
        return _returnData(success);
    }

    /**
     * @notice Approves an ERC20 token for a trusted contract
     * @dev Only approvable to contracts with ERC20 or NATIVE_AND_ERC20 access
     * @param _token The address of the ERC20 token
     * @param _spender The address of the trusted contract
     * @param _amount The amount of tokens to approve
     */
    function approveToken(address _token, address _spender, uint256 _amount) external onlyRole(OMNITRADER_ROLE) {
        ContractAccess access = trustedContracts[_spender];
        require(access == ContractAccess.ERC20 || access == ContractAccess.NATIVE_AND_ERC20, "OT-IVCA-01");
        IERC20(_token).forceApprove(_spender, _amount);
    }

    /**
     * @notice Sets multiple whitelisted functions and their corresponding target contracts
     * @param _funcSignatures An array of function signatures to whitelist
     * @param _contracts An array of target contract addresses corresponding to the function signatures
     */
    function setWhitelistedFunctions(
        bytes4[] calldata _funcSignatures,
        address[] calldata _contracts
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 len = _funcSignatures.length;
        require(len == _contracts.length, "OT-IVAL-01");
        for (uint256 i = 0; i < len; i++) {
            _setWhitelistedFunction(_funcSignatures[i], _contracts[i]);
        }
    }

    /**
     * @notice Sets a single whitelisted function and its corresponding target contract
     * @param _funcSignature The function signature to whitelist
     * @param _contract The target contract address corresponding to the function signature
     */
    function setWhitelistedFunction(bytes4 _funcSignature, address _contract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setWhitelistedFunction(_funcSignature, _contract);
    }

    /**
     * @notice Sets the access level for a trusted contract
     * @param _contract The address of the trusted contract
     * @param _access The access level to assign to the trusted contract
     */
    function setTrustedContract(address _contract, ContractAccess _access) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_contract != address(0), "OT-SAZ-01");
        trustedContracts[_contract] = _access;
    }

    function VERSION() external pure virtual returns (bytes32) {
        return bytes32("1.0.3");
    }

    /**
     * @notice Internal function to set a whitelisted function and its target contract
     * @dev Target contract must be a trusted contract
     * @param _funcSignature The function signature to whitelist
     * @param _contract The target contract address corresponding to the function signature
     */
    function _setWhitelistedFunction(bytes4 _funcSignature, address _contract) internal {
        require(trustedContracts[_contract] != ContractAccess.NONE, "OT-IVTC-01");
        whitelistedFunctions[_funcSignature] = _contract;
    }

    /**
     * @notice Internal function to handle returning data or reverting based on call success
     * @param _success A boolean indicating whether the call was successful
     */
    function _returnData(bool _success) internal pure {
        if (!_success) {
            // Revert with the return data from the call
            assembly {
                let returndata_size := returndatasize()
                returndatacopy(0, 0, returndata_size)
                revert(0, returndata_size)
            }
        }

        // Return the result
        assembly {
            let returndata_size := returndatasize()
            returndatacopy(0, 0, returndata_size)
            return(0, returndata_size)
        }
    }
}
