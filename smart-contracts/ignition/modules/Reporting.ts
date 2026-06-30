import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReportingAndMultiSig", (m) => {
  const reporting = m.contract("Reporting");

  const initialSuperAdmins = [
    "0xda90b18Df16955Da5352C21D00d3ac4CDb52125b", // User's main wallet
    "0x07414EcB953F6867B702e651A8480e8cBB254cf6", // Super Admin 2
    "0xeDCB60f47CEeaFDeD70113701F6BD4BDe7C1f90f", // Super Admin 3
    // //defaults hardhat users for test purposes
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", // 0
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", // 1
    "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", // 2
    "0x90f79bf6eb2c4f870365e785982e1f101e93b906", //3
    "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",//4
    "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc" //5


  ];

  const authorityMultiSig = m.contract("AuthorityMultiSig", [initialSuperAdmins, reporting]);

  // Deploy the new OpinionPolling contract, passing the reporting address into the constructor interface
  const opinionPolling = m.contract("OpinionPolling", [reporting]);

  // Transfer ownership of Reporting to AuthorityMultiSig
  m.call(reporting, "transferOwnership", [authorityMultiSig]);

  return { reporting, authorityMultiSig, opinionPolling };
});