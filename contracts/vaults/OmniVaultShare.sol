// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IOmniVaultShare.sol";

/**
 * @title OmniVaultShare
 * @notice This contract represents the share tokens of an OmniVault, allowing for minting and burning
 *         of shares in response to deposits and withdrawals from the vault. It extends the OFTUpgradeable
 *         contract to enable cross-chain functionality.
 */
contract OmniVaultShare is Initializable, OFTUpgradeable, IOmniVaultShare {
    bytes32 public constant VERSION = bytes32("1.1.0");
    uint256 public immutable vaultId;
    address public omniVaultManager;

    event OmniVaultManagerUpdated(address oldManager, address newManager);

    /**
     * @notice Modifier to restrict functions to be called only by the OmniVaultManager contract.
     */
    modifier onlyOVManager(uint256 _vaultId) {
        require(msg.sender == omniVaultManager, "VS-OOV-01");
        require(_vaultId == vaultId, "VS-IVD-01");
        _;
    }

    /**
     * @notice Constructor for the OmniVaultShare contract.
     * @param _lzEndpoint The LayerZero endpoint address.
     * @param _vaultId The ID of the vault.
     */
    constructor(address _lzEndpoint, uint256 _vaultId) OFTUpgradeable(_lzEndpoint) {
        vaultId = _vaultId;
    }

    /**
     * @notice Initializes the OmniVaultShare contract.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     * @param _admin The address of the admin.
     */
    function initialize(string memory _name, string memory _symbol, address _admin) public initializer {
        require(_admin != address(0), "VS-SAZ-01");
        __OFT_init(_name, _symbol, _admin);
        __Ownable_init();
        transferOwnership(_admin);
    }

    /**
     * @notice Mints new vault shares to a specified address.
     * @dev Can only be called by the OmniVaultManager contract upon deposits.
     * @param _to The address to mint vault shares to.
     * @param _amount The amount of vault shares to mint.
     */
    function mint(uint256 _vaultId, address _to, uint256 _amount) external onlyOVManager(_vaultId) {
        _mint(_to, _amount);
    }

    /**
     * @notice Burns vault shares from the OmniVaultManager contract.
     * @dev Can only be called by the OmniVaultManager contract when shares are locked upon withdrawals.
     * @param _vaultId The ID of the vault.
     * @param _amount The amount of vault shares to burn.
     */
    function burn(uint256 _vaultId, uint256 _amount) external onlyOVManager(_vaultId) {
        _burn(msg.sender, _amount);
    }

    /**
     * @notice Sets the OmniVaultManager contract address.
     * @param _omniVaultManager The address of the OmniVaultManager contract.
     */
    function setOmniVaultManager(address _omniVaultManager) external onlyOwner {
        address oldManager = omniVaultManager;
        omniVaultManager = _omniVaultManager;
        emit OmniVaultManagerUpdated(oldManager, _omniVaultManager);
    }
}
