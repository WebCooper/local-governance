import { getIPFSClient } from "../config/ipfs.js";

// ─────────────────────────────────────────────
//  IMAGE ENDPOINTS
// ─────────────────────────────────────────────

async function storeImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_IMAGE",
        message:
          "No image received. Send multipart/form-data with field name 'image'.",
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    console.log(
      `[storeImage] Received image: ${originalname} | Type: ${mimetype} | Size: ${size} bytes`,
    );

    const ipfs = await getIPFSClient();
    const result = await ipfs.add(buffer, { pin: true, cidVersion: 1 });
    const cid = result.cid.toString();

    console.log(`[storeImage] Image stored on IPFS. CID: ${cid}`);

    return res.status(201).json({
      success: true,
      type: "image",
      cid,
      size: result.size,
      mimeType: mimetype,
      originalName: originalname,
    });
  } catch (err) {
    next(err);
  }
}

async function getImage(req, res, next) {
  try {
    const { cid } = req.params;

    if (!cid || cid.length < 10) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CID",
        message: "Provide a valid CID in the URL: /api/ipfs/image/:cid",
      });
    }

    console.log(`[getImage] Fetching image with CID: ${cid}`);

    const ipfs = await getIPFSClient();
    const chunks = [];

    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const mimeType = detectMimeType(buffer);

    res.set("Content-Type", mimeType);
    res.set("Content-Length", buffer.length);
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    return res.status(200).send(buffer);
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("not found") || err.message.includes("no link"))
    ) {
      return res.status(404).json({
        success: false,
        error: "IMAGE_NOT_FOUND",
        message: `No image found for CID: ${req.params.cid}`,
      });
    }
    next(err);
  }
}

// ─────────────────────────────────────────────
//  TEXT ENDPOINTS
// ─────────────────────────────────────────────

async function storeText(req, res, next) {
  try {
    const { content, title, encoding = "utf-8" } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "NO_CONTENT",
        message: "Field 'content' is required in the JSON body.",
      });
    }

    if (typeof content !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_CONTENT_TYPE",
        message: "'content' must be a string.",
      });
    }

    const MAX_TEXT_SIZE =
      parseInt(process.env.MAX_TEXT_SIZE) || 1 * 1024 * 1024;
    const byteLength = Buffer.byteLength(content, "utf-8");

    if (byteLength > MAX_TEXT_SIZE) {
      return res.status(413).json({
        success: false,
        error: "TEXT_TOO_LARGE",
        message: `Text exceeds the maximum allowed size of ${MAX_TEXT_SIZE / 1024}KB.`,
      });
    }

    const envelope = {
      type: "text",
      title: title || null,
      encoding,
      content,
      storedAt: new Date().toISOString(),
    };

    const buffer = Buffer.from(JSON.stringify(envelope), "utf-8");

    console.log(
      `[storeText] Storing text | Title: ${title || "(none)"} | Size: ${byteLength} bytes`,
    );

    const ipfs = await getIPFSClient();
    const result = await ipfs.add(buffer, { pin: true, cidVersion: 1 });
    const cid = result.cid.toString();

    console.log(`[storeText] Text stored on IPFS. CID: ${cid}`);

    return res.status(201).json({
      success: true,
      type: "text",
      cid,
      title: title || null,
      size: result.size,
      encoding,
    });
  } catch (err) {
    next(err);
  }
}

async function getText(req, res, next) {
  try {
    const { cid } = req.params;
    const { raw } = req.query;

    if (!cid || cid.length < 10) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CID",
        message: "Provide a valid CID in the URL: /api/ipfs/text/:cid",
      });
    }

    console.log(`[getText] Fetching text with CID: ${cid}`);

    const ipfs = await getIPFSClient();
    const chunks = [];

    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const raw_string = buffer.toString("utf-8");

    let envelope;
    try {
      envelope = JSON.parse(raw_string);
    } catch {
      envelope = null;
    }

    if (raw === "true") {
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(envelope?.content ?? raw_string);
    }

    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).json({
      success: true,
      cid,
      type: "text",
      title: envelope?.title ?? null,
      encoding: envelope?.encoding ?? "utf-8",
      storedAt: envelope?.storedAt ?? null,
      content: envelope?.content ?? raw_string,
    });
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("not found") || err.message.includes("no link"))
    ) {
      return res.status(404).json({
        success: false,
        error: "TEXT_NOT_FOUND",
        message: `No content found for CID: ${req.params.cid}`,
      });
    }
    next(err);
  }
}

