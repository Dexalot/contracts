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
    bytes32 public constant VERSION = bytes32("3.1.0");
    uint256 private constant STARTING_A = 50;
    uint256 private constant MIN_A = 10;
    uint256 private constant MAX_A = 10 ** 8;
    uint256 private constant MIN_A_UPDATE_TIME = 1 hours;
    // A value for the invariant calculations
    uint256 public A;
    // Future A value for the invariant calculations
    uint256 public futureA;
    // Time at which futureA can take effect
    uint256 public futureATime;

    // subnetSymbol => [symbolId => quantity]
    mapping(bytes32 => EnumerableMap.Bytes32ToUintMap) private inventoryBySubnetSymbol;
    // symbolId => scalingFactor
    mapping(bytes32 => uint256) public scalingFactor;

    IPortfolioBridgeSub public portfolioBridgeSub;

    event ScalingFactorUpdated(bytes32 indexed symbolId, uint8 scalingFactor, uint256 timestamp);
    event FutureAUpdated(uint256 futureA, uint256 futureATime, uint256 timestamp);
    event AUpdated(uint256 A, uint256 timestamp);
    event InventorySet(bytes32 indexed symbol, bytes32 indexed symbolId, uint256 quantity, uint256 timestamp);

    /**
     * @notice  Initialize the upgradeable contract
     * @param   _portfolioBridgeSub  Address of PortfolioBridgeSub contract
     */
    function initialize(address _portfolioBridgeSub) external initializer {
        require(_portfolioBridgeSub != address(0), "IM-ZADDR-01");
        portfolioBridgeSub = IPortfolioBridgeSub(_portfolioBridgeSub);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PORTFOLIO_BRIDGE_ROLE, _portfolioBridgeSub);
        A = STARTING_A;
        futureA = STARTING_A;
    }

    function getInventoryBySubnetSymbol(bytes32 _symbol) external view returns (bytes32[] memory, uint256[] memory) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_symbol];
        uint256 length = map.length();
        bytes32[] memory symbolIds = new bytes32[](length);
        uint256[] memory quantities = new uint256[](length);
        for (uint256 i = 0; i < length; ++i) {
            (bytes32 symbolId, uint256 quantity) = map.at(i);
            symbolIds[i] = symbolId;
            quantities[i] = quantity;
        }
        return (symbolIds, quantities);
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
     * @notice  Updates the scaling factor for a token
     * @dev     Only admin can call this function
     * @param   _symbolId  SymbolId of the token
     * @param   _scalingFactor  New scaling factor
     */
    function setScalingFactor(bytes32 _symbolId, uint8 _scalingFactor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        scalingFactor[_symbolId] = _scalingFactor;
        emit ScalingFactorUpdated(_symbolId, _scalingFactor, block.timestamp);
    }

    /**
     * @notice  Updates the Future A value for the invariant
     * @dev     Only admin can call this function
     * @param   _A  New A value for the invariant
     * @param   _timePeriod  Time period for the new A value to take effect
     */
    function updateFutureA(uint256 _A, uint256 _timePeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_A > MIN_A && _A < MAX_A, "IM-AVNP-01");
        require(_timePeriod >= MIN_A_UPDATE_TIME, "IM-ATNP-01");
        futureA = _A;
        futureATime = block.timestamp + _timePeriod;
        emit FutureAUpdated(_A, futureATime, block.timestamp);
    }

    /**
     * @notice  Updates the A value for the invariant using futureA
     * @dev     Only admin can call this function
     */
    function updateA() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(futureATime > 0 && block.timestamp >= futureATime, "IM-BTNE-01");
        A = futureA;
        emit AUpdated(A, block.timestamp);
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
        uint256 scaleFactor;
        for (uint256 i = 0; i < numChains; ++i) {
            (bytes32 symbolId, uint256 inventory) = map.at(i);
            if (inventory == 0) {
                continue;
            }
            (uint256 scaledInventory, uint256 sf) = scaleInventory(symbolId, inventory);
            inventories[j] = scaledInventory;
            totalInventory += scaledInventory;
            if (symbolId == _symbolId) {
                index = j;
                scaleFactor = sf;
            }
            j++;
        }
        fee = InvariantMathLibrary.calcWithdrawOneChain(
            _quantity,
            index,
            inventories,
            totalInventory,
            scaleFactor,
            A,
            j
        );
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
        emit InventorySet(_symbol, _symbolId, _quantity, block.timestamp);
    }

    /**
     * @notice  Scales the inventory of a token using its scaling factor
     * @param   _symbolId  SymbolId of the token
     * @param   _inventory  Inventory to scale
     * @return  scaledInventory  Scaled inventory
     * @return  sf  Scaling factor
     */
    function scaleInventory(bytes32 _symbolId, uint256 _inventory) private view returns (uint256, uint256) {
        uint256 sf = scalingFactor[_symbolId];
        if (sf == 0) {
            return (_inventory, 1);
        }
        return (_inventory / sf, sf);
    }
}
