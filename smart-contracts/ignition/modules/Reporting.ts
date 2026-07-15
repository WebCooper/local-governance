import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Full deployment module for the Local Governance smart contract suite.
 *
 * Deployment order (Ignition handles the dependency graph automatically):
 *   1. Reporting.sol         — core report lifecycle contract
 *   2. AuthorityMultiSig.sol — governance contract for managing Authority Workers
 *                              (initialSuperAdmins are government officers who
 *                               created their own MetaMask wallets and shared addresses)
 *   3. Reporting.transferOwnership → AuthorityMultiSig
 *                              (only multi-sig approved proposals can add/remove workers)
 *   4. OpinionPolling.sol    — reads from Reporting's authorizedAuthorities mapping
 *
 * After deployment:
 *   - Update .env: CONTRACT_ADDRESS, POLLING_CONTRACT_ADDRESS, AUTHORITY_MULTISIG_ADDRESS
 *   - Run fund-accounts.ts to pre-fund super admin wallets
 *   - The AuthorityFundingService in the relayer will auto-fund new authority workers
 *     going forward when AddAuthority proposals execute
 */
export default buildModule("ReportingLocalGovernance", (m) => {
  const reporting = m.contract("Reporting");

  // ── Super Admin addresses ──────────────────────────────────────────────────
  // These wallets are created by the government officers themselves (not generated
  // for them). They create MetaMask wallets, share their public address, and
  // these are hardcoded here before deployment.
  const initialSuperAdmins = [
    "0x416109618A1f1A89C7Fd156be62b5fc734745340", // Super Admin 1 - Janitha
    "0x22c3488E96fccE1077365309A92e6BD895a00AAf", // Super Admin 2 - Hansika
    "0xA7Fe174054755c27c870772f47E52081c4b250b5", // Super Admin 3 - Lavindu
    "0xda90b18Df16955Da5352C21D00d3ac4CDb52125b"  // Super Admin 4 - Malitha
  ];

  const initialNames = [
    "Janitha Karunarathna",
    "Hansika Karunathilake",
    "Lavindu Aththanayaka",
    "Malitha Jeewaka"
  ];

  const initialPositions = [
    "Mayor",
    "Deputy Mayor",
    "Chief Executive Officer",
    "Town Planner"
  ];

  const initialDepartments = [
    "Mayor's Office",
    "Deputy Mayor's Office",
    "Treasury & Accounts",
    "Municipal Council"
  ];

  const authorityMultiSig = m.contract("AuthorityMultiSig", [
    initialSuperAdmins,
    initialNames,
    initialPositions,
    initialDepartments,
    reporting
  ]);

  // OpinionPolling reads authorizedAuthorities from Reporting to gate createOfficialPoll
  const opinionPolling = m.contract("OpinionPolling", [reporting]);

  // Transfer Reporting ownership to AuthorityMultiSig so that only multi-sig
  // approved proposals can call setAuthority() to add/remove Authority Workers.
  // After this, the deployer wallet can no longer modify the authority list directly.
  m.call(reporting, "transferOwnership", [authorityMultiSig]);

  return { reporting, authorityMultiSig, opinionPolling };
});