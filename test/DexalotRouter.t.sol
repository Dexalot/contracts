// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import "../contracts/DexalotRouter.sol";
import "../contracts/interfaces/IMainnetRFQ.sol";
import "../contracts/mocks/MockToken.sol";

interface IMockMainnetRFQ is IMainnetRFQ {
    function initialize(address _swapSigner) external;

    function setTrustedForwarder(address _trustedForwarder) external;

    function hasRole(bytes32 role, address account) external view returns (bool);

    struct Order {
        uint256 nonceAndMeta;
        uint128 expiry;
        address makerAsset;
        address takerAsset;
        address maker;
        address taker;
        uint256 makerAmount;
        uint256 takerAmount;
    }
}

contract DexalotRouterTest is Test {
    DexalotRouter router;
    IMockMainnetRFQ rfq;

    address owner = address(0xABCD);
    uint256 signerPrivateKey = 0x1234;
    address swapSigner;
    address trader1 = address(0xBEEF);

    MockToken mockUSDC;
    MockToken mockALOT;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 nonceAndMeta,uint128 expiry,address makerAsset,address takerAsset,address maker,address taker,uint256 makerAmount,uint256 takerAmount)"
        );
    // partialSwap(tuple,bytes,uint256) -> keccak256("partialSwap((uint256,uint128,address,address,address,address,uint256,uint256),bytes,uint256)")
    bytes4 private constant PARTIAL_SWAP_SELECTOR = 0x944bda00;
    // simpleSwap(tuple,bytes) -> keccak256("simpleSwap((uint256,uint128,address,address,address,address,uint256,uint256),bytes)")
    bytes4 private constant SIMPLE_SWAP_SELECTOR = 0x6c75d6f5;

    bytes private constant NOT_ADMIN_ROLE =
        "AccessControl: account 0x000000000000000000000000000000000000beef is missing role 0x0000000000000000000000000000000000000000000000000000000000000000";

    function setUp() public {
        vm.startPrank(owner);
        router = new DexalotRouter(owner);

        bytes memory bytecode = vm.getCode("contracts/MainnetRFQ.sol:MainnetRFQ");

        address payable deployedAddress;
        assembly {
            deployedAddress := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        swapSigner = vm.addr(signerPrivateKey);
        rfq = IMockMainnetRFQ(deployedAddress);
        rfq.initialize(swapSigner);
        rfq.setTrustedForwarder(address(router));
        router.setAllowedRFQ(address(rfq), true);

        mockUSDC = new MockToken("USD Coin", "USDC", 6);
        mockALOT = new MockToken("Dexalot Token", "ALOT", 18);

        mockUSDC.mint(address(rfq), 1000e6);
        mockALOT.mint(address(rfq), 1000e18);

        mockUSDC.mint(trader1, 1000e6);
        mockALOT.mint(trader1, 1000e18);
        vm.deal(address(rfq), 10 ether);
        vm.deal(trader1, 10 ether);
        vm.stopPrank();
    }

    function test_setAllowedRFQ_Addition() public {
        vm.expectEmit();
        emit DexalotRouter.AllowedRFQUpdated(address(rfq), true);

        vm.prank(owner);
        router.setAllowedRFQ(address(rfq), true);

        assertTrue(router.isAllowedRFQ(address(rfq)));
    }

    function test_setAllowedRFQ_Removal() public {
        vm.expectEmit();
        emit DexalotRouter.AllowedRFQUpdated(address(rfq), false);

        vm.prank(owner);
        router.setAllowedRFQ(address(rfq), false);

        assertFalse(router.isAllowedRFQ(address(rfq)));
    }

    function test_setAllowedRFQ_RevertIf_CallerIsNotAdmin() public {
        vm.prank(trader1);
        vm.expectRevert(NOT_ADMIN_ROLE);
        router.setAllowedRFQ(address(rfq), false);
    }

    function test_setAllowedRFQ_RevertIf_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("DR-SAZ-01");
        router.setAllowedRFQ(address(0), false);
    }

    function test_retrieveToken_RevertIf_CallerIsNotAdmin() public {
        vm.startPrank(trader1);
        uint256 amount = 100e6;
        mockUSDC.transfer(address(router), amount);
        vm.expectRevert(NOT_ADMIN_ROLE);
        router.retrieveToken(address(mockUSDC), amount);
        vm.stopPrank();
    }

    function test_retrieveToken_ERC20(uint256 retrievalAmount) public {
        uint256 inputAmount = 100e6;
        vm.assume(retrievalAmount <= inputAmount);
        vm.prank(trader1);
        mockUSDC.transfer(address(router), inputAmount);

        vm.prank(owner);
        router.retrieveToken(address(mockUSDC), retrievalAmount);
        assertEq(mockUSDC.balanceOf(owner), retrievalAmount);
        assertEq(mockUSDC.balanceOf(address(router)), inputAmount - retrievalAmount);
    }

    function test_retrieveToken_Native(uint256 retrievalAmount) public {
        uint256 inputAmount = 1 ether;
        vm.assume(retrievalAmount <= inputAmount);
        vm.prank(trader1);
        (bool success, ) = address(router).call{value: inputAmount}("");
        require(success, "Failed to send native to router");

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        router.retrieveToken(address(0), retrievalAmount);
        assertEq(owner.balance, ownerBalanceBefore + retrievalAmount);
        assertEq(address(router).balance, inputAmount - retrievalAmount);
    }

    function test_retrieveToken_RevertIf_InsufficientNative(uint256 amount) public {
        vm.assume(amount > 0);
        vm.prank(owner);
        vm.expectRevert("DR-TF-01");
        router.retrieveToken(address(0), amount);
    }

    function test_retrieveToken_RevertIf_InsufficientERC20(uint256 amount) public {
        vm.assume(amount > 1000e6);
        vm.prank(owner);
        vm.expectRevert("ERC20: transfer amount exceeds balance");
        router.retrieveToken(address(mockUSDC), amount);
    }

    function test_fallback_RevertIf_InvalidFunctionSelector(bytes4 selector) public {
        vm.assume(selector != PARTIAL_SWAP_SELECTOR && selector != SIMPLE_SWAP_SELECTOR);
        vm.expectRevert("DR-FSNW-01");
        (bool success, ) = address(router).call(abi.encode(bytes28(0), selector));
        require(success);
    }

    function test_simpleSwap_ERC20ToERC20(uint256 makerAmount, uint256 takerAmount, uint256 nativeAmount) public {
        vm.assume(makerAmount > 0 && makerAmount <= 1000e18);
        vm.assume(takerAmount > 0 && takerAmount <= 1000e6);
        vm.assume(nativeAmount <= 1 ether);
        (IMockMainnetRFQ.Order memory order, bytes memory signature) = _getSignedOrder(
            address(mockALOT),
            address(mockUSDC),
            makerAmount,
            takerAmount,
            trader1,
            trader1
        );

        uint256 traderUsdcBefore = mockUSDC.balanceOf(trader1);
        uint256 rfqUsdcBefore = mockUSDC.balanceOf(address(rfq));
        uint256 traderAlotBefore = mockALOT.balanceOf(trader1);
        uint256 rfqAlotBefore = mockALOT.balanceOf(address(rfq));

        // Execute swap via router fallback
        vm.startPrank(trader1);
        mockUSDC.approve(address(router), takerAmount);
        (bool success, ) = address(router).call{value: nativeAmount}(
            abi.encodeWithSelector(SIMPLE_SWAP_SELECTOR, order, signature)
        );
        require(success);
        vm.stopPrank();

        assertEq(mockUSDC.balanceOf(trader1), traderUsdcBefore - takerAmount, "Trader USDC balance incorrect");
        assertEq(mockALOT.balanceOf(trader1), traderAlotBefore + makerAmount, "Trader ALOT balance incorrect");
        assertEq(mockUSDC.balanceOf(address(rfq)), rfqUsdcBefore + takerAmount, "RFQ USDC balance incorrect");
        assertEq(mockALOT.balanceOf(address(rfq)), rfqAlotBefore - makerAmount, "RFQ ALOT balance incorrect");
    }

    function test_simpleSwap_ERC20ToNative(uint256 makerAmount, uint256 takerAmount, uint256 nativeAmount) public {
        vm.assume(makerAmount > 0 && makerAmount <= 1 ether);
        vm.assume(takerAmount > 0 && takerAmount <= 1000e6);
        vm.assume(nativeAmount <= 1 ether);
        (IMockMainnetRFQ.Order memory order, bytes memory signature) = _getSignedOrder(
            address(0),
            address(mockUSDC),
            makerAmount,
            takerAmount,
            trader1,
            trader1
        );

        uint256 traderUsdcBefore = mockUSDC.balanceOf(trader1);
        uint256 rfqUsdcBefore = mockUSDC.balanceOf(address(rfq));
        uint256 traderNativeBefore = trader1.balance;
        uint256 rfqNativeBefore = address(rfq).balance;

        // Execute swap via router fallback
        vm.startPrank(trader1);
        mockUSDC.approve(address(router), takerAmount);
        (bool success, ) = address(router).call{value: nativeAmount}(
            abi.encodeWithSelector(SIMPLE_SWAP_SELECTOR, order, signature)
        );
        require(success);
        vm.stopPrank();

        assertEq(mockUSDC.balanceOf(trader1), traderUsdcBefore - takerAmount, "Trader USDC balance incorrect");
        assertEq(trader1.balance, traderNativeBefore + makerAmount - nativeAmount, "Trader native balance incorrect");
        assertEq(mockUSDC.balanceOf(address(rfq)), rfqUsdcBefore + takerAmount, "RFQ USDC balance incorrect");
        assertEq(address(rfq).balance, rfqNativeBefore - makerAmount + nativeAmount, "RFQ native balance incorrect");
    }

    function test_simpleSwap_NativeToERC20(uint256 makerAmount, uint256 takerAmount, uint256 nativeOffset) public {
        vm.assume(makerAmount > 0 && makerAmount <= 1000e6);
        vm.assume(takerAmount > 0 && takerAmount <= 1 ether);
        vm.assume(nativeOffset <= 1 ether);
        (IMockMainnetRFQ.Order memory order, bytes memory signature) = _getSignedOrder(
            address(mockUSDC),
            address(0),
            makerAmount,
            takerAmount,
            trader1,
            trader1
        );

        uint256 traderUsdcBefore = mockUSDC.balanceOf(trader1);
        uint256 rfqUsdcBefore = mockUSDC.balanceOf(address(rfq));
        uint256 traderNativeBefore = trader1.balance;
        uint256 rfqNativeBefore = address(rfq).balance;

        // Execute swap via router fallback
        vm.startPrank(trader1);
        (bool success, ) = address(router).call{value: takerAmount + nativeOffset}(
            abi.encodeWithSelector(SIMPLE_SWAP_SELECTOR, order, signature)
        );
        require(success);
        vm.stopPrank();

        assertEq(trader1.balance, traderNativeBefore - takerAmount, "Trader native balance incorrect");
        assertEq(mockUSDC.balanceOf(trader1), traderUsdcBefore + makerAmount, "Trader USDC balance incorrect");
        assertEq(address(rfq).balance, rfqNativeBefore + takerAmount, "RFQ native balance incorrect");
        assertEq(mockUSDC.balanceOf(address(rfq)), rfqUsdcBefore - makerAmount, "RFQ USDC balance incorrect");
    }

    function test_partialSwap_ERC20ToERC20(
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 partialAmount,
        uint256 nativeAmount
    ) public {
        vm.assume(makerAmount > 0 && makerAmount <= 1000e18);
        vm.assume(takerAmount > 0 && takerAmount <= 1000e6);
        vm.assume(partialAmount > 0 && partialAmount <= takerAmount);
        vm.assume(nativeAmount <= 1 ether);
        (IMockMainnetRFQ.Order memory order, bytes memory signature) = _getSignedOrder(
            address(mockALOT),
            address(mockUSDC),
            makerAmount,
            takerAmount,
            trader1,
            trader1
        );

        uint256 traderUsdcBefore = mockUSDC.balanceOf(trader1);
        uint256 rfqUsdcBefore = mockUSDC.balanceOf(address(rfq));
        uint256 traderAlotBefore = mockALOT.balanceOf(trader1);
        uint256 rfqAlotBefore = mockALOT.balanceOf(address(rfq));

        // Execute swap via router fallback
        vm.startPrank(trader1);
        mockUSDC.approve(address(router), partialAmount);
        (bool success, ) = address(router).call{value: nativeAmount}(
            abi.encodeWithSelector(PARTIAL_SWAP_SELECTOR, order, signature, partialAmount)
        );
        require(success);
        vm.stopPrank();

        uint256 adjustedMakerAmount = (makerAmount * partialAmount) / takerAmount;

        assertEq(mockUSDC.balanceOf(trader1), traderUsdcBefore - partialAmount, "Trader USDC balance incorrect");
        assertEq(mockALOT.balanceOf(trader1), traderAlotBefore + adjustedMakerAmount, "Trader ALOT balance incorrect");
        assertEq(mockUSDC.balanceOf(address(rfq)), rfqUsdcBefore + partialAmount, "RFQ USDC balance incorrect");
        assertEq(mockALOT.balanceOf(address(rfq)), rfqAlotBefore - adjustedMakerAmount, "RFQ ALOT balance incorrect");
    }

    function test_partialSwap_ERC20ToNative(uint256 makerAmount, uint256 takerAmount, uint256 partialAmount) public {
        vm.assume(makerAmount > 0 && makerAmount <= 1 ether);
        vm.assume(takerAmount > 0 && takerAmount <= 1000e6);
        vm.assume(partialAmount > 0 && partialAmount <= takerAmount);
        (IMockMainnetRFQ.Order memory order, bytes memory signature) = _getSignedOrder(
            address(0),
            address(mockUSDC),
            makerAmount,
            takerAmount,
            trader1,
            trader1
        );

        uint256 traderUsdcBefore = mockUSDC.balanceOf(trader1);
        uint256 rfqUsdcBefore = mockUSDC.balanceOf(address(rfq));
        uint256 traderNativeBefore = trader1.balance;
        uint256 rfqNativeBefore = address(rfq).balance;

        // Execute swap via router fallback
        vm.startPrank(trader1);
        mockUSDC.approve(address(router), partialAmount);
        (bool success, ) = address(router).call(
            abi.encodeWithSelector(PARTIAL_SWAP_SELECTOR, order, signature, partialAmount)
        );
        require(success);
        vm.stopPrank();

        uint256 adjustedMakerAmount = (makerAmount * partialAmount) / takerAmount;

        assertEq(mockUSDC.balanceOf(trader1), traderUsdcBefore - partialAmount, "Trader USDC balance incorrect");
        assertEq(trader1.balance, traderNativeBefore + adjustedMakerAmount, "Trader native balance incorrect");
        assertEq(mockUSDC.balanceOf(address(rfq)), rfqUsdcBefore + partialAmount, "RFQ USDC balance incorrect");
        assertEq(address(rfq).balance, rfqNativeBefore - adjustedMakerAmount, "RFQ native balance incorrect");
    }

    function test_partialSwap_NativeToERC20(uint256 makerAmount, uint256 takerAmount, uint256 partialAmount) public {
        vm.assume(makerAmount > 0 && makerAmount <= 1000e6);
        vm.assume(takerAmount > 0 && takerAmount <= 1 ether);
        vm.assume(partialAmount > 0 && partialAmount <= takerAmount);
        (IMockMainnetRFQ.Order memory order, bytes memory signature) = _getSignedOrder(
            address(mockUSDC),
            address(0),
            makerAmount,
            takerAmount,
            trader1,
            trader1
        );

        uint256 traderUsdcBefore = mockUSDC.balanceOf(trader1);
        uint256 rfqUsdcBefore = mockUSDC.balanceOf(address(rfq));
        uint256 traderNativeBefore = trader1.balance;
        uint256 rfqNativeBefore = address(rfq).balance;

        // Execute swap via router fallback
        vm.startPrank(trader1);
        (bool success, ) = address(router).call{value: partialAmount}(
            abi.encodeWithSelector(PARTIAL_SWAP_SELECTOR, order, signature, partialAmount)
        );
        require(success);
        vm.stopPrank();

        uint256 adjustedMakerAmount = (makerAmount * partialAmount) / takerAmount;

        assertEq(trader1.balance, traderNativeBefore - partialAmount, "Trader native balance incorrect");
        assertEq(mockUSDC.balanceOf(trader1), traderUsdcBefore + adjustedMakerAmount, "Trader USDC balance incorrect");
        assertEq(address(rfq).balance, rfqNativeBefore + partialAmount, "RFQ native balance incorrect");
        assertEq(mockUSDC.balanceOf(address(rfq)), rfqUsdcBefore - adjustedMakerAmount, "RFQ USDC balance incorrect");
    }

    /// @dev Helper to create a signed EIP-712 order.
    function _getSignedOrder(
        address makerAsset,
        address takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        address taker,
        address destTrader
    ) internal view returns (IMockMainnetRFQ.Order memory order, bytes memory signature) {
        uint256 nonce = 100;
        uint256 nonceAndMeta = (uint256(uint160(destTrader)) << 96) | nonce;

        order = IMockMainnetRFQ.Order({
            nonceAndMeta: nonceAndMeta,
            expiry: uint128(block.timestamp + 120),
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            maker: address(rfq),
            taker: taker,
            makerAmount: makerAmount,
            takerAmount: takerAmount
        });

        signature = _signOrder(order, signerPrivateKey);
    }

    /// @dev Internal function to compute the digest and sign an order.
    function _signOrder(IMockMainnetRFQ.Order memory order, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 domainSeparator = _getDomainSeparator();
        bytes32 structHash = _hashOrder(order);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Computes the EIP712 domain separator.
    function _getDomainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes("Dexalot")),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(rfq)
                )
            );
    }

    /// @dev Computes the hash of the Order struct.
    function _hashOrder(IMockMainnetRFQ.Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.nonceAndMeta,
                    order.expiry,
                    order.makerAsset,
                    order.takerAsset,
                    order.maker,
                    order.taker,
                    order.makerAmount,
                    order.takerAmount
                )
            );
    }
}
