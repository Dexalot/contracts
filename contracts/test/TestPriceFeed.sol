// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.8.3;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/*
 * Test contract to emulate AggregatorV3Interface to be able to test price feed in Exchange
 */

contract TestPriceFeed is AggregatorV3Interface {

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function description() external pure returns (string memory) {
        return "Price Feed Test";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
    public
    pure
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
        roundId = _roundId;
        answer = 7504070821;
        startedAt = 1646589377;
        updatedAt = 1646589377;
        answeredInRound = 36893488147419156216;
    }

  function latestRoundData()
    external
    pure
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
        return getRoundData(36893488147419156216);
    }

}
