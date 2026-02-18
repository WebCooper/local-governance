# Private Permissioned Blockchain with Geth and Clique PoA

A private Ethereum-compatible blockchain implemented using Geth with Clique Proof-of-Authority (PoA) consensus mechanism. This setup creates a 3-node permissioned network where only authorized validators can create blocks.

## Overview

**Geth Version:** 1.13.15 (required for PoA support)  
**Consensus:** Clique Proof-of-Authority  
**Network ID:** 1337  
**Nodes:** 3 validators

### What is Clique PoA?

In a standard blockchain (like Bitcoin), mining involves solving mathematical puzzles. However, in Proof-of-Authority (Clique), there is no mining. Instead, the blockchain maintains an authorized "Guest List" of validators in the `extraData` field of the genesis block. These authorized validators are the only ones allowed to create blocks. This is ideal for private, permissioned networks where you control who can participate.

## Prerequisites

- Linux system (Ubuntu/Debian)
- Geth 1.13.15
- Python 3

## Step 1: Install Geth

Install Geth on your local environment:

```bash
sudo apt-get update
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo apt-get update
sudo apt-get install -y ethereum
geth version
```

Verify installation:
```
Geth
Version: 1.16.8-stable (or later)
Git Commit: abeb78c647e354ed922726a1d719ac7bc64a07e2
Architecture: amd64
Go Version: go1.25.1
Operating System: linux
```

## Step 2: Create Node Accounts

Create accounts for each of the three validator nodes.

### Node 1 Account

```bash
geth account new --datadir node1
```

You will be prompted for a password. The output will show:
```
Your new account is locked with a password. Please give a password. Do not forget this password.
Password: 
Repeat password: 

Your new key was generated

Public address of the key:   0x5153b7b572ab753415c2E74BDe8d366920990007
Path of the secret key file: node1/keystore/UTC--2026-01-28T18-20-26.432788984Z--5153b7b572ab753415c2e74bde8d366920990007
```

**Important Security Notes:**
- You can share your public address with anyone
- **NEVER** share your secret key with anyone
- The key controls access to your funds
- **BACKUP** your key file
- **REMEMBER** your password

**Node 1 Address:** `0x5153b7b572ab753415c2E74BDe8d366920990007`

### Node 2 Account

```bash
geth account new --datadir node2
```

**Node 2 Address:** `0xfA62ACf36237cc2B1F95a532b55789921294F4Fe`

### Node 3 Account

```bash
geth account new --datadir node3
```

**Node 3 Address:** `0x564bc98080Dcb0519a55af3F99aB25F076E2F057`

## Step 3: Generate ExtraData String

The `extraData` field in Clique PoA contains the "Guest List" - the authorized validator addresses. Use the `create_extradata.py` script:

```bash
python3 create_extradata.py
```

Output:
```
YOUR EXTRA_DATA STRING:
0x00000000000000000000000000000000000000000000000000000000000000005153b7b572ab753415c2e74bde8d366920990007fa62acf36237cc2b1f95a532b55789921294f4fe564bc98080dcb0519a55af3f99ab25f076e2f0570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
```

