import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import ipfsRoutes from "./routes/ipfsRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { getIPFSClient } from "./config/ipfs.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);
app.use(morgan("dev"));

app.use(express.json({ limit: process.env.MAX_TEXT_SIZE || "1mb" }));

app.use("/api/ipfs", ipfsRoutes);

app.get("/", (req, res) => {
  res.json({
    service: "IPFS Storage Service",
    role: "Stores images and text from backend server, returns CIDs",
    endpoints: {
      health: "GET    /api/ipfs/health",
      storeImage:
        "POST   /api/ipfs/image/store    ← multipart/form-data, field: image",
      getImage: "GET    /api/ipfs/image/:cid",
      storeText:
        "POST   /api/ipfs/text/store     ← application/json, field: content",
      getText: "GET    /api/ipfs/text/:cid      ← ?raw=true for plain text",
      updateText:
        "PUT    /api/ipfs/text/:cid      ← returns new CID (IPFS is immutable)",
      verify: "GET    /api/ipfs/verify/:cid",
      unpin: "DELETE /api/ipfs/unpin/:cid",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    await getIPFSClient();
    app.listen(PORT, () => {
      console.log(` Running on        : http://localhost:${PORT}`);
      console.log(
        `IPFS node         : ${process.env.IPFS_HOST}:${process.env.IPFS_PORT}`,
      );
      console.log(
        `Accepting from    : ${process.env.CORS_ORIGIN || "http://localhost:3000"}`,
      );
      console.log("\nAvailable endpoints:");
      console.log("  GET    /api/ipfs/health");
      console.log("  POST   /api/ipfs/image/store");
      console.log("  GET    /api/ipfs/image/:cid");
      console.log("  POST   /api/ipfs/text/store");
      console.log("  GET    /api/ipfs/text/:cid");
      console.log("  PUT    /api/ipfs/text/:cid");
      console.log("  GET    /api/ipfs/verify/:cid");
      console.log("  DELETE /api/ipfs/unpin/:cid\n");
    });
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }
}

startServer();
