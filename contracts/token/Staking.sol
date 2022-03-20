// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract Staking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // version
    bytes32 constant public VERSION = bytes32("1.0.0");

    IERC20 public rewardsToken;
    IERC20 public stakingToken;

    // constants
    uint256 constant MULTIPLIER = 1e18;
    uint256 constant TENK = 1e4;
    uint256 constant SECONDSINYEAR = 365 days; // 60 * 60 * 24 * 365

    uint256 public periodFinish = 0;
    uint256 public rewardsDuration;
    uint256 public rewardRate = 1000; // numerator for reward rate % to be used with a denominator of 10000, 10% = 1000/10000
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    bool public isStakingPaused;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardRateUpdated(uint256 rate);
    event RewardsDurationUpdated(uint256 rewardsDuration);
    event FundsRecovered(uint256 amount, address token);

    constructor(address _stakingToken, address _rewardsToken, uint256 _rewardsDuration) {
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
        rewardsDuration = _rewardsDuration;
        periodFinish = block.timestamp + rewardsDuration;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored + (((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * MULTIPLIER / SECONDSINYEAR) / TENK);
    }

    function earned(address account) public view returns (uint256) {
        return
            (((_balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account]))) / MULTIPLIER) + rewards[account];
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;

        _;
    }

    function stake(uint256 amount)
        external
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        require(amount > 0, "Staking: Cannot stake 0");
        require(!isStakingPaused, "Staking: Staking has been paused");
        require(
            block.timestamp < periodFinish,
            "Staking: period has been ended"
        );

        _totalSupply += amount;
        _balances[msg.sender] += amount;

        emit Staked(msg.sender, amount);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount)
        public
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        require(amount > 0, "Staking: Cannot withdraw 0");

        _totalSupply -= amount;
        _balances[msg.sender] -= amount;

        emit Withdrawn(msg.sender, amount);

        stakingToken.safeTransfer(msg.sender, amount);
    }

    function getReward()
        public
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;

            emit RewardPaid(msg.sender, reward);

            rewardsToken.safeTransfer(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function pauseStaking() external onlyOwner {
        isStakingPaused = true;
    }

    function unpauseStaking() external onlyOwner {
        isStakingPaused = false;
    }

    function setRewardRate(uint256 newRewardRate) external onlyOwner {
        require(newRewardRate > 0, "Staking: RewardRate cannot be zero");
        rewardRate = newRewardRate;

        emit RewardRateUpdated(rewardRate);
    }

    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        require(
           block.timestamp > periodFinish,
            "Staking: Previous rewards period must be complete before changing the duration for the new period"
        );

        periodFinish = block.timestamp + _rewardsDuration;

        emit RewardsDurationUpdated(_rewardsDuration);
    }

    function recoverFunds(address to) external onlyOwner {
        uint256 balanceRewards = rewardsToken.balanceOf(address(this));
        rewardsToken.safeTransfer(to, balanceRewards);

        emit FundsRecovered(balanceRewards, address(rewardsToken));

        uint256 balanceStaking = stakingToken.balanceOf(address(this));
        stakingToken.safeTransfer(to, balanceStaking);

        emit FundsRecovered(balanceStaking, address(stakingToken));
    }
}
