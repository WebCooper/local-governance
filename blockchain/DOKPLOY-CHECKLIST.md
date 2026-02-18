# Dokploy Deployment Checklist

Complete this checklist to deploy your blockchain nodes to Dokploy on your VPS.

## Pre-Deployment (Local Machine)

- [ ] Git repository initialized in workspace root
  ```bash
  cd /home/cooper/projects/local-governance
  git init
  git add .
  git commit -m "Add blockchain Docker setup"
  ```

- [ ] Test Docker setup locally
  ```bash
  cd blockchain
  docker-compose build
  docker-compose up -d
  # Wait 30 seconds for nodes to initialize
  docker-compose ps  # All should show "running"
  ```

- [ ] Verify nodes are syncing
  ```bash
  docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "eth.blockNumber"
  # Should return a block number > 0
  ```

- [ ] Get Node1's enode address (for bootnodes)
  ```bash
  ./get-bootnode.sh
  # or
  docker-compose exec -T node1 geth attach /blockchain/data/geth.ipc -e "admin.nodeInfo.enode"
  # Save this value! You'll need it for nodes 2 & 3
  ```

- [ ] Backup current docker-compose.yml
  ```bash
  cp docker-compose.yml docker-compose.yml.backup
  ```

- [ ] Update docker-compose.yml with Node1's enode
  - Replace `YOUR_NODE1_ENODE` in node2 and node3 BOOTNODES with the actual enode
  - Example: `enode://abcd1234...5678@node1:30303`

- [ ] Test again with bootnodes configured
  ```bash
  docker-compose restart node2 node3
  docker-compose logs -f  # Watch for peer connections
  # Wait ~30 seconds, should see less errors
  ```

- [ ] Verify RPC is working
  ```bash
  curl -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  # Should return a result like: {"jsonrpc":"2.0","result":"0x123","id":1}
  ```

- [ ] Clean up (prepare for deployment)
  ```bash
  docker-compose down  # Stop containers
  # Leave volumes intact for data persistence
  ```

- [ ] Commit changes
  ```bash
  git add docker-compose.yml
  git commit -m "Configure bootnodes for deployment"
  ```

## VPS Preparation

### Access Your VPS

- [ ] SSH into VPS with Dokploy
  ```bash
  ssh root@your-vps-ip
  # or dokploy@your-vps-ip depending on Dokploy setup
  ```

- [ ] Verify Docker and Docker Compose are installed
  ```bash
  docker --version        # Should be v20+
  docker-compose --version  # Should be v1.29+
  ```

- [ ] Check system resources
  ```bash
  free -h              # Should show ~8GB total
  nproc                # Should show 4 cores
  df -h /              # Should have >20GB free
  ```

- [ ] Create directories
  ```bash
  mkdir -p /opt/blockchain
  cd /opt/blockchain
  ```

## Deploy via Git Push (Recommended for Dokploy)

