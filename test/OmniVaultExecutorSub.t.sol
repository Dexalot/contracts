// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin-v5/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin-v5/access/IAccessControl.sol";

import {OmniVaultExecutorSub} from "contracts/vaults/OmniVaultExecutorSub.sol";

import {IOmniVaultExecutorSub} from "contracts/interfaces/IOmniVaultExecutorSub.sol";
import {IOmniVaultExecutor} from "contracts/interfaces/IOmniVaultExecutor.sol";

import {MockPortfolioSub} from "test/mock/MockPortfolioSub.sol";

contract OmniVaultExecutorSubTest is Test {
    OmniVaultExecutorSub public executor;
    MockPortfolioSub public portfolio;

    address internal constant ADMIN = address(0xBEEF);
    address internal constant ADMIN_BE = address(0xBEEFBEEF);
    address internal constant FEE_MANAGER = address(0xFEE);
    address internal constant OMNIVAULT_MANAGER = address(0x1234);
    uint256 internal omniTraderKey = 0xCAFE;
    address internal omniTrader;

    function setUp() public {
        omniTrader = vm.addr(omniTraderKey);

        executor = new OmniVaultExecutorSub();
        executor.initialize(ADMIN, omniTrader);

        vm.startPrank(ADMIN);
        portfolio = new MockPortfolioSub();
        portfolio.setFeeAddress(FEE_MANAGER);
        executor.setPortfolio(address(portfolio));
        executor.setTrustedContract(address(portfolio), IOmniVaultExecutor.ContractAccess.ERC20);
        executor.setWhitelistedFunction(portfolio.bulkTransferTokens.selector, address(portfolio));
        executor.setWhitelistedFunction(portfolio.transferToken.selector, address(portfolio));
        executor.grantRole(executor.ADMIN_BE_ROLE(), ADMIN_BE);

        executor.setFeeManager();
        executor.setOmniVaultManager(OMNIVAULT_MANAGER);
        executor.setGasTopupAmount(0.1 ether);
        vm.stopPrank();

        vm.deal(address(executor), 1 ether);
    }

    function test_Initialize_SetsCorrectRoles() public {
        assertTrue(executor.hasRole(executor.DEFAULT_ADMIN_ROLE(), ADMIN));
        assertTrue(executor.hasRole(executor.OMNITRADER_ROLE(), omniTrader));
        assertEq(executor.VERSION(), bytes32("1.2.1"));
    }

    function test_SetFeeManager_Success() public {
        vm.prank(ADMIN);
        executor.setFeeManager();

        address feeMgr = executor.feeManager();
        assertEq(feeMgr, FEE_MANAGER);
    }

    function test_SetFeeManager_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.setFeeManager();
    }

    function test_SetOmniVaultManager_Success(address _omniVaultManager) public {
        vm.assume(_omniVaultManager != address(0));
        vm.prank(ADMIN);
        executor.setOmniVaultManager(_omniVaultManager);

        address manager = executor.omniVaultManager();
        assertEq(manager, _omniVaultManager);
    }

    function test_SetOmniVaultManager_RevertIf_ZeroAddress() public {
        vm.prank(ADMIN);
        vm.expectRevert("VE-SAZ-01");
        executor.setOmniVaultManager(address(0));
    }

    function test_SetOmniVaultManager_RevertIf_NotAdmin(address _omniVaultManager) public {
        vm.assume(_omniVaultManager != address(0));
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.setOmniVaultManager(_omniVaultManager);
    }

    function test_TopupGas_Success() public {
        uint256 initialBalance = address(omniTrader).balance;
        uint256 topupAmt = executor.gasTopupAmount();
        bytes memory emptyData = new bytes(0);
        vm.warp(block.timestamp + 8 days);
        vm.prank(omniTrader);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultExecutor.GasTopup(block.timestamp, topupAmt);
        executor.topupGas(emptyData);

        assertEq(address(omniTrader).balance, initialBalance + topupAmt);
    }

    function test_TopupGas_RevertIf_CalledTooSoon() public {
        vm.warp(block.timestamp + 3 days);
        bytes memory emptyData = new bytes(0);

        vm.prank(omniTrader);
        vm.expectRevert("VE-TETG-01");
        executor.topupGas(emptyData);
    }

    function test_TopupGas_RevertIf_NotOmniTrader() public {
        bytes memory emptyData = new bytes(0);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                ADMIN,
                executor.OMNITRADER_ROLE()
            )
        );
        vm.prank(ADMIN);
        executor.topupGas(emptyData);
    }

    function test_TopupGas_RevertIf_SenderFails() public {
        bytes memory emptyData = new bytes(0);
        vm.warp(block.timestamp + 8 days);

        // Set omniTrader to a contract that cannot receive ETH
        address badOmniTrader = address(portfolio);
        vm.startPrank(ADMIN);
        executor.grantRole(executor.OMNITRADER_ROLE(), badOmniTrader);
        vm.stopPrank();

        vm.prank(badOmniTrader);
        vm.expectRevert("VE-FNGT-01");
        executor.topupGas(emptyData);
    }

    function test_CollectSwapFees_Success() public {
        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](2);
        swapIds[0] = 1;
        swapIds[1] = 2;
        uint256[] memory fees = new uint256[](2);
        fees[0] = 100;
        fees[1] = 200;

        vm.prank(ADMIN_BE);
        vm.expectEmit(true, true, true, true);
        emit MockPortfolioSub.Transfer(address(executor), FEE_MANAGER, feeSymbol, 300);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultExecutorSub.SwapFeesCollected(feeSymbol, swapIds, fees);
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function test_CollectSwapFees_RevertIf_LengthMismatch() public {
        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](2);
        swapIds[0] = 1;
        swapIds[1] = 2;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 100;

        vm.prank(ADMIN_BE);
        vm.expectRevert("VE-IVAL-01");
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function test_CollectSwapFees_RevertIf_FeeManagerNotSet() public {
        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](1);
        swapIds[0] = 1;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 100;

        // Unset fee manager by setting portfolio's fee address to zero address
        portfolio.setFeeAddress(address(0));
        vm.prank(ADMIN);
        executor.setFeeManager();

        vm.prank(ADMIN_BE);
        vm.expectRevert("VE-FMNS-01");
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function test_CollectSwapFees_RevertIf_NotAdminBe() public {
        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](1);
        swapIds[0] = 1;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 100;

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.ADMIN_BE_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function test_DispatchAssets_Success(address _recipient) public {
        vm.assume(_recipient != address(0));
        bytes32[] memory symbols = new bytes32[](2);
        symbols[0] = bytes32("TOKEN1");
        symbols[1] = bytes32("TOKEN2");
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100;
        amounts[1] = 200;

        vm.prank(OMNIVAULT_MANAGER);
        vm.expectEmit(true, true, true, true);
        emit MockPortfolioSub.Transfer(address(executor), address(_recipient), symbols[0], amounts[0]);
        emit MockPortfolioSub.Transfer(address(executor), address(_recipient), symbols[1], amounts[1]);
        executor.dispatchAssets(address(_recipient), symbols, amounts);
    }

    function test_DispatchAssets_RevertIf_NotOmniVaultManager(address _recipient) public {
        vm.assume(_recipient != address(0));
        bytes32[] memory symbols = new bytes32[](1);
        symbols[0] = bytes32("TOKEN1");
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.expectRevert("VE-SNVM-01");
        vm.prank(ADMIN);
        executor.dispatchAssets(address(_recipient), symbols, amounts);
    }

    function testFuzz_CollectSwapFees_Success(uint256 fee1, uint256 fee2) public {
        // Assume fees won't cause an overflow when added together
        vm.assume(fee1 < type(uint256).max / 2);
        vm.assume(fee2 < type(uint256).max / 2);

        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](2);
        swapIds[0] = 1;
        swapIds[1] = 2;

        uint256[] memory fees = new uint256[](2);
        fees[0] = fee1;
        fees[1] = fee2;

        uint256 expectedTotal = fee1 + fee2;

        vm.prank(ADMIN_BE);
        vm.expectEmit(true, true, true, true);
        emit MockPortfolioSub.Transfer(address(executor), FEE_MANAGER, feeSymbol, expectedTotal);
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function test_CollectSwapFees_RevertIf_Overflow() public {
        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](2);
        swapIds[0] = 1;
        swapIds[1] = 2;

        uint256[] memory fees = new uint256[](2);
        fees[0] = type(uint256).max;
        fees[1] = 1; // This will cause an arithmetic overflow

        vm.prank(ADMIN_BE);
        vm.expectRevert(); // Standard Solidity 0.8+ Panic for overflow
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function test_CollectSwapFees_EmptyArrays() public {
        // Edge Case: Passing empty arrays should process successfully and transfer 0 fees
        bytes32 feeSymbol = bytes32("TOKEN");
        uint256[] memory swapIds = new uint256[](0);
        uint256[] memory fees = new uint256[](0);

        vm.prank(ADMIN_BE);
        vm.expectEmit(true, true, true, true);
        emit MockPortfolioSub.Transfer(address(executor), FEE_MANAGER, feeSymbol, 0);
        executor.collectSwapFees(feeSymbol, swapIds, fees);
    }

    function testFuzz_TopupGas_IgnoresSwapData(bytes memory randomData) public {
        // Edge Case: Unlike the parent OmniVaultExecutor which attempts to ABI decode
        // the swap data if length > 0, OmniVaultExecutorSub overrides `_topupGas`
        // and completely ignores the second parameter.

        vm.warp(block.timestamp + 8 days);
        uint256 topupAmt = executor.gasTopupAmount();

        vm.prank(omniTrader);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultExecutor.GasTopup(block.timestamp, topupAmt);

        // This should succeed without an abi.decode revert, regardless of the random payload
        executor.topupGas(randomData);
    }

    function test_DispatchAssets_EmptyArrays(address _recipient) public {
        vm.assume(_recipient != address(0));

        // Edge Case: Dispatching 0 assets
        bytes32[] memory symbols = new bytes32[](0);
        uint256[] memory amounts = new uint256[](0);

        vm.prank(OMNIVAULT_MANAGER);
        // We just ensure the call forwards properly to the mock portfolio without reverting
        // in the Executor logic itself.
        executor.dispatchAssets(_recipient, symbols, amounts);
    }
}
