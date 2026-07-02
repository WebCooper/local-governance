import hre from "hardhat";
import { expect } from "chai";

describe("OpinionPolling", function () {
  let ethers: any;
  let networkHelpers: any;
  let reporting: any;
  let polling: any;
  let owner: any;
  let authority: any;
  let nonAuthority: any;
  let relayer: any;

  before(async function () {
    const connection = await hre.network.connect() as any;
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  beforeEach(async function () {
    [owner, authority, nonAuthority, relayer] = await ethers.getSigners();

    // 1. Deploy Reporting contract
    const ReportingFactory = await ethers.getContractFactory("Reporting");
    reporting = await ReportingFactory.deploy();

    // 2. Set authority in Reporting contract
    await reporting.setAuthority(authority.address, true);

    // 3. Deploy OpinionPolling contract pointing to Reporting
    const OpinionPollingFactory = await ethers.getContractFactory("OpinionPolling");
    polling = await OpinionPollingFactory.deploy(await reporting.getAddress());
  });

  describe("createOfficialPoll", function () {
    it("should allow an authorized authority to create a poll", async function () {
      const latestTime = await networkHelpers.time.latest();
      const deadline = latestTime + 3600; // 1 hour in future
      const ipfsCid = "bafybeigdyrzt5s3bty73jcm5s73q5wdf7tcm";
      const pollType = 0; // TrueFalse

      await expect(polling.connect(authority).createOfficialPoll(ipfsCid, deadline, pollType))
        .to.emit(polling, "PollCreated")
        .withArgs(1, authority.address, ipfsCid, deadline);

      const poll = await polling.polls(1);
      expect(poll.id).to.equal(1);
      expect(poll.creator).to.equal(authority.address);
      expect(poll.ipfsMetadataCid).to.equal(ipfsCid);
      expect(poll.deadline).to.equal(deadline);
      expect(poll.pollType).to.equal(pollType);
      expect(poll.isActive).to.be.true;
    });

    it("should revert if created by a non-authority", async function () {
      const latestTime = await networkHelpers.time.latest();
      const deadline = latestTime + 3600;
      await expect(
        polling.connect(nonAuthority).createOfficialPoll("someCid", deadline, 0)
      ).to.be.revertedWithCustomError(polling, "UnauthorizedAuthority");
    });

    it("should revert if deadline is in the past or present", async function () {
      const latestTime = await networkHelpers.time.latest();
      const deadline = latestTime - 10;
      await expect(
        polling.connect(authority).createOfficialPoll("someCid", deadline, 0)
      ).to.be.revertedWithCustomError(polling, "InvalidDeadline");
    });
  });

  describe("castVote", function () {
    let deadline: number;
    const ipfsCid = "bafybeigdyrzt5s3bty73jcm5s73q5wdf7tcm";
    let nullifier1: string;
    let nullifier2: string;

    beforeEach(async function () {
      nullifier1 = ethers.keccak256(ethers.toUtf8Bytes("nullifier1"));
      nullifier2 = ethers.keccak256(ethers.toUtf8Bytes("nullifier2"));

      const latestTime = await networkHelpers.time.latest();
      deadline = latestTime + 3600;
      await polling.connect(authority).createOfficialPoll(ipfsCid, deadline, 0); // Poll ID: 1
    });

    it("should record votes correctly and emit VoteCast event", async function () {
      await expect(polling.connect(relayer).castVote(1, 1, nullifier1))
        .to.emit(polling, "VoteCast")
        .withArgs(1, nullifier1, 1);

      await polling.connect(relayer).castVote(1, 0, nullifier2);

      const results = await polling.getPollResults(1, 2);
      expect(results[0]).to.equal(1); // 1 vote for False (index 0)
      expect(results[1]).to.equal(1); // 1 vote for True (index 1)
    });

    it("should revert if double voting with the same nullifier is attempted", async function () {
      await polling.connect(relayer).castVote(1, 1, nullifier1);
      await expect(
        polling.connect(relayer).castVote(1, 0, nullifier1)
      ).to.be.revertedWithCustomError(polling, "AlreadyVotedWithNullifier");
    });

    it("should revert if poll has passed deadline", async function () {
      await networkHelpers.time.increase(3601); // fast forward past deadline
      await expect(
        polling.connect(relayer).castVote(1, 1, nullifier1)
      ).to.be.revertedWithCustomError(polling, "PollInactiveOrClosed");
    });

    it("should revert if poll is finalized/deactivated", async function () {
      await polling.connect(authority).finalizePoll(1);
      await expect(
        polling.connect(relayer).castVote(1, 1, nullifier1)
      ).to.be.revertedWithCustomError(polling, "PollInactiveOrClosed");
    });
  });

  describe("finalizePoll", function () {
    beforeEach(async function () {
      const latestTime = await networkHelpers.time.latest();
      const deadline = latestTime + 3600;
      await polling.connect(authority).createOfficialPoll("cid", deadline, 0); // Poll ID: 1
    });

    it("should deactivate poll and emit PollFinalized", async function () {
      await expect(polling.connect(nonAuthority).finalizePoll(1))
        .to.emit(polling, "PollFinalized");

      const poll = await polling.polls(1);
      expect(poll.isActive).to.be.false;
    });

    it("should revert if finalizing a poll that does not exist", async function () {
      await expect(
        polling.connect(authority).finalizePoll(999)
      ).to.be.revertedWithCustomError(polling, "PollDoesNotExist");
    });

    it("should revert if finalizing a poll that is already inactive", async function () {
      await polling.connect(authority).finalizePoll(1);
      await expect(
        polling.connect(authority).finalizePoll(1)
      ).to.be.revertedWithCustomError(polling, "PollInactiveOrClosed");
    });
  });
});
