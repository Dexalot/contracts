// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/**
 * @title InventoryFeeCalculatorLibrary
 * @notice Library for calculating withdrawal fees based on inventory levels across different chains.
 * The fee is determined by how the post-withdrawal inventory ratio compares to a target equilibrium
 * ratio, using a formula that incorporates a maximum fee and an exponent to adjust sensitivity.
 * @dev This library is designed to be used in conjunction with the InventoryManager contract.
 */
library InventoryFeeCalculatorLibrary {
    // Basis Points Scalar
    uint256 internal constant BPS = 10000;
    // Max Fee Rate in BPS
    uint256 internal constant MAX_FEE_RATE = 500; // 5%
    // Min Fee Rate in BPS
    uint256 internal constant MIN_FEE_RATE = 1; // 0.01%

    /**
     * @notice Performs BPS fixed-point multiplication: (a * b) / BPS
     * @param a The first multiplicand
     * @param b The second multiplicand
     * @return The result of the multiplication in BPS fixed-point format
     */
    function mulBPS(uint256 a, uint256 b) private pure returns (uint256) {
        return (a * b) / BPS;
    }

    /**
     * @notice Performs BPS fixed-point division: (a * BPS) / b
     * @param a The numerator
     * @param b The denominator
     * @return The result of the division in BPS fixed-point format
     */
    function divBPS(uint256 a, uint256 b) private pure returns (uint256) {
        require(b != 0, "Division by zero");
        return (a * BPS) / b;
    }

    /**
     * @notice Efficiently computes base^K where K is a multiple of 4 BPS (e.g., 8, 12, 16, ..., 32)
     * @param base The base value
     * @param K The exponent value (must be a multiple of 4)
     */
    function powMultipleOf4BPS(uint256 base, uint256 K) private pure returns (uint256 result_) {
        uint256 R = base;

        // Uses mulBPS instead of mulWad
        uint256 R2 = mulBPS(R, R); // R^2
        uint256 R4 = mulBPS(R2, R2); // R^4
        uint256 R8 = mulBPS(R4, R4); // R^8
        uint256 R16 = mulBPS(R8, R8); // R^16

        if (K == 8) {
            return R8;
        }
        if (K == 12) {
            return mulBPS(R8, R4);
        }
        if (K == 16) {
            return R16;
        }
        if (K == 20) {
            return mulBPS(R16, R4);
        }
        if (K == 24) {
            return mulBPS(R16, R8);
        }
        if (K == 28) {
            // R^28 = R^16 * R^12. First compute R^12 = R^8 * R^4
            uint256 R12 = mulBPS(R8, R4);
            return mulBPS(R16, R12);
        }
        return mulBPS(R16, R16);
    }

    /**
     * @notice Calculate the inventory fee for a withdrawal
     * @param K The sensitivity exponent factor to apply (e.g., 8, 12, 16, ..., 32)
     * @param _quantity The quantity being withdrawn
     * @param _chainInventory The current inventory on the chain from which the withdrawal is made
     * @param _totalInventory The total inventory across all chains
     * @param _targetChainRatio The target equilibrium ratio for the chain from which the withdrawal is made
     * @return inventoryFee The calculated inventory fee for the withdrawal
     */
    function calculateFee(
        uint256 K,
        uint256 _quantity,
        uint256 _chainInventory,
        uint256 _totalInventory,
        uint256 _targetChainRatio
    ) internal pure returns (uint256 inventoryFee) {
        // Chain Ratio after withdrawal
        uint256 newChainRatio = (BPS * (_chainInventory - _quantity)) / (_totalInventory - _quantity);

        // Ratio of new compared to target
        uint256 ratio = divBPS(newChainRatio, _targetChainRatio);

        // If above or equal to target, no fee
        if (ratio >= BPS) {
            return 0;
        }
        // Calculate the Exponent Term: B^K (using the BPS-optimized function)
        uint256 exponentTerm = powMultipleOf4BPS(BPS - ratio, K);

        // Calculate the Inventory Fee = F_MIN + F_max * B^K
        uint256 feeRate = MIN_FEE_RATE + mulBPS(MAX_FEE_RATE, exponentTerm);

        return (feeRate * _quantity) / BPS;
    }
}
