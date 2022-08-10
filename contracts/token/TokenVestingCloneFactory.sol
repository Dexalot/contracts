// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./TokenVestingCloneable.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "TokenVestingCloneFactory: clone factory for TokenVestingCloneable"
*/

contract TokenVestingCloneFactory is
    Ownable
{
    // version
    bytes32 constant public VERSION = bytes32("1.0.0");


    address public implementation;

    mapping (uint256 => address) public clones;

    // number of clones
    uint256 public count;

    event TokenVestingCloneFactoryInitialized(address implementation);
    event NewClone(address _clone);

    constructor() {
        implementation = address(new TokenVestingCloneable());
        emit TokenVestingCloneFactoryInitialized(implementation);
    }

    /**
     * @notice Create function for a new TokenVesting clone
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
     * @notice Accessor method to get all clones
     */
    function getClone(uint index) external view returns (address) {
        require(index < count, "TVCF-IOOB-01");
        return clones[index];
    }
}
