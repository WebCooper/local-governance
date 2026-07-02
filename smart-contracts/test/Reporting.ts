// const { expect } = require("chai");
// const { ethers } = require("hardhat");
// const { time } = require("@nomicfoundation/hardhat-network-helpers");

import { ethers } from "ethers";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";


describe("Reporting", function () {

  let reporting;
  let owner, relayer, authority, citizen1, citizen2;

  // Runs before every test — gives us a fresh contract each time
  beforeEach(async function () {
    [owner, relayer, authority, citizen1, citizen2] = await ethers.getSigners();

    const Reporting = await ethers.getContractFactory("Reporting");
    reporting = await Reporting.deploy();

    // Authorize the relayer and authority
    await reporting.setRelayer(relayer.address, true);
    await reporting.setAuthority(authority.address, true);
  });

  // ─── Group 1: Report Submission ───────────────────────────────────────────

  describe("submitReport()", function () {

    it("should allow an authorized relayer to submit a report", async function () {
      // Your test here
    });

    it("should revert if called by a non-relayer", async function () {
      // Your test here
    });

    it("should revert if the same nullifier is reused", async function () {
      // Your test here
    });

  });

  // ─── Group 2: Validation Voting ───────────────────────────────────────────

  describe("castValidationVote()", function () {

    it("should increment upvotes when support is true", async function () {
      // Your test here
    });

    it("should revert if voting window has closed", async function () {
      // Your test here
    });

    it("should revert if nullifier is reused", async function () {
      // Your test here
    });

  });

  // ─── Group 3: Lazy Finalization ───────────────────────────────────────────

  describe("finalizeVotingWindow()", function () {

    it("should move report to Open when upvotes > downvotes", async function () {
      // Your test here
    });

    it("should move report to CommunityRejected when downvotes >= upvotes", async function () {
      // Your test here
    });

    it("should revert if window is still open", async function () {
      // Your test here
    });

    it("should finalize after 24 hours", async function () {
    // // ... submit report, cast votes ...

    // // Fast-forward 24 hours + 1 second
    // await time.increase(24 * 60 * 60 + 1);

    // // Now finalize should succeed
    // await reporting.finalizeVotingWindow(reportId);
    // 
    });
});

});