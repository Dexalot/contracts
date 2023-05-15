// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

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
// Copyright 2022 Dexalot.

contract IncentiveDistributor is PausableUpgradeable, OwnableUpgradeable, EIP712Upgradeable {
    // version
    bytes32 public constant VERSION = bytes32("1.0.2");

    IPortfolioSub private _portfolio;

    // bitmap representing current reward tokenIds
    uint32 public allTokens;
    address private _signer;
    mapping(uint32 => bytes32) public tokens;
    mapping(address => mapping(uint32 => uint128)) public claimedRewards;

    event Claimed(address indexed claimer, uint32 tokenIds, uint128[] amounts, uint256 timestamp);
    event AddRewardToken(bytes32 symbol, uint32 tokenId, uint256 timestamp);
    event DepositGas(address from, uint256 quantity, uint256 timestamp);
    event WithdrawGas(address to, uint256 quantity, uint256 timestamp);

    /**
     * @notice Initializer of the IncentiveDistributor
     * @dev    Adds ALOT token as the first reward token and defines the signer of claim messages.
     * @param  _alotSymbol The symbol of the ALOT token
     * @param  __signer The public address of the signer of claim messages
     * @param __portfolio The address of the portfolio sub contract
     */
    function initialize(bytes32 _alotSymbol, address __signer, address __portfolio) public initializer {
        __Ownable_init();
        __Pausable_init();
        __EIP712_init("Dexalot", "1.0.2");

        require(__signer != address(0), "ID-ZADDR-01");
        require(__portfolio != address(0), "ID-ZADDR-02");

        uint32 tokenId = ~allTokens & (allTokens + 1);
        tokens[tokenId] = _alotSymbol;
        allTokens |= tokenId;
        _signer = __signer;
        _portfolio = IPortfolioSub(__portfolio);

        emit AddRewardToken(_alotSymbol, tokenId, block.timestamp);
    }

    /**
     * @notice Claim DIP token rewards for a given trader in their portfolio
     * @param  _amounts An array of total earned amount for each reward token
     * @param  _tokenIds A bitmap representing which tokens to claim
     * @param  _signature A signed claim message to be verified
     */
    function claim(uint128[] memory _amounts, uint32 _tokenIds, bytes calldata _signature) external whenNotPaused {
        require(_tokenIds | allTokens == allTokens, "ID-TDNE-01");
        require(_checkClaim(msg.sender, _tokenIds, _amounts, _signature), "ID-SIGN-01");

        bool isClaimed;
        uint32 bitmap = _tokenIds;

        for (uint256 i = 0; i < _amounts.length; ++i) {
            require(bitmap != 0, "ID-TACM-01");
            uint32 tokenId = bitmap & ~(bitmap - 1);
            bitmap -= tokenId;

            uint128 amount = _amounts[i];
            uint128 prevClaimed = claimedRewards[msg.sender][tokenId];
            require(amount >= prevClaimed, "ID-RTPC-01");

            if (amount != prevClaimed) {
                bytes32 symbol = tokens[tokenId];
                uint128 claimableAmount = amount - prevClaimed;

                _portfolio.transferToken(msg.sender, symbol, claimableAmount);
                claimedRewards[msg.sender][tokenId] += claimableAmount;

                _amounts[i] = claimableAmount;
                isClaimed = true;
            } else {
                _amounts[i] = 0;
            }
        }
        require(isClaimed, "ID-NTTC-01");
        require(bitmap == 0, "ID-TACM-02");

        emit Claimed(msg.sender, _tokenIds, _amounts, block.timestamp);
    }

    /**
     * @notice Verifies claim message (_user, _tokenIds, _amount) has been signed by signer
     * @param  _user The trader making a claim
     * @param  _tokenIds A bitmap representing which tokens to claim
     * @param  _amounts An array of total earned amount for each reward token
     * @param  _signature A signed claim message to be verified
     */
    function _checkClaim(
        address _user,
        uint32 _tokenIds,
        uint128[] memory _amounts,
        bytes calldata _signature
    ) internal view returns (bool) {
        bytes32 structType = keccak256("Claim(address user,uint32 tokenIds,uint128[] amounts)");
        bytes32 hashedStruct = keccak256(
            abi.encode(structType, _user, _tokenIds, keccak256(abi.encodePacked(_amounts)))
        );
        bytes32 digest = _hashTypedDataV4(hashedStruct);
        return ECDSAUpgradeable.recover(digest, _signature) == _signer;
    }

    /**
     * @notice Add new claimable reward token
     * @param  _symbol The symbol of the new reward token
     */
    function addRewardToken(bytes32 _symbol) external whenPaused onlyOwner {
        uint32 tokenId = ~allTokens & (allTokens + 1);
        tokens[tokenId] = _symbol;
        allTokens |= tokenId;

        emit AddRewardToken(_symbol, tokenId, block.timestamp);
    }

    /**
     * @notice Retrieve reward token when DIP ends
     * @param  _tokenId The id of the reward token to retrieve
     */
    function retrieveRewardToken(uint32 _tokenId) external whenPaused onlyOwner {
        bytes32 symbol = tokens[_tokenId];
        require(symbol != bytes32(0), "ID-TDNE-02");

        (, uint256 availableBalance, ) = _portfolio.getBalance(address(this), symbol);
        _portfolio.transferToken(msg.sender, symbol, availableBalance);
    }

    /**
     * @notice Retrieve all reward tokens when DIP ends
     */
    function retrieveAllRewardTokens() external whenPaused onlyOwner {
        for (uint32 tokenId = 1; tokenId < allTokens; tokenId <<= 1) {
            bytes32 symbol = tokens[tokenId];
            (, uint256 availableBalance, ) = _portfolio.getBalance(address(this), symbol);
            _portfolio.transferToken(msg.sender, symbol, availableBalance);
        }
    }

    /**
     * @notice Receive native ALOT, ensures auto gas tank fill logic holds
     */
    receive() external payable {
        emit DepositGas(msg.sender, msg.value, block.timestamp);
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
}
