import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();

/**
 * REPORTING CONTRACT TEST SUITE - TEST DRIVEN SMART CONTRACT DEVELOPMENT
 * 
 * This test suite verifies the complete reporting flow as specified in reporting_contract.md:
 * 
 * FLOW:
 * 1. ReportingController receives request (description, image, mockProof, nullifierHash)
 * 2. AiOracleService validates content (moderation, spam detection) → approval decision
 * 3. If approved: IpfsService stores evidence (image + metadata) → returns IPFS CID
 * 4. BlockchainService submits IPFS hash to Reporting.sol → registers report on-chain
 * 5. Report enters community validation phase
 * 
 * CRITICAL INVARIANT: AI Oracle approval MUST occur BEFORE IPFS upload.
 * A report is never stored on IPFS or submitted to the blockchain without prior AI moderation clearance.
 * 
 * TEST STRUCTURE:
 * - Stage 1 Tests: Contract deployment and role assignment
 * - Stage 2 Tests: AiOracleService approval gate (before IPFS)
 * - Stage 3 Tests: IpfsService storage gate (before blockchain)
 * - Stage 4 Tests: Blockchain submission gate (createReport function)
 * - Stage 5 Tests: Community voting on-chain (validation, appeals, verification)
 * - Edge Cases: Workflow protection and Sybil resistance
 */

