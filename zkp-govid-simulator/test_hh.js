const { Wallet } = require('ethers');
const mnemonic = "test test test test test test test test test test test junk";
for(let i=0; i<20; i++) {
  const w = Wallet.fromPhrase(mnemonic, `m/44'/60'/0'/0/${i}`);
  if(w.address.toLowerCase() === "0x3148582292B134C84bB1f63aD2983C59DA0887a8".toLowerCase()) {
    console.log("FOUND AT INDEX", i, "PRIVATE KEY:", w.privateKey);
  }
}
