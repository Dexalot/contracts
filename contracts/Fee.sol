// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "The Fee contract to accumulate the fees collected from trade executions."
*/

contract Fee is Initializable, AccessControlEnumerableUpgradeable, ReentrancyGuardUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using SafeERC20 for IERC20;

    // version
    bytes32 constant public VERSION = bytes32('0.9.1');

    // Create a new role identifier for the beneficiary role
    bytes32 constant public BENEFICIARY_ROLE = keccak256("BENEFICIARY_ROLE");

    // bytes32 variable to hold native token of DEXALOT
    bytes32 constant public native = bytes32('AVAX');

    // bytes32 array of all ERC20 tokens traded on DEXALOT
    EnumerableSetUpgradeable.Bytes32Set private tokenList;

    // total shares
    uint public totalShare;

    // bytes32 symbols to ERC20 token map
    mapping (bytes32 => IERC20) private tokenMap;

    // map for numerator for share percentages
    mapping (address => uint) private share;

    // total witdrawn by all users mapped to asset
    mapping (bytes32 => uint) private totalWithdrawn;

    // starting total for a specific user mapped to user and asset
    mapping (address => mapping (bytes32 => uint)) private userTotalStart;

    // total withdrawn by a specific user mapped to user and asset
    mapping (address => mapping (bytes32 => uint)) private userWithdrawn;

    event Distributed(address _beneficiary, uint _distribution, uint _share, bytes32 _token);

    enum Action {ADDED, REMOVED}

    function initialize() public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();

        // intitialize the admins
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // set deployment account to have DEFAULT_ADMIN_ROLE
    }

    function owner() public view returns(address) {
        return getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }

    function addToken(bytes32 _symbol, IERC20 _token) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "F-OACC-01");
        if (!tokenList.contains(_symbol)) {
            tokenList.add(_symbol);
            tokenMap[_symbol] = _token;
        }
    }

    function getTokenList() public view returns(bytes32[] memory) {
        uint tokenCount = tokenList.length();
        bytes32[] memory tokens = new bytes32[](tokenCount);
        for (uint i=0; i<tokenCount; i++) {
            tokens[i] = tokenList.at(i);
        }
        return tokens;
    }

    function addAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "F-OACC-02");
        grantRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function removeAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "F-OACC-03");
        require(getRoleMemberCount(DEFAULT_ADMIN_ROLE)>1, "F-ALOA-01");
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function isAdmin(address _address) public view returns(bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function addBeneficiary(address _address, uint _share) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "F-OACC-04");
        require(_address != address(0), "F-ZANA-01");
        share[_address] = _share;
        totalShare += _share;
        userTotalStart[_address][native] = address(this).balance;
        uint tokenCount = tokenList.length();
        for (uint j= 0; j < tokenCount; j++) {
            bytes32 _token = tokenList.at(j);
            userTotalStart[_address][_token] = tokenMap[_token].balanceOf(_address);
        }
        grantRole(BENEFICIARY_ROLE, _address);
    }

    function removeBeneficiary(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "F-OACC-05");
        require(address(this).balance == 0, "F-BBNZ-01");
        totalShare -= share[_address];
        delete share[_address];
        revokeRole(BENEFICIARY_ROLE, _address);
    }

    function isBeneficiary(address _address) public view returns(bool) {
        return hasRole(BENEFICIARY_ROLE, _address);
    }

    function withdraw() public nonReentrant {
        require(hasRole(BENEFICIARY_ROLE, msg.sender), "F-OBCC-01");
        // withdraw the native coin (only one native coin on EVM)
        withdrawNative(msg.sender);
        // withdraw the ERC20 tokens
        withdrawTokens(msg.sender);
    }

    function withdrawNative(address _owner) private {
        bool success;
        uint _payout = address(this).balance + totalWithdrawn[native] - userTotalStart[_owner][native];
        if (_payout>0) {
            uint _distribution = ((_payout * share[_owner]) / totalShare) - userWithdrawn[_owner][native];
            userWithdrawn[_owner][native] += _distribution;
            totalWithdrawn[native] += _distribution;
            (success, ) = payable(_owner).call{value: _distribution}('');
            require(success, "F-NWFA-01");
            emit Distributed(_owner, _distribution, share[_owner], native);
        }
    }

    function withdrawTokens(address _owner) private {
        uint tokenCount = tokenList.length();
        for (uint j=0; j<tokenCount; j++) {
            bytes32 _token = tokenList.at(j);
            uint _payout = tokenMap[_token].balanceOf(address(this)) + totalWithdrawn[_token] - userTotalStart[_owner][_token];
            if (_payout>0) {
                uint _distribution = ((_payout * share[_owner]) / totalShare) - userWithdrawn[_owner][_token];
                userWithdrawn[_owner][_token] += _distribution;
                totalWithdrawn[_token] += _distribution;
                tokenMap[_token].safeTransfer(_owner, _distribution);
                emit Distributed(_owner, _distribution, share[_owner], _token);
            }
        }
    }

    function getBalance(bytes32 _symbol) public view returns (uint bal) {
            require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "F-OACC-06");
            if (native == _symbol) {
                bal = address(this).balance;
            }
            if (tokenList.contains(_symbol)) {
                bal = tokenMap[_symbol].balanceOf(address(this));
            }
            return bal;
    }

    function getUserBalance(bytes32 _symbol) public view returns (uint) {
            require(isBeneficiary(msg.sender), "F-OBCC-02");
            uint _payout;
            if (native == _symbol) {
                _payout = address(this).balance + totalWithdrawn[native] - userTotalStart[msg.sender][native];
            }
            if (tokenList.contains(_symbol)) {
                _payout = tokenMap[_symbol].balanceOf(address(this)) + totalWithdrawn[_symbol] - userTotalStart[msg.sender][_symbol];
            }
           return ((_payout * share[msg.sender]) / totalShare) - userWithdrawn[msg.sender][_symbol];
    }

    // collect fees under this contract's balance
    receive() external payable {
    }

    // we revert transaction if a non-existing function is called
    fallback() external {
    }

}
