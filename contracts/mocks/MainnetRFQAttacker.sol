// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../MainnetRFQ.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MainnetRFQAttacker {
    enum Function {
        SIMPLE_SWAP,
        CLAIM,
        BATCH_CLAIM
    }
    MainnetRFQ private mainnetRFQ;
    Function private functionToAttack;
    bytes private params;

    constructor(address payable _address) {
        mainnetRFQ = MainnetRFQ(_address);
    }

    function attackSimpleSwap(MainnetRFQ.Order calldata order, bytes calldata signature) external payable {
        functionToAttack = Function.SIMPLE_SWAP;
        params = abi.encode(order, signature);
        IERC20(order.takerAsset).transferFrom(msg.sender, address(this), order.takerAmount);
        IERC20(order.takerAsset).approve(address(mainnetRFQ), order.takerAmount);
        mainnetRFQ.simpleSwap(order, signature);
    }

    function attackClaimBalance(address _asset, uint256 _amount) external payable {
        functionToAttack = Function.CLAIM;
        params = abi.encode(_asset, _amount);
        mainnetRFQ.claimBalance(_asset, _amount);
    }

    function attackBatchClaimBalance(address[] calldata _assets, uint256[] calldata _amounts) external payable {
        functionToAttack = Function.BATCH_CLAIM;
        params = abi.encode(_assets, _amounts);
        mainnetRFQ.batchClaimBalance(_assets, _amounts);
    }

    receive() external payable {
        if (functionToAttack == Function.SIMPLE_SWAP) {
            (MainnetRFQ.Order memory order, bytes memory signature) = abi.decode(params, (MainnetRFQ.Order, bytes));
            mainnetRFQ.simpleSwap(order, signature);
        } else if (functionToAttack == Function.CLAIM) {
            (address _asset, uint256 _amount) = abi.decode(params, (address, uint256));
            mainnetRFQ.claimBalance(_asset, _amount);
        } else if (functionToAttack == Function.BATCH_CLAIM) {
            (address[] memory _assets, uint256[] memory _amounts) = abi.decode(params, (address[], uint256[]));
            mainnetRFQ.batchClaimBalance(_assets, _amounts);
        }
    }
}
