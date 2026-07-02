import { ethers } from 'ethers';

export interface CitizenWallet {
  privateKey: string;
  publicKey: string;
}

export const deriveCitizenWallet = (citizenSeed: string): CitizenWallet => {
  try {
    // 1. Hash the seed to ensure it is exactly 32 bytes (valid private key format)
    const privateKey = ethers.keccak256(ethers.toUtf8Bytes(citizenSeed));

    // 2. Instantiate the wallet
    const wallet = new ethers.Wallet(privateKey);

    return {
      privateKey: wallet.privateKey,
      publicKey: wallet.address, // The Ethereum address
    };
  } catch (error) {
    console.error("Error deriving wallet:", error);
    throw new Error("Could not derive citizen wallet.");
  }
};