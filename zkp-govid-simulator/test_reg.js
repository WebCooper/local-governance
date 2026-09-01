const { Wallet } = require('ethers');

async function test() {
  const wallet = new Wallet('0x4a20a7930e5f77884c72bf4d281888468af1341a634ad5572dba25114894d7cc');
  const timestamp = Date.now();
  const govId = 'EG/2026/8899';
  const name = 'Student (EG/2026/8899)';
  const msg = `ZKP-GovID Registration\nGovID: ${govId}\nName: ${name}\nTimestamp: ${timestamp}`;
  const signature = await wallet.signMessage(msg);
  const payload = {
    govId,
    password: 'password123',
    name,
    timestamp,
    signature,
    signerAddress: wallet.address,
    secret: 'GQZa8aPRmwxNn1uNMufqIJzCDJJZJwsDShxVb4/YGx0'
  };
  console.log('Sending from address:', wallet.address);
  const res = await fetch('https://zkp.internalbuildtools.online/api/govid/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log('STATUS:', res.status);
  console.log('BODY:', await res.text());
}

test();
