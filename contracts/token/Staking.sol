// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "Staking: a flexible staking contract"
*/

contract Staking is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // version
    bytes32 constant public VERSION = bytes32("1.1.1");

    IERC20Upgradeable public rewardsToken;
    IERC20Upgradeable public stakingToken;

    // constants
    uint256 constant MULTIPLIER = 1e18;
    uint256 constant TENK = 1e4;
    uint256 constant SECONDSINYEAR = 365 days; // 60 * 60 * 24 * 365

    uint256 public periodFinish;      // end of current period in unix time
    uint256 public rewardsDuration;   // duration of current period in seconds
    uint256 public rewardRate;        // numerator for reward rate % to be used with a denominator of 10000, 10% = 1000/10000
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    bool public isStakingPaused;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalStake;
    mapping(address => uint256) private _stakes;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Restaked(address indexed user, uint256 reward);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardRateUpdated(uint256 rate);
    event RewardsDurationUpdated(uint256 rewardsDuration);
    event FundsRecovered(uint256 amount, address token);

    function initialize(address _stakingToken, address _rewardsToken, uint256 _rewardRate, uint256 _rewardsDuration) public initializer {
        __Ownable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        stakingToken = IERC20Upgradeable(_stakingToken);
        rewardsToken = IERC20Upgradeable(_rewardsToken);
        rewardsDuration = _rewardsDuration;
        rewardRate = _rewardRate;
        periodFinish = block.timestamp + _rewardsDuration;
    }

    function totalStake() external view returns (uint256) {
        return _totalStake;
    }

    function stakeOf(address account) external view returns (uint256) {
        return _stakes[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalStake == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored + (((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * MULTIPLIER / SECONDSINYEAR) / TENK);
    }

    function earned(address account) public view returns (uint256) {
        return
            (((_stakes[account] * (rewardPerToken() - userRewardPerTokenPaid[account]))) / MULTIPLIER) + rewards[account];
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
        require(amount > 0, "S-CNSZ-01");
        require(!isStakingPaused, "S-SHBP-01");
        require(block.timestamp < periodFinish,"S-PHBE-01");

        _totalStake += amount;
        _stakes[msg.sender] += amount;

        emit Staked(msg.sender, amount);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function unstake(uint256 amount)
        public
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        require(amount > 0, "S-CNWZ-01");
        require(_stakes[msg.sender] >= amount, "S-CNWM-01");

        _totalStake -= amount;
        _stakes[msg.sender] -= amount;

        emit Withdrawn(msg.sender, amount);

        stakingToken.safeTransfer(msg.sender, amount);
    }

    function restake()
        public
        whenNotPaused
        nonReentrant
        updateReward(msg.sender)
    {
        require(!isStakingPaused, "S-SHBP-02");

        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;

            emit Restaked(msg.sender, reward);

            _totalStake += reward;
            _stakes[msg.sender] += reward;
        }
    }

    function claim()
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

    function exit(uint256 amount) external {
        unstake(amount);
        claim();
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

    function setRewardRate(uint256 _rewardRate) external onlyOwner {
        require(_rewardRate > 0, "S-RCNZ-01");

        rewardRate = _rewardRate;

        emit RewardRateUpdated(_rewardRate);
    }

    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        require(block.timestamp > periodFinish, "S-DMBC-01");

        periodFinish = block.timestamp + _rewardsDuration;

        emit RewardsDurationUpdated(_rewardsDuration);
    }

    function recoverFunds() external onlyOwner {
        isStakingPaused = true;

        uint256 balanceStaking = stakingToken.balanceOf(address(this));

        // only recover the remainder of the funds sent to the staking contract for the rewards
        // leave totalStake so people can unstake themselves
        stakingToken.safeTransfer(msg.sender, balanceStaking - _totalStake);

        emit FundsRecovered(balanceStaking, address(stakingToken));
    }
}
