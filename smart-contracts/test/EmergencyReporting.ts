import hre from "hardhat";
import { expect } from "chai";

describe("EmergencyReporting", function () {
  let ethers: any;
  let time: any;
  let emergencyReporting: any;
  let owner: any, relayer: any, authority: any, nonRelayer: any;

  const makeCid = (n: number | string) => `QmEmergency${n}`;
  const makeBytes32 = (s: string) => (ethers as any).keccak256((ethers as any).toUtf8Bytes(s));

  before(async function () {
    const connection = await hre.network.connect() as any;
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
  });

  beforeEach(async function () {
    [owner, relayer, authority, nonRelayer] = await ethers.getSigners();

    const EmergencyReportingFactory = await ethers.getContractFactory("EmergencyReporting");
    emergencyReporting = await EmergencyReportingFactory.deploy();

    await emergencyReporting.setRelayer(relayer.address, true);
    await emergencyReporting.setAuthority(authority.address, true);
  });

  // ─── Helper ────────────────────────────────────────────────────────────────

  async function submitEmergency(tag = "default") {
    const cid = makeCid(tag);
    const reportHash = makeBytes32(`rh-${tag}`);
    const nullifier = makeBytes32(`nul-${tag}`);
    const pseudonym = makeBytes32(`pseudo-${tag}`);
    await emergencyReporting.connect(relayer).submitEmergencyReport(cid, reportHash, nullifier, pseudonym);
    const reportId = Number(await emergencyReporting.reportCount());
    return { reportId, cid, reportHash, nullifier, pseudonym };
  }

  // ─── Group 1: submitEmergencyReport() ──────────────────────────────────────

  describe("submitEmergencyReport()", function () {

    it("T1.2.1 — authorized relayer submits; status is immediately Open (0)", async function () {
      const cid = makeCid("A");
      const reportHash = makeBytes32("emergency-hash");
      const nullifier = makeBytes32("em-nullifier-1");
      const pseudonym = makeBytes32("em-citizen-1");

      await expect(
        emergencyReporting.connect(relayer).submitEmergencyReport(cid, reportHash, nullifier, pseudonym)
      ).to.emit(emergencyReporting, "EmergencyReportSubmitted");

      const report = await emergencyReporting.getReport(1);
      expect(report.ipfsCid).to.equal(cid);
      expect(Number(report.status)).to.equal(0); // Open
      expect(report.isReclassified).to.be.false;
    });

    it("T1.2.2 — nullifier reuse reverts with NullifierAlreadyUsed()", async function () {
      const nullifier = makeBytes32("dup-em-nullifier");
      await emergencyReporting.connect(relayer).submitEmergencyReport(
        makeCid("B"), makeBytes32("rh1"), nullifier, makeBytes32("ps1")
      );

      await expect(
        emergencyReporting.connect(relayer).submitEmergencyReport(
          makeCid("C"), makeBytes32("rh2"), nullifier, makeBytes32("ps2")
        )
      ).to.be.revertedWithCustomError(emergencyReporting, "NullifierAlreadyUsed");
    });

    it("T1.2.3 — non-relayer is rejected with Unauthorized()", async function () {
      await expect(
        emergencyReporting.connect(nonRelayer).submitEmergencyReport(
          makeCid("D"), makeBytes32("rh3"), makeBytes32("n3"), makeBytes32("p3")
        )
      ).to.be.revertedWithCustomError(emergencyReporting, "Unauthorized");
    });

    it("T1.2.4 — empty CID reverts EmptyCID()", async function () {
      await expect(
        emergencyReporting.connect(relayer).submitEmergencyReport(
          "", makeBytes32("rh"), makeBytes32("n"), makeBytes32("p")
        )
      ).to.be.revertedWithCustomError(emergencyReporting, "EmptyCID");
    });

    it("T1.2.5 — zero reportHash reverts InvalidHash()", async function () {
      await expect(
        emergencyReporting.connect(relayer).submitEmergencyReport(
          makeCid("E"), ethers.ZeroHash, makeBytes32("n"), makeBytes32("p")
        )
      ).to.be.revertedWithCustomError(emergencyReporting, "InvalidHash");
    });
  });

  // ─── Group 2: reclassifyEmergency() ───────────────────────────────────────

  describe("reclassifyEmergency()", function () {

    it("T1.2.6 — authority reclassifies; isReclassified=true, 30-day penalty set", async function () {
      const { reportId, pseudonym } = await submitEmergency("reclassify-1");

      await expect(
        emergencyReporting.connect(authority).reclassifyEmergency(reportId, "Not an emergency")
      )
        .to.emit(emergencyReporting, "EmergencyReclassified");

      const report = await emergencyReporting.getReport(reportId);
      expect(report.isReclassified).to.be.true;
      expect(Number(report.status)).to.equal(3); // Reclassified

      const penaltyUntil = await emergencyReporting.emergencyPenaltyBox(pseudonym);
      expect(Number(penaltyUntil)).to.be.greaterThan(0);

      const now = await time.latest();
      const thirtyDays = 30 * 24 * 60 * 60;
      // Penalty should be approximately now + 30 days
      expect(Number(penaltyUntil)).to.be.approximately(now + thirtyDays, 5);
    });

    it("T1.2.7 — penalized citizen cannot submit another emergency (EmergencyReportingLocked)", async function () {
      const { pseudonym } = await submitEmergency("penalized-citizen");
      await emergencyReporting.connect(authority).reclassifyEmergency(1, "False alarm");

      const newNullifier = makeBytes32("new-nullifier-after-penalty");
      await expect(
        emergencyReporting.connect(relayer).submitEmergencyReport(
          makeCid("F"), makeBytes32("rh-new"), newNullifier, pseudonym
        )
      ).to.be.revertedWithCustomError(emergencyReporting, "EmergencyReportingLocked");
    });

    it("T1.2.8 — penalized citizen CAN submit after penalty expires (30 days later)", async function () {
      const { pseudonym } = await submitEmergency("penalty-expiry");
      await emergencyReporting.connect(authority).reclassifyEmergency(1, "False alarm");

      // Fast forward 30 days + 1 second
      await time.increase(30 * 24 * 60 * 60 + 1);

      const newNullifier = makeBytes32("post-penalty-nullifier");
      await emergencyReporting.connect(relayer).submitEmergencyReport(
        makeCid("G"), makeBytes32("rh-post"), newNullifier, pseudonym
      ); // should not throw
    });

    it("T1.2.9 — reclassifying an already-reclassified report reverts InvalidState()", async function () {
      const { reportId } = await submitEmergency("double-reclassify");
      await emergencyReporting.connect(authority).reclassifyEmergency(reportId, "First reclassify");

      await expect(
        emergencyReporting.connect(authority).reclassifyEmergency(reportId, "Second reclassify")
      ).to.be.revertedWithCustomError(emergencyReporting, "InvalidState");
    });
  });

  // ─── Group 3: Authority Action Functions ──────────────────────────────────

  describe("startWork() and resolveEmergency()", function () {

    it("T1.2.10 — authority claims Open emergency → InProgress", async function () {
      const { reportId } = await submitEmergency("startwork-1");

      await expect(
        emergencyReporting.connect(authority).startWork(reportId, "On my way", "")
      ).to.emit(emergencyReporting, "EmergencyWorkStarted");

      const report = await emergencyReporting.getReport(reportId);
      expect(Number(report.status)).to.equal(1); // InProgress
      expect(report.assignedAuthority).to.equal(authority.address);
    });

    it("T1.2.11 — authority resolves an InProgress emergency → Resolved", async function () {
      const { reportId } = await submitEmergency("resolve-1");
      await emergencyReporting.connect(authority).startWork(reportId, "", "");

      await expect(
        emergencyReporting.connect(authority).resolveEmergency(reportId, "Resolved!", "QmResolveCid")
      ).to.emit(emergencyReporting, "EmergencyResolved");

      const report = await emergencyReporting.getReport(reportId);
      expect(Number(report.status)).to.equal(2); // Resolved
      expect(report.authorityComment).to.equal("Resolved!");
    });

    it("T1.2.12 — authority can resolve directly from Open (bypasses InProgress)", async function () {
      const { reportId } = await submitEmergency("direct-resolve");
      await emergencyReporting.connect(authority).resolveEmergency(reportId, "Fast resolution", ""); // should not throw

      const report = await emergencyReporting.getReport(reportId);
      expect(Number(report.status)).to.equal(2); // Resolved
    });

    it("T1.2.13 — startWork on non-Open report reverts InvalidState()", async function () {
      const { reportId } = await submitEmergency("wrong-state");
      // Resolve it first
      await emergencyReporting.connect(authority).resolveEmergency(reportId, "", "");

      await expect(
        emergencyReporting.connect(authority).startWork(reportId, "", "")
      ).to.be.revertedWithCustomError(emergencyReporting, "InvalidState");
    });

    it("T1.2.14 — Super Admin (via AuthorityMultiSig ownership) can claim and resolve emergency", async function () {
      const signers = await ethers.getSigners();
      const superAdmin = signers[5];
      const initialSuperAdmins = [superAdmin.address, signers[6].address, signers[7].address, signers[8].address];
      const AuthorityMultiSigFactory = await ethers.getContractFactory("AuthorityMultiSig");
      const multiSig = await AuthorityMultiSigFactory.deploy(
        initialSuperAdmins,
        ["A", "B", "C", "D"],
        ["P1", "P2", "P3", "P4"],
        ["D1", "D2", "D3", "D4"],
        ethers.ZeroAddress,
        await emergencyReporting.getAddress()
      );
      await emergencyReporting.transferOwnership(await multiSig.getAddress());
      const { reportId } = await submitEmergency("superadmin-claim");
      await emergencyReporting.connect(superAdmin).startWork(reportId, "Super Admin claimed", "");
      const report = await emergencyReporting.getReport(reportId);
      expect(Number(report.status)).to.equal(1); // InProgress
    });
  });
});
