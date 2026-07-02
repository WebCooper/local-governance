
FROM node:20-slim


WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev


COPY src/ ./src/

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/ipfs/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"


CMD ["node", "src/index.js"]