// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../interfaces/IOmniVaultRegistry.sol";

/**
 * @title OmniVaultRegistry
 * @notice This contract manages the registration of OmniVaults on Dexalot L1
 *         with creation details, contract addresses and supported chains.
 */
contract OmniVaultRegistry is IOmniVaultRegistry, AccessControlUpgradeable {
    bytes32 public constant VERSION = bytes32("1.0.0");

    // Number of registered vaults
    uint256 public numVaults;
    // Mapping from vault ID to vault details
    mapping(uint256 => VaultDetails) public registeredVaults;

    // Emitted when a new vault is registered
    event VaultRegistered(
        uint256 indexed vaultId,
        string name,
        address indexed creator,
        address omniVault,
        address omniTrader,
        address omniVaultShare,
        address dexalotRFQ,
        uint32[] chainIds
    );
    // Emitted when a new chain is added to an existing vault
    event VaultNewChain(uint256 indexed vaultId, uint32 chainId);

    /**
     * @notice Initializes the contract.
     * @param _admin The address for the DEFAULT_ADMIN_ROLE.
     */
    function initialize(address _admin) public initializer {
        require(_admin != address(0), "VR-SAZ-01");

        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /**
     * @notice Registers a new vault with the registry.
     * @param _name The name of the vault.
     * @param _proposer The address of the vault proposer.
     * @param _omniVault The address of the OmniVault contract.
     * @param _omniVaultExecutor The address of the OmniVaultExecutor contract.
     * @param _omniVaultShare The address of the OmniVaultShare contract.
     * @param _dexalotRFQ The address of the DexalotRFQ contract.
     * @param _chainIds The array of supported chain IDs for the vault.
     * @return vaultId The ID of the newly registered vault.
     */
    function registerVault(
        string calldata _name,
        address _proposer,
        address _omniVault,
        address _omniVaultExecutor,
        address _omniVaultShare,
        address _dexalotRFQ,
        uint32[] calldata _chainIds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 vaultId) {
        require(_proposer != address(0), "VR-SAZ-01");
        require(_omniVault != address(0), "VR-SAZ-02");
        require(_omniVaultExecutor != address(0), "VR-SAZ-03");
        require(_omniVaultShare != address(0), "VR-SAZ-04");
        require(_dexalotRFQ != address(0), "VR-SAZ-05");

        vaultId = numVaults;

        registeredVaults[vaultId] = VaultDetails({
            name: _name,
            creator: _proposer,
            omniVault: _omniVault,
            omniTrader: _omniVaultExecutor,
            omniVaultShare: _omniVaultShare,
            dexalotRFQ: _dexalotRFQ,
            chainIds: _chainIds
        });

        numVaults++;

        emit VaultRegistered(
            vaultId,
            _name,
            _proposer,
            _omniVault,
            _omniVaultExecutor,
            _omniVaultShare,
            _dexalotRFQ,
            _chainIds
        );
    }

    /**
     * @notice Adds a new supported chain ID to an existing vault.
     * @param _vaultId The ID of the vault.
     * @param _chainId The new chain ID to add.
     */
    function addVaultChain(uint256 _vaultId, uint32 _chainId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_vaultId < numVaults, "VR-VINE-01");
        registeredVaults[_vaultId].chainIds.push(_chainId);

        emit VaultNewChain(_vaultId, _chainId);
    }
}
