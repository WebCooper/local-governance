import { ethers } from 'ethers';

export interface CitizenWallet {
  privateKey: string;
  publicKey: string;
}

export const deriveCitizenWallet = (citizenSeed: string, customSalt?: string): CitizenWallet => {
  try {
    const salt = customSalt || process.env.NEXT_PUBLIC_CITIZEN_WALLET_SALT || 'aurachain_citizen_dapp_salt_secret_2026';
    const saltedSeed = `${citizenSeed}:${salt}`;

    // 1. Hash the salted seed to ensure it is exactly 32 bytes (valid private key format)
    const privateKey = ethers.keccak256(ethers.toUtf8Bytes(saltedSeed));

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