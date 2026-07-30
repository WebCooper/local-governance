import hre from "hardhat";
import { expect } from "chai";

describe("EmergencyReporting", function () {
  let ethers: any;
  let emergencyReporting: any;
  let owner: any, relayer: any, authority: any, citizen1: any;

  before(async function () {
    const connection = await hre.network.connect() as any;
    ethers = connection.ethers;
  });

  beforeEach(async function () {
    [owner, relayer, authority, citizen1] = await ethers.getSigners();

    const EmergencyReportingFactory = await ethers.getContractFactory("EmergencyReporting");
    emergencyReporting = await EmergencyReportingFactory.deploy();

    await emergencyReporting.setRelayer(relayer.address, true);
    await emergencyReporting.setAuthority(authority.address, true);
  });

  it("should allow an authorized relayer to submit an emergency report with Open status immediately", async function () {
    const cid = "QmTestEmergency123";
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes("emergency"));
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));
    const pseudonym = ethers.keccak256(ethers.toUtf8Bytes("citizen-1"));

    await expect(
      emergencyReporting.connect(relayer).submitEmergencyReport(cid, reportHash, nullifier, pseudonym)
    ).to.emit(emergencyReporting, "EmergencyReportSubmitted");

    const rep = await emergencyReporting.getReport(1);
    expect(rep.ipfsCid).to.equal(cid);
    expect(Number(rep.status)).to.equal(0); // 0 = Open
  });

  it("should penalize a citizen when an emergency report is reclassified", async function () {
    const cid = "QmTestEmergencyFake";
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
    const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-2"));
    const pseudonym = ethers.keccak256(ethers.toUtf8Bytes("citizen-fake"));

    await emergencyReporting.connect(relayer).submitEmergencyReport(cid, reportHash, nullifier, pseudonym);

    await expect(
      emergencyReporting.connect(authority).reclassifyEmergency(1, "Not an emergency")
    ).to.emit(emergencyReporting, "EmergencyReclassified");

    const penaltyUntil = await emergencyReporting.emergencyPenaltyBox(pseudonym);
    expect(Number(penaltyUntil)).to.be.greaterThan(0);

    // Second emergency attempt from same pseudonym should revert
    const nullifier2 = ethers.keccak256(ethers.toUtf8Bytes("nullifier-3"));
    await expect(
      emergencyReporting.connect(relayer).submitEmergencyReport(cid, reportHash, nullifier2, pseudonym)
    ).to.be.revertedWithCustomError(emergencyReporting, "EmergencyReportingLocked");
  });
});
