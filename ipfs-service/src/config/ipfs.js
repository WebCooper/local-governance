
import { create } from "kubo-rpc-client";
import "dotenv/config";


let ipfsClient = null;

export async function getIPFSClient() {
  if (ipfsClient) return ipfsClient;
  ipfsClient = create({
    host: process.env.IPFS_HOST || "127.0.0.1",
    port: parseInt(process.env.IPFS_PORT) || 5001,
    protocol: process.env.IPFS_PROTOCOL || "http",
  });
  try {
    const version = await ipfsClient.version();
    console.log(`Connected to IPFS node. Version: ${version.version}`);
  } catch (err) {
    console.error("Cannot connect to IPFS node:", err.message);
    console.error("   Make sure IPFS daemon is running: ipfs daemon");
    throw err;
  }
  return ipfsClient;
}
