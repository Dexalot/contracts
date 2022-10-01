// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../PortfolioMinter.sol";

/**
 * @title Mock contract to test PortfolioMinter
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioMinterMock is PortfolioMinter {
    function mint(address _to, uint256 _amount) public override onlyRole(MINTER_ROLE) whenNotPaused {
        require(_amount > 0, "PM-ZAMT-01");
        emit Mint(_to, _amount);
        totalNativeMinted += _amount;
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = _to.call{value: _amount}("");
        require(sent, "PM-MOCK");
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
