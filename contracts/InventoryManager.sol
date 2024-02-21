// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./library/InvariantMathLibrary.sol";

import "./interfaces/IPortfolioBridgeSub.sol";
import "./interfaces/IPortfolio.sol";
import "./interfaces/IInventoryManager.sol";

/**
 * @title   InventoryManager
 * @notice  Manages the inventory of tokens on the subnet and calculates withdrawal fees
 * @dev     The inventory is stored by subnet symbol and symbolId. The inventory is
 *          updated by the PortfolioBridgeSub contract. The withdrawal fee is calculated
 *          using the InvariantMathLibrary which use the stableswap invariant to calculate
 *          the fee. The fee is based on the quantity requested, the current inventory in
 *          the requested chain and the total inventory across all chains.
 */
contract InventoryManager is AccessControlEnumerableUpgradeable, IInventoryManager {
    using EnumerableMap for EnumerableMap.Bytes32ToUintMap;

    bytes32 private constant PORTFOLIO_BRIDGE_ROLE = keccak256("PORTFOLIO_BRIDGE_ROLE");
    bytes32 public constant VERSION = bytes32("3.0.0");
    // A value for the invariant calculations
    uint256 public A;

    // subnetSymbol => [symbolId => quantity]
    mapping(bytes32 => EnumerableMap.Bytes32ToUintMap) private inventoryBySubnetSymbol;

    IPortfolioBridgeSub public portfolioBridgeSub;

    /**
     * @notice  Initialize the upgradeable contract
     * @param   _portfolioBridgeSub  Address of PortfolioBridgeSub contract
     * @param   _A  A value for the invariant
     */
    function initialize(address _portfolioBridgeSub, uint256 _A) external initializer {
        require(_portfolioBridgeSub != address(0), "IM-ZADDR-01");
        portfolioBridgeSub = IPortfolioBridgeSub(_portfolioBridgeSub);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PORTFOLIO_BRIDGE_ROLE, _portfolioBridgeSub);
        A = _A;
    }

    /**
     * @notice  Increments the inventory of a token
     * @dev     Only called by the PortfolioBridgeSub contract for processing a deposit
     * @param   _symbol  Subnet symbol of the token
     * @param   _symbolId  SymbolId of the token
     * @param   _quantity  Quantity to increment
     */
    function increment(bytes32 _symbol, bytes32 _symbolId, uint256 _quantity) external onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_symbol];
        (, uint256 current) = map.tryGet(_symbolId);
        map.set(_symbolId, current + _quantity);
    }

    /**
     * @notice  Decrements the inventory of a token
     * @dev     Only called by the PortfolioBridgeSub contract for processing a withdrawal
     * @param   _symbol  Subnet symbol of the token
     * @param   _symbolId  SymbolId of the token
     * @param   _quantity  Quantity to decrement
     */
    function decrement(bytes32 _symbol, bytes32 _symbolId, uint256 _quantity) external onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_symbol];
        (, uint256 current) = map.tryGet(_symbolId);
        require(current >= _quantity, "IM-INVT-01");
        map.set(_symbolId, current - _quantity);
    }

    /**
     * @notice  Removes a token from the inventory
     * @dev     Only called by the PortfolioBridgeSub contract
     * @param   _symbol  Subnet symbol of the token
     * @param   _symbolId  SymbolId of the token
     * @return  bool  True if the token was removed and inventory 0, false if inventory remaining
     */
    function remove(bytes32 _symbol, bytes32 _symbolId) external onlyRole(PORTFOLIO_BRIDGE_ROLE) returns (bool) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_symbol];
        (bool success, uint256 inventory) = map.tryGet(_symbolId);
        if (success && inventory == 0) {
            map.remove(_symbolId);
            return true;
        }
        return inventory == 0;
    }

    /**
     * @notice  Updates the PortfolioBridgeSub contract address
     * @dev     Only admin can call this function
     * @param   _portfolioBridgeSub  Address of PortfolioBridgeSub contract
     */
    function updatePortfolioBridgeSub(address _portfolioBridgeSub) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_portfolioBridgeSub != address(0), "IM-ZADDR-01");
        _revokeRole(PORTFOLIO_BRIDGE_ROLE, address(portfolioBridgeSub));
        _grantRole(PORTFOLIO_BRIDGE_ROLE, _portfolioBridgeSub);
        portfolioBridgeSub = IPortfolioBridgeSub(_portfolioBridgeSub);
    }

    /**
     * @notice  Updates the A value for the invariant
     * @dev     Only admin can call this function
     * @param   _A  A value for the invariant
     */
    function updateA(uint256 _A) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_A > 0, "IM-ZVFA-01");
        A = _A;
    }

    /**
     * @notice  Sets host chains inventories for each token
     * @dev     Only admin can call this function. After the March 2024 we need to equal
     * inventoryBySymbolId portfolioSub.tokenTotals as the C-Chain will still be the only
     * destination from the subnet right after the upgrade. This function can be removed
     * after the upgrade
     * @param   _tokens  Array of tokens in the from of SYMBOL + srcChainId
     * @param   _quantities  Array of quantities
     */
    function setInventoryBySymbolId(
        bytes32[] calldata _tokens,
        uint256[] calldata _quantities
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokens.length == _quantities.length, "IM-LENM-01");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            IPortfolio.TokenDetails memory tokenDetails = portfolioBridgeSub.getTokenDetails(_tokens[i]);
            if (tokenDetails.symbolId != bytes32(0)) {
                set(tokenDetails.symbol, _tokens[i], _quantities[i]);
            }
        }
    }

    /**
     * @notice  Converts the inventory of a token from one subnet symbol to another
     * @dev     Only portfolio bridge can call this function
     * @param   _symbolId  SymbolId of the token
     * @param   _fromSymbol  Subnet symbol of the token to convert from
     * @param   _toSymbol  Subnet symbol of the token to convert to
     */
    function convertSymbol(
        bytes32 _symbolId,
        bytes32 _fromSymbol,
        bytes32 _toSymbol
    ) external onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        require(_fromSymbol != bytes32(0) && _toSymbol != bytes32(0), "IM-SMEB-01");
        EnumerableMap.Bytes32ToUintMap storage fromMap = inventoryBySubnetSymbol[_fromSymbol];
        (bool success, uint256 inventory) = fromMap.tryGet(_symbolId);
        if (success) {
            fromMap.remove(_symbolId);
        }
        uint256 curInventory = get(_toSymbol, _symbolId);
        inventoryBySubnetSymbol[_toSymbol].set(_symbolId, curInventory + inventory);
    }

    /**
     * @notice  Calculates the withdrawal fee for a token
     * @dev     Uses the InvariantMathLibrary to provide exponential fees if
     * inventory is spread across multiple chains, unbalanced and quantity is large
     * @param   _symbol  Subnet symbol of the token
     * @param   _symbolId  SymbolId of the token
     * @param   _quantity  Quantity to withdraw
     * @return  fee  Withdrawal fee
     */
    function calculateWithdrawalFee(
        bytes32 _symbol,
        bytes32 _symbolId,
        uint256 _quantity
    ) external view returns (uint256 fee) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_symbol];
        uint256 numChains = map.length();
        uint256 currentInventory = get(_symbol, _symbolId);
        if (numChains == 1 || currentInventory == 0) {
            return 0;
        }
        require(currentInventory >= _quantity, "IM-INVT-02");
        uint256[] memory inventories = new uint256[](numChains);
        uint256 totalInventory = 0;
        uint256 index = numChains;

        // Generates all non-zero inventories and calculates total inventory
        uint256 j = 0;
        for (uint256 i = 0; i < numChains; ++i) {
            (bytes32 symbolId, uint256 inventory) = map.at(i);
            if (inventory == 0) {
                continue;
            }
            inventories[j] = inventory;
            totalInventory += inventory;
            if (symbolId == _symbolId) {
                index = j;
            }
            j++;
        }
        fee = InvariantMathLibrary.calcWithdrawOneChain(_quantity, index, inventories, totalInventory, A, j);
    }

    /**
     * @notice  Gets the inventory of a token
     * @param   _symbol  Subnet symbol of the token
     * @param   _symbolId  SymbolId of the token
     * @return  inventory Inventory of the token, 0 if not present
     */
    function get(bytes32 _symbol, bytes32 _symbolId) public view returns (uint256 inventory) {
        (, inventory) = inventoryBySubnetSymbol[_symbol].tryGet(_symbolId);
    }

    /**
     * @notice  Sets a new inventory for a token
     * @dev     Only used once for the initial setup of the inventory
     * @param   _symbol  Subnet symbol of the token
     * @param   _symbolId  SymbolId of the token
     * @param   _quantity  Quantity of the token
     */
    function set(bytes32 _symbol, bytes32 _symbolId, uint256 _quantity) private {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_symbol];
        require(!map.contains(_symbolId), "IM-SIAE-01");
        map.set(_symbolId, _quantity);
    }
}
