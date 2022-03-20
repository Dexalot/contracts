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
    bytes32 constant public VERSION = bytes32("1.1.0");

    IERC20 public immutable token;

    bytes32 public immutable root; // merkle tree root

    uint256 private _cliff;
    uint256 private _start;
    uint256 private _duration;
    uint256 private _firstReleasePercentage;

    mapping(address => uint256) private _releasedPercentage;
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
     * @return the cliff time of the airdrop vesting.
     */
    function cliff() external view returns (uint256) {
        return _cliff;
    }

    /**
     * @return the start time of the airdrop vesting.
     */
    function start() external view returns (uint256) {
        return _start;
    }

    /**
     * @return the duration of the airdrop vesting.
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

    /*
     * @dev Claims tokens to user's wallet.
     * @param index value of the position in the list
     * @param amount total value to airdrop, Percentage and Vesting calculated by it
     * @param merkleProof the proof of merkle
     */
    function claim(
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
        require(
            token.balanceOf(address(this)) > amount,
            "Airdrop: Contract doesnt have enough tokens"
        );
        require(block.timestamp > _start, "Airdrop: too early");

        bytes32 leaf = keccak256(abi.encodePacked(index, msg.sender, amount));

        require(
            MerkleProof.verify(merkleProof, root, leaf),
            "Airdrop: Merkle Proof is not valid"
        );

        uint256 percentage = _vestedByPercentage(amount);

        if (_releasedPercentage[msg.sender] == 0) {
            _releasedPercentage[msg.sender] = percentage;
        }

        uint256 unreleased = _releasableAmount(index, amount);
        require(unreleased > 0, "Airdrop: no tokens are due");

        _released[index] += unreleased;

        emit Claimed(msg.sender, unreleased, block.timestamp);

        token.safeTransfer(msg.sender, unreleased);
    }

    /*
     * @dev Claims tokens to user's Dexalot portfolio.
     * @param index value of the position in the list
     * @param amount total value to airdrop, Percentage and Vesting calculated by it
     * @param merkleProof the proof of merkle
     */
    function claimToPortfolio(
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
                require(
            token.balanceOf(address(this)) > amount,
            "Airdrop: Contract doesnt have enough tokens"
        );
        require(block.timestamp > _start, "Airdrop: too early");

        bytes32 leaf = keccak256(abi.encodePacked(index, msg.sender, amount));

        require(
            MerkleProof.verify(merkleProof, root, leaf),
            "Airdrop: Merkle Proof is not valid"
        );

        uint256 percentage = _vestedByPercentage(amount);

        if (_releasedPercentage[msg.sender] == 0) {
            _releasedPercentage[msg.sender] = percentage;
        }

        uint256 unreleased = _releasableAmount(index, amount);
        require(unreleased > 0, "Airdrop: no tokens are due");

        _released[index] += unreleased;

        emit Claimed(msg.sender, unreleased, block.timestamp);

        token.safeTransfer(msg.sender, unreleased);

        string memory symbolStr = IERC20Metadata(address(token)).symbol();
        bytes32 symbol = stringToBytes32(symbolStr);

        _portfolio.depositTokenFromContract(msg.sender, symbol, unreleased);
    }

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
        uint256 totalBalance = amount - _releasedPercentage[msg.sender];

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

    function _vestedByPercentage(uint256 amount)
        private
        view
        returns (uint256)
    {
        uint256 percentage = (amount * _firstReleasePercentage) / 100;
        return percentage;
    }

    function retrieveFund() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
    }

    /*
     * set address for the portfolio.
     */
    function setPortfolio(IPortfolio portfolio) external onlyOwner {
        require(
            address(portfolio) != address(0),
            "Airdrop: portfolio is the zero address"
        );
        _portfolio = portfolio;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // utility function to convert string to bytes32
    function stringToBytes32(string memory _string)
        private
        pure
        returns (bytes32 result)
    {
        return _string.stringToBytes32();
    }
}
