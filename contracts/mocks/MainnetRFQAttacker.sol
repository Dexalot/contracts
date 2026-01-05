// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../MainnetRFQ.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPortfolio.sol";
import "../library/UtilsLibrary.sol";

contract MainnetRFQAttacker {
    enum Function {
        SIMPLE_SWAP,
        MULTI_SWAP,
        CLAIM,
        BATCH_CLAIM,
        PROCESS_XFER_PAYLOAD,
        REMOVE_FROM_SWAP_QUEUE
    }
    MainnetRFQ private mainnetRFQ;
    MainnetRFQ private forwarderAsMainnetRFQ;
    Function private functionToAttack;
    bytes private params;

    constructor(address payable _address, address payable _forwarder) {
        mainnetRFQ = MainnetRFQ(_address);
        forwarderAsMainnetRFQ = MainnetRFQ(_forwarder);
    }

    function attackSimpleSwap(MainnetRFQ.Order calldata order, bytes calldata signature) external payable {
        functionToAttack = Function.SIMPLE_SWAP;
        params = abi.encode(order, signature);
        IERC20(order.takerAsset).transferFrom(msg.sender, address(this), order.takerAmount);
        IERC20(order.takerAsset).approve(address(forwarderAsMainnetRFQ), order.takerAmount);
        forwarderAsMainnetRFQ.simpleSwap(order, signature);
    }

    function attackPartialSwap(MainnetRFQ.Order calldata order, bytes calldata signature) external payable {
        functionToAttack = Function.MULTI_SWAP;
        params = abi.encode(order, signature);
        IERC20(order.takerAsset).transferFrom(msg.sender, address(this), order.takerAmount);
        IERC20(order.takerAsset).approve(address(forwarderAsMainnetRFQ), order.takerAmount);
        forwarderAsMainnetRFQ.partialSwap(order, signature, order.takerAmount);
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

    function attackProcessXFerPayload(
        bytes32 _trader,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolio.Tx _transaction,
        bytes18 _customdata
    ) external payable {
        functionToAttack = Function.PROCESS_XFER_PAYLOAD;
        params = abi.encode(_trader, _symbol, _quantity, _transaction, _customdata);
        IPortfolio.XFER memory xfer = IPortfolio.XFER(0, _transaction, _trader, _symbol, _quantity, 0, _customdata);
        mainnetRFQ.processXFerPayload(xfer);
    }

    function attackRemoveFromSwapQueue(uint256 _nonceAndMeta) external payable {
        functionToAttack = Function.REMOVE_FROM_SWAP_QUEUE;
        params = abi.encode(_nonceAndMeta);
        mainnetRFQ.removeFromSwapQueue(_nonceAndMeta);
    }

    receive() external payable {
        if (functionToAttack == Function.SIMPLE_SWAP) {
            (MainnetRFQ.Order memory order, bytes memory signature) = abi.decode(params, (MainnetRFQ.Order, bytes));
            forwarderAsMainnetRFQ.simpleSwap(order, signature);
        } else if (functionToAttack == Function.MULTI_SWAP) {
            (MainnetRFQ.Order memory order, bytes memory signature) = abi.decode(params, (MainnetRFQ.Order, bytes));
            forwarderAsMainnetRFQ.partialSwap(order, signature, order.takerAmount);
        } else if (functionToAttack == Function.CLAIM) {
            (address _asset, uint256 _amount) = abi.decode(params, (address, uint256));
            mainnetRFQ.claimBalance(_asset, _amount);
        } else if (functionToAttack == Function.BATCH_CLAIM) {
            (address[] memory _assets, uint256[] memory _amounts) = abi.decode(params, (address[], uint256[]));
            mainnetRFQ.batchClaimBalance(_assets, _amounts);
        } else if (functionToAttack == Function.PROCESS_XFER_PAYLOAD) {
            (bytes32 _trader, bytes32 _symbol, uint256 _quantity, IPortfolio.Tx _transaction, bytes18 _customdata) = abi
                .decode(params, (bytes32, bytes32, uint256, IPortfolio.Tx, bytes18));
            IPortfolio.XFER memory xfer = IPortfolio.XFER(0, _transaction, _trader, _symbol, _quantity, 0, _customdata);
            mainnetRFQ.processXFerPayload(xfer);
        } else if (functionToAttack == Function.REMOVE_FROM_SWAP_QUEUE) {
            uint256 _nonceAndMeta = abi.decode(params, (uint256));
            mainnetRFQ.removeFromSwapQueue(_nonceAndMeta);
        }
    }
}
