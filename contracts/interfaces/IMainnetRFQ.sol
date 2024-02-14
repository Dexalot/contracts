// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;
import "./IPortfolio.sol";

/**
 * @title Interface of MainnetRFQ
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IMainnetRFQ {
    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolio.Tx _transaction,
        bytes28 _customdata
    ) external;

    function pause() external;

    function unpause() external;

    receive() external payable;
}
