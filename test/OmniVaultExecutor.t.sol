// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin-v5/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin-v5/access/IAccessControl.sol";

import {OmniVaultExecutor} from "contracts/vaults/OmniVaultExecutor.sol";

import {IOmniVaultExecutor} from "contracts/interfaces/IOmniVaultExecutor.sol";
import {MockToken} from "contracts/mocks/MockToken.sol";

contract TargetMock {
    uint256 public value;
    bool public shouldFail;

    function setValue(uint256 _val) external payable {
        require(!shouldFail, "MOCK_REVERT");
        value = _val;
    }

    function setFail(bool _fail) external {
        shouldFail = _fail;
    }

    receive() external payable {
        require(!shouldFail, "MOCK_REVERT");
    }
}

contract OmniVaultExecutorTest is Test {
    OmniVaultExecutor public executor;
    TargetMock public target;

    address internal constant ADMIN = address(0xBEEF);
    uint256 internal omniTraderKey = 0xCAFE;
    address internal omniTrader;

    MockToken internal token;

    function setUp() public {
        omniTrader = vm.addr(omniTraderKey);

        executor = new OmniVaultExecutor();
        executor.initialize(ADMIN, omniTrader);

        target = new TargetMock();

        vm.startPrank(ADMIN);
        token = new MockToken("MOCK", "MOCK", 18);

        token.mint(address(executor), 1_000_000 * 1e18);
        vm.stopPrank();
    }

    function test_Initialize_SetsCorrectRoles() public {
        assertTrue(executor.hasRole(executor.DEFAULT_ADMIN_ROLE(), ADMIN));
        assertTrue(executor.hasRole(executor.OMNITRADER_ROLE(), omniTrader));
        assertEq(executor.VERSION(), bytes32("1.1.0"));
    }

    function test_Initialize_RevertIf_ZeroAddress() public {
        OmniVaultExecutor newExec = new OmniVaultExecutor();
        vm.expectRevert("VE-SAZ-01");
        newExec.initialize(address(0), omniTrader);

        vm.expectRevert("VE-SAZ-02");
        newExec.initialize(ADMIN, address(0));
    }

    function test_SetTrustedContract_Success(address _trustedContract, uint8 _access) public {
        vm.assume(_trustedContract != address(0));
        vm.assume(_access <= uint8(IOmniVaultExecutor.ContractAccess.NATIVE_AND_ERC20));
        vm.prank(ADMIN);
        executor.setTrustedContract(_trustedContract, IOmniVaultExecutor.ContractAccess(_access));

        IOmniVaultExecutor.ContractAccess access = executor.trustedContracts(_trustedContract);
        assertEq(uint256(access), _access);
    }

    function test_SetTrustedContract_RevertIf_ZeroAddress(uint8 _access) public {
        vm.assume(_access <= uint8(IOmniVaultExecutor.ContractAccess.NATIVE_AND_ERC20));
        vm.prank(ADMIN);
        vm.expectRevert("VE-SAZ-01");
        executor.setTrustedContract(address(0), IOmniVaultExecutor.ContractAccess(_access));
    }

    function test_SetTrustedContract_RevertIf_NotAdmin(address _trustedContract, uint8 _access) public {
        vm.assume(_access <= uint8(IOmniVaultExecutor.ContractAccess.NATIVE_AND_ERC20));
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.setTrustedContract(_trustedContract, IOmniVaultExecutor.ContractAccess(_access));
    }

    function test_SetWhitelistedFunction_Success() public {
        bytes4 sig = TargetMock.setValue.selector;
        address targetAddress = address(target);

        vm.startPrank(ADMIN);
        executor.setTrustedContract(targetAddress, IOmniVaultExecutor.ContractAccess.NATIVE);
        executor.setWhitelistedFunction(sig, targetAddress);
        vm.stopPrank();

        assertEq(executor.whitelistedFunctions(sig), targetAddress);
    }

    function test_SetWhitelistedFunction_RevertIf_NotTrusted() public {
        bytes4 sig = TargetMock.setValue.selector;

        vm.prank(ADMIN);
        vm.expectRevert("VE-IVTC-01");
        executor.setWhitelistedFunction(sig, address(target));
    }

    function test_SetWhitelistedFunction_RevertIf_NotOwner() public {
        bytes4 sig = TargetMock.setValue.selector;
        address targetAddress = address(target);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.setWhitelistedFunction(sig, targetAddress);
    }

    function test_SetWhitelistedFunction_RevertIf_SelectorOccupied() public {
        bytes4 sig = TargetMock.setValue.selector;
        address targetAddress = address(target);

        vm.startPrank(ADMIN);
        executor.setTrustedContract(targetAddress, IOmniVaultExecutor.ContractAccess.NATIVE);
        executor.setWhitelistedFunction(sig, targetAddress);

        executor.setTrustedContract(omniTrader, IOmniVaultExecutor.ContractAccess.TRUSTED);

        vm.expectRevert("VE-SEAO-01");
        executor.setWhitelistedFunction(sig, omniTrader);
    }

    function test_SetWhitelistedFunctions_Success() public {
        bytes4[] memory sigs = new bytes4[](2);
        sigs[0] = TargetMock.setValue.selector;
        sigs[1] = TargetMock.setFail.selector;
        address[] memory targets = new address[](2);
        address targetAddress = address(target);
        targets[0] = targetAddress;
        targets[1] = targetAddress;

        vm.startPrank(ADMIN);
        executor.setTrustedContract(targetAddress, IOmniVaultExecutor.ContractAccess.NATIVE);
        executor.setWhitelistedFunctions(sigs, targets);
        vm.stopPrank();

        assertEq(executor.whitelistedFunctions(sigs[0]), targetAddress);
        assertEq(executor.whitelistedFunctions(sigs[1]), targetAddress);
    }

    function test_SetWhitelistedFunctions_RevertIf_ArrayLengthMismatch() public {
        bytes4[] memory sigs = new bytes4[](1);
        sigs[0] = TargetMock.setValue.selector;
        address[] memory targets = new address[](0);

        vm.prank(ADMIN);
        vm.expectRevert("VE-IVAL-01");
        executor.setWhitelistedFunctions(sigs, targets);
    }

    function test_SetWhitelistedFunctions_RevertIf_NotOwner() public {
        bytes4[] memory sigs = new bytes4[](1);
        sigs[0] = TargetMock.setValue.selector;
        address[] memory targets = new address[](1);
        targets[0] = address(target);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.setWhitelistedFunctions(sigs, targets);
    }

    function test_RemoveWhitelistedFunction_Success() public {
        bytes4 sig = TargetMock.setValue.selector;
        address targetAddress = address(target);

        vm.startPrank(ADMIN);
        executor.setTrustedContract(targetAddress, IOmniVaultExecutor.ContractAccess.NATIVE);
        executor.setWhitelistedFunction(sig, targetAddress);
        executor.removeWhitelistedFunction(sig);
        vm.stopPrank();

        assertEq(executor.whitelistedFunctions(sig), address(0));
    }

    function test_RemoveWhitelistedFunction_RevertIf_NotWhitelisted() public {
        bytes4 sig = TargetMock.setValue.selector;

        vm.prank(ADMIN);
        vm.expectRevert("VE-FSNW-01");
        executor.removeWhitelistedFunction(sig);
    }

    function test_RemoveWhitelistedFunction_RevertIf_NotOwner() public {
        bytes4 sig = TargetMock.setValue.selector;

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.removeWhitelistedFunction(sig);
    }

    function test_SetPortfolio_Success() public {
        vm.prank(ADMIN);
        executor.setPortfolio(address(target));

        assertEq(executor.portfolio(), address(target));
    }

    function test_SetPortfolio_RevertIf_ZeroAddress() public {
        vm.prank(ADMIN);
        vm.expectRevert("VE-SAZ-01");
        executor.setPortfolio(address(0));
    }

    function test_SetPortfolio_RevertIf_NotOwner() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                omniTrader,
                executor.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(omniTrader);
        executor.setPortfolio(address(target));
    }

    function test_Receive_Success() public {
        vm.deal(address(omniTrader), 2 ether);
        vm.prank(omniTrader);
        (bool success, ) = address(executor).call{value: 1 ether}("");
        assertTrue(success);
    }

    function test_SendNative_Success(uint256 _nativeAmount) public {
        vm.assume(_nativeAmount > 0 && _nativeAmount <= 1 ether);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE);

        vm.deal(address(executor), 1 ether);

        uint256 initialBalance = address(target).balance;

        vm.prank(omniTrader);
        executor.sendNative(payable(address(target)), _nativeAmount);

        assertEq(address(target).balance, initialBalance + _nativeAmount);
    }

    function test_SendNative_SuccessIf_NativeAndERC20Set(uint256 _nativeAmount) public {
        vm.assume(_nativeAmount > 0 && _nativeAmount <= 1 ether);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE_AND_ERC20);

        vm.deal(address(executor), 1 ether);

        uint256 initialBalance = address(target).balance;

        vm.prank(omniTrader);
        executor.sendNative(payable(address(target)), _nativeAmount);

        assertEq(address(target).balance, initialBalance + _nativeAmount);
    }

    function test_SendNative_RevertIf_AccessLevelInsufficient(uint256 _nativeAmount) public {
        vm.assume(_nativeAmount > 0 && _nativeAmount <= 1 ether);
        vm.deal(address(executor), 1 ether);

        vm.prank(omniTrader);
        vm.expectRevert("VE-IVCA-01");
        executor.sendNative(payable(address(target)), _nativeAmount);
    }

    function test_SendNative_RevertIf_TargetReverts(uint256 _nativeAmount) public {
        vm.assume(_nativeAmount > 0 && _nativeAmount <= 1 ether);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE);

        vm.deal(address(executor), 1 ether);
        target.setFail(true);

        vm.prank(omniTrader);
        vm.expectRevert("MOCK_REVERT");
        executor.sendNative(payable(address(target)), _nativeAmount);
    }

    function test_SendNative_RevertIf_NotOmniTrader(uint256 _nativeAmount) public {
        vm.assume(_nativeAmount > 0 && _nativeAmount <= 1 ether);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE);

        vm.deal(address(executor), 1 ether);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                ADMIN,
                executor.OMNITRADER_ROLE()
            )
        );
        vm.prank(ADMIN);
        executor.sendNative(payable(address(target)), _nativeAmount);
    }

    function test_ApproveToken_Success(uint256 _approveAmount) public {
        vm.assume(_approveAmount > 0 && _approveAmount <= 1_000_000 * 1e18);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.ERC20);

        vm.prank(omniTrader);
        executor.approveToken(address(token), address(target), _approveAmount);

        assertEq(token.allowance(address(executor), address(target)), _approveAmount);
    }

    function test_ApproveToken_SuccessIf_NativeAndERC20Set(uint256 _approveAmount) public {
        vm.assume(_approveAmount > 0 && _approveAmount <= 1_000_000 * 1e18);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE_AND_ERC20);

        vm.prank(omniTrader);
        executor.approveToken(address(token), address(target), _approveAmount);

        assertEq(token.allowance(address(executor), address(target)), _approveAmount);
    }

    function test_ApproveToken_RevertIf_AccessLevelInsufficient(uint256 _approveAmount) public {
        vm.assume(_approveAmount > 0 && _approveAmount <= 1_000_000 * 1e18);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE);

        vm.prank(omniTrader);
        vm.expectRevert("VE-IVCA-01");
        executor.approveToken(address(token), address(target), _approveAmount);
    }

    function test_ApproveToken_RevertIf_NotOmniTrader(uint256 _approveAmount) public {
        vm.assume(_approveAmount > 0 && _approveAmount <= 1_000_000 * 1e18);
        vm.prank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.ERC20);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                ADMIN,
                executor.OMNITRADER_ROLE()
            )
        );
        vm.prank(ADMIN);
        executor.approveToken(address(token), address(target), _approveAmount);
    }

    function test_Fallback_Success(uint256 _val) public {
        vm.startPrank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE);
        executor.setWhitelistedFunction(TargetMock.setValue.selector, address(target));
        vm.stopPrank();

        bytes memory callData = abi.encodeWithSelector(TargetMock.setValue.selector, _val);

        vm.prank(omniTrader);
        (bool success, ) = address(executor).call(callData);
        assertTrue(success);
        assertEq(target.value(), _val);
    }

    function test_Fallback_RevertIf_NotWhitelisted() public {
        bytes memory callData = abi.encodeWithSelector(TargetMock.setValue.selector, 100);

        vm.prank(omniTrader);
        vm.expectRevert("VE-FSNW-01");
        (bool success, ) = address(executor).call(callData);
    }

    function test_Fallback_RevertIf_NotOmniTrader() public {
        bytes memory callData = abi.encodeWithSelector(TargetMock.setValue.selector, 100);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                ADMIN,
                executor.OMNITRADER_ROLE()
            )
        );
        vm.prank(ADMIN);
        (bool success, ) = address(executor).call(callData);
    }

    function test_Fallback_RevertIf_TargetReverts() public {
        bytes4 sig = TargetMock.setValue.selector;

        vm.startPrank(ADMIN);
        executor.setTrustedContract(address(target), IOmniVaultExecutor.ContractAccess.NATIVE);
        executor.setWhitelistedFunction(sig, address(target));
        vm.stopPrank();

        target.setFail(true);

        vm.prank(omniTrader);
        vm.expectRevert("MOCK_REVERT");
        (bool success, ) = address(executor).call(abi.encodeWithSelector(sig, 100));
    }

    function test_Fallback_RevertIf_CalldataTooShort() public {
        vm.prank(omniTrader);

        bytes memory shortData = new bytes(3);
        shortData[0] = 0x12;
        shortData[1] = 0x34;
        shortData[2] = 0x56;
        (bool success, bytes memory returnData) = address(executor).call(shortData);
        assertFalse(success);

        bytes memory expectedError = abi.encodeWithSignature("Error(string)", "VE-CDTS-01");
        assertEq(returnData, expectedError);
    }
}