- [ ] Create SSH key pair on VPS (if needed for git)
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/dokploy -C "dokploy"
  # Follow prompts (can leave passphrase empty for automation)
  ```

- [ ] Add VPS SSH key to your GitHub/GitLab account
  ```bash
  cat ~/.ssh/dokploy.pub
  # Copy output and add to your git provider's SSH keys
  ```

- [ ] Configure Dokploy to listen for git pushes
  - See Dokploy documentation for webhook setup
  - Or manually pull: `git clone <url> /opt/blockchain`

- [ ] Push code to trigger deployment
  ```bash
  # From local machine
  git push origin main  # If connected to Dokploy
  ```

## Alternative: Manual Docker Compose Deployment

- [ ] Transfer files to VPS
  ```bash
  scp -r blockchain/ root@your-vps-ip:/opt/
  # Or rsync for faster transfer
  rsync -avz --delete blockchain/ root@your-vps-ip:/opt/blockchain/
  ```

- [ ] Navigate to blockchain directory
  ```bash
  cd /opt/blockchain
  ```

## Start the Nodes

- [ ] Build Docker images on VPS
  ```bash
  docker-compose build
  # This may take 2-3 minutes
  ```

- [ ] Start all nodes
  ```bash
  docker-compose up -d
  ```

- [ ] Verify containers are running
  ```bash
  docker-compose ps
  # All three nodes should show "running" (not exited/restarting)
  ```

- [ ] Check initialization
  ```bash
  docker-compose logs --tail=20
  # Should see "Geth" messages, not errors
  ```

- [ ] Give nodes time to initialize (wait 30-60 seconds)
  ```bash
  sleep 30
  docker-compose ps  # Verify still running
  ```

## Post-Deployment Verification

- [ ] Check Node1's block height
  ```bash
  docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "eth.blockNumber"
  # Should be a number > 0
  ```

- [ ] Check Node1's mining status
  ```bash
  docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "eth.mining"
  # Should return: true
  ```

- [ ] Check peer connections
  ```bash
  docker-compose exec node1 geth attach /blockchain/data/geth.ipc -e "net.peerCount"
  # Should be 2 (node2 and node3)
  ```

- [ ] Verify Node2 is connected
  ```bash
  docker-compose exec node2 geth attach /blockchain/data/geth.ipc -e "net.peerCount"
  # Should be >= 1
  ```

- [ ] Test HTTP RPC endpoint
  ```bash
  curl -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  # Should return result, not error
  ```

- [ ] Test from external client
  ```bash
  # From your local machine
  curl -X POST http://your-vps-ip:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  # Should work if VPS firewall allows port 8545
  ```

## Networking & Firewall

- [ ] Open required ports on VPS firewall
  ```bash
  # If using UFW:
  sudo ufw allow 8545/tcp  # HTTP RPC (Node1 only)
  sudo ufw allow 30303/tcp # P2P (Node1)
  sudo ufw allow 30304/tcp # P2P (Node2)
  sudo ufw allow 30305/tcp # P2P (Node3)
  sudo ufw status          # Verify
  ```

- [ ] Verify firewalls are not blocking connections
  ```bash
  # Test from local machine
  telnet your-vps-ip 8545
  # Should connect or timeout (not refused)
  ```

## Health Monitoring

- [ ] Set up monitoring script
  ```bash
  cat > /opt/blockchain/monitor.sh << 'EOF'
  #!/bin/bash
  while true; do
    clear
    cd /opt/blockchain
    docker-compose ps
    echo "---"
    docker-compose exec -T node1 geth attach /blockchain/data/geth.ipc -e \
      "console.log('Node1: Block ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)" 2>/dev/null
    docker-compose exec -T node2 geth attach /blockchain/data/geth.ipc -e \
      "console.log('Node2: Block ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)" 2>/dev/null
    docker-compose exec -T node3 geth attach /blockchain/data/geth.ipc -e \
      "console.log('Node3: Block ' + eth.blockNumber + ', Mining: ' + eth.mining + ', Peers: ' + net.peerCount)" 2>/dev/null
    sleep 10
  done
  EOF
  chmod +x monitor.sh
  ```

- [ ] Monitor resource usage
  ```bash
  docker stats --no-stream
  ```

- [ ] Check disk usage
  ```bash
  du -sh /opt/blockchain/blockchain
  # Should be reasonable (likely < 2GB initially, grows over time)
  ```

## Maintenance Setup

- [ ] Configure automatic restarts
  ```yaml
  # docker-compose.yml already has: restart: unless-stopped
  # This ensures nodes restart if they crash
  ```

- [ ] Set up log rotation (optional)
  ```bash
  docker-compose logs --timestamps | tail -n 10000 > /var/log/blockchain.log
  # Add to crontab if needed
  ```

- [ ] Create backup plan
  ```bash
  mkdir -p /opt/blockchain/backups
  # Create script to backup node data
  ```

## Troubleshooting

If nodes fail to start:
- [ ] Check logs: `docker-compose logs`
- [ ] Verify ports are free: `netstat -tlnp | grep :8545`
- [ ] Check disk space: `df -h`
- [ ] Restart: `docker-compose restart`

If nodes won't connect to each other:
- [ ] Verify bootnodes in docker-compose.yml
- [ ] Check firewall allows 30303-30305
- [ ] Restart nodes 2 and 3: `docker-compose restart node2 node3`
- [ ] Check logs for connection errors

If RPC returns errors:
- [ ] Verify node1 is running: `docker-compose ps node1`
- [ ] Test locally first: `curl http://localhost:8545`
- [ ] Check firewall allows external access to 8545
- [ ] Verify JSON-RPC syntax is correct

## Success Criteria

✅ Deployment is successful when:
- All 3 containers are running
- All nodes show `eth.blockNumber > 0`
- All nodes show `eth.mining = true`
- Node1 shows `net.peerCount = 2`
- Nodes 2 & 3 show `net.peerCount >= 1`
- HTTP RPC works at `http://your-vps-ip:8545`
- No container restarts or errors in logs

## Next Steps

1. **Monitor**: Keep checking node status for 24 hours
2. **Backup**: Set up automated backups of blockchain data
3. **Scale**: If needed, optimize further or add more nodes
4. **Integrate**: Connect your backend-relayer and web-dapp to the RPC endpoint
5. **Secure**: Review security settings and firewall rules

For detailed information, refer to:
- [QUICKSTART.md](QUICKSTART.md) - Quick reference guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Comprehensive guide
- [README.md](README.md) - Blockchain setup documentation
