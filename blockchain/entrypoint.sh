#!/bin/bash
set -e

# Initialize the node if it hasn't been done yet
if [ ! -d "/blockchain/data/geth" ]; then
    echo "Initializing Geth node with genesis block..."
    geth init --datadir /blockchain/data /blockchain/genesis.json
fi

# Extract node configuration from environment variables
# These should be passed via docker-compose
NODE_NAME=${NODE_NAME:-node1}
NETWORK_ID=${NETWORK_ID:-1337}
PORT=${PORT:-30303}
AUTHRPC_PORT=${AUTHRPC_PORT:-8551}
HTTP_PORT=${HTTP_PORT:-8545}
MINER_ETHERBASE=${MINER_ETHERBASE:-0x1bB3c72918a315d67fac7641e8bf0906577ca263}
UNLOCK_ACCOUNT=${UNLOCK_ACCOUNT:-0x1bB3c72918a315d67fac7641e8bf0906577ca263}
PASSWORD_FILE=${PASSWORD_FILE:-/blockchain/data/password.txt}
BOOTNODES=${BOOTNODES:-}

# Build geth command
GETH_ARGS=(
    "--datadir" "/blockchain/data"
    "--networkid" "$NETWORK_ID"
    "--port" "$PORT"
    "--authrpc.port" "$AUTHRPC_PORT"
    "--mine"
    "--miner.gasprice" "0"
    "--miner.etherbase" "$MINER_ETHERBASE"
    "--unlock" "$UNLOCK_ACCOUNT"
    "--password" "$PASSWORD_FILE"
    "--allow-insecure-unlock"
    "--cache" "256"  # Reduced cache for VPS with 8GB RAM
    "--maxpeers" "25"
)

# Add HTTP API for node1 only
if [ "$NODE_NAME" = "node1" ]; then
    GETH_ARGS+=(
        "--http"
        "--http.addr" "0.0.0.0"
        "--http.port" "$HTTP_PORT"
        "--http.corsdomain" "*"
        "--http.api" "eth,net,web3,personal,miner,admin,clique"
    )
fi

# Add bootnodes if specified
if [ -n "$BOOTNODES" ]; then
    GETH_ARGS+=("--bootnodes" "$BOOTNODES")
fi

echo "Starting Geth node: $NODE_NAME"
echo "Command: geth ${GETH_ARGS[@]}"

# Start geth
exec geth "${GETH_ARGS[@]}"
