// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "MockToken: a pausable Mock ERC20 Token contract used for DEXALOT testing."
*/

contract MockToken is ERC20 {
   using SafeERC20 for IERC20;

   // version
    bytes32 constant public VERSION = bytes32("0.9.1");

    uint8 __decimals;

   /**
   * @dev assign totalSupply to account creating this contract
   */
   constructor(string memory _name, string memory _symbol, uint8 _decimals) ERC20(_name, _symbol) {
      __decimals = _decimals;
   }

   function decimals() public view override returns(uint8) {
      return __decimals;
   }

   function mint(address _owner, uint _quantity) public {
      super._mint(_owner, _quantity);
   }

 }