**Structure of extraData:**
- 32 bytes of "Vanity" (empty space, reserved for future use)
- Validator Addresses concatenated back-to-back (Node 1 + Node 2 + Node 3)
- 65 bytes of "Signature" (reserved space for the node's digital signature)

**Why This Matters:** This string is the "DNA" that grants permission. If you put the wrong validators here, nodes will start but refuse to create blocks, as they won't see themselves on the authorized list.

## Step 4: Create Genesis Configuration

Create `genesis.json` in the root directory:

```json
{
  "config": {
    "chainId": 1337,
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "clique": {
      "period": 5,
      "epoch": 30000
    }
  },
  "difficulty": "0x400",
  "gasLimit": "0x8000000",
  "alloc": {
    "5153b7b572ab753415c2e74bde8d366920990007": { "balance": "0x200000000000000000000" },
    "fa62acf36237cc2b1f95a532b55789921294f4fe": { "balance": "0x200000000000000000000" },
    "564bc98080dcb0519a55af3f99ab25f076e2f057": { "balance": "0x200000000000000000000" }
  },
  "coinbase": "0x0000000000000000000000000000000000000000",
  "mixhash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "nonce": "0x0000000000000042",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "timestamp": "0x00"
}
```

## Step 5: Initialize Each Node

Initialize all three nodes with the genesis block:

```bash
geth init --datadir node1 genesis.json
geth init --datadir node2 genesis.json
geth init --datadir node3 genesis.json
```

Expected output:
```
INFO [01-29|09:49:11.025] Allocated cache and file handles
INFO [01-29|09:49:11.161] Writing custom genesis block
INFO [01-29|09:49:11.163] Successfully wrote genesis state
```

## Step 6: Start Node 1 (Bootnode)

In the first terminal:

```bash
geth --datadir node1 \
  --networkid 1337 \
  --http --http.addr "0.0.0.0" --http.port 8545 --http.corsdomain "*" \
  --http.api "eth,net,web3,personal,miner,admin,clique" \
  --allow-insecure-unlock \
  --mine --miner.gasprice 0 --miner.etherbase "0x1bB3c72918a315d67fac7641e8bf0906577ca263" \
  --unlock "0x1bB3c72918a315d67fac7641e8bf0906577ca263" --password "node1/password.txt" \
  console
```

In the geth console, get the enode address:
```javascript
admin.nodeInfo.enode
```

Copy the enode address (format: `enode://HASH@127.0.0.1:30303`)

## Step 7: Start Node 2

In a new terminal:

```bash
geth --datadir node2 \
  --networkid 1337 \
  --port 30304 \
  --authrpc.port 8551 \
  --mine --miner.gasprice 0 --miner.etherbase "0x92173f5df8050332Fee023628835F72e8d4Be471" \
  --unlock "0x92173f5df8050332Fee023628835F72e8d4Be471" --password "node2/password.txt" \
  --bootnodes "enode://HASH@127.0.0.1:30303" \
  console
```

Replace `HASH` with the enode from Node 1.

## Step 8: Start Node 3

In another terminal:

```bash
geth --datadir node3 \
  --networkid 1337 \
  --port 30305 \
  --authrpc.port 8553 \
  --mine --miner.gasprice 0 --miner.etherbase "0x60Ecd1C3590f3BE4BB18D302537c4989A11735E9" \
  --unlock "0x60Ecd1C3590f3BE4BB18D302537c4989A11735E9" --password "node3/password.txt" \
  --bootnodes "enode://HASH@127.0.0.1:30303" \
  console
```

Replace `HASH` with the enode from Node 1.

## Step 9: Verify Network Connectivity

In each node's console, check peer connections:

```javascript
net.peerCount
```

Should return a number greater than 0 if nodes are connected.

To see detailed peer information:
```javascript
admin.peers
```

## What to Commit to GitHub

✅ **Commit these files:**
- `genesis.json` - Blockchain configuration
- `create_extradata.py` - Script to generate validator list
- `README.md` - Documentation
- `.gitignore` - Git ignore rules

❌ **Do NOT commit:**
- `node1/`, `node2/`, `node3/` directories - Contains private keys and blockchain state
- `geth-*` binaries - Large files, users should install Geth themselves
- Password files - Security risk
- Any keystore files - Contains encrypted private keys
- Transaction/database files - Local state

## Project Structure

```
.
├── genesis.json              # Genesis block configuration
├── create_extradata.py       # Generate validator extraData
├── node1/                    # Node 1 data (not committed)
│   ├── keystore/            # Private keys (NOT committed)
│   └── geth/                # Blockchain data (NOT committed)
├── node2/                    # Node 2 data (not committed)
└── node3/                    # Node 3 data (not committed)
```

## Resources

- [Geth Documentation](https://geth.ethereum.org/docs)
- [Clique Consensus](https://geth.ethereum.org/docs/consensus-algorithms/clique)
- [Ethereum JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/)