// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin-v5/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin-v5/access/IAccessControl.sol";
import {MessageHashUtils} from "@openzeppelin-v5/utils/cryptography/MessageHashUtils.sol";

import {OmniVaultCreator} from "contracts/vaults/OmniVaultCreator.sol";

import {IOmniVaultCreator} from "contracts/interfaces/IOmniVaultCreator.sol";
import {MockToken} from "contracts/mocks/MockToken.sol";

contract OmniVaultCreatorTest is Test {
    OmniVaultCreator public creator;

    address internal constant ADMIN = address(0xBEEF);
    address internal proposer;
    uint256 internal constant proposerKey = 0x1234;

    MockToken internal feeToken;
    MockToken internal baseToken;
    MockToken internal quoteToken;

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
        vm.startPrank(ADMIN);
        creator.setFeeToken(address(feeToken));
        creator.setFeeAmount(uint64(INITIAL_FEE_AMOUNT));
        vm.stopPrank();
    }

    // Helper to verify expected calls on the Real Mock Tokens
    function mockTokenTransfer(address token, address from, address to, uint256 amount) internal {
        if (from == proposer) {
            // Verifies that creator calls transferFrom(proposer, creator, amount)
            vm.expectCall(
                token,
                abi.encodeWithSelector(IERC20.transferFrom.selector, proposer, address(creator), amount)
            );
        } else {
            // Verifies that creator calls transfer(to, amount)
            // This covers ADMIN withdrawals, Reclaims to proposer, and Funding to VaultExecutors
            vm.expectCall(token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        }
    }

    // --- TEST INITIALIZATION ---

    function test_Initialize_SetsCorrectState() public {
        assertEq(creator.reclaimDelay(), 7 days, "Reclaim delay incorrect");
        assertEq(creator.feeAmount(), INITIAL_FEE_AMOUNT, "Fee amount incorrect");
    }

    function test_Initialize_RevertIf_AdminIsZero() public {
        OmniVaultCreator newCreator = new OmniVaultCreator();
        vm.expectRevert("VC-SAZ-01");
        newCreator.initialize(address(0));
    }

    // --- TEST ADMIN FUNCTIONS ---

    function test_SetFeeToken_Success(address _newFeeToken) public {
        vm.assume(_newFeeToken != address(0) && _newFeeToken != address(feeToken));
        vm.prank(ADMIN);
        vm.expectEmit(true, true, false, true);
        emit IOmniVaultCreator.FeeTokenUpdated(_newFeeToken, address(feeToken));
        creator.setFeeToken(_newFeeToken);
        assertEq(creator.feeToken(), _newFeeToken);
    }

    function test_SetFeeToken_RevertIf_ZeroAddress() public {
        vm.prank(ADMIN);
        vm.expectRevert("VC-SAZ-01");
        creator.setFeeToken(address(0));
    }

    function test_SetFeeToken_RevertIf_PendingFeesExist(
        address _newFeeToken,
        uint256 _baseAmount,
        uint256 _quoteAmount
    ) public {
        vm.assume(_newFeeToken != address(0) && _newFeeToken != address(feeToken));
        test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.prank(ADMIN);
        vm.expectRevert("VC-FTNF-01");
        creator.setFeeToken(_newFeeToken);
    }

    function test_SetFeeToken_RevertIf_ClaimableFeesExist(
        address _newFeeToken,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        address _vaultExecutor
    ) public {
        vm.assume(_newFeeToken != address(0) && _newFeeToken != address(feeToken));
        test_AcceptAndFundVault_Success(_baseAmount, _quoteAmount, _vaultExecutor);

        vm.prank(ADMIN);
        vm.expectRevert("VC-FTNF-01");
        creator.setFeeToken(_newFeeToken);
    }

    function test_SetFeeToken_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                creator.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        creator.setFeeToken(address(0));
    }

    function test_SetFeeAmount_Success(uint64 _newFee) public {
        vm.prank(ADMIN);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultCreator.FeeUpdated(_newFee, uint64(INITIAL_FEE_AMOUNT));
        creator.setFeeAmount(_newFee);
        assertEq(creator.feeAmount(), _newFee);
    }

    function test_SetFeeAmount_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                creator.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        creator.setFeeAmount(0);
    }

    function test_SetReclaimDelay_Success(uint256 _newDelay) public {
        vm.assume(_newDelay < 28 days);
        vm.prank(ADMIN);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultCreator.ReclaimDelayUpdated(_newDelay, 7 days);
        creator.setReclaimDelay(_newDelay);
        assertEq(creator.reclaimDelay(), _newDelay);
    }

    function test_SetReclaimDelay_RevertIf_DelayTooLong(uint256 _newDelay) public {
        vm.assume(_newDelay > 28 days);
        vm.prank(ADMIN);
        vm.expectRevert("VC-IRDL-01");
        creator.setReclaimDelay(_newDelay);
    }

    function test_SetReclaimDelay_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                creator.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        creator.setReclaimDelay(0);
    }

    // --- TEST RISK ACKNOWLEDGEMENT ---

    function test_AcknowledgeRiskDisclosure_Success() public {
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(proposer);
        vm.expectEmit(true, false, false, false);
        emit IOmniVaultCreator.RiskAcknowledged(proposer);
        creator.acknowledgeRiskDisclosure(signature);

        assertTrue(creator.hasAcknowledgedRisk(proposer));
    }

    function test_AcknowledgeRiskDisclosure_RevertIf_AlreadyAcknowledged() public {
        _helper_AcknowledgeRisk();

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(proposer);
        vm.expectRevert("VC-RDAA-01");
        creator.acknowledgeRiskDisclosure(signature);
    }

    function test_AcknowledgeRiskDisclosure_RevertIf_InvalidSigner(uint128 _key) public {
        vm.assume(_key != proposerKey && _key != 0);
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, messageHash);
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.prank(proposer);
        vm.expectRevert("VC-IRDS-01");
        creator.acknowledgeRiskDisclosure(badSignature);
    }

    function test_AcknowledgeRiskDisclosure_RevertIf_InvalidMessage(string memory _message) public {
        vm.assume(keccak256(bytes(_message)) != keccak256(bytes(creator.RISK_DISCLOSURE())));
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(bytes(_message));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.prank(proposer);
        vm.expectRevert("VC-IRDS-01");
        creator.acknowledgeRiskDisclosure(badSignature);
    }

    function _helper_AcknowledgeRisk() private {
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(bytes(creator.RISK_DISCLOSURE()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.prank(proposer);
        creator.acknowledgeRiskDisclosure(signature);
    }

    // --- TEST OPEN PAIR VAULT ---

    function test_OpenPairVault_Success(uint256 _baseAmount, uint256 _quoteAmount) public returns (bytes32) {
        vm.assume(_baseAmount >= 0 && _baseAmount < 1_000 * 1e18);
        vm.assume(_quoteAmount >= 0 && _quoteAmount < 1_000 * 1e6);

        _helper_AcknowledgeRisk();

        mockTokenTransfer(address(feeToken), proposer, address(creator), INITIAL_FEE_AMOUNT);
        mockTokenTransfer(address(baseToken), proposer, address(creator), _baseAmount);
        mockTokenTransfer(address(quoteToken), proposer, address(creator), _quoteAmount);

        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        vm.startPrank(proposer);
        vm.chainId(CHAIN_ID);
        bytes32 requestId = creator.openPairVault(baseTokens, quoteTokens, chainIds, _baseAmount, _quoteAmount);
        vm.stopPrank();

        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(requestId);
        assertEq(request.proposer, proposer);
        assertEq(uint256(request.status), uint256(IOmniVaultCreator.VaultRequestStatus.PENDING));

        return requestId;
    }

    function test_OpenPairVault_RevertIf_RiskNotAcknowledged() public {
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

    function test_OpenPairVault_RevertIf_ArrayLengthMismatch() public {
        _helper_AcknowledgeRisk();

        address[] memory baseTokens = new address[](2);
        address[] memory quoteTokens = new address[](1);
        uint32[] memory chainIds = new uint32[](1);

        vm.prank(proposer);
        vm.expectRevert("VC-IVAL-01");
        creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
    }

    function test_OpenPairVault_RevertIf_InvalidChainId() public {
        _helper_AcknowledgeRisk();

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

    function test_RejectVaultRequest_RevertIf_NotPending(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.prank(ADMIN);
        creator.rejectVaultRequest(requestId);

        vm.prank(ADMIN);
        vm.expectRevert("VC-IVRS-01");
        creator.rejectVaultRequest(requestId);
    }

    function test_RejectVaultRequest_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                creator.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        creator.rejectVaultRequest(bytes32(0));
    }

    // --- TEST RECLAIM REQUEST ---

    function test_ReclaimRequest_Success_AfterDelay(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        mockTokenTransfer(address(feeToken), address(creator), proposer, INITIAL_FEE_AMOUNT);
        mockTokenTransfer(address(baseToken), address(creator), proposer, _baseAmount);
        mockTokenTransfer(address(quoteToken), address(creator), proposer, _quoteAmount);

        vm.prank(proposer);
        emit IOmniVaultCreator.VaultCreationUpdate(requestId, IOmniVaultCreator.VaultRequestStatus.RECLAIMED);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _baseAmount;
        amounts[1] = _quoteAmount;

        creator.reclaimRequest(requestId, tokens, amounts);
        assertEq(creator.collectedFees(), 0);
    }

    function test_ReclaimRequest_Success_AfterRejection(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.prank(ADMIN);
        creator.rejectVaultRequest(requestId);

        vm.prank(proposer);
        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _baseAmount;
        amounts[1] = _quoteAmount;

        creator.reclaimRequest(requestId, tokens, amounts);

        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(requestId);
        assertEq(address(request.proposer), address(0));
    }

    function test_ReclaimRequest_RevertIf_TooEarly(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.warp(block.timestamp + 1 days);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _baseAmount;
        amounts[1] = _quoteAmount;

        vm.prank(proposer);
        vm.expectRevert("VC-IVRS-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    function test_ReclaimRequest_RevertIf_SenderNotProposer(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);
        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);

        vm.prank(ADMIN);
        vm.expectRevert("VC-SNEP-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    function test_ReclaimRequest_RevertIf_InvalidTokensOrAmounts(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);
        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](1);
        tokens[0] = address(baseToken);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _baseAmount;

        vm.prank(proposer);
        vm.expectRevert("VC-IDHM-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    function test_ReclaimRequest_RevertIf_FeeOnTransferTokenFails(uint256 _baseAmount, uint256 _quoteAmount) public {
        _baseAmount = bound(_baseAmount, 100, 1_000 * 1e18); // bound so at lest 1 gwei fee is taken
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.prank(ADMIN);
        baseToken.setFeeOnTransfer(true);

        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _baseAmount;
        amounts[1] = _quoteAmount;

        vm.prank(proposer);
        vm.expectRevert("VC-BTNM-01");
        creator.reclaimRequest(requestId, tokens, amounts);
    }

    // --- TEST ACCEPT AND FUND VAULT ---

    function test_AcceptAndFundVault_Success(uint256 _baseAmount, uint256 _quoteAmount, address _vaultExecutor) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);
        vm.assume(_vaultExecutor != address(0));

        mockTokenTransfer(address(baseToken), address(creator), _vaultExecutor, _baseAmount);
        mockTokenTransfer(address(quoteToken), address(creator), _vaultExecutor, _quoteAmount);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _baseAmount;
        amounts[1] = _quoteAmount;

        vm.prank(ADMIN);
        creator.acceptAndFundVault(requestId, _vaultExecutor, tokens, amounts);

        assertEq(creator.collectedFees(), INITIAL_FEE_AMOUNT);
    }

    function test_AcceptAndFundVault_RevertIf_VaultAddressZero(uint256 _baseAmount, uint256 _quoteAmount) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _baseAmount;
        amounts[1] = _quoteAmount;

        vm.prank(ADMIN);
        vm.expectRevert("VC-SAZ-01");
        creator.acceptAndFundVault(requestId, address(0), tokens, amounts);
    }

    function test_AcceptAndFundVault_RevertIf_RequestNotFound(
        bytes32 _requestId,
        address _vaultExecutor,
        address[] calldata _tokens,
        uint256[] calldata _amounts
    ) public {
        vm.assume(_vaultExecutor != address(0));
        vm.prank(ADMIN);
        vm.expectRevert("VC-SNEP-01");
        creator.acceptAndFundVault(_requestId, _vaultExecutor, _tokens, _amounts);
    }

    function test_AcceptAndFundVault_RevertIf_NotPending(
        uint256 _baseAmount,
        uint256 _quoteAmount,
        address _vaultExecutor
    ) public {
        vm.assume(_vaultExecutor != address(0));
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);

        vm.prank(ADMIN);
        creator.rejectVaultRequest(requestId);

        address[] memory tokens = new address[](2);

        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);

        vm.prank(ADMIN);
        vm.expectRevert("VC-IVRS-01");
        creator.acceptAndFundVault(requestId, _vaultExecutor, tokens, amounts);
    }

    function test_AcceptAndFundVault_RevertIf_InvalidTokensOrAmounts(
        uint256 _baseAmount,
        uint256 _quoteAmount,
        address _vaultExecutor
    ) public {
        bytes32 requestId = test_OpenPairVault_Success(_baseAmount, _quoteAmount);
        vm.assume(_vaultExecutor != address(0));

        address[] memory tokens = new address[](1);
        tokens[0] = address(baseToken);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _baseAmount;

        vm.prank(ADMIN);
        vm.expectRevert("VC-IDHM-01");
        creator.acceptAndFundVault(requestId, _vaultExecutor, tokens, amounts);
    }

    function test_AcceptAndFundVault_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                creator.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        creator.acceptAndFundVault(bytes32(0), address(0), new address[](0), new uint256[](0));
    }

    // --- TEST WITHDRAW COLLECTED FEES ---

    function test_WithdrawCollectedFees_Success(
        uint256 _baseAmount,
        uint256 _quoteAmount,
        address _vaultExecutor
    ) public {
        test_AcceptAndFundVault_Success(_baseAmount, _quoteAmount, _vaultExecutor);
        uint256 expectedFees = creator.collectedFees();

        mockTokenTransfer(address(feeToken), address(creator), ADMIN, expectedFees);

        vm.prank(ADMIN);
        creator.withdrawCollectedFees();

        assertEq(creator.collectedFees(), 0);
    }

    function test_WithdrawCollectedFees_RevertIf_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proposer,
                creator.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proposer);
        creator.withdrawCollectedFees();
    }

    function testFuzz_OpenPairVault_ZeroAmounts(uint256 baseAmt, uint256 quoteAmt) public {
        // Edge Case: Allow creating a vault with 0 initial deposit (if business logic permits)
        // Bound to prevent overflow/out-of-gas on mints
        vm.assume(baseAmt < 1_000_000 * 1e18);
        vm.assume(quoteAmt < 1_000_000 * 1e6);

        _helper_AcknowledgeRisk();

        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        vm.prank(proposer);
        vm.chainId(CHAIN_ID);
        bytes32 reqId = creator.openPairVault(baseTokens, quoteTokens, chainIds, baseAmt, quoteAmt);

        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(reqId);
        assertEq(request.proposer, proposer);
    }

    function test_OpenPairVault_EmptyArrays() public {
        _helper_AcknowledgeRisk();
        address[] memory empty = new address[](0);
        uint32[] memory emptyChains = new uint32[](0);

        vm.prank(proposer);
        // Expect an out-of-bounds panic because openPairVault accesses chainIds[0] without checking length > 0
        vm.expectRevert();
        creator.openPairVault(empty, empty, emptyChains, BASE_AMOUNT, QUOTE_AMOUNT);
    }

    function testFuzz_AcceptAndFundVault_HashMismatch(uint256 tamperedBase) public {
        vm.assume(tamperedBase != BASE_AMOUNT);
        bytes32 reqId = test_OpenPairVault_Success(BASE_AMOUNT, QUOTE_AMOUNT);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory badAmounts = new uint256[](2);
        badAmounts[0] = tamperedBase; // Tampered amount
        badAmounts[1] = QUOTE_AMOUNT;

        vm.prank(ADMIN);
        vm.expectRevert("VC-IDHM-01"); // initialDepositHash mismatch
        creator.acceptAndFundVault(reqId, address(0xDEAD), tokens, badAmounts);
    }

    function testFuzz_ReclaimRequest_HashMismatch(uint256 tamperedQuote) public {
        vm.assume(tamperedQuote != QUOTE_AMOUNT);
        bytes32 reqId = test_OpenPairVault_Success(BASE_AMOUNT, QUOTE_AMOUNT);
        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory badAmounts = new uint256[](2);
        badAmounts[0] = BASE_AMOUNT;
        badAmounts[1] = tamperedQuote; // Tampered amount

        vm.prank(proposer);
        vm.expectRevert("VC-IDHM-01");
        creator.reclaimRequest(reqId, tokens, badAmounts);
    }

    function test_ReclaimRequest_RevertIf_AlreadyReclaimed() public {
        bytes32 reqId = test_OpenPairVault_Success(BASE_AMOUNT, QUOTE_AMOUNT);
        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.startPrank(proposer);
        creator.reclaimRequest(reqId, tokens, amounts);

        // Attempt double reclaim
        vm.expectRevert("VC-SNEP-01"); // Proposer of a deleted request defaults to address(0)
        creator.reclaimRequest(reqId, tokens, amounts);
        vm.stopPrank();
    }

    function test_AcceptAndFundVault_RevertIf_AlreadyReclaimed() public {
        bytes32 reqId = test_OpenPairVault_Success(BASE_AMOUNT, QUOTE_AMOUNT);
        vm.warp(block.timestamp + creator.reclaimDelay() + 1);

        address[] memory tokens = new address[](2);
        tokens[0] = address(baseToken);
        tokens[1] = address(quoteToken);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = BASE_AMOUNT;
        amounts[1] = QUOTE_AMOUNT;

        vm.prank(proposer);
        creator.reclaimRequest(reqId, tokens, amounts);

        // Admin tries to accept a request that was already reclaimed by the proposer
        vm.prank(ADMIN);
        vm.expectRevert("VC-SNEP-01"); // Request deleted, proposer is address(0)
        creator.acceptAndFundVault(reqId, address(0xDEAD), tokens, amounts);
    }

    function test_RejectVaultRequest_RevertIf_AlreadyRejected() public {
        bytes32 reqId = test_OpenPairVault_Success(BASE_AMOUNT, QUOTE_AMOUNT);

        vm.startPrank(ADMIN);
        creator.rejectVaultRequest(reqId);

        // Admin tries to reject again
        vm.expectRevert("VC-IVRS-01"); // Status is now REJECTED, not PENDING
        creator.rejectVaultRequest(reqId);
        vm.stopPrank();
    }

    function test_RejectVaultRequest_RefundsFeeExactly() public {
        uint256 initialProposerFeeBal = feeToken.balanceOf(proposer);
        bytes32 reqId = test_OpenPairVault_Success(BASE_AMOUNT, QUOTE_AMOUNT);

        // Verify fee was deducted
        assertEq(feeToken.balanceOf(proposer), initialProposerFeeBal - INITIAL_FEE_AMOUNT);
        assertEq(creator.pendingFees(), INITIAL_FEE_AMOUNT);

        vm.prank(ADMIN);
        creator.rejectVaultRequest(reqId);

        // Verify fee was completely refunded
        assertEq(feeToken.balanceOf(proposer), initialProposerFeeBal);
        assertEq(creator.pendingFees(), 0);
    }

    function test_SetFeeAmount_ZeroFee_Success() public {
        vm.prank(ADMIN);
        creator.setFeeAmount(0);

        _helper_AcknowledgeRisk();
        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        uint256 feeBalBefore = feeToken.balanceOf(proposer);

        vm.prank(proposer);
        vm.chainId(CHAIN_ID);
        bytes32 reqId = creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);

        uint256 feeBalAfter = feeToken.balanceOf(proposer);

        // Assert no fee was taken and state reflects zero
        assertEq(feeBalBefore, feeBalAfter);
        assertEq(creator.pendingFees(), 0);

        IOmniVaultCreator.VaultRequest memory request = creator.getCreationRequest(reqId);
        assertEq(request.feeCollected, 0);
    }

    function testFuzz_OpenPairVault_NonceIncrements(uint8 iterations) public {
        vm.assume(iterations > 1 && iterations <= 10);
        _helper_AcknowledgeRisk();

        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        bytes32 lastReqId;

        vm.startPrank(proposer);
        vm.chainId(CHAIN_ID);
        for (uint8 i = 0; i < iterations; i++) {
            bytes32 reqId = creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
            assertTrue(reqId != lastReqId, "Request IDs should be strictly unique");
            lastReqId = reqId;
        }
        vm.stopPrank();

        // Nonce should strictly match the number of iterations
        assertEq(creator.creationNonces(proposer), iterations);
    }

    function test_WithdrawCollectedFees_ZeroFees() public {
        // Edge Case: Admin withdrawing when collected fees are precisely 0
        assertEq(creator.collectedFees(), 0);

        vm.prank(ADMIN);
        vm.expectEmit(true, false, false, true);
        emit IOmniVaultCreator.CreationFeeCollected(ADMIN, address(feeToken), 0);

        // This should safely process without reverting
        creator.withdrawCollectedFees();
    }

    function testFuzz_SetReclaimDelay_Boundary(uint256 delay) public {
        // Ensures the < 28 days logic acts strictly at the boundary
        if (delay < 28 days) {
            vm.prank(ADMIN);
            creator.setReclaimDelay(delay);
            assertEq(creator.reclaimDelay(), delay);
        } else {
            vm.prank(ADMIN);
            vm.expectRevert("VC-IRDL-01");
            creator.setReclaimDelay(delay);
        }
    }

    function test_OpenPairVault_RevertIf_FeeTransferFails() public {
        _helper_AcknowledgeRisk();

        // Proposer revokes approval for the fee token to simulate a failed SafeERC20 transfer
        vm.prank(proposer);
        feeToken.approve(address(creator), 0);

        address[] memory baseTokens = new address[](1);
        baseTokens[0] = address(baseToken);
        address[] memory quoteTokens = new address[](1);
        quoteTokens[0] = address(quoteToken);
        uint32[] memory chainIds = new uint32[](1);
        chainIds[0] = uint32(CHAIN_ID);

        vm.prank(proposer);
        vm.chainId(CHAIN_ID);

        vm.expectRevert(); // Standard ERC20 Insufficient Allowance revert
        creator.openPairVault(baseTokens, quoteTokens, chainIds, BASE_AMOUNT, QUOTE_AMOUNT);
    }
}
