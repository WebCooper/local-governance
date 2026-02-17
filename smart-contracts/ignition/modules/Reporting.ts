import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReportingDeployment", (m) => {
  // For local testing, we extract 4 default Hardhat accounts.
  // When you deploy to your VPS later, you will replace these with the actual 
  // public addresses of your NestJS backend and your 3 Geth nodes.
  const relayerAddress = m.getAccount(1);
  const govNodeAddress = m.getAccount(2);
  const ngoNodeAddress = m.getAccount(3);
  const intlNodeAddress = m.getAccount(4);

  // Deploy the contract, passing the 4 addresses to the constructor
  const reportingContract = m.contract("Reporting", [
    relayerAddress,
    govNodeAddress,
    ngoNodeAddress,
    intlNodeAddress
  ]);

  return { reportingContract };
});