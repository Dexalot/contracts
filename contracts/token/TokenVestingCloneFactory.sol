// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./TokenVestingCloneable.sol";

/**
 * @title Clone factory for TokenVestingCloneable
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract TokenVestingCloneFactory is Ownable {
    // version
    bytes32 public constant VERSION = bytes32("1.0.0");

    address public implementation;

    mapping(uint256 => address) public clones;

    // number of clones
    uint256 public count;

    event TokenVestingCloneFactoryInitialized(address implementation);
    event NewClone(address _clone);

    constructor() {
        implementation = address(new TokenVestingCloneable());
        emit TokenVestingCloneFactoryInitialized(implementation);
    }

    /**
     * @dev Create function for a new TokenVesting clone
     * @param __beneficiary address of the beneficiary to whom vested tokens are transferred
     * @param __start time (as Unix time) at which point vesting starts
     * @param __cliffDuration duration in seconds of the cliff in which tokens will begin to vest
     * @param __duration duration in seconds of the period in which the tokens will vest
     * @param __startPortfolioDeposits time (as Unix time) portfolio deposits start
     * @param __revocable whether the vesting is revocable or not
     * @param __firstReleasePercentage percentage to be released initially
     * @param __period length of claim period that allows one to withdraw in discrete periods.
     * i.e. (60 x 60 x 24) x 30 will allow the beneficiary to claim every 30 days, 0 for no restrictions
     * @param __portfolio address of portfolio
     */

    function createTokenVesting(
        address __beneficiary,
        uint256 __start,
        uint256 __cliffDuration,
        uint256 __duration,
        uint256 __startPortfolioDeposits,
        bool __revocable,
        uint256 __firstReleasePercentage,
        uint256 __period,
        address __portfolio,
        address __owner
    ) external onlyOwner {
        address clone = Clones.clone(implementation);
        TokenVestingCloneable(clone).initialize(
            __beneficiary,
            __start,
            __cliffDuration,
            __duration,
            __startPortfolioDeposits,
            __revocable,
            __firstReleasePercentage,
            __period,
            __portfolio,
            __owner
        );
        clones[count++] = clone;
        emit NewClone(clone);
    }

    /**
     * @dev Accessor method to get i-th clone
     * @param index clone index
     */
    function getClone(uint256 index) external view returns (address) {
        require(index < count, "TVCF-IOOB-01");
        return clones[index];
    }
}
