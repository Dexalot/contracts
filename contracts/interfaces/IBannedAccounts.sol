// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title Interface of BannedAccounts
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IBannedAccounts {
    // extensible enum to hold reasons for ban
    // OFAC  = address appearing in US GOV OFAC SDN list at https://sanctionssearch.ofac.treas.gov
    // ABUSE = address exhibiting abusive use of Dexalot resources
    // TERMS = address violating Dexalot Terms & Conditions
    enum BanReason {
        NOTBANNED,
        OFAC,
        ABUSE,
        TERMS
    }

    function isBanned(address _account) external view returns (bool);

    function getBanReason(address _account) external view returns (BanReason);
}