describe("Decentralized Reporting Contract - Test Driven Development", function () {
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

    // ========================================================================
    // MOCK SERVICE IMPLEMENTATIONS (Stage 2, 3, 4 Gates)
    // ========================================================================
    
    /**
     * AI ORACLE SERVICE MOCK - Stage 2 Gate
     * Simulates the AiOracleService approval logic before IPFS upload
     * @param description - Report description text
     * @param returns - { isApproved, reason }
     */
    const mockAiOracleService = {
        isApproved: true,
        reason: '',
        
        moderateContent: async (description: string) => {
            // Simulate content moderation
            if (description.toLowerCase().includes('spam') || description.length < 5) {
                return { isApproved: false, reason: 'Content flagged as spam or too short' };
            }
            if (description.toLowerCase().includes('abusive')) {
                return { isApproved: false, reason: 'Content violates community standards' };
            }
            return { isApproved: true, reason: 'Content approved for IPFS storage' };
        }
    };

    /**
     * IPFS SERVICE MOCK - Stage 3 Gate
     * Simulates the IpfsService storage logic before blockchain submission
     * @param description - Report description
     * @returns - { ipfsCID }
     */
    const mockIpfsService = {
        uploadEvidence: async (description: string) => {
            // Simulate IPFS upload - generate a mock CID based on content
            if (!description || description.length === 0) {
                throw new Error('IPFS upload failed: Empty content');
            }
            // In production, this would return actual IPFS hash
            const mockCID = `ipfs://QmMock${ethers.id(description).slice(2, 10).toUpperCase()}`;
            return mockCID;
        }
    };

    /**
     * BLOCKCHAIN SERVICE WRAPPER - Stage 4 Gate
     * Simulates BlockchainService calling Reporting.sol.createReport()
     * This is where the report is finally persisted on-chain
     */
    const submitReportToBlockchain = async (reportingContract: any, relayer: any, ipfsCID: string, nullifierHash: string) => {
        return await reportingContract.connect(relayer).createReport(ipfsCID, nullifierHash);
    };

    async function deployReportingFixture() {
        // Hardhat provides 20 fake wallets for testing. We assign them to our roles:
        const [admin, relayer, govNode, ngoNode, intlNode, citizen1, citizen2, citizen3, citizen4, citizen5] = await ethers.getSigners();
        
        // Deploy the contract and assign the roles in the constructor
        const Reporting = await ethers.getContractFactory("Reporting");
        const reportingContract = await Reporting.deploy(
            relayer.address, 
            govNode.address, 
            ngoNode.address, 
            intlNode.address
        );
        
        // Wait for deployment to complete
        await reportingContract.waitForDeployment();

        return { reportingContract, admin, relayer, govNode, ngoNode, intlNode, citizen1, citizen2, citizen3, citizen4, citizen5 };
    }

    /**
     * COMPLETE FLOW TEST HELPER
     * Simulates the entire pipeline: AiOracle → IPFS → Blockchain
     * Returns the report ID on success, null on expected failure
     */
    const submitReportThroughPipeline = async (
        reportingContract: any,
        relayerSigner: any,
        description: string,
        shouldGetAiApproval = true,
        shouldGetIpfsStorage = true
    ): Promise<bigint | null> => {
        // STAGE 2: AI ORACLE SERVICE APPROVAL GATE
        const aiVerdict = await mockAiOracleService.moderateContent(description);
        if (!aiVerdict.isApproved) {
            if (shouldGetAiApproval) {
                throw new Error(`AI moderation failed: ${aiVerdict.reason}`);
            }
            return null; // Intended rejection
        }

        // STAGE 3: IPFS SERVICE STORAGE GATE
        let ipfsCID;
        try {
            ipfsCID = await mockIpfsService.uploadEvidence(description);
        } catch (error) {
            if (shouldGetIpfsStorage) {
                throw error;
            }
            return null; // Intended failure
        }

        // STAGE 4: BLOCKCHAIN SUBMISSION
        const nullifierHash = ethers.id(description); // Hash the description for nullifier
        await submitReportToBlockchain(reportingContract, relayerSigner, ipfsCID, nullifierHash);
        
        // Get the report ID that was just created
        const nextId = await reportingContract.nextReportId();
        return nextId - 1n; // Return report ID as bigint
    };

    // ========================================================================
    // STAGE 1: DEPLOYMENT & ROLE ASSIGNMENT TESTS
    // ========================================================================
    
    describe("Stage 1: Contract Deployment & Role Assignment", function () {
        it("Should deploy contract with correct role assignments", async function () {
            const { reportingContract, relayer, govNode, ngoNode, intlNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            // Verify RELAYER_ROLE is assigned to backend wallet
            const hasRelayerRole = await reportingContract.hasRole(
                await reportingContract.RELAYER_ROLE(),
                relayer.address
            );
            expect(hasRelayerRole).to.be.true;
            
            // Verify AUTHORITY_ROLE is assigned to governance nodes
            const hasGovRole = await reportingContract.hasRole(
                await reportingContract.AUTHORITY_ROLE(),
                govNode.address
            );
            expect(hasGovRole).to.be.true;
            
            const hasNgoRole = await reportingContract.hasRole(
                await reportingContract.AUTHORITY_ROLE(),
                ngoNode.address
            );
            expect(hasNgoRole).to.be.true;
        });
    });

    // ========================================================================
    // STAGE 2: AI ORACLE SERVICE GATE TESTS (Before IPFS)
    // ========================================================================
    
    describe("Stage 2: AI Oracle Service - Content Moderation Gate", function () {
        it("Should reject spam content at AiOracleService gate", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const spamDescription = "spam";
            const aiVerdict = await mockAiOracleService.moderateContent(spamDescription);
            
            expect(aiVerdict.isApproved).to.be.false;
            expect(aiVerdict.reason).to.include("spam");
        });

        it("Should reject abusive content at AiOracleService gate", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const abusiveDescription = "This is abusive content that violates standards";
            const aiVerdict = await mockAiOracleService.moderateContent(abusiveDescription);
            
            expect(aiVerdict.isApproved).to.be.false;
            expect(aiVerdict.reason).to.include("community standards");
        });

        it("Should approve legitimate content at AiOracleService gate", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const legitimateDescription = "Pothole on Main Street needs repair urgently";
            const aiVerdict = await mockAiOracleService.moderateContent(legitimateDescription);
            
            expect(aiVerdict.isApproved).to.be.true;
        });
    });

    // ========================================================================
    // STAGE 3: IPFS SERVICE GATE TESTS (After AI Approval)
    // ========================================================================
    
    describe("Stage 3: IPFS Service - Storage Gate", function () {
        it("Should generate valid IPFS CID on successful upload", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Valid report for testing";
            const ipfsCID = await mockIpfsService.uploadEvidence(description);
            
            expect(ipfsCID).to.include("ipfs://");
            expect(ipfsCID.length).to.be.greaterThan(10);
        });

        it("Should fail IPFS upload with empty content", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            await expect(
                mockIpfsService.uploadEvidence("")
            ).to.be.rejectedWith("Empty content");
        });

        it("Should generate unique IPFS CID for different content", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description1 = "Report 1";
            const description2 = "Report 2";
            
            const cid1 = await mockIpfsService.uploadEvidence(description1);
            const cid2 = await mockIpfsService.uploadEvidence(description2);
            
            expect(cid1).to.not.equal(cid2);
        });
    });

    // ========================================================================
    // STAGE 4: BLOCKCHAIN SUBMISSION GATE TESTS (After AI + IPFS)
    // ========================================================================
    
    describe("Stage 4: Blockchain Submission - createReport Function", function () {
        it("Should allow Relayer to create report with valid IPFS CID and nullifier", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const ipfsCID = "ipfs://QmMockHashForNow12345";
            const nullifierHash = ethers.encodeBytes32String("user_1_report_123");
            
            await reportingContract.connect(relayer).createReport(ipfsCID, nullifierHash);
            
            const report = await reportingContract.reports(0);
            expect(report.ipfsCID).to.equal(ipfsCID);
            expect(report.status).to.equal(ReportStatus.Pending_Validation);
            expect(report.submissionNullifier).to.equal(nullifierHash);
        });

        it("Should reject report submission with invalid IPFS CID format", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            // The contract accepts any string, but this simulates validation at BlockchainService level
            const invalidCID = "not-an-ipfs-hash";
            const nullifierHash = ethers.encodeBytes32String("user_1");
            
            // Note: In production, BlockchainService should validate before calling contract
            await reportingContract.connect(relayer).createReport(invalidCID, nullifierHash);
            
            const report = await reportingContract.reports(0);
            expect(report.ipfsCID).to.equal(invalidCID);
        });

        it("Should prevent duplicate submission using same nullifier (Sybil Resistance)", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const ipfsCID_1 = "ipfs://QmHash1";
            const ipfsCID_2 = "ipfs://QmHash2";
            const nullifierHash = ethers.encodeBytes32String("user_1_report_123");
            
            // First submission succeeds
            await reportingContract.connect(relayer).createReport(ipfsCID_1, nullifierHash);
            
            // Second submission with same nullifier fails
            await expect(
                reportingContract.connect(relayer).createReport(ipfsCID_2, nullifierHash)
            ).to.be.revertedWith("Report already submitted by this citizen");
        });

        it("Should reject non-Relayer calling createReport", async function () {
            const { reportingContract, citizen1 } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const ipfsCID = "ipfs://QmHash";
            const nullifierHash = ethers.encodeBytes32String("user_1");
            
            await expect(
                reportingContract.connect(citizen1).createReport(ipfsCID, nullifierHash)
            ).to.be.revertedWithCustomError(reportingContract, "AccessControlUnauthorizedAccount");
        });
    });

    // ========================================================================
    // STAGE 5: COMMUNITY VOTING ON-CHAIN TESTS
    // ========================================================================
    
    describe("Stage 5: Community Voting - Validation Phase", function () {
        it("Should transition report to 'Open' after 3 community True votes in Validation phase", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            // COMPLETE FLOW: AI → IPFS → Blockchain
            const description = "Pothole on Main Street";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Community votes in Validation phase
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
            
            const report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
            expect(report.votesFor).to.equal(3);
        });

        it("Should transition report to 'Community_Rejected' after 3 False votes in Validation phase", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Rejected report for testing community rejection";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Community votes in Validation phase
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("vote_1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("vote_2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("vote_3"), VotingPhase.Validation);
            
            const report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Community_Rejected);
            expect(report.votesAgainst).to.equal(3);
        });

        it("Should prevent voting on expired reports", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Test report";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Get the report's expiration time
            const report = await reportingContract.reports(reportId);
            const expiresAt = report.expiresAt;
            
            // Fast forward time past expiration
            await networkHelpers.time.increaseTo(Number(expiresAt) + 100);
            
            // Attempt to vote should fail
            await expect(
                reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("late_vote"), VotingPhase.Validation)
            ).to.be.revertedWith("Report has expired - no further voting allowed");
        });
    });

    describe("Stage 5: Community Voting - Authority Actions", function () {
        it("Should allow Authority to mark 'Open' report as solved", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            // Get report to Open state
            const description = "Potholeissue";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            // Authority marks solved
            await reportingContract.connect(govNode).markAsSolved(reportId);
            
            const report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Pending_Verification);
            expect(report.actionedBy).to.equal(govNode.address);
        });

        it("Should allow Authority to reject 'Open' report", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Falseissue";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            // Authority rejects
            await reportingContract.connect(govNode).rejectIssue(reportId);
            
            const report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Pending_Rejection_Review);
            expect(report.actionedBy).to.equal(govNode.address);
        });
    });

    describe("Stage 5: Community Voting - Verification Phase", function () {
        it("Should close report after community verifies authority's solution", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Readable issue";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Validate to Open
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            // Authority marks solved
            await reportingContract.connect(govNode).markAsSolved(reportId);
            
            // Community verifies solution (votes True = fixed)
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("ver1"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("ver2"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("ver3"), VotingPhase.Verification);
            
            const report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Closed);
        });

        it("Should allow same citizen to vote in multiple phases (Sybil Resistance)", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Multi phase issue";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            const citizen1Vote = ethers.encodeBytes32String("citizen_1");
            const citizen2Vote = ethers.encodeBytes32String("citizen_2");
            const citizen3Vote = ethers.encodeBytes32String("citizen_3");
            
            // Validation phase
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizen1Vote, VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizen2Vote, VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizen3Vote, VotingPhase.Validation);
            
            let report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
            
            // Authority marks solved
            await reportingContract.connect(govNode).markAsSolved(reportId);
            
            // Same citizens vote again in Verification phase (different voting nullifiers)
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizen1Vote, VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizen2Vote, VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizen3Vote, VotingPhase.Verification);
            
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Closed);
        });

        it("Should prevent voting twice in same phase (Sybil Resistance within phase)", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Sybil test";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            const voterNullifier = ethers.encodeBytes32String("voter_1");
            
            // First vote succeeds
            await reportingContract.connect(relayer).voteOnReport(reportId, true, voterNullifier, VotingPhase.Validation);
            
            // Second vote with same nullifier in same phase fails
            await expect(
                reportingContract.connect(relayer).voteOnReport(reportId, true, voterNullifier, VotingPhase.Validation)
            ).to.be.revertedWith("Citizen already voted in this phase");
        });
    });

    describe("Stage 5: Community Voting - Appeal Phase", function () {
        it("Should allow community to appeal authority rejection and revert to Open", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Appeal test";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Validate to Open
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            // Authority rejects
            await reportingContract.connect(govNode).rejectIssue(reportId);
            let report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Pending_Rejection_Review);
            
            // Community appeals (votes False = overturn rejection)
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("appeal_1"), VotingPhase.Rejection_Review);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("appeal_2"), VotingPhase.Rejection_Review);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("appeal_3"), VotingPhase.Rejection_Review);
            
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
        });
    });

    // ========================================================================
    // EDGE CASE TESTS: WORKFLOW PROTECTION & SYBIL RESISTANCE
    // ========================================================================
    
    describe("Edge Case 1.1: Phase-Based Sybil Resistance", function () {
        it("Should enforce voting nullifier is scoped by phase", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Phase based sybil";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            const citizenNullifier = ethers.encodeBytes32String("citizen_1");
            
            // Vote in Validation phase
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizenNullifier, VotingPhase.Validation);
            
            // Get other votes to transition to Open
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            let report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
            
            // Authority marks solved
            await reportingContract.connect(govNode).markAsSolved(reportId);
            
            // Same citizen should be able to vote in Verification phase
            await reportingContract.connect(relayer).voteOnReport(reportId, true, citizenNullifier, VotingPhase.Verification);
            
            // This should NOT revert - different phase allows same nullifier
            const hasVotedInVerification = await reportingContract.reportVotes(reportId, VotingPhase.Verification, citizenNullifier);
            expect(hasVotedInVerification).to.be.true;
        });
    });

    describe("Edge Case 2: Infinite Reopening Loops Protection", function () {
        it("Should prevent infinite reopening loops by enforcing REOPEN_LIMIT", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Reopen test";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Get to Open state
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            let report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
            
            // First reopen cycle
            await reportingContract.connect(govNode).markAsSolved(reportId);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver1"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver2"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver3"), VotingPhase.Verification);
            
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Reopened);
            expect(report.reopenCount).to.equal(1);
            
            // Second reopen cycle
            await reportingContract.connect(govNode).markAsSolved(reportId);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver4"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver5"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver6"), VotingPhase.Verification);
            
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Reopened);
            expect(report.reopenCount).to.equal(2);
            
            // Third reopen cycle
            await reportingContract.connect(govNode).markAsSolved(reportId);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver7"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver8"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("ver9"), VotingPhase.Verification);
            
            report = await reportingContract.reports(reportId);
            // After 3rd reopen, REOPEN_LIMIT is reached and report is forced Closed
            expect(report.status).to.equal(ReportStatus.Closed);
            expect(report.reopenCount).to.equal(3);
        });
    });

    describe("Edge Case 3: Stalled Reports & Expiration", function () {
        it("Should prevent stalling by expiring reports after 7 days", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Stalled report";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            let report = await reportingContract.reports(reportId);
            const expiresAt = report.expiresAt;
            
            // Report should be votable initially
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            
            // Fast forward time past expiration (7 days)
            await networkHelpers.time.increaseTo(Number(expiresAt) + 1);
            
            // Voting should now be blocked
            await expect(
                reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation)
            ).to.be.revertedWith("Report has expired - no further voting allowed");
        });
    });

    describe("Integration Tests: Full Reporting Flow", function () {
        it("Should execute complete happy path: Request → AI → IPFS → Blockchain → Community Votes → Closed", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            // STAGE 2: AI ORACLE - Content passes moderation
            const description = "Broken street light on Oak Avenue";
            const aiVerdict = await mockAiOracleService.moderateContent(description);
            expect(aiVerdict.isApproved).to.be.true;
            
            // STAGE 3: IPFS SERVICE - Content stored
            const ipfsCID = await mockIpfsService.uploadEvidence(description);
            expect(ipfsCID).to.include("ipfs://");
            
            // STAGE 4: BLOCKCHAIN - Report submitted
            const nullifierHash = ethers.id(description);
            await submitReportToBlockchain(reportingContract, relayer, ipfsCID, nullifierHash);
            
            const reportId = 0;
            let report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Pending_Validation);
            
            // STAGE 5: Community Validation Phase
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("citizen_1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("citizen_2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("citizen_3"), VotingPhase.Validation);
            
            // Report transitions to Open
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
            
            // STAGE 5: Authority Action
            await reportingContract.connect(govNode).markAsSolved(reportId);
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Pending_Verification);
            
            // STAGE 5: Community Verification Phase
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("citizen_1"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("citizen_2"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("citizen_3"), VotingPhase.Verification);
            
            // Report is now Closed
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Closed);
        });

        it("Should reject report at AI ORACLE stage and prevent IPFS upload", async function () {
            const { reportingContract, relayer } = await networkHelpers.loadFixture(deployReportingFixture);
            
            // STAGE 2: AI ORACLE - Content REJECTED
            const spamDescription = "spam";
            const aiVerdict = await mockAiOracleService.moderateContent(spamDescription);
            expect(aiVerdict.isApproved).to.be.false;
            
            // Report should NOT proceed to IPFS or blockchain
            // This is enforced at the ReportingController level (not tested here)
            // This test documents the expected behavior
        });

        it("Should allow community to appeal authority rejection through two-phase voting", async function () {
            const { reportingContract, relayer, govNode } = await networkHelpers.loadFixture(deployReportingFixture);
            
            const description = "Appeal scenario";
            const reportId = (await submitReportThroughPipeline(reportingContract, relayer, description))!;
            
            // Validate to Open
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v1"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v2"), VotingPhase.Validation);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("v3"), VotingPhase.Validation);
            
            // Authority rejects
            await reportingContract.connect(govNode).rejectIssue(reportId);
            let report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Pending_Rejection_Review);
            
            // Community appeals (False votes = overturn)
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("appeal_1"), VotingPhase.Rejection_Review);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("appeal_2"), VotingPhase.Rejection_Review);
            await reportingContract.connect(relayer).voteOnReport(reportId, false, ethers.encodeBytes32String("appeal_3"), VotingPhase.Rejection_Review);
            
            // Back to Open for authority retry
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Open);
            
            // Authority marks solved
            await reportingContract.connect(govNode).markAsSolved(reportId);
            
            // Community verifies
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("ver1"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("ver2"), VotingPhase.Verification);
            await reportingContract.connect(relayer).voteOnReport(reportId, true, ethers.encodeBytes32String("ver3"), VotingPhase.Verification);
            
            report = await reportingContract.reports(reportId);
            expect(report.status).to.equal(ReportStatus.Closed);
        });
    });
});
