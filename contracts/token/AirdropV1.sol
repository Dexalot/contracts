// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AirdropV1 is Pausable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    bytes32 public immutable root; // merkle tree root

    mapping(uint256 => uint256) public _claimed;

    event Claimed(address claimer, uint256 amount, uint256 timestamp);

    constructor(IERC20 _token, bytes32 _root) Pausable() {
        token = _token;
        root = _root;
    }

    function claim(
        uint256 index,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
        require(
            token.balanceOf(address(this)) > amount,
            "Contract doesnt have enough tokens"
        );

        (uint256 claimedBlock, uint256 claimedMask) = claimed(index);
        _claimed[index / 256] = claimedBlock | claimedMask;

        bytes32 leaf = keccak256(abi.encodePacked(index, msg.sender, amount));

        require(
            MerkleProof.verify(merkleProof, root, leaf),
            "Merkle Proof is not valid"
        );

        emit Claimed(msg.sender, amount, block.timestamp);

        token.safeTransfer(msg.sender, amount);
    }

    function claimed(uint256 index)
        public
        view
        returns (uint256 claimedBlock, uint256 claimedMask)
    {
        claimedBlock = _claimed[index / 256];
        claimedMask = (uint256(1) << uint256(index % 256));
        require(
            (claimedBlock & claimedMask) == 0,
            "Tokens have already been claimed"
        );
    }

    function canClaim(uint256 index) external view returns (bool) {
        uint256 claimedBlock = _claimed[index / 256];
        uint256 claimedMask = (uint256(1) << uint256(index % 256));
        return ((claimedBlock & claimedMask) == 0);
    }

    function retrieveFund() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
