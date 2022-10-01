// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

import "contracts/PortfolioMinter.sol";

/**
 * @title Mock contract to test reentrancy guard on PortfolioMinter
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioMinterAttacker is Ownable {
    PortfolioMinter private portfolioMinter;

    constructor(address _address) {
        portfolioMinter = PortfolioMinter(_address);
    }

    function attackMint() external payable onlyOwner {
        portfolioMinter.mint(address(this), 10);
    }

    receive() external payable {
        address nativeMinterAddr = portfolioMinter.getNativeMinter();
        if (address(nativeMinterAddr).balance > 0) {
            portfolioMinter.mint(address(this), address(nativeMinterAddr).balance);
        } else {
            payable(owner()).transfer(address(this).balance);
        }
    }
}
