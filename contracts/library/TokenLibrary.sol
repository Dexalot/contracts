// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

library TokenLibrary {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    function sendToken(address _token, address _to, uint256 _amount) internal {
        if (_token == address(0)) {
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "TL-TF-01");
        } else {
            IERC20Upgradeable(_token).safeTransfer(_to, _amount);
        }
    }

    function receiveToken(address _token, address _from, uint256 _amount) internal {
        if (_token == address(0)) {
            require(msg.value == _amount, "TL-INA-01");
        } else {
            IERC20Upgradeable(_token).safeTransferFrom(_from, address(this), _amount);
        }
    }
}
