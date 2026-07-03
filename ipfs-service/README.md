IPFS Image Storage Service

Dockerized setup for the IPFS image storage microservice.

Quick start (requires Docker and docker-compose):

1. Copy or edit `.env` to set `PORT` and IPFS settings if needed. The provided `docker-compose.yml` wires the `ipfs` container automatically.

2. Build and start both services:

```powershell
docker-compose up --build -d
```

3. Check logs:

```powershell
docker-compose logs -f ipfs-service
```

4. The service will be available at http://localhost:4000

Notes:
- The compose file includes an `ipfs` service (go-ipfs). The app's `.env` expects `IPFS_HOST` and `IPFS_PORT`. When using docker-compose, the defaults will be `ipfs:5001` if you update `.env` accordingly — the existing `.env` uses `127.0.0.1:5001` which will not work from inside the container. Update `.env` to `IPFS_HOST=ipfs` to point to the dockerized IPFS node.
