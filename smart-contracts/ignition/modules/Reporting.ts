import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReportingAndMultiSig", (m) => {
  const reporting = m.contract("Reporting");

  const initialSuperAdmins = [
    "0xda90b18Df16955Da5352C21D00d3ac4CDb52125b", // User's main wallet
    "0x07414EcB953F6867B702e651A8480e8cBB254cf6", // Super Admin 2
    "0xeDCB60f47CEeaFDeD70113701F6BD4BDe7C1f90f", // Super Admin 3
  ];

  const authorityMultiSig = m.contract("AuthorityMultiSig", [initialSuperAdmins, reporting]);

  // Transfer ownership of Reporting to AuthorityMultiSig
  m.call(reporting, "transferOwnership", [authorityMultiSig]);

  return { reporting, authorityMultiSig };
});