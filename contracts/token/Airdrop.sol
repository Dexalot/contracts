// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title Flexible airdrop contract
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract Airdrop is Pausable, Ownable {
    using SafeERC20 for IERC20;

    // version
    bytes32 public constant VERSION = bytes32("1.3.1");

    IERC20 public immutable token;

    bytes32 public immutable root; // merkle tree root

    uint256 private _cliff;
    uint256 private _start;
    uint256 private _duration;
    uint256 private _firstReleasePercentage;

    mapping(uint256 => uint256) private _released;

    event Claimed(address claimer, uint256 amount, uint256 timestamp);

    constructor(
        IERC20 _token,
        bytes32 _root,
        uint256 __start,
        uint256 __cliffDuration,
        uint256 __duration,
        uint256 __firstReleasePercentage
    ) Pausable() {
        token = _token;
        root = _root;

        _duration = __duration;
        _cliff = __start + __cliffDuration;
        _start = __start;
        _firstReleasePercentage = __firstReleasePercentage;
    }

    /**
     * @return the cliff time of the airdrop vesting
     */
    function cliff() external view returns (uint256) {
        return _cliff;
    }

    /**
     * @return the start time of the airdrop vesting
     */
    function start() external view returns (uint256) {
        return _start;
    }

    /**
     * @return the duration of the airdrop vesting
     */
    function duration() external view returns (uint256) {
        return _duration;
    }

    /**
     * @return the initial release percentage.
     */
    function getPercentage() external view returns (uint256) {
        return _firstReleasePercentage;
    }

    /**
     * @dev Claims tokens to user's wallet
     * @param index value of the position in the list
     * @param amount total value to airdrop, Percentage and Vesting calculated by it
     * @param merkleProof the proof of merkle
     */
    function claim(
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused {
        require(token.balanceOf(address(this)) >= (amount - _released[index]), "A-CNET-01");

        require(block.timestamp > _start, "A-TOOE-01");

        bytes32 leaf = keccak256(abi.encodePacked(index, msg.sender, amount));
        require(MerkleProof.verify(merkleProof, root, leaf), "A-MPNV-01");

        uint256 unreleased = _releasableAmount(index, amount);
        require(unreleased > 0, "A-NTAD-01");

        _released[index] += unreleased;

        emit Claimed(msg.sender, unreleased, block.timestamp);

        token.safeTransfer(msg.sender, unreleased);
    }

    /**
     * @return released amount for the index
     * @param index value of the position in the list
     */
    function released(uint256 index) external view returns (uint256) {
        return _released[index];
    }

    function _releasableAmount(uint256 index, uint256 amount) private view returns (uint256) {
        return (_vestedAmount(amount) + _vestedByPercentage(amount)) - _released[index];
    }

    function _vestedAmount(uint256 amount) private view returns (uint256) {
        uint256 totalBalance = amount - _vestedByPercentage(amount);

        if (block.timestamp < _cliff) {
            return 0;
        } else if (block.timestamp >= _start + _duration) {
            return totalBalance;
        } else {
            uint256 fromCliff = block.timestamp - _cliff;
            uint256 cliffDuration = _cliff - _start;
            uint256 durationAfterCliff = _duration - cliffDuration;
            uint256 vesting = (totalBalance * (fromCliff)) / (durationAfterCliff);

            return vesting;
        }
    }

    /**
     * @return releasableAmount for the index
     * @param index value of the position in the list
     * @param amount total value to airdrop, Percentage and Vesting calculated by it
     * @param merkleProof the proof of merkle
     */
    function releasableAmount(
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external view returns (uint256) {
        bytes32 leaf = keccak256(abi.encodePacked(index, msg.sender, amount));

        require(MerkleProof.verify(merkleProof, root, leaf), "A-MPNV-02");

        return _releasableAmount(index, amount);
    }

    function _vestedByPercentage(uint256 amount) private view returns (uint256) {
        if (block.timestamp < _start) {
            return 0;
        } else {
            return (amount * _firstReleasePercentage) / 100;
        }
    }

    /**
     * @dev retrieves project tokens from the contract sending to the owner
     */
    function retrieveProjectToken() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
    }

    /**
     * @dev retrieves other tokens from the contract sending to the owner
     */
    function retrieveOtherToken(address tok) external onlyOwner {
        IERC20 t = IERC20(address(tok));
        uint256 balance = t.balanceOf(address(this));
        t.safeTransfer(msg.sender, balance);
    }

    /**
     * @dev pauses the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev unpauses the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
