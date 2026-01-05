// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOmniVaultShare is IERC20 {
    function mint(address _to, uint256 _amount) external;

    function burn(uint256 _amount) external;
}
