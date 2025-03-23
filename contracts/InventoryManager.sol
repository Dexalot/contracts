// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./library/InvariantMathLibrary.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/IInventoryManager.sol";
import "./library/UtilsLibrary.sol";

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
    bytes32 public constant VERSION = bytes32("3.2.0");
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

    // symbolId => [account => liqprovided] map
    mapping(bytes32 => mapping(address => uint256)) public userProvidedLiquidity;

    event ScalingFactorUpdated(bytes32 indexed symbolId, uint8 scalingFactor, uint256 timestamp);
    event FutureAUpdated(uint256 futureA, uint256 futureATime, uint256 timestamp);
    event AUpdated(uint256 A, uint256 timestamp);
    event PortfolioBridgeSubUpdated(address portfolioBridgeSub);

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
     * @notice  Increments the inventory of a token and the liquidity provided by the users from each chain
     * @dev     Only called by the PortfolioBridgeSub contract for processing a deposit
     * @param   _deposit  Deposit struct
     */
    function increment(IPortfolioBridgeSub.XferShort calldata _deposit) external onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_deposit.symbol];
        (, uint256 currentInventory) = map.tryGet(_deposit.symbolId);
        map.set(_deposit.symbolId, currentInventory + _deposit.quantity);

        userProvidedLiquidity[_deposit.symbolId][_deposit.traderaddress] += _deposit.quantity;
    }

    /**
     * @notice  Decrements the inventory of a token and the liquidity provided by the users from each chain
     * @dev     Only called by the PortfolioBridgeSub contract for processing a withdrawal.
     * @param   _withdrawal  Withdrawal transaction

     */
    function decrement(IPortfolioBridgeSub.XferShort calldata _withdrawal) external onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_withdrawal.symbol];
        (, uint256 current) = map.tryGet(_withdrawal.symbolId);
        require(current >= _withdrawal.quantity, "IM-INVT-01");
        map.set(_withdrawal.symbolId, current - _withdrawal.quantity);
        uint256 userLiquidity = userProvidedLiquidity[_withdrawal.symbolId][_withdrawal.traderaddress];

        if (userLiquidity > 0) {
            // calculate remaining user liquidity
            userLiquidity = userLiquidity - UtilsLibrary.min(userLiquidity, _withdrawal.quantity);
            if (userLiquidity > 0) {
                userProvidedLiquidity[_withdrawal.symbolId][_withdrawal.traderaddress] = userLiquidity;
            } else {
                // clean the state if user liquidity provided is 0
                delete (userProvidedLiquidity[_withdrawal.symbolId][_withdrawal.traderaddress]);
            }
        }
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
        emit PortfolioBridgeSubUpdated(_portfolioBridgeSub);
    }

    /**
     * @notice  Updates the scaling factor for a number of tokens
     * @dev     Only admin can call this function
     * @param   _symbolIds  SymbolIds of the token
     * @param   _scalingFactors  New scaling factors to set
     */
    function setScalingFactors(
        bytes32[] memory _symbolIds,
        uint8[] memory _scalingFactors
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _symbolIds.length; ++i) {
            bytes32 symbolId = _symbolIds[i];
            uint8 sf = _scalingFactors[i];
            IPortfolio.TokenDetails memory td = portfolioBridgeSub.getTokenDetails(symbolId);
            require(td.symbolId == symbolId, "IM-NVSI-01");
            scalingFactor[symbolId] = sf;
            emit ScalingFactorUpdated(symbolId, sf, block.timestamp);
        }
    }

    /**
     * @notice  Removes multiple scaling factors for non-existent tokens
     * @dev     Only admin can call this function
     * @param   _symbolIds  SymbolIds of the tokens to remove
     */
    function removeScalingFactors(bytes32[] memory _symbolIds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _symbolIds.length; ++i) {
            bytes32 symbolId = _symbolIds[i];
            IPortfolio.TokenDetails memory td = portfolioBridgeSub.getTokenDetails(symbolId);
            require(td.symbolId == bytes32(0), "IM-NVSI-02");
            delete scalingFactor[symbolId];
            emit ScalingFactorUpdated(symbolId, 0, block.timestamp);
        }
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
     * @notice  Calculates the withdrawal fee for a token
     * @dev     Uses the InvariantMathLibrary to provide exponential fees if
     * inventory is spread across multiple chains, unbalanced and quantity is large
     * if the user provided liquidity from that chain already, he gets lower fees up to the
     * inventory supplied
     * @param   _withdrawal  withdrawal transaction
     * @return  fee  Withdrawal fee
     */
    function calculateWithdrawalFee(
        IPortfolioBridgeSub.XferShort calldata _withdrawal
    ) external view returns (uint256 fee) {
        EnumerableMap.Bytes32ToUintMap storage map = inventoryBySubnetSymbol[_withdrawal.symbol];
        uint256 numChains = map.length();
        uint256 currentInventory = get(_withdrawal.symbol, _withdrawal.symbolId);

        if (numChains == 1 || currentInventory == 0) {
            return 0;
        }
        require(currentInventory >= _withdrawal.quantity, "IM-INVT-02");

        uint256 userLiquidity = userProvidedLiquidity[_withdrawal.symbolId][_withdrawal.traderaddress];
        // If the user already provided liquidity to the chain it is trying to withdraw, no additional fee required
        if (_withdrawal.quantity <= userLiquidity) {
            return 0;
        }

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
            if (symbolId == _withdrawal.symbolId) {
                index = j;
                scaleFactor = sf;
            }
            j++;
        }

        // Charge fee for the partial. If 100 USDC provided and trying to withraw 150 USDC, he pays only
        // for the additional 50 ==>  _withdrawal.quantity - userLiquidity
        fee =
            InvariantMathLibrary.calcWithdrawOneChain(
                (_withdrawal.quantity) / scaleFactor,
                index,
                inventories,
                totalInventory,
                A,
                j
            ) *
            scaleFactor;
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
