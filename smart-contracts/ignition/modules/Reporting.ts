import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReportingAndMultiSig", (m) => {
  const reporting = m.contract("Reporting");

  const initialSuperAdmins = [
    "0x27794a007eFFBBFE6dB522560cAB6FfeA2cD4A36", // Super Admin 1
    "0xD019C08F95B5450F36Fcb8D1d4Ba8AB73B64fDA7", // Super Admin 2
    "0x2f82af1eDf8ddA7C6f87AFdc1B60Dc5cA4C76B23", // Super Admin 3
  ];

  const authorityMultiSig = m.contract("AuthorityMultiSig", [initialSuperAdmins, reporting]);

  // Deploy the new OpinionPolling contract, passing the reporting address into the constructor interface
  const opinionPolling = m.contract("OpinionPolling", [reporting]);

  // Transfer ownership of Reporting to AuthorityMultiSig
  m.call(reporting, "transferOwnership", [authorityMultiSig]);

  return { reporting, authorityMultiSig, opinionPolling };
});