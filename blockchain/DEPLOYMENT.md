# Blockchain Docker Deployment on Dokploy

This guide explains how to deploy your 3-node Geth blockchain to a VPS using Docker and Dokploy.

## Prerequisites

- Dokploy installed on your VPS
- 4 CPU cores, 8GB RAM
- Docker and Docker Compose available

## Step 1: Prepare Local Environment (if not already done)

Make sure you have the genesis block and node configurations ready:

```bash
cd blockchain/
# Files should exist:
# - genesis.json
# - node1/keystore/*, node1/password.txt
# - node2/keystore/*, node2/password.txt
# - node3/keystore/*, node3/password.txt
# - Dockerfile
# - docker-compose.yml
# - entrypoint.sh
```

## Step 2: Build and Test Locally (Optional)

Before deploying to VPS, you can test locally:

```bash
# Build the Docker image
docker-compose build

# Start the nodes (this may take a few minutes)
docker-compose up -d

# Check logs
docker-compose logs -f node1

# Check if nodes are running
docker-compose ps
```

## Step 3: Deploy to VPS via Dokploy

### Option A: Using Git Push to Dokploy

1. **Initialize Git repository** (if not already a git repo):
   ```bash
   cd /home/cooper/projects/local-governance
   git init
   git add .
   git commit -m "Initial commit with blockchain docker setup"
   ```

2. **Add Dokploy remote**:
   ```bash
   git remote add dokploy ssh://dokploy-user@your-vps-ip/path/to/repo
   # or use Dokploy's web UI to generate the git URL
   ```

3. **Push to Dokploy**:
   ```bash
   git push dokploy main
   ```

### Option B: Manual Docker Compose Deployment

1. **SSH into your VPS**:
   ```bash
   ssh root@your-vps-ip
   ```

2. **Clone or transfer the blockchain directory**:
   ```bash
   # Either clone from git
   git clone <your-repo-url> /opt/blockchain
   cd /opt/blockchain/blockchain
   
   # Or transfer files via rsync/scp
   scp -r blockchain/ root@your-vps-ip:/opt/
   ```

3. **Start the nodes**:
   ```bash
   cd /opt/blockchain/blockchain
   docker-compose up -d
   ```

4. **Monitor the nodes**:
   ```bash
   docker-compose logs -f
   ```

## Step 4: Configure Bootnodes

The docker-compose.yml has placeholders for bootnodes. You need to:

1. **Get Node1's enode** (the primary node acts as bootnode):
   ```bash
   # From your local machine while node1 is running
   docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "admin.nodeInfo.enode"
   
   # Or on VPS:
   ssh root@your-vps-ip "docker-compose -f /opt/blockchain/blockchain/docker-compose.yml exec node1 geth attach /blockchain/data/geth.ipc -e \"admin.nodeInfo.enode\""
   ```

2. **Update the docker-compose.yml** with Node1's enode:
   ```yaml
   # Replace YOUR_NODE1_ENODE with actual enode from above
   # Example: enode://abcd1234...@node1:30303
   ```

   For nodes on VPS, if they need to communicate via external IP:
   ```yaml
   BOOTNODES: "enode://abcd1234...@your-vps-ip:30303"
   ```

3. **Restart nodes 2 and 3**:
   ```bash
   docker-compose restart node2 node3
   ```

## Step 5: Verify Deployment

### Check Node Status

```bash
# SSH into VPS
ssh root@your-vps-ip

# Check running containers
docker-compose -f /opt/blockchain/blockchain/docker-compose.yml ps

# Check logs
docker-compose -f /opt/blockchain/blockchain/docker-compose.yml logs -f

# Connect to a node
docker-compose -f /opt/blockchain/blockchain/docker-compose.yml exec node1 geth attach /blockchain/data/geth.ipc

# Inside geth console, check:
> eth.blockNumber     # Should be > 0 and increasing
> net.peerCount       # Should show connected peers
> eth.mining          # Should be true
> eth.accounts        # Should show uncovered accounts
```

### Test RPC Endpoint

```bash
# From anywhere, test node1's HTTP RPC endpoint
curl -X POST http://your-vps-ip:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Response should be like:
# {"jsonrpc":"2.0","result":"0x123","id":1}
```

## Resource Optimization for 8GB RAM / 4 Core VPS

The docker-compose.yml is already optimized:

- **Cache**: Reduced to 256MB per node (default is 1GB)
- **Maxpeers**: Limited to 25 per node
- **No websocket**: Only HTTP RPC on node1 for lower overhead

### If you experience memory issues:

1. **Reduce cache further** in entrypoint.sh or docker-compose.yml:
   ```bash
   --cache 128  # Instead of 256
   ```

2. **Run as light nodes** (if you prefer faster sync):
   ```bash
   --syncmode light  # Add to GETH_ARGS in entrypoint.sh
   ```

3. **Limit database size**:
   ```bash
   --pruning=full  # Reduce historical data
   ```

## Backup and Maintenance

### Backup Node Data

```bash
# SSH into VPS
docker-compose exec node1 bash -c 'tar -czf /blockchain/data/node1-backup.tar.gz -C /blockchain/data geth keystore && cp /blockchain/data/node1-backup.tar.gz /blockchain/backups/'

# Download to local machine
scp root@your-vps-ip:/opt/blockchain/blockchain/backups/node1-backup.tar.gz ./
```

### View Volumes

```bash
# List Docker volumes
docker volume ls

# Inspect volume location
docker volume inspect blockchain_node1-data

# Manual backup of volumes
docker run --rm -v blockchain_node1-data:/data -v $(pwd):/backup alpine tar czf /backup/node1-data.tar.gz -C /data .
```

## Troubleshooting

### Nodes not connecting to each other

1. Check firewall rules - ports 30303, 30304, 30305 should be open
2. Verify bootnodes configuration is correct
3. Check logs for connection errors: `docker-compose logs node2`

### Out of memory errors

1. Reduce cache sizes (see above)
2. Monitor memory: `docker stats`
3. Consider running a light node or archive mode with pruning

### Blocks not being mined

1. Check that mining is enabled: `eth.mining` should return true
2. Verify miner.etherbase is set correctly
3. Ensure all 3 accounts are in the Clique genesis extraData

### High disk usage

1. Check chaindata size: `du -sh /opt/blockchain/blockchain`
2. Consider pruning: add `--gcmode=archive` or `--pruning` flags
3. Look into light sync mode

## Dokploy Configuration

If using Dokploy's web interface:

1. Create a new "Compose" application
2. Point to your git repository with the blockchain folder
3. Set Docker Compose path to `blockchain/docker-compose.yml`
4. Set environment variables if needed
5. Enable auto-restart
6. Configure health checks if available

## Production Considerations

⚠️ **Important for Production:**

- **Never commit keystores or passwords** to public repositories
- Use `.env` files for sensitive data (not tracked by git)
- Implement proper backup and disaster recovery
- Monitor node health and disk space
- Set up logging aggregation
- Consider load balancing if multiple clients connect
- Review security settings (firewall, SSH keys, etc.)

## Next Steps

1. Test locally with `docker-compose up`
2. Get Node1's enode address
3. Update docker-compose.yml bootnodes
4. Deploy to VPS
5. Verify all nodes are mining and connected
6. Set up monitoring/alerting
