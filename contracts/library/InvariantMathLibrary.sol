// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title InvariantMathLibrary
 * @notice Library for calculating withdrawal fees of the same asset across different chains
 * using a stableswap invariant which combines a constant product and constant sum formula.
 * @dev To be used in conjunction with the InventoryManager contract. Calculations use Newton's method to
 * approximate the value of D and YD. For more information, see the StableSwap whitepaper.
 */
library InvariantMathLibrary {
    /**
     * @notice Calculate the absolute difference between two numbers
     * @param x The first number
     * @param y The second number
     * @return The absolute difference between x and y
     */
    function abs(uint256 x, uint256 y) private pure returns (uint256) {
        return x >= y ? x - y : y - x;
    }

    /**
     * @notice Calculate the D value for the given x and A
     * @param xp The array of inventory per chain
     * @param A The amplification coefficient
     * @param N The number of chains
     * @return The D value
     */
    function getD(uint256[] memory xp, uint256 A, uint256 N) private pure returns (uint256) {
        /*
        Newton's method to compute D
        -----------------------------
        f(D) = ADn^n + D^(n + 1) / (n^n prod(x_i)) - An^n sum(x_i) - D
        f'(D) = An^n + (n + 1) D^n / (n^n prod(x_i)) - 1

                     (as + np)D_n
        D_(n+1) = -----------------------
                  (a - 1)D_n + (n + 1)p

        a = An^n
        s = sum(x_i)
        p = (D_n)^(n + 1) / (n^n prod(x_i))
        */
        uint256 a = A * N; // An^n

        uint256 s; // x_0 + x_1 + ... + x_(n-1)
        for (uint256 i; i < N; ++i) {
            s += xp[i];
        }

        // Newton's method
        // Initial guess, d <= s
        uint256 d = s;
        uint256 d_prev;
        for (uint256 i; i < 255; ++i) {
            // p = D^(n + 1) / (n^n * x_0 * ... * x_(n-1))
            uint256 p = d;
            for (uint256 j; j < N; ++j) {
                p = (p * d) / (N * xp[j]);
            }
            d_prev = d;
            d = ((a * s + N * p) * d) / ((a - 1) * d + (N + 1) * p);

            if (abs(d, d_prev) <= 1) {
                return d;
            }
        }
        revert("D didn't converge");
    }

    /**
     * @notice Calculate the YD value for the given i, xp, d, A, and N
     * @param i The index of the chain to withdraw from
     * @param xp The array of inventory per chain
     * @param d The D value
     * @param A The amplification coefficient
     * @param N The number of chains
     * @return The YD value
     */
    function getYD(uint256 i, uint256[] memory xp, uint256 d, uint256 A, uint256 N) private pure returns (uint256) {
        uint256 a = A * N;
        uint256 s;
        uint256 c = d;

        uint256 _x;
        for (uint256 k; k < N; ++k) {
            if (k != i) {
                _x = xp[k];
            } else {
                continue;
            }

            s += _x;
            c = (c * d) / (N * _x);
        }
        c = (c * d) / (N * a);
        uint256 b = s + d / a;

        // Newton's method
        uint256 y_prev;
        // Initial guess, y <= d
        uint256 y = d;
        for (uint256 _i; _i < 255; ++_i) {
            y_prev = y;
            y = (y * y + c) / (2 * y + b - d);
            if (abs(y, y_prev) <= 1) {
                return y;
            }
        }
        revert("y didn't converge");
    }

    /**
     * @notice Calculate the withdrawal fee for a token from a given chain
     * @param _quantity The quantity to withdraw
     * @param _i The index of the chain to withdraw from
     * @param _xp The array of inventory per chain
     * @param _totalInventory The total inventory across all chains
     * @param _A The amplification coefficient
     * @param _N The number of chains
     * @return fee The withdrawal fee
     */
    function calcWithdrawOneChain(
        uint256 _quantity,
        uint256 _i,
        uint256[] memory _xp,
        uint256 _totalInventory,
        uint256 _scaleFactor,
        uint256 _A,
        uint256 _N
    ) internal pure returns (uint256 fee) {
        // Calculate d0 and d1
        uint256 d0 = getD(_xp, _A, _N) / _scaleFactor;
        uint256 d1 = d0 - (d0 * _quantity) / (_totalInventory);

        uint256 dy = (_xp[_i] - getYD(_i, _xp, d1, _A, _N) - 1);
        if (dy > _quantity) {
            return 0;
        }
        return _quantity - dy;
    }
}
