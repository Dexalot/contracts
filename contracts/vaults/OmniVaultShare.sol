// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title OmniVaultShare
 * @notice This contract represents the share tokens of an OmniVault, allowing for minting and burning
 *         of shares in response to deposits and withdrawals from the vault. It extends the OFTUpgradeable
 *         contract to enable cross-chain functionality.
 */
contract OmniVaultShare is Initializable, OFTUpgradeable {
    bytes32 public constant VERSION = bytes32("1.0.0");

    address public omniVaultAddress;

    /**
     * @notice Modifier to restrict functions to be called only by the OmniVault contract.
     */
    modifier onlyOmniVault() {
        require(msg.sender == omniVaultAddress, "OVS-OOV-01");
        _;
    }

    /**
     * @notice Constructor for the OmniVaultShare contract.
     * @param _lzEndpoint The LayerZero endpoint address.
     */
    constructor(address _lzEndpoint) OFTUpgradeable(_lzEndpoint) {}

    /**
     * @notice Initializes the OmniVaultShare contract.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     * @param _admin The address of the admin.
     */
    function initialize(string memory _name, string memory _symbol, address _admin) public initializer {
        require(_admin != address(0), "OVS-SAZ-01");
        __OFT_init(_name, _symbol, _admin);
        __Ownable_init();
        transferOwnership(_admin);
    }

    /**
     * @notice Mints new vault shares to a specified address.
     * @dev Can only be called by the OmniVault contract upon deposits.
     * @param _to The address to mint vault shares to.
     * @param _amount The amount of vault shares to mint.
     */
    function mint(address _to, uint256 _amount) external onlyOmniVault {
        _mint(_to, _amount);
    }

    /**
     * @notice Burns vault shares from the OmniVault.
     * @dev Can only be called by the OmniVault contract when shares are locked upon withdrawals.
     * @param _amount The amount of vault shares to burn.
     */
    function burn(uint256 _amount) external onlyOmniVault {
        _burn(msg.sender, _amount);
    }

    /**
     * @notice Sets the OmniVault contract address.
     * @param _omniVault The address of the OmniVault contract.
     */
    function setOmniVaultAddress(address _omniVault) external onlyOwner {
        omniVaultAddress = _omniVault;
    }
}
