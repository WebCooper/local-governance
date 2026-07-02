import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReportingAndMultiSig", (m) => {
  const reporting = m.contract("Reporting");

  const initialSuperAdmins = [
    "0x51F279FC45e8bD2E66501391Df378Da045Cd3d45", // User's main wallet
    "0x2f82af1eDf8ddA7C6f87AFdc1B60Dc5cA4C76B23", // Super Admin 2
    "0xD019C08F95B5450F36Fcb8D1d4Ba8AB73B64fDA7", // Super Admin 3
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