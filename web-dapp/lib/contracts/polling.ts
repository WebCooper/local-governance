import { ethers } from "ethers";
import { OpinionPollingABI } from "@/lib/contracts/abis";

export const POLLING_ADDRESS = process.env.NEXT_PUBLIC_POLLING_CONTRACT_ADDRESS || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"; // Update as per your local hardhat deployment

export const getPollingContract = (signerOrProvider: ethers.Signer | ethers.Provider) => {
    return new ethers.Contract(POLLING_ADDRESS, OpinionPollingABI, signerOrProvider);
};

/**
 * Encrypts or formats a local string nullifier directly into a bytes32 string hex
 */
export const formatNullifierToBytes32 = (nullifier: string): string => {
    if (nullifier.startsWith("0x") && nullifier.length === 66) {
        return nullifier;
    }
    return ethers.hexlify(ethers.getBytes(nullifier));
};