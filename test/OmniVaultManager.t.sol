// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin-v5/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin-v5/access/IAccessControl.sol";

import {OmniVaultManager} from "contracts/vaults/OmniVaultManager.sol";

import {IOmniVaultManager} from "contracts/interfaces/IOmniVaultManager.sol";

import {MockPortfolioSub} from "test/mock/MockPortfolioSub.sol";
import {MockOmniVaultShare} from "test/mock/MockOmniVaultShare.sol";
import {MockVaultExecutorSub} from "test/mock/MockVaultExecutorSub.sol";

contract OmniVaultManagerTest is Test {
    OmniVaultManager public manager;
    MockPortfolioSub public portfolio;
    MockOmniVaultShare public shareToken;
    MockVaultExecutorSub public vaultExecutor;

    address internal constant ADMIN = address(0xBEEF);
    address internal constant SETTLER = address(0x1234);
    uint256 internal proposerKey = 0xCAFE;
    address internal proposer;

    function setUp() public {
        proposer = vm.addr(proposerKey);

        manager = new OmniVaultManager();
        manager.initialize(ADMIN, SETTLER);

        vm.startPrank(ADMIN);
        portfolio = new MockPortfolioSub();
        manager.setPortfolio(address(portfolio));
        _setupToken(bytes32("ALOT"), 0); // TokenId 0
        _setupToken(bytes32("USDC"), 1); // TokenId 1

        shareToken = new MockOmniVaultShare();
        vaultExecutor = new MockVaultExecutorSub();
        vm.stopPrank();

        uint16[] memory tokenIds = new uint16[](2);
        tokenIds[0] = 0;
        tokenIds[1] = 1;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 50_000;
        amounts[1] = 10_000;

        _setupVault(0, tokenIds, amounts, 100);
    }

    function _setupToken(bytes32 symbol, uint16 id) internal {
        portfolio.setTokenDetails(symbol);
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: symbol,
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 0, // Simplified for testing
            minPerDeposit: 1,
            maxPerDeposit: 1_000_000
        });
        manager.addTokenDetails(info);
    }

    function _setupVault(
        uint16 _vaultId,
        uint16[] memory _tokenIds,
        uint256[] memory _amounts,
        uint208 _shares
    ) internal returns (uint256) {
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = 1;
        vm.startPrank(ADMIN);
        IOmniVaultManager.VaultDetails memory details = IOmniVaultManager.VaultDetails({
            name: "Test Vault",
            proposer: proposer,
            omniTrader: address(0x0001),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(vaultExecutor),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0003),
            chainIds: chainIds,
            tokens: _tokenIds
        });
        manager.registerVault(_vaultId, details, _tokenIds, _amounts, _shares);
        vm.stopPrank();
    }

    function test_Initialize_SetsCorrectRoles() public {
        assertTrue(manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), ADMIN));
        assertTrue(manager.hasRole(manager.SETTLER_ROLE(), SETTLER));
        assertEq(manager.VERSION(), bytes32("1.1.0"));
    }

    function test_Initialize_RevertIf_ZeroAdmin() public {
        OmniVaultManager newMgr = new OmniVaultManager();
        vm.expectRevert("VM-SAZ-01");
        newMgr.initialize(address(0), SETTLER);
    }

    function test_SetPortfolio_Success() public {
        address newPortfolio = address(0xDEAD);
        vm.prank(ADMIN);
        manager.setPortfolio(newPortfolio);

        assertEq(address(manager.portfolio()), newPortfolio);
    }

    function test_SetPortfolio_RevertIf_ZeroAddress() public {
        address newPortfolio = address(0);
        vm.expectRevert("VM-SAZ-01");
        vm.prank(ADMIN);
        manager.setPortfolio(newPortfolio);
    }

    function test_SetPortfolio_RevertIf_NotAdmin() public {
        address newPortfolio = address(0xDEAD);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.setPortfolio(newPortfolio);
    }

    function test_PauseUnpause_Success() public {
        vm.prank(ADMIN);
        manager.pause();

        assertTrue(manager.paused());

        vm.prank(ADMIN);
        manager.unpause();

        assertFalse(manager.paused());
    }

    function test_Pause_RevertIf_Paused() public {
        vm.prank(ADMIN);
        manager.pause();

        vm.expectRevert("EnforcedPause()");
        vm.prank(ADMIN);
        manager.pause();
    }

    function test_Pause_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.pause();
    }

    function test_Unpause_RevertIf_NotPaused() public {
        vm.expectRevert("ExpectedPause()");
        vm.prank(ADMIN);
        manager.unpause();
    }

    function test_Unpause_RevertIf_NotAdmin() public {
        vm.prank(ADMIN);
        manager.pause();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.unpause();
    }

    function test_AddTokenDetails_Success() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("DAI"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 0,
            minPerDeposit: 1,
            maxPerDeposit: 1_000_000
        });

        portfolio.setTokenDetails(info.symbol);

        vm.prank(ADMIN);
        manager.addTokenDetails(info);
    }

    function test_AddTokenDetails_RevertIf_TokenAlreadyExists() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("ALOT"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 0,
            minPerDeposit: 1,
            maxPerDeposit: 1_000_000
        });

        vm.expectRevert("VM-TSNM-01");
        vm.prank(ADMIN);
        manager.addTokenDetails(info);
    }

    function test_AddTokenDetails_RevertIf_TokenNotInPortfolio() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("DAI"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 0,
            minPerDeposit: 1,
            maxPerDeposit: 1_000_000
        });

        vm.expectRevert("VM-TSIP-01");
        vm.prank(ADMIN);
        manager.addTokenDetails(info);
    }

    function test_AddTokenDetails_RevertIf_NotAdmin() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("DAI"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 0,
            minPerDeposit: 1,
            maxPerDeposit: 1_000_000
        });

        portfolio.setTokenDetails(info.symbol);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.addTokenDetails(info);
    }

    function test_UpdateTokenDetails_Success() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("ALOT"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 18,
            minPerDeposit: 10,
            maxPerDeposit: 2_000_000
        });

        vm.prank(ADMIN);
        manager.updateTokenDetails(0, info);
    }

    function test_UpdateTokenDetails_RevertIf_TokenNotInManager() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("DAI"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 18,
            minPerDeposit: 10,
            maxPerDeposit: 2_000_000
        });

        vm.expectRevert("VM-TSIM-01");
        vm.prank(ADMIN);
        manager.updateTokenDetails(0, info);
    }

    function test_UpdateTokenDetails_RevertIf_OutOfBoundsTokenId() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("ALOT"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 18,
            minPerDeposit: 10,
            maxPerDeposit: 2_000_000
        });

        vm.expectRevert("VM-TSIM-02");
        vm.prank(ADMIN);
        manager.updateTokenDetails(3, info);
    }

    function test_UpdateTokenDetails_RevertIf_MismatchSymbol() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("ALOT"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 18,
            minPerDeposit: 10,
            maxPerDeposit: 2_000_000
        });

        vm.expectRevert("VM-TSIM-02");
        vm.prank(ADMIN);
        manager.updateTokenDetails(1, info);
    }

    function test_UpdateTokenDetails_RevertIf_NotAdmin() public {
        IOmniVaultManager.AssetInfo memory info = IOmniVaultManager.AssetInfo({
            symbol: bytes32("ALOT"),
            tokenType: IOmniVaultManager.AssetType.BASE,
            precision: 18,
            minPerDeposit: 10,
            maxPerDeposit: 2_000_000
        });

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.updateTokenDetails(0, info);
    }

    function test_PauseVault_Success() public {
        vm.prank(ADMIN);
        manager.pauseVault(0);

        IOmniVaultManager.VaultDetails memory details = manager.getVaultDetails(0);
        assertEq(uint256(details.status), uint256(IOmniVaultManager.VaultStatus.PAUSED));
    }

    function test_PauseVault_RevertIf_NotExistingVault() public {
        vm.expectRevert("VM-VINA-01");
        vm.prank(ADMIN);
        manager.pauseVault(999);
    }

    function test_PauseVault_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.pauseVault(0);
    }

    function test_UnpauseVault_Success() public {
        vm.prank(ADMIN);
        manager.pauseVault(0);

        vm.prank(ADMIN);
        manager.unpauseVault(0);

        IOmniVaultManager.VaultDetails memory details = manager.getVaultDetails(0);
        assertEq(uint256(details.status), uint256(IOmniVaultManager.VaultStatus.ACTIVE));
    }

    function test_UnpauseVault_RevertIf_NotPaused() public {
        vm.expectRevert("VM-VINP-01");
        vm.prank(ADMIN);
        manager.unpauseVault(0);
    }

    function test_UnpauseVault_RevertIf_NotAdmin() public {
        vm.prank(ADMIN);
        manager.pauseVault(0);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.unpauseVault(0);
    }

    function test_UpdateVaultDetails_Success() public {
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = 2;
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 1;

        IOmniVaultManager.VaultDetails memory newDetails = IOmniVaultManager.VaultDetails({
            name: "Updated Vault",
            proposer: proposer,
            omniTrader: address(0x0004),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0005),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0006),
            chainIds: chainIds,
            tokens: tokens
        });

        vm.startPrank(ADMIN);
        manager.pauseVault(0);
        manager.updateVaultDetails(0, newDetails);
        vm.stopPrank();

        IOmniVaultManager.VaultDetails memory details = manager.getVaultDetails(0);
        assertEq(details.name, "Updated Vault");
        assertEq(details.omniTrader, address(0x0004));
        assertEq(details.executor, address(0x0005));
        assertEq(details.dexalotRFQ, address(0x0006));
        assertEq(details.chainIds[0], 2);
        assertEq(details.tokens[0], 1);
    }

    function test_UpdateVaultDetails_RevertIf_NotExistingVault() public {
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = 2;
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 1;

        IOmniVaultManager.VaultDetails memory newDetails = IOmniVaultManager.VaultDetails({
            name: "Updated Vault",
            proposer: proposer,
            omniTrader: address(0x0004),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0005),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0006),
            chainIds: chainIds,
            tokens: tokens
        });

        vm.expectRevert("VM-VINP-01");
        vm.prank(ADMIN);
        manager.updateVaultDetails(999, newDetails);
    }

    function test_UpdateVaultDetauls_RevertIf_NotPaused() public {
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = 2;
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 1;

        IOmniVaultManager.VaultDetails memory newDetails = IOmniVaultManager.VaultDetails({
            name: "Updated Vault",
            proposer: proposer,
            omniTrader: address(0x0004),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0005),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0006),
            chainIds: chainIds,
            tokens: tokens
        });

        vm.expectRevert("VM-VINP-01");
        vm.prank(ADMIN);
        manager.updateVaultDetails(0, newDetails);
    }

    function test_UpdateVaultDetails_RevertIf_NotAdmin() public {
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = 2;
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 1;

        IOmniVaultManager.VaultDetails memory newDetails = IOmniVaultManager.VaultDetails({
            name: "Updated Vault",
            proposer: proposer,
            omniTrader: address(0x0004),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0005),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0006),
            chainIds: chainIds,
            tokens: tokens
        });

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.updateVaultDetails(0, newDetails);
    }

    function test_UpdateVaultDetails_RevertIf_PendingTransfer() public {
        uint16[] memory tokenIds = new uint16[](1);
        tokenIds[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000;

        vm.prank(proposer);
        manager.requestDeposit(0, tokenIds, amounts);

        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = 2;
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 1;

        IOmniVaultManager.VaultDetails memory newDetails = IOmniVaultManager.VaultDetails({
            name: "Updated Vault",
            proposer: proposer,
            omniTrader: address(0x0004),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0005),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0006),
            chainIds: chainIds,
            tokens: tokens
        });

        test_RequestDeposit_Success();

        vm.startPrank(ADMIN);
        manager.pauseVault(0);

        vm.expectRevert("VM-PTNU-01");
        manager.updateVaultDetails(0, newDetails);
        vm.stopPrank();
    }

    function test_RegisterVault_RevertIf_VaultIdMismatch() public {
        uint16[] memory tokenIds = new uint16[](1);
        tokenIds[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000;

        uint16 wrongVaultId = 2; // Should be 1

        IOmniVaultManager.VaultDetails memory details = IOmniVaultManager.VaultDetails({
            name: "Mismatch Vault",
            proposer: proposer,
            omniTrader: address(0x0001),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0002),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0003),
            chainIds: new uint32[](0),
            tokens: tokenIds
        });

        vm.expectRevert("VM-RNVI-01");
        vm.prank(ADMIN);
        manager.registerVault(wrongVaultId, details, tokenIds, amounts, 100);
    }

    function test_RegisterVault_RevertIf_NotAdmin() public {
        uint16[] memory tokenIds = new uint16[](1);
        tokenIds[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000;

        IOmniVaultManager.VaultDetails memory details = IOmniVaultManager.VaultDetails({
            name: "Test Vault",
            proposer: proposer,
            omniTrader: address(0x0001),
            status: IOmniVaultManager.VaultStatus.ACTIVE,
            executor: address(0x0002),
            shareToken: address(shareToken),
            dexalotRFQ: address(0x0003),
            chainIds: new uint32[](0),
            tokens: tokenIds
        });

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.registerVault(1, details, tokenIds, amounts, 100);
    }

    function test_RequestDeposit_Success()
        public
        returns (uint16[] memory tokens, uint256[] memory amounts, bytes32 reqId)
    {
        tokens = new uint16[](2);
        tokens[0] = 0;
        tokens[1] = 1;
        amounts = new uint256[](2);
        amounts[0] = 100;
        amounts[1] = 200;

        vm.prank(proposer);
        reqId = manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestDeposit_RevertIf_NotActive() public {
        vm.prank(ADMIN);
        manager.pauseVault(0);

        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.prank(proposer);
        vm.expectRevert("VM-VSAC-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestDeposit_RevertIf_TooManyPending() public {
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;
        for (uint256 i = 0; i < manager.MAX_PENDING_REQUESTS(); i++) {
            manager.requestDeposit(0, tokens, amounts);
        }

        vm.prank(proposer);
        vm.expectRevert("VM-PRCL-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestDeposit_RevertIf_TokenNotInVault() public {
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 99; // not in vault
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.prank(proposer);
        vm.expectRevert("VM-TIIV-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestDeposit_RevertIf_AmountTooLow() public {
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 0; // too low

        vm.prank(proposer);
        vm.expectRevert("VM-ODLR-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestDeposit_RevertIf_AmountTooLarge() public {
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2_000_000; // too large

        vm.prank(proposer);
        vm.expectRevert("VM-ODLR-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestDeposit_RevertIf_MismatchedArrayLengths() public {
        uint16[] memory tokens = new uint16[](2);
        tokens[0] = 0;
        tokens[1] = 1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.prank(proposer);
        vm.expectRevert("VM-IVAL-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    function test_RequestWithdrawal_Success() public returns (bytes32 reqId, uint208 shares) {
        shares = 10;
        vm.startPrank(proposer);
        shareToken.approve(address(manager), shares);
        reqId = manager.requestWithdrawal(0, shares);
        vm.stopPrank();
    }

    function test_RequestWithdrawal_Success_IfPausedVault() public {
        uint208 shares = 10;
        vm.prank(ADMIN);
        manager.pauseVault(0);

        vm.startPrank(proposer);
        shareToken.approve(address(manager), shares);
        bytes32 reqId = manager.requestWithdrawal(0, shares);
        vm.stopPrank();
    }

    function test_RequestWithdrawal_RevertIf_ZeroShares() public {
        vm.prank(proposer);
        vm.expectRevert("VM-ZEVS-01");
        manager.requestWithdrawal(0, 0);
    }

    function test_RequestWithdrawal_RevertIf_TooManyPending() public {
        vm.startPrank(proposer);
        shareToken.mint(0, proposer, type(uint208).max);
        shareToken.approve(address(manager), type(uint208).max);
        for (uint256 i = 0; i < manager.MAX_PENDING_REQUESTS(); i++) {
            manager.requestWithdrawal(0, 10);
        }

        vm.expectRevert("VM-PRCL-01");
        manager.requestWithdrawal(0, 10);
        vm.stopPrank();
    }

    function test_RequestWithdrawal_RevertIf_Deprecated() public {
        vm.startPrank(ADMIN);
        manager.pauseVault(0);
        manager.updateVaultDetails(
            0,
            IOmniVaultManager.VaultDetails({
                name: "Test Vault",
                proposer: proposer,
                omniTrader: address(0x0001),
                status: IOmniVaultManager.VaultStatus.DEPRECATED,
                executor: address(vaultExecutor),
                shareToken: address(shareToken),
                dexalotRFQ: address(0x0003),
                chainIds: new uint32[](0),
                tokens: new uint16[](0)
            })
        );
        vm.stopPrank();

        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        vm.expectRevert("VM-VSAP-01");
        manager.requestWithdrawal(0, 10);
        vm.stopPrank();
    }

    function test_BulkSettleState_Success() public {
        // Setup a deposit and withdrawal request
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.startPrank(proposer);
        bytes32 depReq = manager.requestDeposit(0, tokens, amounts);

        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: depReq,
            tokenIds: tokens,
            amounts: amounts,
            depositShares: 10
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: wReq,
            symbols: new bytes32[](0),
            amounts: new uint256[](0)
        });

        vm.prank(SETTLER);
        manager.bulkSettleState(deposits, withdrawals);

        IOmniVaultManager.TransferRequest memory depRequest = manager.getTransferRequest(depReq);
        assertEq(depRequest.timestamp, 0);
        IOmniVaultManager.TransferRequest memory wRequest = manager.getTransferRequest(wReq);
        assertEq(wRequest.timestamp, 0);
    }

    function test_BulkSettleState_Success_DepositRefund() public {
        // Setup a deposit and withdrawal request
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.startPrank(proposer);
        bytes32 depReq = manager.requestDeposit(0, tokens, amounts);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: depReq,
            tokenIds: tokens,
            amounts: amounts,
            depositShares: 0
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        manager.bulkSettleState(deposits, withdrawals);

        IOmniVaultManager.TransferRequest memory depRequest = manager.getTransferRequest(depReq);
        assertEq(depRequest.timestamp, 0);
    }

    function test_BulkSettleState_Success_Withdrawal() public {
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        bytes32[] memory symbols = new bytes32[](2);
        uint256[] memory amounts = new uint256[](2);
        symbols[0] = bytes32("ALOT");
        amounts[0] = 50;
        symbols[1] = bytes32("USDC");
        amounts[1] = 10;
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: wReq,
            symbols: symbols,
            amounts: amounts
        });

        vm.prank(SETTLER);
        manager.bulkSettleState(deposits, withdrawals);

        IOmniVaultManager.TransferRequest memory wRequest = manager.getTransferRequest(wReq);
        assertEq(wRequest.timestamp, 0);
    }

    function test_BulkSettleState_RevertIf_DepositHashMismatch() public {
        // Setup a deposit and withdrawal request
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.startPrank(proposer);
        bytes32 depReq = manager.requestDeposit(0, tokens, amounts);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-DHMR-01");
        manager.bulkSettleState(deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_WithdrawalHashMismatch() public {
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-WHMR-01");
        manager.bulkSettleState(deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_InvalidDepositRequestId() public {
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: wReq, // invalid deposit request id
            tokenIds: new uint16[](0),
            amounts: new uint256[](0),
            depositShares: 10
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-ADRP-01");
        manager.bulkSettleState(deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_InvalidWithdrawalRequestId() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: bytes32(0), // invalid withdrawal request id
            symbols: new bytes32[](0),
            amounts: new uint256[](0)
        });

        vm.prank(SETTLER);
        vm.expectRevert("VM-AWRP-01");
        manager.bulkSettleState(deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_WithdrawalArraysMismatch() public {
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        bytes32[] memory symbols = new bytes32[](2);
        uint256[] memory amounts = new uint256[](1);
        symbols[0] = bytes32("ALOT");
        amounts[0] = 50;
        symbols[1] = bytes32("USDC");
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: wReq,
            symbols: symbols,
            amounts: amounts
        });

        vm.prank(SETTLER);
        vm.expectRevert("VM-IVAL-02");
        manager.bulkSettleState(deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_NotSettler() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.expectRevert();
        manager.bulkSettleState(deposits, withdrawals);
    }

    function test_UnwindBatch_Success_Empty() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.prank(SETTLER);
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_Success_Deposit() public {
        (uint16[] memory tokens, uint256[] memory amounts, bytes32 reqId) = test_RequestDeposit_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: reqId,
            tokenIds: tokens,
            amounts: amounts,
            depositShares: 0
        });
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_Success_Withdrawal() public {
        (bytes32 reqId, uint208 shares) = test_RequestWithdrawal_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: reqId,
            symbols: new bytes32[](0),
            amounts: new uint256[](0)
        });

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_Success_DepositAndWithdrawal() public {
        (uint16[] memory tokens, uint256[] memory amounts, bytes32 depReqId) = test_RequestDeposit_Success();
        (bytes32 wReqId, ) = test_RequestWithdrawal_Success();

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: depReqId,
            tokenIds: tokens,
            amounts: amounts,
            depositShares: 0
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: wReqId,
            symbols: new bytes32[](0),
            amounts: new uint256[](0)
        });

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_InvalidDepositRequestId() public {
        (bytes32 wReqId, ) = test_RequestWithdrawal_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: wReqId,
            tokenIds: new uint16[](0),
            amounts: new uint256[](0),
            depositShares: 0
        });
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.expectRevert("VM-ADRP-01");
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_InvalidWithdrawalRequestId() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: bytes32(0),
            symbols: new bytes32[](0),
            amounts: new uint256[](0)
        });

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.expectRevert("VM-AWRP-01");
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_InvalidDepositHash() public {
        (uint16[] memory tokens, uint256[] memory amounts, bytes32 depReqId) = test_RequestDeposit_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.expectRevert("VM-DHMR-01");
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_InvalidWithdrawalHash() public {
        (bytes32 wReqId, ) = test_RequestWithdrawal_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.expectRevert("VM-WHMR-01");
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_InvalidDepositTokens() public {
        (uint16[] memory tokens, uint256[] memory amounts, bytes32 depReqId) = test_RequestDeposit_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: depReqId,
            tokenIds: new uint16[](0),
            amounts: amounts,
            depositShares: 0
        });
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.expectRevert("VM-IVAL-01");
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_TooEarly() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.expectRevert("VM-RCNP-01");
        manager.unwindBatch(deposits, withdrawals);
    }
}
