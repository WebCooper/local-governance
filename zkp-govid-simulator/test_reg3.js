const { ethers } = require('ethers');

async function testRegister() {
  const wallet = ethers.Wallet.createRandom();
  const govId = "EG/2026/8888";
  const name = "Student (EG/2026/8888)";
  const password = "Password123!";
  const timestamp = Date.now();

  const msg = `ZKP-GovID Registration\nGovID: ${govId}\nName: ${name}\nTimestamp: ${timestamp}`;
  const signature = await wallet.signMessage(msg);

  const payload = {
    govId,
    name,
    password,
    timestamp,
    signature,
    signerAddress: wallet.address,
    secret: "GQZa8aPRmwxNn1uNMufqIJzCDJJZJwsDShxVb4/YGx0"
  };

  try {
    const res = await fetch("http://localhost:5000/api/govid/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

testRegister();
