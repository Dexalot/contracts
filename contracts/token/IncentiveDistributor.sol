// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/BitMapsUpgradeable.sol";

import "../interfaces/IPortfolioSub.sol";

/**
 * @title Distributor for Dexalot Incentive Program (DIP) rewards
 * @notice IncentiveDistributor distributes 200,000 $ALOT tokens monthly for up to 2 years and
 * potential other tokens to traders based on their trading activity. Token rewards per
 * trader are calculated off-chain and finalized at month's end. To validate, we sign a
 * message containing the trader address, ids and amounts of reward tokens earned to date.
 * This signature is input to the claim function to verify and allow traders to withdraw
 * their earned Dexalot Incentive Program (DIP) rewards to the PortfolioSubnet contract.
 */
// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2026 Dexalot.
contract IncentiveDistributor is PausableUpgradeable, OwnableUpgradeable, EIP712Upgradeable {
    using BitMapsUpgradeable for BitMapsUpgradeable.BitMap;

    bytes32 public constant VERSION = bytes32("2.0.0");

    // EIP-712 typehash for claim struct
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address user,uint32 tokenIds,uint32 expiry,uint16[] weekIds,uint128[] amounts)");

    IPortfolioSub public portfolio;

    // bitmap representing current reward tokenIds
    uint32 public allTokens;
    address public rewardSigner;
    // tokenId => symbol
    mapping(uint32 => bytes32) public tokens;

    // user address => tokenId => bitmap of claimed weeks
    mapping(address => mapping(uint32 => BitMapsUpgradeable.BitMap)) private _claimedWeeks;

    event Claimed(
        address indexed claimer,
        uint32 tokenIds,
        uint32 expiry,
        uint16[] weekIds,
        uint128[] amounts,
        uint256 timestamp
    );
    event AddRewardToken(bytes32 symbol, uint32 tokenId, uint256 timestamp);
    event DepositGas(address from, uint256 quantity, uint256 timestamp);
    event WithdrawGas(address to, uint256 quantity, uint256 timestamp);

    function initialize(bytes32 _alotSymbol, address __signer, address __portfolio) public initializer {
        __Ownable_init();
        __Pausable_init();
        __EIP712_init("Dexalot", "2");

        require(__signer != address(0), "ID-ZADDR-01");
        require(__portfolio != address(0), "ID-ZADDR-02");

        uint32 tokenId = ~allTokens & (allTokens + 1);
        tokens[tokenId] = _alotSymbol;
        allTokens |= tokenId;
        rewardSigner = __signer;
        portfolio = IPortfolioSub(__portfolio);

        emit AddRewardToken(_alotSymbol, tokenId, block.timestamp);
    }

    /**
     * @notice Receive native ALOT, ensures auto gas tank fill logic holds
     */
    receive() external payable {
        emit DepositGas(msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Claim DIP token rewards for specific weeks
     * @dev To handle rolling expiry, we claim specific Week IDs.
     * The _amounts array should correspond to the total expected for the provided weeks.
     * Example: If claiming Week 10, 11 + 12 for Token A and Token B.
     * _weekIds: [10, 11, 12] (The weeks being claimed)
     * _amounts: [TotalForTokenA, TotalForTokenB] (The sum of those specific weeks)
     * @param _tokenIds Bitmap of token IDs being claimed
     * @param _expiry Expiry timestamp of the signature
     * @param _weekIds Array of week IDs being claimed
     * @param _amounts Array of amounts corresponding to each token ID being claimed
     * @param _signature EIP-712 signature from the authorized signer
     */
    function claim(
        uint32 _tokenIds,
        uint32 _expiry,
        uint16[] calldata _weekIds,
        uint128[] calldata _amounts,
        bytes calldata _signature
    ) external whenNotPaused {
        require(_weekIds.length > 0, "ID-NWID-01");
        require(block.timestamp <= _expiry, "ID-EXPR-01");
        require(_tokenIds | allTokens == allTokens, "ID-TDNE-01");
        require(_checkClaim(msg.sender, _tokenIds, _expiry, _weekIds, _amounts, _signature), "ID-SIGN-01");

        uint256 len = _amounts.length;
        bytes32[] memory symbols = new bytes32[](len);
        uint256[] memory amounts = new uint256[](len);
        uint32 bitmap = _tokenIds;

        uint256 tokenIndex = 0;
        // iterate through each token in the bitmap
        while (bitmap != 0) {
            require(tokenIndex < len, "ID-TACM-01");

            uint32 tokenId = bitmap & ~(bitmap - 1);
            bitmap -= tokenId;

            // require that none of the weeks in this batch have been claimed for this token
            for (uint256 w = 0; w < _weekIds.length; w++) {
                require(!_claimedWeeks[msg.sender][tokenId].get(_weekIds[w]), "ID-WKCL-01");
            }

            // mark weeks as claimed
            for (uint256 w = 0; w < _weekIds.length; w++) {
                _claimedWeeks[msg.sender][tokenId].set(_weekIds[w]);
            }

            amounts[tokenIndex] = _amounts[tokenIndex];
            symbols[tokenIndex] = tokens[tokenId];
            tokenIndex++;
        }
        // ensure all tokens have been processed
        require(tokenIndex == len, "ID-TACM-02");

        portfolio.bulkTransferTokens(address(this), msg.sender, symbols, amounts);

        emit Claimed(msg.sender, _tokenIds, _expiry, _weekIds, _amounts, block.timestamp);
    }

    /**
     * @notice Adds a new reward token to the distributor
     * @dev Can only be called by the owner when the contract is paused
     * @param _symbol Symbol of the new reward token
     */
    function addRewardToken(bytes32 _symbol) external whenPaused onlyOwner {
        uint32 tokenId = ~allTokens & (allTokens + 1);
        tokens[tokenId] = _symbol;
        allTokens |= tokenId;
        emit AddRewardToken(_symbol, tokenId, block.timestamp);
    }

    /**
     * @notice Retrieve unclaimed reward tokens to owner
     * @dev Can only be called by the owner when the contract is paused
     * @param _tokenId Token ID to retrieve
     */
    function retrieveRewardToken(uint32 _tokenId) external whenPaused onlyOwner {
        bytes32 symbol = tokens[_tokenId];
        require(symbol != bytes32(0), "ID-TDNE-02");
        (, uint256 availableBalance, ) = portfolio.getBalance(address(this), symbol);
        portfolio.transferToken(msg.sender, symbol, availableBalance);
    }

    /**
     * @notice Withdraw ALOT from IncentiveDistributor gas tank to owner
     * @param amount The amount of ALOT to withdraw to owner
     */
    function withdrawGas(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "ID-AGCB-01");
        emit WithdrawGas(msg.sender, amount, block.timestamp);
        payable(msg.sender).transfer(amount);
    }

    /**
     * @notice Pause to perform admin functions
     */
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /**
     * @notice Unpause to allow claiming to resume
     */
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /**
     * @notice Update the authorized signer address
     * @dev Can only be called by the owner when the contract is paused
     * @param _newSigner Address of the new signer
     */
    function updateSigner(address _newSigner) external onlyOwner whenPaused {
        require(_newSigner != address(0), "ID-ZADDR-01");
        rewardSigner = _newSigner;
    }

    /**
     * @notice Check if a specific week has been claimed for a user and token
     * @param _user Address of the user
     * @param _tokenId Token ID to check
     * @param _weekId Week ID to check
     * @return bool indicating if the week has been claimed
     */
    function isWeekClaimed(address _user, uint32 _tokenId, uint16 _weekId) external view returns (bool) {
        return _claimedWeeks[_user][_tokenId].get(_weekId);
    }

    /**
     * @notice Internal function to verify claim signature
     * @param _user Address of the user making the claim
     * @param _tokenIds Bitmap of token IDs being claimed
     * @param _expiry Expiry timestamp of the signature
     * @param _weekIds Array of week IDs being claimed
     * @param _amounts Array of amounts corresponding to each token ID being claimed
     * @param _signature EIP-712 signature from the authorized signer
     * @return bool indicating if the signature is valid
     */
    function _checkClaim(
        address _user,
        uint32 _tokenIds,
        uint32 _expiry,
        uint16[] calldata _weekIds,
        uint128[] memory _amounts,
        bytes calldata _signature
    ) internal view returns (bool) {
        bytes32 hashedStruct = keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                _user,
                _tokenIds,
                _expiry,
                keccak256(abi.encodePacked(_weekIds)),
                keccak256(abi.encodePacked(_amounts))
            )
        );
        bytes32 digest = _hashTypedDataV4(hashedStruct);
        return ECDSAUpgradeable.recover(digest, _signature) == rewardSigner;
    }
}
