// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ECDSAUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import {OmniVaultCreator} from "contracts/vaults/OmniVaultCreator.sol";

import {IOmniVaultCreator} from "contracts/interfaces/IOmniVaultCreator.sol";
import "contracts/mocks/MockToken.sol";

contract OmniVaultCreatorTest is Test {
    OmniVaultCreator public creator;

    address internal constant ADMIN = address(0xBEEF);
    address internal proposer;
    uint256 internal constant proposerKey = 0x1234;

    MockToken internal feeToken;
    MockToken internal baseToken;
    MockToken internal quoteToken;

    address internal constant OMNI_VAULT_MOCK = address(0x0420);
    address internal constant DEFAULT_BURN_ADDRESS = address(0xDEAD);

    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x0000000000000000000000000000000000000000000000000000000000000000;

    // Amounts
    uint256 internal constant INITIAL_FEE_AMOUNT = 100 * 1e6;
    uint256 internal constant BASE_AMOUNT = 500;
    uint256 internal constant QUOTE_AMOUNT = 1000;
    uint32 internal constant CHAIN_ID = 31337;

    function setUp() public {
        // 1. Setup Proposer
        proposer = vm.addr(proposerKey);

        vm.startPrank(ADMIN);

        // 2. Deploy Mock Tokens
        feeToken = new MockToken("USDC", "USDC", 6);
        baseToken = new MockToken("ZRO", "ZRO", 18);
        quoteToken = new MockToken("USDT", "USDT", 6);

        // 3. Mint tokens to proposer
        feeToken.mint(proposer, 1_000_000 * 1e6);
        baseToken.mint(proposer, 1_000_000 * 1e18);
        quoteToken.mint(proposer, 1_000_000 * 1e6);
        vm.stopPrank();

        // 4. Deploy Creator
        creator = new OmniVaultCreator();
        creator.initialize(ADMIN);

        // 5. Approve Creator (Now that we have the address)
        vm.startPrank(proposer);
        feeToken.approve(address(creator), type(uint256).max);
        baseToken.approve(address(creator), type(uint256).max);
        quoteToken.approve(address(creator), type(uint256).max);
        vm.stopPrank();

        // 6. Configure Fee Token
        vm.prank(ADMIN);
        creator.setFeeToken(address(feeToken));
    }

    // Helper to verify expected calls on the Real Mock Tokens
    function mockTokenTransfer(address token, address from, address to, uint256 amount) internal {
        if (from == proposer) {
            // Verifies that creator calls transferFrom(proposer, creator, amount)
            vm.expectCall(
                token,
                abi.encodeWithSelector(IERC20Upgradeable.transferFrom.selector, proposer, address(creator), amount)
            );
        } else if (to == proposer || to == ADMIN || to == OMNI_VAULT_MOCK) {
            // Verifies that creator calls transfer(to, amount)
            vm.expectCall(token, abi.encodeWithSelector(IERC20Upgradeable.transfer.selector, to, amount));
        }
    }

    // --- TEST INITIALIZATION ---

    function testInitializeSetsAdminAndDefaultValues() public {
        assertEq(creator.reclaimDelay(), 7 days, "Reclaim delay incorrect");
        assertEq(creator.feeAmount(), INITIAL_FEE_AMOUNT, "Fee amount incorrect");
    }

    function testInitializeRevertsIfAdminIsZero() public {
        OmniVaultCreator newCreator = new OmniVaultCreator();
        vm.expectRevert("VC-SAZ-01");
        newCreator.initialize(address(0));
    }

    // --- TEST ADMIN FUNCTIONS ---

    function testSetFeeToken() public {
        address newFeeToken = address(0xDEAD);
        vm.prank(ADMIN);
        vm.expectEmit(true, true, false, true);
        emit IOmniVaultCreator.FeeTokenUpdated(newFeeToken, address(feeToken));
        creator.setFeeToken(newFeeToken);
        assertEq(creator.feeToken(), newFeeToken, "Fee token not updated");
    }

    function testSetFeeTokenRevertsIfZeroAddress() public {
        vm.prank(ADMIN);
        vm.expectRevert("VC-SAZ-01");
        creator.setFeeToken(address(0));
    }

    function testSetFeeAmount() public {
        uint64 newFee = 500 * 1e6;
        vm.prank(ADMIN);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultCreator.FeeUpdated(newFee, uint64(INITIAL_FEE_AMOUNT));
        creator.setFeeAmount(newFee);
        assertEq(creator.feeAmount(), newFee, "Fee amount not updated");
    }

    function testSetReclaimDelay() public {
        uint256 newDelay = 20 days;
        vm.prank(ADMIN);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultCreator.ReclaimDelayUpdated(newDelay, 7 days);
        creator.setReclaimDelay(newDelay);
        assertEq(creator.reclaimDelay(), newDelay, "Reclaim delay not updated");
    }

    function testSetReclaimDelayRevertsIfTooLong() public {
        vm.prank(ADMIN);
        vm.expectRevert("VC-IRDL-01");
        creator.setReclaimDelay(30 days);
    }

    // --- TEST RISK ACKNOWLEDGEMENT ---

    function testAcknowledgeRiskDisclosure() public {
        bytes32 messageHash = ECDSAUpgradeable.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(proposer);
        vm.expectEmit(true, false, false, false);
        emit IOmniVaultCreator.RiskAcknowledged(proposer);
        creator.acknowledgeRiskDisclosure(signature);

        assertTrue(creator.hasAcknowledgedRisk(proposer), "Risk not acknowledged");
    }

    function testAcknowledgeRiskDisclosureRevertsIfAlreadyAcknowledged() public {
        bytes32 messageHash = ECDSAUpgradeable.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.startPrank(proposer);
        creator.acknowledgeRiskDisclosure(signature);

        vm.expectRevert("VC-RDAA-01");
        creator.acknowledgeRiskDisclosure(signature);
        vm.stopPrank();
    }

    function testAcknowledgeRiskDisclosureRevertsIfInvalidSignature() public {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x999999, bytes32(0)); // Wrong key
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.prank(proposer);
        vm.expectRevert("VC-IRDS-01");
        creator.acknowledgeRiskDisclosure(badSignature);
    }

    // --- TEST OPEN PAIR VAULT ---

    function testOpenPairVaultSuccess() public returns (bytes32) {
        // Acknowledge risk
        bytes32 messageHash = ECDSAUpgradeable.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(proposer);
        creator.acknowledgeRiskDisclosure(signature);

        // Expect Calls on the REAL tokens
        mockTokenTransfer(address(feeToken), proposer, address(creator), INITIAL_FEE_AMOUNT);
        mockTokenTransfer(address(baseToken), proposer, address(creator), BASE_AMOUNT);
        mockTokenTransfer(address(quoteToken), proposer, address(creator), QUOTE_AMOUNT);

        // Setup call data
        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        vm.startPrank(proposer);
        vm.chainId(CHAIN_ID); // Fix: use chainId() not roll()
        bytes32 requestId = creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
        vm.stopPrank();

        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(requestId);
        assertEq(request.proposer, proposer, "Proposer incorrect");
        assertEq(uint256(request.status), uint256(IOmniVaultCreator.VaultRequestStatus.PENDING), "Status incorrect");
        assertEq(request.feeCollected, INITIAL_FEE_AMOUNT, "Fee collected incorrect");

        return requestId;
    }

    function testOpenPairVaultRevertsIfUnacknowledgedRisk() public {
        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        vm.prank(proposer);
        vm.chainId(CHAIN_ID);
        vm.expectRevert("VC-RDNS-01");
        creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
    }

    function testOpenPairVaultRevertsIfInvalidArrayLength() public {
        bytes32 messageHash = ECDSAUpgradeable.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(proposer);
        creator.acknowledgeRiskDisclosure(signature);

        address[] memory baseTokens = new address[](2);
        address[] memory quoteTokens = new address[](1);
        uint32[] memory chainIds = new uint32[](1);

        vm.prank(proposer);
        vm.expectRevert("VC-IVAL-01");
        creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
    }

    function testOpenPairVaultRevertsIfInvalidChainId() public {
        bytes32 messageHash = ECDSAUpgradeable.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(proposer);
        creator.acknowledgeRiskDisclosure(signature);

        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(999);

        vm.prank(proposer);
        vm.chainId(CHAIN_ID);
        vm.expectRevert("VC-IVCI-01");
        creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
    }

    // --- TEST REJECT VAULT REQUEST ---

    function testRejectVaultRequestFailsIfNotPending() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.prank(ADMIN);
        creator.rejectVaultRequest(requestId);

        vm.prank(ADMIN);
        vm.expectRevert("VC-IVRS-01");
        creator.rejectVaultRequest(requestId);
    }

    // --- TEST RECLAIM REQUEST ---

    function testReclaimRequestSuccessAfterDelay() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        mockTokenTransfer(address(feeToken), address(creator), proposer, INITIAL_FEE_AMOUNT);
        mockTokenTransfer(address(baseToken), address(creator), proposer, BASE_AMOUNT);
        mockTokenTransfer(address(quoteToken), address(creator), proposer, QUOTE_AMOUNT);

        vm.prank(proposer);
        vm.expectEmit(true, false, false, false);
        emit IOmniVaultCreator.VaultCreationUpdate(requestId, IOmniVaultCreator.VaultRequestStatus.RECLAIMED);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        creator.reclaimRequest(requestId, tokens, amounts);

        assertEq(creator.collectedFees(), 0, "Collected fees should be reduced");
        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(requestId);
        assertEq(address(request.proposer), address(0), "Request should be deleted");
    }

    function testReclaimRequestSuccessAfterRejection() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.prank(ADMIN);
        creator.rejectVaultRequest(requestId);

        mockTokenTransfer(address(feeToken), address(creator), proposer, INITIAL_FEE_AMOUNT);
        mockTokenTransfer(address(baseToken), address(creator), proposer, BASE_AMOUNT);
        mockTokenTransfer(address(quoteToken), address(creator), proposer, QUOTE_AMOUNT);

        vm.prank(proposer);
        vm.expectEmit(true, false, false, false);
        emit IOmniVaultCreator.VaultCreationUpdate(requestId, IOmniVaultCreator.VaultRequestStatus.RECLAIMED);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        creator.reclaimRequest(requestId, tokens, amounts);

        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(requestId);
        assertEq(address(request.proposer), address(0), "Request should be deleted");
    }

    function testReclaimRequestRevertsIfTooEarly() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.warp(block.timestamp + 1 days);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.prank(proposer);
        vm.expectRevert("VC-IVRS-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    function testReclaimRequestRevertsIfNotProposer() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.prank(DEFAULT_BURN_ADDRESS);
        vm.expectRevert("VC-SNEP-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    function testReclaimRequestRevertsIfInvalidTokensOrAmounts() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](1);
        tokens[0] = address(baseToken);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = BASE_AMOUNT;

        vm.prank(proposer);
        vm.expectRevert("VC-IDHM-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    // --- TEST ACCEPT AND FUND VAULT ---

    function testAcceptAndFundVaultSuccess() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        mockTokenTransfer(address(baseToken), address(creator), OMNI_VAULT_MOCK, BASE_AMOUNT);
        mockTokenTransfer(address(quoteToken), address(creator), OMNI_VAULT_MOCK, QUOTE_AMOUNT);

        uint256 expectedFees = INITIAL_FEE_AMOUNT;

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.prank(ADMIN);
        vm.expectEmit(true, false, false, false);
        emit IOmniVaultCreator.VaultCreationUpdate(requestId, IOmniVaultCreator.VaultRequestStatus.ACCEPTED);
        creator.acceptAndFundVault(requestId, OMNI_VAULT_MOCK, tokens, amounts);

        assertEq(creator.collectedFees(), expectedFees, "Collected fees incorrect");
        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(requestId);
        assertEq(address(request.proposer), address(0), "Request should be deleted");
    }

    function testAcceptAndFundVaultRevertsIfRequestNotFound() public {
        vm.prank(ADMIN);
        vm.expectRevert("VC-SNEP-01");
        creator.acceptAndFundVault(bytes32(0), OMNI_VAULT_MOCK, new address[](0), new uint256[](0));
    }

    function testAcceptAndFundVaultRevertsIfVaultAddressIsZero() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.prank(ADMIN);
        vm.expectRevert("VC-SAZ-01");
        creator.acceptAndFundVault(requestId, address(0), tokens, amounts);
    }

    // VC-SNEP-01

    function testAcceptAndFundVaultRevertsIfNotPending() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        vm.prank(ADMIN);
        creator.rejectVaultRequest(requestId);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.prank(ADMIN);
        vm.expectRevert("VC-IVRS-01");
        creator.acceptAndFundVault(requestId, OMNI_VAULT_MOCK, tokens, amounts);
    }

    function testAcceptAndFundVaultRevertsIfInvalidTokensOrAmounts() public {
        bytes32 requestId = testOpenPairVaultSuccess();

        address[] memory tokens = new address[](1);
        tokens[0] = address(baseToken);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = BASE_AMOUNT;

        vm.prank(ADMIN);
        vm.expectRevert("VC-IDHM-01");
        creator.acceptAndFundVault(requestId, OMNI_VAULT_MOCK, tokens, amounts);
    }

    // --- TEST WITHDRAW COLLECTED FEES ---

    function testWithdrawCollectedFeesSuccess() public {
        testAcceptAndFundVaultSuccess();

        uint256 expectedFees = creator.collectedFees();

        mockTokenTransfer(address(feeToken), address(creator), ADMIN, expectedFees);

        vm.prank(ADMIN);
        creator.withdrawCollectedFees();

        assertEq(creator.collectedFees(), 0, "Collected fees should be zero after withdrawal");
    }

    function testWithdrawCollectedFeesZeroAmount() public {
        uint256 initialFees = creator.collectedFees();
        assertEq(initialFees, 0, "Initial fees should be zero");

        vm.prank(ADMIN);
        vm.expectCall(
            address(feeToken),
            abi.encodeWithSelector(IERC20Upgradeable.transfer.selector, ADMIN, initialFees)
        );
        creator.withdrawCollectedFees();

        assertEq(creator.collectedFees(), 0, "Fees should remain zero");
    }
}