async function updateText(req, res, next) {
  try {
    const { cid } = req.params;
    const { content, title, encoding = "utf-8" } = req.body;

    if (!cid || cid.length < 10) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CID",
        message: "Provide the original CID: /api/ipfs/text/:cid",
      });
    }

    if (!content || typeof content !== "string") {
      return res.status(400).json({
        success: false,
        error: "NO_CONTENT",
        message: "Field 'content' (string) is required in the JSON body.",
      });
    }

    const MAX_TEXT_SIZE =
      parseInt(process.env.MAX_TEXT_SIZE) || 1 * 1024 * 1024;
    const byteLength = Buffer.byteLength(content, "utf-8");

    if (byteLength > MAX_TEXT_SIZE) {
      return res.status(413).json({
        success: false,
        error: "TEXT_TOO_LARGE",
        message: `Text exceeds the maximum allowed size of ${MAX_TEXT_SIZE / 1024}KB.`,
      });
    }

    const envelope = {
      type: "text",
      title: title || null,
      encoding,
      content,
      storedAt: new Date().toISOString(),
      previousCid: cid,
    };

    const buffer = Buffer.from(JSON.stringify(envelope), "utf-8");

    const ipfs = await getIPFSClient();
    const result = await ipfs.add(buffer, { pin: true, cidVersion: 1 });
    const newCid = result.cid.toString();

    console.log(
      `[updateText] New version stored. Old CID: ${cid} → New CID: ${newCid}`,
    );

    return res.status(201).json({
      success: true,
      type: "text",
      previousCid: cid,
      cid: newCid,
      title: title || null,
      size: result.size,
      encoding,
      note: "IPFS is immutable. Update your stored CID reference to the new value.",
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────
//  SHARED / UTILITY ENDPOINTS
// ─────────────────────────────────────────────

async function verifyCID(req, res, next) {
  try {
    const { cid } = req.params;

    if (!cid || cid.length < 10) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CID",
        message: "Provide a valid CID: /api/ipfs/verify/:cid",
      });
    }

    const ipfs = await getIPFSClient();
    let exists = false;
    let detectedType = null;

    try {
      await ipfs.files.stat(`/ipfs/${cid}`);
      exists = true;

      const peek = [];
      let bytesRead = 0;
      for await (const chunk of ipfs.cat(cid)) {
        peek.push(chunk);
        bytesRead += chunk.length;
        if (bytesRead >= 32) break;
      }
      const sample = Buffer.concat(peek).slice(0, 32);
      detectedType = guessContentType(sample);
    } catch {
      exists = false;
    }

    return res.status(200).json({
      success: true,
      cid,
      exists,
      detectedType,
      message: exists
        ? "CID is accessible on IPFS."
        : "CID not found on this IPFS node.",
    });
  } catch (err) {
    next(err);
  }
}

async function unpinContent(req, res, next) {
  try {
    const { cid } = req.params;

    if (!cid) {
      return res.status(400).json({
        success: false,
        error: "MISSING_CID",
        message: "Provide a CID: /api/ipfs/unpin/:cid",
      });
    }

    const ipfs = await getIPFSClient();
    await ipfs.pin.rm(cid);

    console.log(`[unpinContent] Unpinned CID: ${cid}`);

    return res.status(200).json({
      success: true,
      cid,
      message:
        "Content unpinned. It will be removed by garbage collection in the future.",
    });
  } catch (err) {
    next(err);
  }
}

async function healthCheck(req, res, next) {
  try {
    const ipfs = await getIPFSClient();
    const version = await ipfs.version();

    return res.status(200).json({
      success: true,
      status: "healthy",
      ipfs: {
        connected: true,
        version: version.version,
        node: `${process.env.IPFS_HOST}:${process.env.IPFS_PORT}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: "unhealthy",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function detectMimeType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "image/webp";
  return "application/octet-stream";
}

function guessContentType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57
  )
    return "image";

  const sample = buffer.toString("utf-8").trimStart();
  if (sample.startsWith("{") || sample.startsWith("[")) return "text";
  if (/^[\x20-\x7E\t\n\r]+$/.test(sample)) return "text";

  return "unknown";
}



export {
  storeImage,
  getImage,
  storeText,
  getText,
  updateText,
  verifyCID,
  unpinContent,
  healthCheck,
};
