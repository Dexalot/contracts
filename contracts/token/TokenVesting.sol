// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IPortfolio.sol";

/**
 * @title TokenVesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period. Optionally revocable by the
 * owner.
 */
contract TokenVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // The vesting schedule is time-based (i.e. using block timestamps as opposed to e.g. block numbers), and is
    // therefore sensitive to timestamp manipulation (which is something miners can do, to a certain degree). Therefore,
    // it is recommended to avoid using short time durations (less than a minute). Typical vesting schemes, with a
    // cliff period of a year and a duration of four years, are safe to use.

    event TokensReleased(address token, uint256 amount);
    event TokenVestingRevoked(address token);

    // beneficiary of tokens after they are released
    address private _beneficiary;

    // Durations and timestamps are expressed in UNIX time, the same units as block.timestamp.
    uint256 private _cliff;
    uint256 private _start;
    uint256 private _duration;

    bool private _revocable;

    uint256 private _firstReleasePercentage;
    mapping(address => uint256) private _releasedPercentage;
    IPortfolio private _portfolio;
    mapping(address => bool) private _isFundingPortfolio;

    mapping(address => uint256) private _released;
    mapping(address => bool) private _revoked;

    /*
     * @dev Creates a vesting contract that vests its balance of any ERC20 token to the
     * beneficiary, gradually in a linear fashion until start + duration. By then all
     * of the balance will have vested.
     * @param __beneficiary address of the beneficiary to whom vested tokens are transferred
     * @param __cliffDuration duration in seconds of the cliff in which tokens will begin to vest
     * @param __start the time (as Unix time) at which point vesting starts
     * @param __duration duration in seconds of the period in which the tokens will vest
     * @param __revocable whether the vesting is revocable or not
     * @param __firstReleasePercentage
     * @param __portfolio
     */
    constructor(
        address __beneficiary,
        uint256 __start,
        uint256 __cliffDuration,
        uint256 __duration,
        bool __revocable,
        uint256 __firstReleasePercentage,
        IPortfolio __portfolio
    ) {
        require(
            __beneficiary != address(0),
            "TokenVesting: beneficiary is the zero address"
        );
        require(
            __cliffDuration <= __duration,
            "TokenVesting: cliff is longer than duration"
        );
        require(__duration > 0, "TokenVesting: duration is 0");
        require(
            __start + __duration > block.timestamp,
            "TokenVesting: final time is before current time"
        );
        require(__firstReleasePercentage > 0, "TokenVesting: percentage is 0");
        require(
            address(__portfolio) != address(0),
            "TokenVesting: portfolio is the zero address"
        );

        _beneficiary = __beneficiary;
        _revocable = __revocable;
        _duration = __duration;
        _cliff = __start + __cliffDuration;
        _start = __start;
        _firstReleasePercentage = __firstReleasePercentage;
        _portfolio = __portfolio;
    }

    /**
     * @return the beneficiary of the tokens.
     */
    function beneficiary() external view returns (address) {
        return _beneficiary;
    }

    /**
     * @return the cliff time of the token vesting.
     */
    function cliff() external view returns (uint256) {
        return _cliff;
    }

    /**
     * @return the start time of the token vesting.
     */
    function start() external view returns (uint256) {
        return _start;
    }

    /**
     * @return the duration of the token vesting.
     */
    function duration() external view returns (uint256) {
        return _duration;
    }

    /**
     * @return true if the vesting is revocable.
     */
    function revocable() external view returns (bool) {
        return _revocable;
    }

    /**
     * @return the amount of the token released.
     */
    function released(address token) external view returns (uint256) {
        return _released[token];
    }

    /**
     * @return true if the token is revoked.
     */
    function revoked(address token) external view returns (bool) {
        return _revoked[token];
    }

    /*
     * get value of the percentage
     */
    function getPercentage() external view returns (uint256) {
        return _firstReleasePercentage;
    }

    /*
     * set value of the percentage
     */
    function setPercentage(uint256 percentage) external onlyOwner {
        _firstReleasePercentage = percentage;
    }

    /*
     * @return true if the vesting is funded to the portfolio.
     */
    function isFundingPortfolio(address token) external view returns (bool) {
        return _isFundingPortfolio[token];
    }

    /*
     * set true if the vesting will be funded to the portfolio.
     */
    function setFundingPortfolio(address token, bool isFunding) external {
        require(msg.sender == _beneficiary, "Only beneficiary");

        _isFundingPortfolio[token] = isFunding;
    }

    /**
     * @return the portfolio address for funding
     */
    function getPortfolio() external view returns (address) {
        return address(_portfolio);
    }

    /*
     * set address for the portfolio.
     */
    function setPortfolio(IPortfolio portfolio) external onlyOwner {
        require(
            address(portfolio) != address(0),
            "TokenVesting: portfolio is the zero address"
        );
        _portfolio = portfolio;
    }

    /**
     * @notice Transfers vested tokens to beneficiary.
     * @param token ERC20 token which is being vested
     */
    function release(IERC20 token) external nonReentrant {
        uint256 unreleased = _releasableAmount(token);

        require(unreleased > 0, "TokenVesting: no tokens are due");

        uint256 isReleased = _released[address(token)];
        _released[address(token)] = _released[address(token)] + unreleased;

        emit TokensReleased(address(token), unreleased);

        token.safeTransfer(_beneficiary, unreleased);

        if (isReleased == 0 && _isFundingPortfolio[address(token)]) {
            bytes32 symbol = bytes32("ALOT");
            _portfolio.depositTokenFromContract(
                _beneficiary,
                symbol,
                unreleased
            );
        }

        if (isReleased == 0) {
            uint256 percentage = _vestedByPercentage(token);

            if (percentage <= unreleased) {
                _releasedPercentage[address(token)] = percentage;
            }
        }
    }

    /**
     * @notice Allows the owner to revoke the vesting. Tokens already vested
     * remain in the contract, the rest are returned to the owner.
     * @param token ERC20 token which is being vested
     */
    function revoke(IERC20 token) external onlyOwner {
        require(_revocable, "TokenVesting: cannot revoke");
        require(
            !_revoked[address(token)],
            "TokenVesting: token already revoked"
        );

        uint256 balance = token.balanceOf(address(this));

        uint256 unreleased = _releasableAmount(token);
        uint256 refund = balance - unreleased;

        _revoked[address(token)] = true;

        emit TokenVestingRevoked(address(token));

        token.safeTransfer(owner(), refund);
    }

    /**
     * @dev Calculates the amount that has already vested but hasn't been released yet.
     * @param token ERC20 token which is being vested
     */
    function _releasableAmount(IERC20 token) private view returns (uint256) {
        return
            (_vestedAmount(token) +
                _vestedByPercentage(token) +
                _releasedPercentage[address(token)]) -
            _released[address(token)];
    }

    function vestedAmount(IERC20 token) external view returns (uint256) {
        return _vestedAmount(token);
    }

    function vestedPercentageAmount(IERC20 token)
        external
        view
        returns (uint256)
    {
        return _releasedPercentage[address(token)];
    }

    /**
     * @dev Calculates the amount that has already vested.
     * @param token ERC20 token which is being vested
     */
    function _vestedAmount(IERC20 token) private view returns (uint256) {
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 totalBalance = currentBalance + _released[address(token)];

        if (block.timestamp < _cliff) {
            return 0;
        } else if (
            block.timestamp >= _start + _duration || _revoked[address(token)]
        ) {
            return totalBalance;
        } else {
            uint256 fromStart = block.timestamp - _start;
            uint256 vesting = (totalBalance * (fromStart)) / _duration;

            return vesting;
        }
    }

    function _vestedByPercentage(IERC20 token) private view returns (uint256) {
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 totalBalance = currentBalance + _released[address(token)];
        uint256 timeVesting = _vestedAmount(token);

        uint256 percentage = (totalBalance * _firstReleasePercentage) / 100;

        if (timeVesting > percentage) {
            percentage = 0;
        } else {
            percentage = percentage - timeVesting;
        }

        return percentage;
    }
}
