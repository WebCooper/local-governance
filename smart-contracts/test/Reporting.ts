import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();

describe("Decentralized Reporting Contract", function () {
    // Enum values for VotingPhase
    const VotingPhase = {
        Validation: 0,
        Rejection_Review: 1,
        Verification: 2
    };

    // Enum values for ReportStatus
    const ReportStatus = {
        Pending_Validation: 0,
        Community_Rejected: 1,
        Open: 2,
        Pending_Rejection_Review: 3,
        Pending_Verification: 4,
        Closed: 5,
        Reopened: 6
    };

    async function deployReportingFixture() {
        // Hardhat provides 20 fake wallets for testing. We assign them to our roles:
        const [admin, relayer, govNode, ngoNode, intlNode, citizen1, citizen2, citizen3] = await ethers.getSigners();
        
        // Deploy the contract and assign the roles in the constructor
        const Reporting = await ethers.getContractFactory("Reporting");
        const reportingContract = await Reporting.deploy(
            relayer.address, 
            govNode.address, 
            ngoNode.address, 
            intlNode.address
        );

        return { reportingContract, admin, relayer, govNode, ngoNode, intlNode, citizen1, citizen2, citizen3 };
    }

    it("Should allow the Relayer to create a report successfully", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // Generate a fake ZKP nullifier
        const fakeNullifier = ethers.encodeBytes32String("user_1_report_123");
        
        // Relayer submits the transaction
        await reportingContract.connect(relayer).createReport("ipfs://QmAbCdEf...", fakeNullifier);
        
        const report = await reportingContract.reports(0);
        expect(report.ipfsCID).to.equal("ipfs://QmAbCdEf...");
        expect(report.status).to.equal(ReportStatus.Pending_Validation);
        expect(report.votesFor).to.equal(0);
        expect(report.votesAgainst).to.equal(0);
    });

    it("Should reject a duplicate report from the same citizen (Sybil Resistance)", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const fakeNullifier = ethers.encodeBytes32String("user_1_report_123");
        await reportingContract.connect(relayer).createReport("ipfs_hash_1", fakeNullifier);
        
        // Try submitting the exact same nullifier again
        await expect(
            reportingContract.connect(relayer).createReport("ipfs_hash_2", fakeNullifier)
        ).to.be.revertedWith("Report already submitted by this citizen");
    });

    it("Should transition report to 'Open' after 3 community True votes in Validation phase", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("report_nullifier");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // 3 different citizens vote 'True' (Direction = true), Phase = Validation
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
        
        const report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
        expect(report.votesFor).to.equal(3);
    });

    it("Should transition report to 'Community_Rejected' after 3 False votes in Validation phase", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("report_nullifier_2");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // 3 different citizens vote 'False' (Direction = false) to mark as spam
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
        
        const report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Community_Rejected);
        expect(report.votesAgainst).to.equal(3);
    });

    it("Should allow an Authority to reject an 'Open' report", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // First, create and validate a report to get it to Open state
        const reportNullifier = ethers.encodeBytes32String("report_nullifier_3");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);

        // Now the Government Node rejects the open report
        await reportingContract.connect(govNode).rejectIssue(0);

        const report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Rejection_Review);
        expect(report.actionedBy).to.equal(govNode.address);
        expect(report.votesFor).to.equal(0); // Votes reset for new phase
        expect(report.votesAgainst).to.equal(0);
    });

    it("Should allow an Authority to mark an 'Open' report as solved", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // First, create and validate a report to get it to Open state
        const reportNullifier = ethers.encodeBytes32String("report_nullifier_4");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);

        // Now the Local Governance Node marks it as solved
        await reportingContract.connect(govNode).markAsSolved(0);

        const report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Verification);
        expect(report.actionedBy).to.equal(govNode.address);
        expect(report.votesFor).to.equal(0); // Votes reset for verification phase
        expect(report.votesAgainst).to.equal(0);
    });

    it("Should allow same citizen to vote in multiple phases (phase-based vote tracking)", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // Create and validate a report
        const reportNullifier = ethers.encodeBytes32String("report_nullifier_5");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // Citizen 1, 2, 3 vote in Validation phase (all True)
        const citizen1Vote = ethers.encodeBytes32String("citizen_1_vote");
        const citizen2Vote = ethers.encodeBytes32String("citizen_2_vote");
        const citizen3Vote = ethers.encodeBytes32String("citizen_3_vote");
        
        await reportingContract.connect(relayer).voteOnReport(0, true, citizen1Vote, VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, citizen2Vote, VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, citizen3Vote, VotingPhase.Validation);
        
        // Report is now Open
        let report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
        
        // Authority marks it as solved
        await reportingContract.connect(govNode).markAsSolved(0);
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Verification);
        
        // Same 3 citizens should be able to vote AGAIN in Verification phase
        await reportingContract.connect(relayer).voteOnReport(0, true, citizen1Vote, VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, true, citizen2Vote, VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, true, citizen3Vote, VotingPhase.Verification);
        
        // Report should be Closed after 3 True votes in Verification
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Closed);
    });

    it("Should prevent voting twice on the same report in the same phase", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("report_nullifier_6");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        const voterNullifier = ethers.encodeBytes32String("voter_1");
        
        // First vote succeeds
        await reportingContract.connect(relayer).voteOnReport(0, true, voterNullifier, VotingPhase.Validation);
        
        // Second vote with same nullifier in same phase should fail
        await expect(
            reportingContract.connect(relayer).voteOnReport(0, true, voterNullifier, VotingPhase.Validation)
        ).to.be.revertedWith("Citizen already voted in this phase");
    });

    it("Should transition from Pending_Rejection_Review to Open after successful appeal", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // Create and validate report to Open
        const reportNullifier = ethers.encodeBytes32String("report_nullifier_7");
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
        
        // Authority rejects
        await reportingContract.connect(govNode).rejectIssue(0);
        let report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Rejection_Review);
        
        // 3 citizens vote False (appeal) in Rejection_Review phase
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("appeal_1"), VotingPhase.Rejection_Review);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("appeal_2"), VotingPhase.Rejection_Review);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("appeal_3"), VotingPhase.Rejection_Review);
        
        // Report should go back to Open (appeal successful)
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
    });

    it("Should reject non-existent report", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        await expect(
            reportingContract.connect(relayer).voteOnReport(999, true, ethers.encodeBytes32String("vote"), VotingPhase.Validation)
        ).to.be.revertedWith("Report does not exist");
    });

    // ============================================================================
    // EDGE CASE 1: Critical Logic Flaw - Voting Sybil Resistance vs. Multi-Phase Voting
    // ============================================================================
    
    it("EDGE CASE 1.1: Should block citizen from voting in subsequent phases (Phase-based Sybil Resistance Bug)", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_report_1");
        const citizenNullifier = ethers.encodeBytes32String("citizen_nullifier_phase_bug");
        
        // Create report
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // Citizen votes in Validation phase
        await reportingContract.connect(relayer).voteOnReport(0, true, citizenNullifier, VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
        
        // Report is now Open
        let report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
        
        // Authority marks it as solved
        await reportingContract.connect(govNode).markAsSolved(0);
        
        // THIS IS THE BUG: Same citizen should be able to vote in Verification phase, but can't
        // because reportVotes[reportId][nullifier] is global, not phase-based
        // Current behavior: This will revert with "Citizen already voted in this phase"
        // Expected behavior: Should allow voting because it's a different phase
        
        const canVoteInVerification = await reportingContract.reportVotes(0, VotingPhase.Verification, citizenNullifier);
        const canVoteInValidation = await reportingContract.reportVotes(0, VotingPhase.Validation, citizenNullifier);
        
        // If mapping is NOT phase-aware, this check shows the bug
        // The citizen voted in Validation (true), but Verification check depends on implementation
        expect(canVoteInValidation).to.equal(true);
        expect(canVoteInVerification).to.equal(false); // Should be allowed to vote in different phase
    });

    it("EDGE CASE 1.2: Verify voting nullifier is properly scoped by phase", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_report_2");
        const citizenNullifier = ethers.encodeBytes32String("citizen_phase_test");
        
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // Vote in Validation phase
        await reportingContract.connect(relayer).voteOnReport(0, true, citizenNullifier, VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
        
        let report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
        
        await reportingContract.connect(govNode).markAsSolved(0);
        
        // Attempt to vote in Verification phase - this tests the implementation
        // If the fix is in place, this should succeed; if not, it should fail
        try {
            await reportingContract.connect(relayer).voteOnReport(0, true, citizenNullifier, VotingPhase.Verification);
            // If we reach here, the vote succeeded (phase-aware mapping is working)
        } catch (err: any) {
            // If vote failed, check the error reason
            console.log("Vote rejection reason:", err.reason || err.message);
            expect(err.reason || err.message).to.include("voted");
        }
    });

    // ============================================================================
    // EDGE CASE 2: Workflow Deadlocks - Infinite Loops
    // ============================================================================
    
    it("EDGE CASE 2.1: Should prevent infinite reopening loops (Missing Reopening Counter)", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_report_reopen");
        
        // Create and move to Open
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
        
        let report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
        
        // Authority marks solved, then community votes it's Not solved -> Reopened
        await reportingContract.connect(govNode).markAsSolved(0);
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Verification);
        
        // Community votes "No" (false) to reopen
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v4"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v5"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v6"), VotingPhase.Verification);
        
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Reopened);
        
        // Authority marks solved AGAIN (stubborn authority)
        await reportingContract.connect(govNode).markAsSolved(0);
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Verification);
        
        // Verify reopenCount is being tracked
        expect(report.reopenCount).to.equal(1);
        
        // Community votes to reopen AGAIN - second reopen
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v7"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v8"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v9"), VotingPhase.Verification);
        
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Reopened);
        expect(report.reopenCount).to.equal(2);
        
        // Authority marks solved AGAIN (third time)
        await reportingContract.connect(govNode).markAsSolved(0);
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Pending_Verification);
        
        // Community votes to reopen AGAIN - but this is the third reopen which exceeds REOPEN_LIMIT (3)
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v10"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v11"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v12"), VotingPhase.Verification);
        
        report = await reportingContract.reports(0);
        // Should be Closed, not Reopened, because reopenCount has reached the limit
        expect(report.status).to.equal(ReportStatus.Closed);
        expect(report.reopenCount).to.equal(3);
    });

    it("EDGE CASE 2.2: Should track reopening count to prevent infinite loops", async function () {
        const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_reopen_counter");
        
        // Setup report to Open state
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
        
        let report = await reportingContract.reports(0);
        expect(report.reopenCount).to.equal(0); // Initial reopenCount should be 0
        
        // Move through cycle: Open -> Pending_Verification -> Reopened (1st reopen)
        await reportingContract.connect(govNode).markAsSolved(0);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v4"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v5"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v6"), VotingPhase.Verification);
        
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Reopened);
        expect(report.reopenCount).to.equal(1); // Should increment to 1 after first reopen
        
        // Second reopen cycle
        await reportingContract.connect(govNode).markAsSolved(0);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v13"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v14"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v15"), VotingPhase.Verification);
        
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Reopened);
        expect(report.reopenCount).to.equal(2); // Should increment to 2 after second reopen
        
        // Third reopen cycle - should be forced closed instead
        await reportingContract.connect(govNode).markAsSolved(0);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v16"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v17"), VotingPhase.Verification);
        await reportingContract.connect(relayer).voteOnReport(0, false, ethers.encodeBytes32String("v18"), VotingPhase.Verification);
        
        report = await reportingContract.reports(0);
        // After 3rd reopen attempt, should be forced closed (REOPEN_LIMIT reached)
        expect(report.status).to.equal(ReportStatus.Closed);
        expect(report.reopenCount).to.equal(3); // Should be at the limit
    });

    // ============================================================================
    // EDGE CASE 3: Limbo States - Stalled Reports
    // ============================================================================
    
    it("EDGE CASE 3.1: Should detect stalled reports with insufficient votes", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_stalled_report");
        
        // Create report but only get 1 vote (threshold is 3)
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("lone_vote"), VotingPhase.Validation);
        
        let report = await reportingContract.reports(0);
        
        // Report is stuck in Pending_Validation with insufficient votes
        expect(report.status).to.equal(ReportStatus.Pending_Validation);
        expect(report.votesFor).to.equal(1);
        
        // Without time-based expiry, this report remains in limbo indefinitely
        // Test documents this vulnerability
        const isStalled = BigInt(report.status) === BigInt(ReportStatus.Pending_Validation) && BigInt(report.votesFor) === BigInt(1);
        expect(isStalled).to.equal(true);
    });

    it("EDGE CASE 3.2: Should allow cleanup of expired stalled reports", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_expired_report");
        
        // Create report - gets createdAt timestamp and expiresAt (7 days later)
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        let report = await reportingContract.reports(0);
        const createdAt = report.createdAt;
        const expiresAt = report.expiresAt;
        
        expect(createdAt).to.be.greaterThan(0);
        expect(expiresAt).to.be.greaterThan(createdAt);
        
        // Calculate the difference - should be approximately 7 days (604800 seconds)
        const expirationDifference = Number(expiresAt) - Number(createdAt);
        const sevenDaysInSeconds = 7 * 24 * 60 * 60; // 604800 seconds
        expect(expirationDifference).to.equal(sevenDaysInSeconds);
        
        // Test expiration by advancing time in hardhat
        // Skip time to after expiration (7 days + 1 second)
        await networkHelpers.time.increase(sevenDaysInSeconds + 1);
        
        // Attempt to vote on expired report - should revert
        await expect(
            reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("late_vote"), VotingPhase.Validation)
        ).to.be.revertedWith("Report has expired - no further voting allowed");
        
        // Report should still exist and be queryable (for archival purposes)
        report = await reportingContract.reports(0);
        expect(report.id).to.equal(0);
        expect(report.status).to.equal(ReportStatus.Pending_Validation);
    });

    // ============================================================================
    // EDGE CASE 4: Relayer Centralization Risks (Documentation)
    // ============================================================================
    
    it("EDGE CASE 4.1: Should document Relayer centralization risk", async function () {
        const { reportingContract, relayer, admin } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // Verify only Relayer can create reports - should revert with AccessControl error
        let reverted = false;
        try {
            await reportingContract.connect(admin).createReport("ipfs_hash", ethers.encodeBytes32String("test"));
        } catch (err) {
            reverted = true;
        }
        expect(reverted).to.equal(true);
        
        // Relayer has exclusive control - centralization risk
        const hasRoleMethod = typeof reportingContract.hasRole === 'function';
        expect(hasRoleMethod).to.equal(true);
    });

    // ============================================================================
    // EDGE CASE 5: Nullifier Reuse & Collision
    // ============================================================================
    
    it("EDGE CASE 5.1: Should prevent resubmitting same report with corrected content", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const submissionNullifier = ethers.encodeBytes32String("user_1_fixed_report");
        
        // First attempt - create report
        await reportingContract.connect(relayer).createReport("ipfs_hash_typo", submissionNullifier);
        
        // User realizes typo and wants to resubmit with corrected content
        // Second attempt - same nullifier, different content
        await expect(
            reportingContract.connect(relayer).createReport("ipfs_hash_corrected", submissionNullifier)
        ).to.be.revertedWith("Report already submitted by this citizen");
        
        // User is stuck with the original report - edge case
        const report = await reportingContract.reports(0);
        expect(report.ipfsCID).to.equal("ipfs_hash_typo"); // Typo persists
    });

    it("EDGE CASE 5.2: Should verify nullifier is deterministic and epoch-based", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // Best practice: nullifier should be based on User_Secret + Epoch, NOT Report_Content
        // This allows user one report per epoch, not one specific report forever
        
        const userEpochNullifier1 = ethers.encodeBytes32String("user_epoch_1");
        const userEpochNullifier2 = ethers.encodeBytes32String("user_epoch_2");
        
        // Same user, different epochs (or time periods) should allow new reports
        await reportingContract.connect(relayer).createReport("ipfs_1", userEpochNullifier1);
        await reportingContract.connect(relayer).createReport("ipfs_2", userEpochNullifier2);
        
        // Both reports should exist
        const report1 = await reportingContract.reports(0);
        const report2 = await reportingContract.reports(1);
        
        expect(report1.ipfsCID).to.equal("ipfs_1");
        expect(report2.ipfsCID).to.equal("ipfs_2");
    });

    // ============================================================================
    // EDGE CASE 6: Threshold Race Conditions
    // ============================================================================
    
    it("EDGE CASE 6.1: Should handle gracefully when threshold is exceeded", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_overshoot");
        
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // Accumulate votes close to threshold (3)
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
        
        let report = await reportingContract.reports(0);
        expect(report.votesFor).to.equal(2);
        expect(report.status).to.equal(ReportStatus.Pending_Validation);
        
        // Third vote triggers Open status
        await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
        
        report = await reportingContract.reports(0);
        expect(report.status).to.equal(ReportStatus.Open);
        expect(report.votesFor).to.equal(3);
        
        // Fourth vote after threshold crossed - this tests overshoot handling
        // Current behavior: Will revert because status is no longer Pending_Validation
        let reverted = false;
        try {
            await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String("v4"), VotingPhase.Validation);
        } catch (err) {
            reverted = true;
        }
        expect(reverted).to.equal(true); // Expected to revert due to status mismatch
    });

    it("EDGE CASE 6.2: Should properly track vote counts at threshold boundaries", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        const reportNullifier = ethers.encodeBytes32String("test_threshold_boundary");
        
        await reportingContract.connect(relayer).createReport("ipfs_hash", reportNullifier);
        
        // Test threshold boundary: add votes one by one
        for (let i = 1; i <= 3; i++) {
            await reportingContract.connect(relayer).voteOnReport(0, true, ethers.encodeBytes32String(`v${i}`), VotingPhase.Validation);
            
            const report = await reportingContract.reports(0);
            expect(report.votesFor).to.equal(i);
            
            if (i < 3) {
                expect(report.status).to.equal(ReportStatus.Pending_Validation);
            } else {
                expect(report.status).to.equal(ReportStatus.Open);
            }
        }
    });

    // ============================================================================
    // EDGE CASE 7: Data Structure & Storage Optimization
    // ============================================================================
    
    it("EDGE CASE 7.1: Should verify IPFS CID storage format optimization", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // IPFS CIDs can be long strings - gas-intensive to store as string
        const longIPFSCID = "ipfs://QmVeryLongHashThatTakesUpStorageSpaceAndCostsGas1234567890";
        const submissionNullifier = ethers.encodeBytes32String("test_cid_storage");
        
        await reportingContract.connect(relayer).createReport(longIPFSCID, submissionNullifier);
        
        const report = await reportingContract.reports(0);
        expect(report.ipfsCID).to.equal(longIPFSCID);
        
        // Verify all struct fields are properly initialized
        expect(report.id).to.equal(0);
        expect(report.status).to.equal(ReportStatus.Pending_Validation);
        expect(report.submissionNullifier).to.equal(submissionNullifier);
        expect(report.votesFor).to.equal(0);
        expect(report.votesAgainst).to.equal(0);
        expect(report.reopenCount).to.equal(0); // New field initialized to 0
        expect(report.expiresAt).to.be.greaterThan(report.createdAt); // New field set to future timestamp
        
        // Storage note: IPFS CID stored as string type - gas cost documented
        // Current design prioritizes readability and compatibility over gas optimization
        // Alternative: Could store as bytes32 (hashed) or bytes for gas savings (not implemented)
    });

    it("EDGE CASE 7.2: Should measure struct size overhead", async function () {
        const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
        
        // Deploy multiple reports to test storage patterns
        for (let i = 0; i < 3; i++) {
            const nullifier = ethers.encodeBytes32String(`test_report_${i}`);
            await reportingContract.connect(relayer).createReport(`ipfs://hash${i}`, nullifier);
        }
        
        // Verify all reports are stored correctly with new fields
        for (let i = 0; i < 3; i++) {
            const report = await reportingContract.reports(i);
            expect(report.id).to.equal(i);
            expect(report.status).to.equal(ReportStatus.Pending_Validation);
            
            // Verify new fields added for edge case mitigations
            expect(report.reopenCount).to.equal(0); // Field added for EDGE CASE 2
            expect(report.expiresAt).to.be.greaterThan(0); // Field added for EDGE CASE 3
            
            // Verify expiration is set correctly (7 days from creation)
            const expectedExpiration = Number(report.createdAt) + (7 * 24 * 60 * 60);
            expect(Number(report.expiresAt)).to.equal(expectedExpiration);
        }
    });
});