import { expect } from "chai";
import hre from "hardhat";

describe("AuthorityMultiSig", function () {
  let AuthorityMultiSig: any;
  let authorityMultiSig: any;
  let Reporting: any;
  let reporting: any;

  let owner: any;
  let superAdmin1: any, superAdmin2: any, superAdmin3: any, superAdmin4: any, superAdmin5: any;
  let newSuperAdmin: any;
  let newAuthority: any;

  beforeEach(async function () {
    const signers = await hre.ethers.getSigners();
    owner = signers[0];
    superAdmin1 = signers[1];
    superAdmin2 = signers[2];
    superAdmin3 = signers[3];
    superAdmin4 = signers[4];
    superAdmin5 = signers[5];
    newSuperAdmin = signers[6];
    newAuthority = signers[7];

    const initialSuperAdmins = [
      superAdmin1.address,
      superAdmin2.address,
      superAdmin3.address,
      superAdmin4.address,
      superAdmin5.address,
    ];

    // Deploy Reporting
    Reporting = await hre.ethers.getContractFactory("Reporting");
    reporting = await Reporting.deploy();

    // Deploy AuthorityMultiSig
    AuthorityMultiSig = await hre.ethers.getContractFactory("AuthorityMultiSig");
    authorityMultiSig = await AuthorityMultiSig.deploy(initialSuperAdmins, reporting.target || reporting.address);

    // Transfer ownership of Reporting to AuthorityMultiSig
    await reporting.transferOwnership(authorityMultiSig.target || authorityMultiSig.address);
  });

  describe("Super Admin Management", function () {
    it("should allow super admins to add a new super admin via majority vote", async function () {
      // superAdmin1 proposes adding newSuperAdmin
      await authorityMultiSig.connect(superAdmin1).submitProposal(newSuperAdmin.address, 0); // 0 = AddSuperAdmin

      // superAdmin1 automatically votes. We need 3 votes total (majority of 5).
      // superAdmin2 and superAdmin3 vote yes.
      await authorityMultiSig.connect(superAdmin2).vote(1);
      await authorityMultiSig.connect(superAdmin3).vote(1);

      // Proposal should execute automatically on the 3rd vote
      const isSuperAdmin = await authorityMultiSig.isSuperAdmin(newSuperAdmin.address);
      expect(isSuperAdmin).to.be.true;

      const count = await authorityMultiSig.superAdminCount();
      expect(count).to.equal(6);
    });

    it("should allow super admins to remove a super admin", async function () {
      // Propose removing superAdmin5
      await authorityMultiSig.connect(superAdmin1).submitProposal(superAdmin5.address, 1); // 1 = RemoveSuperAdmin

      await authorityMultiSig.connect(superAdmin2).vote(1);
      await authorityMultiSig.connect(superAdmin3).vote(1);

      const isSuperAdmin = await authorityMultiSig.isSuperAdmin(superAdmin5.address);
      expect(isSuperAdmin).to.be.false;

      const count = await authorityMultiSig.superAdminCount();
      expect(count).to.equal(4);
    });
  });

  describe("Authority Management", function () {
    it("should allow super admins to add an authority", async function () {
      await authorityMultiSig.connect(superAdmin1).submitProposal(newAuthority.address, 2); // 2 = AddAuthority

      await authorityMultiSig.connect(superAdmin2).vote(1);
      await authorityMultiSig.connect(superAdmin3).vote(1);

      const isAuth = await reporting.authorizedAuthorities(newAuthority.address);
      expect(isAuth).to.be.true;
    });

    it("should allow super admins to remove an authority", async function () {
      // First add the authority
      await authorityMultiSig.connect(superAdmin1).submitProposal(newAuthority.address, 2);
      await authorityMultiSig.connect(superAdmin2).vote(1);
      await authorityMultiSig.connect(superAdmin3).vote(1);
      
      // Now remove them
      await authorityMultiSig.connect(superAdmin4).submitProposal(newAuthority.address, 3); // 3 = RemoveAuthority
      await authorityMultiSig.connect(superAdmin5).vote(2);
      await authorityMultiSig.connect(superAdmin1).vote(2);

      const isAuth = await reporting.authorizedAuthorities(newAuthority.address);
      expect(isAuth).to.be.false;
    });
  });
});
