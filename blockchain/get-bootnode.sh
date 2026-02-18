#!/bin/bash
# Script to extract Node1's enode for use as bootnode in Node2 and Node3

set -e

echo "Extracting Node1's enode address..."
echo "Make sure Node1 is running: docker-compose up -d node1"
echo ""

# Try different ways to get to geth console
if command -v docker-compose &> /dev/null; then
    echo "Using docker-compose to get Node1's enode..."
    
    # Wait a moment for node1 to be ready
    sleep 5
    
    # Get enode
    ENODE=$(docker-compose exec -T node1 geth attach /blockchain/data/geth.ipc -e "admin.nodeInfo.enode" 2>/dev/null || echo "")
    
    if [ -z "$ENODE" ]; then
        echo "Failed to get enode. Make sure node1 is running."
        exit 1
    fi
    
    echo ""
    echo "✓ Node1's enode address:"
    echo "$ENODE"
    echo ""
    echo "For local deployment (all nodes on same machine):"
    echo "$ENODE"
    echo ""
    echo "For remote deployment (nodes on different machines):"
    # Replace node1 hostname with actual IP
    ENODE_REMOTE="${ENODE//node1/YOUR_VPS_IP}"
    echo "$ENODE_REMOTE"
    echo ""
    echo "Update docker-compose.yml BOOTNODES environment variables with this address."
else
    echo "docker-compose not found. Please run this script in the blockchain directory."
    exit 1
fi
