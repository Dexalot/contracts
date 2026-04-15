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

        _setupVault(0, tokenIds, amounts, 10000e18);
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

    function _finalizeBatch() internal returns (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) {
        // 1. Build the Prices Array (Length MUST match manager.tokenIndex())
        prices = new uint256[](2);
        prices[0] = 1e17; // Price for tokenId 0 (ALOT)
        prices[1] = 1e18; // Price for tokenId 1 (USDC)

        // 2. Build the Vaults Array
        vaults = new IOmniVaultManager.VaultState[](1);
        uint256[] memory balances = new uint256[](2);
        balances[0] = 10_000;
        balances[1] = 50_000;
        vaults[0] = IOmniVaultManager.VaultState({
            vaultId: 0,
            tokenIds: manager.getVaultDetails(0).tokens,
            balances: balances
        });

        // 3. Execute the Finalization as the Settler
        vm.prank(SETTLER);
        manager.finalizeBatch(prices, vaults);

        // 4. Return the exact arrays so the test can use them for settlement hashes
        return (prices, vaults);
    }

    function test_Initialize_SetsCorrectRoles() public {
        assertTrue(manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), ADMIN));
        assertTrue(manager.hasRole(manager.SETTLER_ROLE(), SETTLER));
        assertEq(manager.VERSION(), bytes32("1.2.3"));
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

    function test_DeprecateVault_Success() public {
        vm.prank(ADMIN);
        manager.deprecateVault(0);

        IOmniVaultManager.VaultDetails memory details = manager.getVaultDetails(0);
        assertEq(uint256(details.status), uint256(IOmniVaultManager.VaultStatus.DEPRECATED));
    }

    function test_DeprecateVault_RevertIf_NotExistingVault() public {
        vm.expectRevert("VM-VSNN-01");
        vm.prank(ADMIN);
        manager.deprecateVault(1);
    }

    function test_DeprecateVault_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                manager.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        manager.deprecateVault(0);
    }

    function test_DeprecateVault_RevertIf_PendingRequests() public {
        uint16[] memory tokenIds = new uint16[](1);
        tokenIds[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000;

        vm.prank(proposer);
        manager.requestDeposit(0, tokenIds, amounts);

        vm.expectRevert("VM-PRNZ-01");
        vm.prank(ADMIN);
        manager.deprecateVault(0);
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

    function test_UpdateVaultDetails_Success_NewTokens() public {
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 1;

        IOmniVaultManager.VaultDetails memory details = manager.getVaultDetails(0);
        details.tokens = tokens;

        vm.startPrank(ADMIN);
        manager.pauseVault(0);
        manager.updateVaultDetails(0, details);
        vm.stopPrank();

        details = manager.getVaultDetails(0);
        assertEq(details.tokens[0], 1);
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

        vm.expectRevert("VM-PRNZ-01");
        manager.updateVaultDetails(0, newDetails);
        vm.stopPrank();
    }

    function test_UpdateVaultDetails_RevertIf_NotPaused() public {
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

        vm.expectRevert("VM-VSNP-01");
        vm.prank(ADMIN);
        manager.updateVaultDetails(0, newDetails);
    }

    function test_UpdateVaultDetails_RevertIf_PrevBatchFinalized() public {
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
        _finalizeBatch();

        vm.startPrank(ADMIN);
        manager.pauseVault(0);

        vm.expectRevert("VM-PBFS-01");
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
        manager.registerVault(wrongVaultId, details, tokenIds, amounts, 10000e18);
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
        manager.registerVault(1, details, tokenIds, amounts, 10000e18);
    }

    function test_RegisterVault_RevertIf_SharesLessThanMin() public {
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

        vm.expectRevert("VM-SLTM-01");
        vm.prank(ADMIN);
        manager.registerVault(1, details, tokenIds, amounts, 500e18);
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

    function test_RequestDeposit_RevertIf_DuplicateTokens() public {
        uint16[] memory tokens = new uint16[](2);
        tokens[0] = 0;
        tokens[1] = 0; // duplicate
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100;
        amounts[1] = 200;

        vm.prank(proposer);
        vm.expectRevert("VM-DTID-01");
        manager.requestDeposit(0, tokens, amounts);
    }

    // function test_RequestDeposit_RevertIf_TooManyPending() public {
    //     uint16[] memory tokens = new uint16[](1);
    //     tokens[0] = 0;
    //     uint256[] memory amounts = new uint256[](1);
    //     amounts[0] = 100;
    //     for (uint256 i = 0; i < manager.MAX_PENDING_REQUESTS(); i++) {
    //         manager.requestDeposit(0, tokens, amounts);
    //     }

    //     vm.prank(proposer);
    //     vm.expectRevert("VM-PRCL-01");
    //     manager.requestDeposit(0, tokens, amounts);
    // }

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

    function test_RequestWithdrawal_RevertIf_StatusNone() public {
        vm.prank(proposer);
        vm.expectRevert("VM-VSNN-01");
        manager.requestWithdrawal(1, 10);
    }

    // function test_RequestWithdrawal_RevertIf_TooManyPending() public {
    //     vm.startPrank(proposer);
    //     shareToken.mint(0, proposer, type(uint208).max);
    //     shareToken.approve(address(manager), type(uint208).max);
    //     for (uint256 i = 0; i < manager.MAX_PENDING_REQUESTS(); i++) {
    //         manager.requestWithdrawal(0, 10);
    //     }

    //     vm.expectRevert("VM-PRCL-01");
    //     manager.requestWithdrawal(0, 10);
    //     vm.stopPrank();
    // }

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
            process: true
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: wReq, process: true});

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);

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
            process: false
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);

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
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: wReq, process: true});

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);

        IOmniVaultManager.TransferRequest memory wRequest = manager.getTransferRequest(wReq);
        assertEq(wRequest.timestamp, 0);
    }

    function test_BulkSettleState_Success_WithdrawalRefund() public {
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: wReq, process: false});

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);

        IOmniVaultManager.TransferRequest memory wRequest = manager.getTransferRequest(wReq);
        assertEq(wRequest.timestamp, 0);
    }

    function test_BulkSettleState_RevertIf_BatchNotFinalized() public {
        test_BulkSettleState_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        uint256[] memory prices = new uint256[](2);
        prices[0] = 1e17;
        prices[1] = 1e18;

        IOmniVaultManager.VaultState[] memory vaults = new IOmniVaultManager.VaultState[](1);
        uint256[] memory balances = new uint256[](2);
        balances[0] = 10_000;
        balances[1] = 50_000;
        vaults[0] = IOmniVaultManager.VaultState({
            vaultId: 0,
            tokenIds: manager.getVaultDetails(0).tokens,
            balances: balances
        });

        vm.prank(SETTLER);
        vm.expectRevert("VM-BSNF-01");
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_IncorrectStateHash() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        // Tamper with prices to cause state hash mismatch
        prices[0] = 2e17;

        vm.prank(SETTLER);
        vm.expectRevert("VM-IVSH-01");
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
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

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.prank(SETTLER);
        vm.expectRevert("VM-DHMR-01");
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_WithdrawalHashMismatch() public {
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 10);
        bytes32 wReq = manager.requestWithdrawal(0, 10);
        vm.stopPrank();

        // Prepare fulfillments
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.prank(SETTLER);
        vm.expectRevert("VM-WHMR-01");
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
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
            process: true
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);
        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();
        vm.prank(SETTLER);
        vm.expectRevert("VM-ADRP-01");
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_InvalidWithdrawalRequestId() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({
            withdrawalRequestId: bytes32(0), // invalid withdrawal request id
            process: true
        });

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();
        vm.prank(SETTLER);
        vm.expectRevert("VM-AWRP-01");
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_NotSettler() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        vm.expectRevert();
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_FinalizeBatch_Success() public {
        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();
    }

    function test_FinalizeBatch_RevertIf_PrevBatchNotSettled() public {
        _finalizeBatch();

        console.log(manager.currentBatchId());

        vm.expectRevert("VM-PBNS-01");
        vm.prank(SETTLER);
        manager.finalizeBatch(new uint256[](0), new IOmniVaultManager.VaultState[](0));
    }

    function test_FinalizeBatch_RevertIf_PricesLengthMismatch() public {
        vm.expectRevert("VM-IVAL-01");
        vm.prank(SETTLER);
        manager.finalizeBatch(new uint256[](0), new IOmniVaultManager.VaultState[](1));
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
            process: true
        });
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_Success_Withdrawal() public {
        (bytes32 reqId, uint208 shares) = test_RequestWithdrawal_Success();
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: reqId, process: false});

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
            process: false
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: wReqId, process: false});

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
            process: false
        });
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.warp(block.timestamp + manager.RECLAIM_DELAY() + 1);

        vm.expectRevert("VM-ADRP-01");
        manager.unwindBatch(deposits, withdrawals);
    }

    function test_UnwindBatch_RevertIf_InvalidWithdrawalRequestId() public {
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: bytes32(0), process: false});

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
            process: false
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

    function testFuzz_FinalizeBatch_RevertIf_PricesLengthMismatch(uint8 randomLength) public {
        vm.assume(randomLength != manager.tokenIndex()); // Manager currently has 2 tokens (0 and 1)

        uint256[] memory badPrices = new uint256[](randomLength);
        IOmniVaultManager.VaultState[] memory vaults = new IOmniVaultManager.VaultState[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-IVAL-01");
        manager.finalizeBatch(badPrices, vaults);
    }

    function test_FinalizeBatch_RevertIf_CalledTwiceBeforeSettle() public {
        _finalizeBatch(); // First finalize succeeds

        // Attempting to finalize again while the current batch is in FINALIZED status
        uint256[] memory prices = new uint256[](2);
        IOmniVaultManager.VaultState[] memory vaults = new IOmniVaultManager.VaultState[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-PBNS-01"); //Prev batch state = finalized, not settled
        manager.finalizeBatch(prices, vaults);
    }

    function test_FinalizeBatch_Settle_EmptyBatch_Success() public {
        // No deposits or withdrawals made
        uint256[] memory prices = new uint256[](2);
        prices[0] = 1e18;
        prices[1] = 1e18;
        IOmniVaultManager.VaultState[] memory vaults = new IOmniVaultManager.VaultState[](0);

        vm.prank(SETTLER);
        manager.finalizeBatch(prices, vaults);

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);

        // Assert batch moved to SETTLED
        (, IOmniVaultManager.BatchStatus status, , , ) = manager.completedBatches(1);
        assertEq(uint256(status), uint256(IOmniVaultManager.BatchStatus.SETTLED));
    }

    function testFuzz_BulkSettleState_RevertIf_PricesTampered(uint256 tamperedPrice) public {
        vm.assume(tamperedPrice != 1e17); // 1e17 is the legitimate price set in _finalizeBatch()

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        (uint256[] memory originalPrices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        // Settler attempts to cheat by altering the price during settlement
        uint256[] memory tamperedPrices = new uint256[](2);
        tamperedPrices[0] = tamperedPrice;
        tamperedPrices[1] = originalPrices[1];

        vm.prank(SETTLER);
        vm.expectRevert("VM-IVSH-01"); // Invalid State Hash
        manager.bulkSettleState(tamperedPrices, vaults, deposits, withdrawals);
    }

    function testFuzz_BulkSettleState_RevertIf_VaultsTampered(uint256 tamperedBalance) public {
        vm.assume(tamperedBalance != 10_000); // 10_000 is the legitimate balance set in _finalizeBatch()

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory originalVaults) = _finalizeBatch();

        // Settler attempts to cheat by altering the vault balance during settlement
        originalVaults[0].balances[0] = tamperedBalance;

        vm.prank(SETTLER);
        vm.expectRevert("VM-IVSH-01"); // Invalid State Hash
        manager.bulkSettleState(prices, originalVaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_DepositMissing() public {
        // Create 2 distinct deposits
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts1 = new uint256[](1);
        amounts1[0] = 100;
        uint256[] memory amounts2 = new uint256[](1);
        amounts2[0] = 200;

        vm.startPrank(proposer);
        bytes32 req1 = manager.requestDeposit(0, tokens, amounts1);
        bytes32 req2 = manager.requestDeposit(0, tokens, amounts2); // req2 will be omitted
        vm.stopPrank();

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        // Omit the second deposit
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: req1,
            tokenIds: tokens,
            amounts: amounts1,
            process: true
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-DHMR-01"); // Deposit Hash Mismatch Revert
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_DepositOrderSwapped() public {
        // Create 2 distinct deposits
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.startPrank(proposer);
        bytes32 req1 = manager.requestDeposit(0, tokens, amounts);
        bytes32 req2 = manager.requestDeposit(0, tokens, amounts);
        vm.stopPrank();

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        // Provide them in the wrong order
        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](2);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: req2,
            tokenIds: tokens,
            amounts: amounts,
            process: true
        });
        deposits[1] = IOmniVaultManager.DepositFufillment({
            depositRequestId: req1,
            tokenIds: tokens,
            amounts: amounts,
            process: true
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.prank(SETTLER);
        vm.expectRevert("VM-DHMR-01"); // Strict FIFO ordering enforced by rolling hash
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_RevertIf_WithdrawalMissing() public {
        // Create 2 distinct withdrawals
        vm.startPrank(proposer);
        shareToken.approve(address(manager), 20);
        bytes32 wReq1 = manager.requestWithdrawal(0, 10);
        bytes32 wReq2 = manager.requestWithdrawal(0, 10); // wReq2 will be omitted
        vm.stopPrank();

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: wReq1, process: true});

        vm.prank(SETTLER);
        vm.expectRevert("VM-WHMR-01"); // Withdrawal Hash Mismatch
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_PartialProcess_RefundsCorrectly() public {
        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.startPrank(proposer);
        bytes32 req1 = manager.requestDeposit(0, tokens, amounts);
        bytes32 req2 = manager.requestDeposit(0, tokens, amounts);
        vm.stopPrank();

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](2);
        // Request 1 is accepted
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: req1,
            tokenIds: tokens,
            amounts: amounts,
            process: true
        });
        // Request 2 is rejected/refunded
        deposits[1] = IOmniVaultManager.DepositFufillment({
            depositRequestId: req2,
            tokenIds: tokens,
            amounts: amounts,
            process: false
        });

        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        // We expect a DEPOSIT_FAILED event emitted for req2
        vm.expectEmit(true, false, false, false);
        emit IOmniVaultManager.TransferRequestUpdate(
            req2,
            1,
            proposer,
            IOmniVaultManager.RequestStatus.DEPOSIT_FAILED,
            tokens,
            amounts
        );

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }

    function test_BulkSettleState_WithdrawalProcessFalse_ReturnsShares() public {
        uint208 withdrawAmount = 10;

        vm.startPrank(proposer);
        uint256 initialShares = shareToken.balanceOf(proposer);
        shareToken.approve(address(manager), withdrawAmount);
        bytes32 wReq = manager.requestWithdrawal(0, withdrawAmount);
        vm.stopPrank();

        // User balance should have decreased due to the transfer to the manager
        assertEq(shareToken.balanceOf(proposer), initialShares - withdrawAmount);

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](1);

        // Mark process = false to trigger refund logic
        withdrawals[0] = IOmniVaultManager.WithdrawalFufillment({withdrawalRequestId: wReq, process: false});

        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);

        // Shares should be fully refunded to the proposer
        assertEq(shareToken.balanceOf(proposer), initialShares);
    }

    function test_BulkSettleState_RevertIf_AlreadySettled() public {
        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](0);
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        vm.startPrank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals); // First settle

        // Attempt to settle the same batch again
        vm.expectRevert("VM-BSNF-01"); // Batch Status Not Finalized
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
        vm.stopPrank();
    }

    function testFuzz_Settle_SharesCalculation_PrecisionLoss(uint256 tinyAmount) public {
        // Test edge case where deposit amount is so small it results in 0 USD value / 0 shares
        vm.assume(tinyAmount > 0 && tinyAmount < 10);

        uint16[] memory tokens = new uint16[](1);
        tokens[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = tinyAmount;

        vm.startPrank(proposer);
        bytes32 req = manager.requestDeposit(0, tokens, amounts);
        vm.stopPrank();

        (uint256[] memory prices, IOmniVaultManager.VaultState[] memory vaults) = _finalizeBatch();

        IOmniVaultManager.DepositFufillment[] memory deposits = new IOmniVaultManager.DepositFufillment[](1);
        deposits[0] = IOmniVaultManager.DepositFufillment({
            depositRequestId: req,
            tokenIds: tokens,
            amounts: amounts,
            process: true
        });
        IOmniVaultManager.WithdrawalFufillment[] memory withdrawals = new IOmniVaultManager.WithdrawalFufillment[](0);

        // We expect this to execute safely, rounding the minted shares down to 0 without panicking
        vm.prank(SETTLER);
        manager.bulkSettleState(prices, vaults, deposits, withdrawals);
    }
}
