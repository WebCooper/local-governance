FROM ethereum/client-go:v1.13.15

# Install packages for password-protected account unlocking
RUN apt-get update && apt-get install -y \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /blockchain

# Copy genesis file
COPY genesis.json /blockchain/

# Create entrypoint script that will be used to start geth
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
