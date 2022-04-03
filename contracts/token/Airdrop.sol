// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../library/StringLibrary.sol";
import "../interfaces/IPortfolio.sol";

contract Airdrop is Pausable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using StringLibrary for string;

    // version
    bytes32 constant public VERSION = bytes32("1.2.0");

    IERC20 public immutable token;

    bytes32 public immutable root; // merkle tree root

    uint256 private _cliff;
    uint256 private _start;
    uint256 private _duration;
    uint256 private _firstReleasePercentage;

    mapping(uint256 => uint256) private _released;

    IPortfolio private _portfolio;

    event Claimed(address claimer, uint256 amount, uint256 timestamp);

    constructor(
        IERC20 _token,
        bytes32 _root,
        uint256 __start,
        uint256 __cliffDuration,
        uint256 __duration,
        uint256 __firstReleasePercentage,
        IPortfolio __portfolio
    ) Pausable() {
        token = _token;
        root = _root;

        _duration = __duration;
        _cliff = __start + __cliffDuration;
        _start = __start;
        _firstReleasePercentage = __firstReleasePercentage;

        _portfolio = __portfolio;
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
     * @return the portfolio address for funding.
     */
    function getPortfolio() external view returns (address) {
        return address(_portfolio);
    }

    /**
     * @dev Implements claiming of tokens to user's wallet
     * @param to account to claim to
     * @param index value of the position in the list
     * @param amount total value to airdrop, Percentage and Vesting calculated by it
     * @param merkleProof the proof of merkle
     * @return the claimed amount
     */
    function _doClaim(
        address to,
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) private nonReentrant returns (uint256) {
        require(
            token.balanceOf(address(this)) > amount,
            "Airdrop: Contract doesnt have enough tokens"
        );

        require(block.timestamp > _start, "Airdrop: too early");

        bytes32 leaf = keccak256(abi.encodePacked(index, to, amount));
        require(
            MerkleProof.verify(merkleProof, root, leaf),
            "Airdrop: Merkle Proof is not valid"
        );

        uint256 unreleased = _releasableAmount(index, amount);
        require(unreleased > 0, "Airdrop: no tokens are due");

        _released[index] += unreleased;

        emit Claimed(to, unreleased, block.timestamp);

        token.safeTransfer(to, unreleased);

        return unreleased;
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
        // _doClaim is non-reentrant
        _doClaim(msg.sender, index, amount, merkleProof);
    }

    /**
     * @dev Claims tokens to user's Dexalot portfolio
     * @param index value of the position in the list
     * @param amount total value to airdrop, Percentage and Vesting calculated by it
     * @param merkleProof the proof of merkle
     */
    function claimToPortfolio(
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused {
        string memory symbolStr = IERC20Metadata(address(token)).symbol();
        bytes32 symbol = stringToBytes32(symbolStr);

        // _doClaim is non-reentrant
        uint256 unreleased = _doClaim(msg.sender, index, amount, merkleProof);

        // _portfolio.depositTokenFromContract is non-reentrant
        _portfolio.depositTokenFromContract(msg.sender, symbol, unreleased);
    }

    /**
     * @return released amount for the index
     * @param index value of the position in the list
     */
    function released(uint256 index) external view returns (uint256) {
        return _released[index];
    }

    function _releasableAmount(uint256 index, uint256 amount)
        private
        view
        returns (uint256)
    {
        return
            (_vestedAmount(amount) + _vestedByPercentage(amount)) -
            _released[index];
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
            uint256 vesting = (totalBalance * (fromCliff)) /
                (durationAfterCliff);

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

        require(
            MerkleProof.verify(merkleProof, root, leaf),
            "Airdrop: Merkle Proof is not valid"
        );

        return _releasableAmount(index, amount);
    }

    function _vestedByPercentage(uint256 amount)
        private
        view
        returns (uint256)
    {
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
     * @dev set address for the portfolio
     */
    function setPortfolio(IPortfolio portfolio) external onlyOwner {
        require(
            address(portfolio) != address(0),
            "Airdrop: portfolio is the zero address"
        );
        _portfolio = portfolio;
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

    /**
     * @dev utility function to convert string to bytes32
     */
    function stringToBytes32(string memory _string)
        private
        pure
        returns (bytes32 result)
    {
        return _string.stringToBytes32();
    }
}
