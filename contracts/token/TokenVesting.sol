// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../library/StringLibrary.sol";

import "../interfaces/IPortfolio.sol";

/**
 *   @author "DEXALOT TEAM"
 *   @title "TokenVesting: a flexible token vesting contract"
 */

contract TokenVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;
    using StringLibrary for string;

    // The vesting schedule is time-based (i.e. using block timestamps as opposed to e.g. block numbers), and is
    // therefore sensitive to timestamp manipulation (which is something miners can do, to a certain degree). Therefore,
    // it is recommended to avoid using short time durations (less than a minute). Typical vesting schemes, with a
    // cliff period of a year and a duration of four years, are safe to use.

    // version
    bytes32 constant public VERSION = bytes32("1.2.0");

    event TokensReleased(address token, uint256 amount);
    event TokenVestingRevoked(address token);
    event TokenVestingReinstated(address token);

    // beneficiary of tokens after they are released
    address private _beneficiary;

    // Durations and timestamps are expressed in UNIX time, the same units as block.timestamp.
    uint256 private _cliff;
    uint256 private _start;
    uint256 private _duration;
    uint256 private _startPortfolioDeposits;
    uint256 private _period;

    bool private _revocable;

    IPortfolio private _portfolio;
    uint256 private _totalSupplyBeforeRevoke;
    uint256 private _firstReleasePercentage;
    mapping(address => uint256) private _releasedPercentage;

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
     * @oaran __startPortfolioDeposits
     * @param __revocable whether the vesting contract is revocable or not
     * @param __firstReleasePercentage
     * @param __period length of claim period that allows one to withdraw in discrete periods. i.e. (60 x 60 x 24) x 30 will
     *                 allow the beneficiary to claim every 30 days, 0 for no period restrictions
     * @param __portfolio
     */
    constructor(
        address __beneficiary,
        uint256 __start,
        uint256 __cliffDuration,
        uint256 __duration,
        uint256 __startPortfolioDeposits,
        bool __revocable,
        uint256 __firstReleasePercentage,
        uint256 __period,
        address __portfolio
    ) {
        require(__beneficiary != address(0), "TV-BIZA-01");
        require(__cliffDuration <= __duration, "TV-CLTD-01");
        require(__duration > 0, "TV-DISZ-01");
        require(__start + __duration > block.timestamp, "TV-FTBC-01");
        require(__startPortfolioDeposits < __start, "TV-PDBS-01");
        require(__firstReleasePercentage <= 100, "TV-PGTZ-01");
        require(__portfolio != address(0), "TV-PIZA-01");

        _beneficiary = __beneficiary;
        _revocable = __revocable;
        _duration = __duration;
        _cliff = __start + __cliffDuration;
        _start = __start;
        _startPortfolioDeposits = __startPortfolioDeposits;
        _firstReleasePercentage = __firstReleasePercentage;
        _period = __period;
        _portfolio = IPortfolio(__portfolio);
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
     * @return the start time for depositing to portfolio.
     */
    function startPortfolioDeposits() external view returns (uint256) {
        return _startPortfolioDeposits;
    }

    /**
     * @return true if the vesting is revocable.
     */
    function revocable() external view returns (bool) {
        return _revocable;
    }

    /**
     * @return the duration in seconds for claim periods.
     */
    function period() external view returns (uint256) {
        return _period;
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
        require(percentage <= 100, "TV-PGTZ-02");
        _firstReleasePercentage = percentage;
    }

    /*
     * set starting time for depositing to portfolio
     */
    function setStartPortfolioDeposits(uint256 time) external onlyOwner {
        _startPortfolioDeposits = time;
    }

    /*
     * @return true if the vesting is funded to the portfolio.
     * beneficiary check is not for access control, it is just for convenience in frontend
     */
    function canFundWallet(IERC20Metadata token, address __beneficiary) public view returns (bool) {
        return
            __beneficiary == _beneficiary &&
            block.timestamp > _start &&
            (_vestedByPercentage(token) > _releasedPercentage[address(token)] || block.timestamp > _cliff);
    }

    /*
     * @return true if the vesting is funded to the portfolio.
     * beneficiary check is not for access control, it is just for convenience in frontend
     */
    function canFundPortfolio(address __beneficiary) public view returns (bool) {
        return
            __beneficiary == _beneficiary &&
            block.timestamp > _startPortfolioDeposits &&
            block.timestamp < _start;
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
    function setPortfolio(address portfolio) external onlyOwner {
        require(portfolio != address(0), "TV-PIZA-02");
        _portfolio = IPortfolio(portfolio);
    }

    /**
     * @notice Transfers vested tokens to beneficiary.
     * @param token ERC20 token which is being vested
     */
    function release(IERC20Metadata token) external nonReentrant {
        require(token.balanceOf(address(this)) > 0, "TV-NBOC-01");
        require(block.timestamp > _start, "TV-TEAR-01");

        uint256 unreleased = _releasableAmount(token);
        require(unreleased > 0, "TV-NTAD-01");

        if (_releasedPercentage[address(token)] == 0) {
            _releasedPercentage[address(token)] = _vestedByPercentage(token);
        }

        _released[address(token)] = _released[address(token)] + unreleased;

        emit TokensReleased(address(token), unreleased);

        token.safeTransfer(_beneficiary, unreleased);
    }

    /**
     * @notice Transfers vested tokens to Portfolio.
     * @param token ERC20 token which is being vested
     */
    function releaseToPortfolio(IERC20Metadata token) external nonReentrant {
        require(canFundPortfolio(_beneficiary), "TV-OPDA-01");

        uint256 unreleased = _releasableAmount(token);
        require(unreleased > 0, "TV-NTAD-02");

        if (_releasedPercentage[address(token)] == 0) {
            string memory symbolStr = IERC20Metadata(token).symbol();
            bytes32 symbol = stringToBytes32(symbolStr);

            _releasedPercentage[address(token)] = _vestedByPercentage(token);

            _released[address(token)] = _released[address(token)] + unreleased;

            emit TokensReleased(address(token), unreleased);

            token.safeTransfer(_beneficiary, unreleased);

            _portfolio.depositTokenFromContract(
                _beneficiary,
                symbol,
                unreleased
            );
        }
    }

    /**
     * @notice Allows the owner to revoke the vesting. Tokens already vested
     * remain in the contract, the rest are returned to the owner.
     * @param token ERC20 token which is being vested
     */
    function revoke(IERC20Metadata token) external onlyOwner {
        require(_revocable, "TV-CNTR-01");
        require(!_revoked[address(token)], "TV-TKAR-01");

        uint256 balance = token.balanceOf(address(this));
        _totalSupplyBeforeRevoke = balance + _released[address(token)];

        uint256 unreleased = _releasableAmount(token);
        uint256 refund = balance - unreleased;

        _revoked[address(token)] = true;

        emit TokenVestingRevoked(address(token));

        token.safeTransfer(owner(), refund);
    }

    /**
     * @notice Allows the owner to reinstate the vesting.
     * @param token ERC20 token which is being vested
     */
    function reinstate(IERC20Metadata token) external onlyOwner {
        require(_revoked[address(token)], "TV-TKNR-01");

        _revoked[address(token)] = false;

        emit TokenVestingReinstated(address(token));
    }

    /**
     * @dev Calculates the amount that has already vested but hasn't been released yet.
     * @param token ERC20 token which is being vested
     */
    function _releasableAmount(IERC20Metadata token) private view returns (uint256) {
        return
            (_vestedAmount(token) + _vestedByPercentage(token)) -
            _released[address(token)];
    }

    /**
     * @dev Returns the amount for the amount remaining after the initial percentage vested at TGE.
     * @param token ERC20 token which is being vested
     */
    function vestedAmount(IERC20Metadata token) external view returns (uint256) {
        return _vestedAmount(token);
    }

    /**
     * @dev Returns the amount that has been released based on the initial percentage vested at TGE.
     * @param token ERC20 token which is being vested
     */
    function releasedPercentageAmount(IERC20Metadata token) external view returns (uint256) {
        return _releasedPercentage[address(token)];
    }

    /**
     * @dev Returns the amount that is releaseable based on the initial percentage vested  at TGE.
     * @param token ERC20 token which is being vested
     */
    function vestedPercentageAmount(IERC20Metadata token) external view returns (uint256) {
        return _vestedByPercentage(token);
    }

    /**
     * @dev Calculates the amount that has already vested.
     * Subtracts the amount calculated by percentage.
     * Starts calculating of vested amount after the time of cliff.
     * @param token ERC20 token which is being vested
     */
    function _vestedAmount(IERC20Metadata token) private view returns (uint256) {
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 totalBalance = (currentBalance + _released[address(token)]) -
            _vestedByPercentage(token);

        if (block.timestamp < _cliff) {
            return 0;
        } else if (
            block.timestamp >= _start + _duration || _revoked[address(token)]
        ) {
            return totalBalance;
        } else {
            if (_period > 0) {
                return totalBalance * ((block.timestamp - _cliff) / _period) / ((_start + _duration - _cliff) / _period);
            } else {
                return (totalBalance * (block.timestamp - _cliff)) / (_start + _duration - _cliff);
            }
        }
    }

    /**
     * @dev Calculates the amount vested at TGE.
     * @param token ERC20 token which is being vested
     */
    function _vestedByPercentage(IERC20Metadata token) private view returns (uint256) {
        if (block.timestamp < _startPortfolioDeposits) {
            return 0;
        } else {
            uint256 currentBalance = token.balanceOf(address(this));
            uint256 totalBalance = _revoked[address(token)] ? _totalSupplyBeforeRevoke : currentBalance + _released[address(token)];
            uint256 percentage = (totalBalance * _firstReleasePercentage) / 100;

            return percentage;
        }
    }

    // utility function to convert string to bytes32
    function stringToBytes32(string memory _string) public pure returns (bytes32 result) {
        return _string.stringToBytes32();
    }
}
