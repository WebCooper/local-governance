const { Wallet } = require('ethers');

async function test() {
  const wallet = new Wallet('0xda7a888d692c21e5882c5e7d5f29e001fc5424df7d52eb71098126da9266d24f');
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
