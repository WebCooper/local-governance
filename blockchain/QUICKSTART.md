# Quick Start Guide for Blockchain Docker Deployment

## Local Testing (Before VPS Deployment)

### 1. Test the setup locally

```bash
cd blockchain/

# Build Docker image
docker-compose build

# Start all nodes
docker-compose up -d

# Check if containers are running
docker-compose ps

# View logs
docker-compose logs -f

# Stop all nodes
docker-compose down

# Remove volumes (clean everything)
docker-compose down -v
```

### 2. Verify nodes are working

```bash
# Check block height on node1
docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "eth.blockNumber"

# Check peer count
docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "net.peerCount"

# Check mining status
docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "eth.mining"

# Test HTTP RPC
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### 3. Get bootnode address

```bash
# This will print Node1's enode address needed for Node2 & Node3 to connect
./get-bootnode.sh

# OR manually:
docker-compose exec -T node1 geth attach /blockchain/data/geth.ipc -e "admin.nodeInfo.enode"
```

### 4. Update docker-compose with bootnode

After getting the enode, edit `docker-compose.yml`:
- Find `YOUR_NODE1_ENODE` in node2 and node3 services
- Replace with the actual enode address
- Restart nodes: `docker-compose restart node2 node3`

## Deploying to VPS

### 1. Copy files to VPS

```bash
# From your local machine
scp -r blockchain/ root@your-vps-ip:/opt/

# Or clone if using git
# ssh root@your-vps-ip
# git clone <your-repo> /opt/local-governance
```

### 2. SSH into VPS and start nodes

```bash
ssh root@your-vps-ip

cd /opt/blockchain  # or /opt/local-governance/blockchain

# Build and start
docker-compose up -d

# Monitor
docker-compose logs -f

# In another terminal, verify nodes
docker-compose ps
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### 3. The RPC endpoint on VPS is accessible at:
- `http://your-vps-ip:8545`

## Common Commands

```bash
# View logs for specific node
docker-compose logs node1 -f
docker-compose logs node2
docker-compose logs node3

# Execute geth commands
docker-compose exec node1 geth attach /blockchain/data/geth.ipc

# Inside geth console:
> eth.blockNumber
> eth.accounts
> eth.mining
> net.peerCount
> web3.net.peerCount
> admin.peers
> admin.nodeInfo

# Restart specific node
docker-compose restart node1

# Stop all nodes
docker-compose stop

# Remove everything
docker-compose down -v

# View resource usage
docker stats

# Check disk usage
docker exec blockchain-node1 du -sh /blockchain/data/geth
```

## Monitoring Health

### Check if nodes are healthy

```bash
# SSH into VPS
docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e \
  "console.log('Block: ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)"
```

### Watch in real-time

```bash
while true; do
  clear
  docker-compose ps
  echo "---"
  docker exec blockchain-node1 geth attach /blockchain/data/geth.ipc -e \
    "console.log('Node1 - Block: ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)" 2>/dev/null || echo "Node1 not ready"
  docker exec blockchain-node2 geth attach /blockchain/data/geth.ipc -e \
    "console.log('Node2 - Block: ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)" 2>/dev/null || echo "Node2 not ready"
  docker exec blockchain-node3 geth attach /blockchain/data/geth.ipc -e \
    "console.log('Node3 - Block: ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)" 2>/dev/null || echo "Node3 not ready"
  sleep 10
done
```

## Troubleshooting

**Nodes not connecting?**
- Check logs: `docker-compose logs`
- Verify bootnode enode is correct in docker-compose.yml
- Restart nodes: `docker-compose restart`

**Out of memory?**
- Check: `docker stats`
- Reduce CACHE_SIZE in docker-compose.yml
- Consider using light sync mode

**Ports already in use?**
- Check: `lsof -i :8545` (or other ports)
- Kill process or change port mapping in docker-compose.yml

**Need to reset?**
- Stop and remove: `docker-compose down -v`
- Restart: `docker-compose up -d`

For detailed info, see [DEPLOYMENT.md](DEPLOYMENT.md)
