// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

import "../bridgeApps/LzV2App.sol";
import "../interfaces/IPortfolioBridge.sol";

contract CelerMock is LzV2App {
    constructor(address _endpoint, address _owner) LzV2App(_endpoint, _owner) {}

    function getBridgeProvider() public pure override returns (IPortfolioBridge.BridgeProvider) {
        return IPortfolioBridge.BridgeProvider.CELER;
    }
}
