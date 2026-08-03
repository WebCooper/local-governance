import { ethers } from "ethers";

async function main() {
  const RPC_URL = "https://rpc.internalbuildtools.online";
  const MULTISIG_ADDRESS = "0xc57D3318b7c547eC6478C0Be4835f7444C57Dc68";
  const EMERGENCY_ADDRESS = "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const multiSigAbi = [
    "function getSuperAdmins() external view returns (address[])",
    "function reportingContract() external view returns (address)",
    "function emergencyReportingContract() external view returns (address)",
    "function isSuperAdmin(address account) external view returns (bool)"
  ];

  const emergencyAbi = [
    "function owner() external view returns (address)",
    "function authorizedAuthorities(address account) external view returns (bool)",
    "function getAuthorities() external view returns (address[])"
  ];

  const multiSig = new ethers.Contract(MULTISIG_ADDRESS, multiSigAbi, provider);
  const emergency = new ethers.Contract(EMERGENCY_ADDRESS, emergencyAbi, provider);

  const superAdmins = await multiSig.getSuperAdmins();
  console.log("=== Super Admins in AuthorityMultiSig ===");
  superAdmins.forEach((admin: string, index: number) => {
    console.log(`[${index}] ${admin}`);
  });

  const reportingContract = await multiSig.reportingContract();
  const emergencyContractInMultiSig = await multiSig.emergencyReportingContract();
  console.log("MultiSig.reportingContract:", reportingContract);
  console.log("MultiSig.emergencyReportingContract:", emergencyContractInMultiSig);

  const emergencyOwner = await emergency.owner();
  console.log("EmergencyReporting.owner:", emergencyOwner);

  const emergencyAuthorities = await emergency.getAuthorities();
  console.log("=== Authorities in EmergencyReporting ===");
  emergencyAuthorities.forEach((auth: string, index: number) => {
    console.log(`[${index}] ${auth}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
