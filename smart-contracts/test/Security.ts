import hre from "hardhat";
import { expect } from "chai";

/**
 * T6 — Cryptographic Security & Sybil Attack Validation
 * Tests nullifier reuse prevention and Sybil-resistance at the contract layer.
 */
describe("Security & Sybil Attack Prevention", function () {
  let ethers: any;
  let time: any;
  let reporting: any;
  let emergencyReporting: any;
  let opinionPolling: any;
  let relayer: any, authority: any, badActor: any, owner: any;

  const makeBytes32 = (s: string) => (ethers as any).keccak256((ethers as any).toUtf8Bytes(s));

  before(async function () {
    const connection = await hre.network.connect() as any;
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
  });

  beforeEach(async function () {
    [owner, relayer, authority, badActor] = await ethers.getSigners();

    const ReportingFactory = await ethers.getContractFactory("Reporting");
    reporting = await ReportingFactory.deploy();
    await reporting.setRelayer(relayer.address, true);
    await reporting.setAuthority(authority.address, true);
    await reporting.setVotingWindowDuration(60 * 60); // 1 hour

    const EmergencyFactory = await ethers.getContractFactory("EmergencyReporting");
    emergencyReporting = await EmergencyFactory.deploy();
    await emergencyReporting.setRelayer(relayer.address, true);
    await emergencyReporting.setAuthority(authority.address, true);

    const OpinionPollingFactory = await ethers.getContractFactory("OpinionPolling");
    opinionPolling = await OpinionPollingFactory.deploy(await reporting.getAddress());
  });

  // ─── T6.1 — Nullifier Replay Prevention (100% revert) ─────────────────────

  describe("T6.1 — Submission nullifier replay prevention (100 attempts)", function () {

    it("should revert all 100 duplicate nullifier replay attempts", async function () {
      const nullifier = makeBytes32("replay-nullifier-constant");

      // First submission succeeds
      await reporting.connect(relayer).submitReport(
        "QmFirst", makeBytes32("rh"), nullifier, makeBytes32("p0")
      );

      // All subsequent attempts must revert
      let revertCount = 0;
      for (let i = 1; i <= 100; i++) {
        try {
          await reporting.connect(relayer).submitReport(
            `QmReplay${i}`, makeBytes32(`rh${i}`), nullifier, makeBytes32(`p${i}`)
          );
        } catch {
          revertCount++;
        }
      }

      expect(revertCount).to.equal(100, "All 100 replay attempts must be rejected");
    });
  });

  // ─── T6.2 — Forged Gov Signature (Relayer-layer test, documented) ──────────
  // NOTE: Gov signature forgery is enforced in the NestJS relayer (off-chain).
  // On-chain, any nullifier that makes it through is valid. This test documents
  // that only relayers (trusted) can call submitReport.

  describe("T6.2 — Non-relayer cannot directly submit to contract", function () {

    it("badActor calling submitReport directly is rejected Unauthorized", async function () {
      await expect(
        reporting.connect(badActor).submitReport(
          "QmAttack", makeBytes32("attack-hash"), makeBytes32("attack-nul"), makeBytes32("attack-ps")
        )
      ).to.be.revertedWithCustomError(reporting, "Unauthorized");
    });
  });

  // ─── T6.3 — Sybil Vote: Same citizen, different nullifiers ─────────────────

  describe("T6.3 — Sybil validation vote prevention (same pseudonym, new nullifier)", function () {

    it("should reject second vote from same citizen pseudonym even with fresh nullifier", async function () {
      // Submit a report first
      await reporting.connect(relayer).submitReport(
        "QmSybilTest", makeBytes32("sybil-rh"), makeBytes32("sybil-sub-nul"), makeBytes32("sybil-p")
      );
      const reportId = 1;

      const samePseudonym = makeBytes32("sybil-voter-identity");

      // First vote: succeeds
      await reporting.connect(relayer).castValidationVote(
        reportId, makeBytes32("sybil-vote-nul-1"), true, samePseudonym
      );

      // Second vote: different nullifier, SAME pseudonym → CitizenAlreadyVoted
      await expect(
        reporting.connect(relayer).castValidationVote(
          reportId, makeBytes32("sybil-vote-nul-2"), false, samePseudonym
        )
      ).to.be.revertedWithCustomError(reporting, "CitizenAlreadyVoted");
    });
  });

  // ─── T6.4 — Sybil Poll Vote Prevention ──────────────────────────────────────

  describe("T6.4 — OpinionPolling double-vote prevention", function () {

    it("should reject second poll vote with the same nullifier", async function () {
      const latestTime = await time.latest();
      await opinionPolling.connect(authority).createOfficialPoll("QmPollCid", latestTime + 7200, 0);
      const pollId = 1;

      const nullifier = makeBytes32("poll-sybil-nul");

      // First vote succeeds
      await opinionPolling.connect(relayer).castVote(pollId, 1, nullifier);

      // Sybil attempt with same nullifier
      await expect(
        opinionPolling.connect(relayer).castVote(pollId, 0, nullifier)
      ).to.be.revertedWithCustomError(opinionPolling, "AlreadyVotedWithNullifier");
    });
  });

  // ─── T6.5 — Emergency Penalty Box Prevents False-Alarm Abuse ───────────────

  describe("T6.5 — Emergency abuse prevention via penalty box", function () {

    it("should block penalized citizen for 30 days", async function () {
      const pseudonym = makeBytes32("abuse-pseudonym");
      const nullifier1 = makeBytes32("em-nul-1");

      await emergencyReporting.connect(relayer).submitEmergencyReport(
        "QmFalseAlarm", makeBytes32("fa-rh"), nullifier1, pseudonym
      );

      // Authority reclassifies
      await emergencyReporting.connect(authority).reclassifyEmergency(1, "False alarm");

      const penaltyUntil = await emergencyReporting.emergencyPenaltyBox(pseudonym);
      const now = await time.latest();
      expect(Number(penaltyUntil)).to.be.gt(now);

      // Attempt immediately after penalty → should fail
      await expect(
        emergencyReporting.connect(relayer).submitEmergencyReport(
          "QmSecond", makeBytes32("rh2"), makeBytes32("em-nul-2"), pseudonym
        )
      ).to.be.revertedWithCustomError(emergencyReporting, "EmergencyReportingLocked");
    });

    it("should allow citizen to submit again after 30-day penalty expires", async function () {
      const pseudonym = makeBytes32("expiry-pseudonym");
      await emergencyReporting.connect(relayer).submitEmergencyReport(
        "QmFalse2", makeBytes32("rh-false"), makeBytes32("em-n-1"), pseudonym
      );
      await emergencyReporting.connect(authority).reclassifyEmergency(1, "Not emergency");

      // Advance 30 days + 1 second
      await time.increase(30 * 24 * 60 * 60 + 1);

      // Should succeed now
      await emergencyReporting.connect(relayer).submitEmergencyReport(
        "QmAfterExpiry", makeBytes32("rh-new"), makeBytes32("em-n-2"), pseudonym
      ); // should not throw
    });
  });

  // ─── T6.6 — Verification and Rejection Review Sybil Protection ─────────────

  describe("T6.6 — Sybil protection in verification and rejection review phases", function () {

    async function getReportToVerification() {
      const pseudonym = makeBytes32("v-citizen");
      await reporting.connect(relayer).submitReport(
        "QmVer", makeBytes32("v-rh"), makeBytes32("v-sub-nul"), pseudonym
      );
      const reportId = Number(await reporting.reportCount());

      // Finalize validation
      await reporting.connect(relayer).castValidationVote(reportId, makeBytes32("v-vote-nul"), true, makeBytes32("v-voter"));
      await time.increase(60 * 60 + 1);
      await reporting.finalizeVotingWindow(reportId);

      // Start work + mark solved
      await reporting.connect(authority).startWork(reportId, "", "");
      await reporting.connect(authority).markAsSolved(reportId, "Done", "");

      return reportId;
    }

    it("should reject duplicate verification vote from same pseudonym", async function () {
      const reportId = await getReportToVerification();
      const samePseudonym = makeBytes32("ver-sybil-voter");

      await reporting.connect(relayer).castVerificationVote(reportId, makeBytes32("ver-nul-1"), true, samePseudonym);

      await expect(
        reporting.connect(relayer).castVerificationVote(reportId, makeBytes32("ver-nul-2"), false, samePseudonym)
      ).to.be.revertedWithCustomError(reporting, "CitizenAlreadyVoted");
    });
  });
});
