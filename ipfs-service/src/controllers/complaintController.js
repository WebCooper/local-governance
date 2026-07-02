import { getIPFSClient } from "../config/ipfs.js";

async function storeComplaint(req, res, next) {
  try {
    const ipfs = await getIPFSClient();

    const description = req.body?.description?.trim();
    const category = req.body?.category?.trim();
    const location = req.body?.location?.trim();

    if (!description) {
      return res.status(400).json({
        success: false,
        error: "MISSING_DESCRIPTION",
        message: "'description' is required.",
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        error: "MISSING_CATEGORY",
        message: "'category' is required.",
      });
    }

    if (!location) {
      return res.status(400).json({
        success: false,
        error: "MISSING_LOCATION",
        message: "'location' is required.",
      });
    }

    const files = req.files || [];

    if (files.length > 5) {
      return res.status(400).json({
        success: false,
        error: "TOO_MANY_IMAGES",
        message: "Maximum 5 images allowed per complaint.",
      });
    }

    const images = files.map((file) => ({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      data: file.buffer.toString("base64"),
    }));

    console.log(
      `[storeComplaint] Embedding ${images.length} image(s) into envelope.`,
    );

    const envelope = {
      type: "complaint",
      description,
      category,
      location,
      imageCount: images.length,
      images,
      storedAt: new Date().toISOString(),
    };

    const envelopeBuffer = Buffer.from(JSON.stringify(envelope), "utf-8");
    const envelopeResult = await ipfs.add(envelopeBuffer, {
      pin: true,
      cidVersion: 1,
    });
    const complaintCID = envelopeResult.cid.toString();

    console.log(
      `[storeComplaint] Complaint stored. CID: ${complaintCID} | Total size: ${envelopeResult.size} bytes`,
    );

    return res.status(201).json({
      success: true,
      type: "complaint",
      cid: complaintCID,
      description,
      category,
      location,
      imageCount: images.length,
      images: images.map(({ originalName, mimeType, size }) => ({
        originalName,
        mimeType,
        size,
      })),
      storedAt: envelope.storedAt,
    });
  } catch (err) {
    next(err);
  }
}

async function getComplaint(req, res, next) {
  try {
    const { cid } = req.params;

    if (!cid || cid.length < 10) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CID",
        message: "Provide a valid CID: /api/ipfs/complaint/:cid",
      });
    }

    console.log(`[getComplaint] Fetching complaint CID: ${cid}`);

    const ipfs = await getIPFSClient();
    const chunks = [];

    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }

    const envelope = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    if (envelope.type !== "complaint") {
      return res.status(400).json({
        success: false,
        error: "WRONG_TYPE",
        message: "CID does not point to a complaint.",
      });
    }

    return res.status(200).json({
      success: true,
      cid,
      ...envelope,
    });
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("not found") || err.message.includes("no link"))
    ) {
      return res.status(404).json({
        success: false,
        error: "COMPLAINT_NOT_FOUND",
        message: `No complaint found for CID: ${req.params.cid}`,
      });
    }
    next(err);
  }
}

async function getComplaintImage(req, res, next) {
  try {
    const { cid, index } = req.params;
    const imgIndex = parseInt(index);

    if (!cid || cid.length < 10) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CID",
        message: "Provide a valid CID.",
      });
    }

    if (isNaN(imgIndex) || imgIndex < 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INDEX",
        message: "Image index must be a number starting from 0.",
      });
    }

    const ipfs = await getIPFSClient();
    const chunks = [];

    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }

    const envelope = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    if (envelope.type !== "complaint") {
      return res.status(400).json({
        success: false,
        error: "WRONG_TYPE",
        message: "CID does not point to a complaint.",
      });
    }

    if (!envelope.images || imgIndex >= envelope.images.length) {
      return res.status(404).json({
        success: false,
        error: "IMAGE_NOT_FOUND",
        message: `No image at index ${imgIndex}. This complaint has ${envelope.images?.length ?? 0} image(s).`,
      });
    }

    const image = envelope.images[imgIndex];
    const buffer = Buffer.from(image.data, "base64");

    // Returns raw image — opens directly in browser
    res.set("Content-Type", image.mimeType);
    res.set("Content-Length", buffer.length);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Content-Disposition", `inline; filename="${image.originalName}"`);

    return res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

export { storeComplaint, getComplaint, getComplaintImage };
