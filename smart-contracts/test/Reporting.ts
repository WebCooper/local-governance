import hre from "hardhat";
import { expect } from "chai";

describe("Reporting", function () {
  let ethers: any;
  let time: any;
  let reporting: any;
  let owner: any, relayer: any, authority: any, citizen1: any, citizen2: any, citizen3: any;

  // Reusable helpers
  const makeCid = (n: number | string) => `QmTestCid${n}`;
  const makeBytes32 = (s: string) => (ethers as any).keccak256((ethers as any).toUtf8Bytes(s));

  before(async function () {
    const connection = await hre.network.connect() as any;
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
  });

  beforeEach(async function () {
    [owner, relayer, authority, citizen1, citizen2, citizen3] = await ethers.getSigners();

    const Reporting = await ethers.getContractFactory("Reporting");
    reporting = await Reporting.deploy();

    await reporting.setRelayer(relayer.address, true);
    await reporting.setAuthority(authority.address, true);

    // Shorten the voting window to 1 hour for time-travel tests
    await reporting.setVotingWindowDuration(60 * 60); // 1 hour
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async function submitReport(
    opts: {
      cid?: string;
      reportHash?: string;
      nullifier?: string;
      pseudonym?: string;
    } = {}
  ) {
    const cid = opts.cid ?? makeCid(1);
    const reportHash = opts.reportHash ?? makeBytes32("report-hash");
    const nullifier = opts.nullifier ?? makeBytes32("nullifier-1");
    const pseudonym = opts.pseudonym ?? makeBytes32("citizen-1");
    const tx = await reporting.connect(relayer).submitReport(cid, reportHash, nullifier, pseudonym);
    const receipt = await tx.wait();
    return { tx, receipt, cid, reportHash, nullifier, pseudonym };
  }

  async function submitAndOpenReport(tag = 'default') {
    const citizenPseudonym = makeBytes32('citizen-open-' + tag);
    const nullifier = makeBytes32('nullifier-open-' + tag);
    await reporting.connect(relayer).submitReport(
      `QmTestCidOpen${tag}`,
      makeBytes32('rh-open-' + tag),
      nullifier,
      citizenPseudonym
    );
    const reportId = await reporting.reportCount();
    const reportIdNum = Number(reportId);

    // Cast 1 upvote so upvotes > downvotes → Open after finalization
    const voteNul = makeBytes32('open-vote-nul-' + tag);
    const votePseudo = makeBytes32('open-vote-voter-' + tag);
    await reporting.connect(relayer).castValidationVote(reportIdNum, voteNul, true, votePseudo);

    // Advance past the voting window
    await time.increase(60 * 60 + 1);

    // Finalize → Open
    await reporting.finalizeVotingWindow(reportIdNum);
    return reportIdNum;
  }

  // ─── Group 1: Report Submission ───────────────────────────────────────────

  describe("submitReport()", function () {

    it("T1.1.1 — authorized relayer submits a report successfully", async function () {
      const cid = makeCid(1);
      const reportHash = makeBytes32("report-hash");
      const nullifier = makeBytes32("nullifier-1");
      const pseudonym = makeBytes32("citizen-1");

      await expect(
        reporting.connect(relayer).submitReport(cid, reportHash, nullifier, pseudonym)
      )
        .to.emit(reporting, "ReportSubmitted")
        .withArgs(1, cid, reportHash, nullifier, pseudonym, (await time.latest()) + 1);

      const report = await reporting.getReport(1);
      expect(report.id).to.equal(1n);
      expect(report.ipfsCid).to.equal(cid);
      expect(report.reportHash).to.equal(reportHash);
      expect(report.submissionNullifier).to.equal(nullifier);
      expect(report.citizenPseudonym).to.equal(pseudonym);
      expect(report.status).to.equal(0n); // PendingValidation
    });

    it("T1.1.2 — non-relayer is rejected with Unauthorized()", async function () {
      await expect(
        reporting.connect(citizen1).submitReport(makeCid(1), makeBytes32("h"), makeBytes32("n"), makeBytes32("p"))
      ).to.be.revertedWithCustomError(reporting, "Unauthorized");
    });

    it("T1.1.3 — duplicate nullifier is rejected with NullifierAlreadyUsed()", async function () {
      const nullifier = makeBytes32("same-nullifier");
      await reporting.connect(relayer).submitReport(makeCid(1), makeBytes32("h1"), nullifier, makeBytes32("p1"));

      await expect(
        reporting.connect(relayer).submitReport(makeCid(2), makeBytes32("h2"), nullifier, makeBytes32("p2"))
      ).to.be.revertedWithCustomError(reporting, "NullifierAlreadyUsed");
    });

    it("T1.1.4 — empty CID is rejected with EmptyCID()", async function () {
      await expect(
        reporting.connect(relayer).submitReport("", makeBytes32("h"), makeBytes32("n"), makeBytes32("p"))
      ).to.be.revertedWithCustomError(reporting, "EmptyCID");
    });

    it("T1.1.5 — zero reportHash is rejected with InvalidHash()", async function () {
      await expect(
        reporting.connect(relayer).submitReport(makeCid(1), ethers.ZeroHash, makeBytes32("n"), makeBytes32("p"))
      ).to.be.revertedWithCustomError(reporting, "InvalidHash");
    });

    it("T1.1.6 — zero nullifier is rejected with InvalidNullifier()", async function () {
      await expect(
        reporting.connect(relayer).submitReport(makeCid(1), makeBytes32("h"), ethers.ZeroHash, makeBytes32("p"))
      ).to.be.revertedWithCustomError(reporting, "InvalidNullifier");
    });

    it("T1.1.7 — zero pseudonym is rejected with InvalidPseudonym()", async function () {
      await expect(
        reporting.connect(relayer).submitReport(makeCid(1), makeBytes32("h"), makeBytes32("n"), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(reporting, "InvalidPseudonym");
    });

    it("T1.1.8 — report count increments with each submission", async function () {
      await submitReport({ nullifier: makeBytes32("n1"), pseudonym: makeBytes32("p1") });
      await submitReport({ nullifier: makeBytes32("n2"), pseudonym: makeBytes32("p2") });
      expect(await reporting.reportCount()).to.equal(2n);
    });

    it("T1.1.9 — phaseDeadline is set on submission", async function () {
      await submitReport();
      const report = await reporting.getReport(1);
      expect(report.phaseDeadline).to.be.gt(0n);
    });
  });

  // ─── Group 2: Validation Voting ───────────────────────────────────────────

  describe("castValidationVote()", function () {

    beforeEach(async function () {
      await submitReport();
    });

    it("T1.1.10 — upvote increments validationUpvotes and emits ValidationVoteCast", async function () {
      const voteNullifier = makeBytes32("vote-n1");
      const pseudonym = makeBytes32("voter-1");

      await expect(
        reporting.connect(relayer).castValidationVote(1, voteNullifier, true, pseudonym)
      ).to.emit(reporting, "ValidationVoteCast").withArgs(1, voteNullifier, true, 1n, 0n);

      const report = await reporting.getReport(1);
      expect(report.votes.validationUpvotes).to.equal(1n);
      expect(report.votes.validationDownvotes).to.equal(0n);
    });

    it("T1.1.11 — downvote increments validationDownvotes", async function () {
      const voteNullifier = makeBytes32("vote-n2");
      const pseudonym = makeBytes32("voter-2");

      await reporting.connect(relayer).castValidationVote(1, voteNullifier, false, pseudonym);

      const report = await reporting.getReport(1);
      expect(report.votes.validationDownvotes).to.equal(1n);
    });

    it("T1.1.12 — same vote nullifier is rejected with NullifierAlreadyUsed()", async function () {
      const voteNullifier = makeBytes32("dup-vote-n");
      await reporting.connect(relayer).castValidationVote(1, voteNullifier, true, makeBytes32("v1"));

      await expect(
        reporting.connect(relayer).castValidationVote(1, voteNullifier, false, makeBytes32("v2"))
      ).to.be.revertedWithCustomError(reporting, "NullifierAlreadyUsed");
    });

    it("T1.1.13 — same citizen pseudonym cannot vote twice (CitizenAlreadyVoted)", async function () {
      const pseudonym = makeBytes32("repeat-voter");
      await reporting.connect(relayer).castValidationVote(1, makeBytes32("vn1"), true, pseudonym);

      await expect(
        reporting.connect(relayer).castValidationVote(1, makeBytes32("vn2"), false, pseudonym)
      ).to.be.revertedWithCustomError(reporting, "CitizenAlreadyVoted");
    });

    it("T1.1.14 — vote after window expiry triggers lazy finalization (not counted)", async function () {
      // Cast 1 upvote to ensure Open on finalization
      await reporting.connect(relayer).castValidationVote(1, makeBytes32("pre-exp"), true, makeBytes32("pre-voter"));

      // Advance time past window
      await time.increase(60 * 60 + 2);

      // This vote arrives late — should NOT be counted, instead should finalize
      await reporting.connect(relayer).castValidationVote(1, makeBytes32("late-n"), false, makeBytes32("late-voter"));

      const report = await reporting.getReport(1);
      // Status should have advanced from PendingValidation (0=PendingValidation, 2=Open)
      expect(report.status).to.not.equal(0n); // no longer PendingValidation
    });

    it("T1.1.15 — voting reverts when report is not in PendingValidation", async function () {
      // Force finalize to Open
      await reporting.connect(relayer).castValidationVote(1, makeBytes32("up"), true, makeBytes32("vp1"));
      await time.increase(60 * 60 + 2);
      await reporting.finalizeVotingWindow(1);

      await expect(
        reporting.connect(relayer).castValidationVote(1, makeBytes32("post-n"), true, makeBytes32("post-p"))
      ).to.be.revertedWithCustomError(reporting, "InvalidState");
    });
  });

  // ─── Group 3: Finalization ────────────────────────────────────────────────

  describe("finalizeVotingWindow()", function () {

    beforeEach(async function () {
      await submitReport();
    });

    it("T1.1.16 — status → Open when upvotes > downvotes", async function () {
      await reporting.connect(relayer).castValidationVote(1, makeBytes32("un1"), true, makeBytes32("pn1"));
      await time.increase(60 * 60 + 1);

      await expect(reporting.finalizeVotingWindow(1))
        .to.emit(reporting, "VotingWindowFinalized");

      const report = await reporting.getReport(1);
      expect(report.status).to.equal(2n); // Open
    });

    it("T1.1.17 — status → CommunityRejected when downvotes >= upvotes (tie defaults rejected)", async function () {
      // No votes = 0 up, 0 down → downvotes >= upvotes → CommunityRejected
      await time.increase(60 * 60 + 1);
      await reporting.finalizeVotingWindow(1);

      const report = await reporting.getReport(1);
      expect(report.status).to.equal(1n); // CommunityRejected
    });

    it("T1.1.18 — finalizeVotingWindow reverts when window is still open", async function () {
      await expect(
        reporting.finalizeVotingWindow(1)
      ).to.be.revertedWithCustomError(reporting, "VotingWindowStillOpen");
    });

    it('T1.1.19 — finalizeVotingWindow succeeds exactly after window duration (time travel)', async function () {
      await time.increase(60 * 60 + 1); // past 1-hour window

      await reporting.finalizeVotingWindow(1); // should not throw
      const report = await reporting.getReport(1);
      expect(report.status).to.not.equal(0n); // moved from PendingValidation
    });

    it('T1.1.20 — batchFinalizeVotingWindows finalizes multiple expired reports', async function () {
      // Submit 3 more reports (report 1 already from beforeEach)
      await submitReport({ nullifier: makeBytes32('bn1'), pseudonym: makeBytes32('bp1') });
      await submitReport({ nullifier: makeBytes32('bn2'), pseudonym: makeBytes32('bp2') });
      await submitReport({ nullifier: makeBytes32('bn3'), pseudonym: makeBytes32('bp3') });

      await time.increase(60 * 60 + 1);

      const reportIds = [1, 2, 3, 4]; // report 1 from beforeEach + 3 more
      await reporting.batchFinalizeVotingWindows(reportIds); // should not throw

      for (const id of reportIds) {
        const r = await reporting.getReport(id);
        expect(r.status).to.not.equal(0n); // all finalized
      }
    });
  });

  // ─── Group 4: Authority Actions ───────────────────────────────────────────

  describe("Authority lifecycle (startWork → markAsSolved → PendingVerification)", function () {

    let reportId: number;

    beforeEach(async function () {
      reportId = await submitAndOpenReport('authority-tests');
    });

    it("T1.1.21 — authority claims an Open report (startWork → InProgress)", async function () {
      await expect(
        reporting.connect(authority).startWork(reportId, "Starting work", "")
      ).to.emit(reporting, "WorkStarted");

      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(3n); // InProgress
      expect(report.assignedAuthority).to.equal(authority.address);
    });

    it("T1.1.22 — startWork reverts on wrong status (e.g. PendingValidation)", async function () {
      // Submit a fresh report that is still PendingValidation
      await submitReport({ nullifier: makeBytes32("wrong-state-n"), pseudonym: makeBytes32("wrong-state-p") });
      const newId = Number(await reporting.reportCount());

      await expect(
        reporting.connect(authority).startWork(newId, "", "")
      ).to.be.revertedWithCustomError(reporting, "InvalidState");
    });

    it("T1.1.23 — authority marks report solved → PendingVerification with phase deadline set", async function () {
      await reporting.connect(authority).startWork(reportId, "Start", "");
      await expect(
        reporting.connect(authority).markAsSolved(reportId, "Fixed!", "QmEvidenceCid")
      ).to.emit(reporting, "ReportMarkedSolved");

      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(5n); // PendingVerification
      expect(report.phaseDeadline).to.be.gt(0n);
      expect(report.authorityComment).to.equal("Fixed!");
      expect(report.authorityImageCid).to.equal("QmEvidenceCid");
    });

    it("T1.1.24 — wrong authority cannot markAsSolved (Unauthorized)", async function () {
      await reporting.connect(authority).startWork(reportId, "", "");

      // citizen1 is not the assigned authority
      await expect(
        reporting.connect(citizen1).markAsSolved(reportId, "", "")
      ).to.be.revertedWithCustomError(reporting, "Unauthorized");
    });

    it("T1.1.25 — authority rejects issue → PendingRejectionReview", async function () {
      await expect(
        reporting.connect(authority).rejectIssue(reportId, "Not valid", "")
      ).to.emit(reporting, "ReportRejectedByAuthority");

      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(4n); // PendingRejectionReview
      expect(report.phaseDeadline).to.be.gt(0n);
    });
  });

  // ─── Group 5: Verification Voting ─────────────────────────────────────────

  describe("castVerificationVote()", function () {

    let reportId: number;

    beforeEach(async function () {
      // Get report to PendingVerification
      reportId = await submitAndOpenReport('cv-citizen');
      await reporting.connect(authority).startWork(reportId, "", "");
      await reporting.connect(authority).markAsSolved(reportId, "Done", "");
    });

    it("T1.1.26 — accept vote increments verificationAcceptVotes", async function () {
      await reporting.connect(relayer).castVerificationVote(reportId, makeBytes32("vvn1"), true, makeBytes32("vvp1"));
      const report = await reporting.getReport(reportId);
      expect(report.votes.verificationAcceptVotes).to.equal(1n);
    });

    it("T1.1.27 — reject vote increments verificationRejectVotes", async function () {
      await reporting.connect(relayer).castVerificationVote(reportId, makeBytes32("vvn2"), false, makeBytes32("vvp2"));
      const report = await reporting.getReport(reportId);
      expect(report.votes.verificationRejectVotes).to.equal(1n);
    });

    it("T1.1.28 — after window: accept ≥ reject → Closed", async function () {
      await reporting.connect(relayer).castVerificationVote(reportId, makeBytes32("vvn3"), true, makeBytes32("vvp3"));
      await time.increase(60 * 60 + 1);
      await reporting.finalizeVotingWindow(reportId);

      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(6n); // Closed
    });

    it("T1.1.29 — after window: reject > accept → Reopened", async function () {
      await reporting.connect(relayer).castVerificationVote(reportId, makeBytes32("vvn4"), false, makeBytes32("vvp4"));
      await time.increase(60 * 60 + 1);
      await reporting.finalizeVotingWindow(reportId);

      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(7n); // Reopened
    });
  });

  // ─── Group 6: Rejection Review Voting ─────────────────────────────────────

  describe("castRejectionReviewVote()", function () {

    let reportId: number;

    beforeEach(async function () {
      reportId = await submitAndOpenReport('rr-citizen');
      await reporting.connect(authority).rejectIssue(reportId, "Not valid", "");
    });

    it("T1.1.30 — uphold vote increments rejectionUpholdVotes", async function () {
      await reporting.connect(relayer).castRejectionReviewVote(reportId, makeBytes32("rvn1"), true, makeBytes32("rvp1"));
      const report = await reporting.getReport(reportId);
      expect(report.votes.rejectionUpholdVotes).to.equal(1n);
    });

    it("T1.1.31 — appeal vote increments rejectionAppealVotes", async function () {
      await reporting.connect(relayer).castRejectionReviewVote(reportId, makeBytes32("rvn2"), false, makeBytes32("rvp2"));
      const report = await reporting.getReport(reportId);
      expect(report.votes.rejectionAppealVotes).to.equal(1n);
    });

    it("T1.1.32 — uphold ≥ appeal after window → Closed", async function () {
      await reporting.connect(relayer).castRejectionReviewVote(reportId, makeBytes32("rvn3"), true, makeBytes32("rvp3"));
      await time.increase(60 * 60 + 1);
      await reporting.finalizeVotingWindow(reportId);
      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(6n); // Closed
    });

    it("T1.1.33 — appeal > uphold after window → Reopened", async function () {
      await reporting.connect(relayer).castRejectionReviewVote(reportId, makeBytes32("rvn4"), false, makeBytes32("rvp4"));
      await time.increase(60 * 60 + 1);
      await reporting.finalizeVotingWindow(reportId);
      const report = await reporting.getReport(reportId);
      expect(report.status).to.equal(7n); // Reopened
    });
  });

  // ─── Group 7: Query & Pagination Functions ─────────────────────────────────

  describe("Query functions", function () {

    beforeEach(async function () {
      // Submit 5 reports for pagination tests
      for (let i = 1; i <= 5; i++) {
        await submitReport({
          cid: makeCid(i),
          nullifier: makeBytes32(`n${i}`),
          pseudonym: makeBytes32(`p${i}`),
        });
      }
    });

    it("T1.1.34 — getAllReports returns reports newest-first", async function () {
      const [page, total] = await reporting.getAllReports(0, 5);
      expect(total).to.equal(5n);
      expect(page[0].id).to.equal(5n); // newest first
      expect(page[4].id).to.equal(1n); // oldest last
    });

    it("T1.1.35 — getAllReports with offset skips correct number of reports", async function () {
      const [page, total] = await reporting.getAllReports(2, 3);
      expect(total).to.equal(5n);
      expect(page.length).to.equal(3);
      expect(page[0].id).to.equal(3n); // starts from 3rd newest
    });

    it("T1.1.36 — getAllReports with limit > 100 reverts InvalidPagination", async function () {
      await expect(
        reporting.getAllReports(0, 101)
      ).to.be.revertedWithCustomError(reporting, "InvalidPagination");
    });

    it("T1.1.37 — getReportsByCitizen returns only reports for that pseudonym", async function () {
      const pseudonym = makeBytes32("p2");
      const [page, total] = await reporting.getReportsByCitizen(pseudonym, 0, 10);
      expect(total).to.equal(1n);
      expect(page[0].citizenPseudonym).to.equal(pseudonym);
    });

    it("T1.1.38 — getReportCountByCitizen returns correct count", async function () {
      // Submit 2 more from the same pseudonym
      const samePseudonym = makeBytes32("same-citizen");
      await submitReport({ nullifier: makeBytes32("sn1"), pseudonym: samePseudonym });
      await submitReport({ nullifier: makeBytes32("sn2"), pseudonym: samePseudonym });

      const count = await reporting.getReportCountByCitizen(samePseudonym);
      expect(count).to.equal(2n);
    });

    it("T1.1.39 — getReportsByIds returns correct reports in order", async function () {
      const ids = [1, 3, 5];
      const results = await reporting.getReportsByIds(ids);
      expect(results[0].id).to.equal(1n);
      expect(results[1].id).to.equal(3n);
      expect(results[2].id).to.equal(5n);
    });

    it("T1.1.40 — getReport with invalid id reverts InvalidReportId", async function () {
      await expect(reporting.getReport(999)).to.be.revertedWithCustomError(reporting, "InvalidReportId");
      await expect(reporting.getReport(0)).to.be.revertedWithCustomError(reporting, "InvalidReportId");
    });
  });

  // ─── Group 8: Authority Action Log ─────────────────────────────────────────

  describe("Authority action history (getReportActions)", function () {

    it('T1.1.41 — action log grows correctly across lifecycle', async function () {
      const reportId = await submitAndOpenReport('log-citizen');

      await reporting.connect(authority).startWork(reportId, "Started", "");
      await reporting.connect(authority).markAsSolved(reportId, "Done", "QmImg");

      const actions = await reporting.getReportActions(reportId);
      expect(actions.length).to.equal(2);
      expect(actions[0].comment).to.equal("Started");
      expect(actions[1].comment).to.equal("Done");
      expect(actions[1].imageCid).to.equal("QmImg");
    });
  });
});