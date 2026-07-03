import { getIPFSClient } from "../config/ipfs.js";

async function storePoll(req, res, next) {
    try {
        const ipfs = await getIPFSClient();
        const { title, description, pollType, options } = req.body;

        if (!title || !description || pollType === undefined || !options) {
            return res.status(400).json({
                success: false,
                error: "MISSING_FIELDS",
                message: "title, description, pollType, and options are required.",
            });
        }

        const files = req.files || [];
        if (files.length > 5) {
            return res.status(400).json({
                success: false,
                error: "TOO_MANY_IMAGES",
                message: "Maximum 5 images allowed per poll.",
            });
        }

        const parsedOptions = typeof options === "string" ? JSON.parse(options) : options;

        const images = files.map((file) => ({
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            data: file.buffer.toString("base64"),
        }));

        const envelope = {
            type: "poll",
            title,
            description,
            pollType: parseInt(pollType),
            options: parsedOptions,
            imageCount: images.length,
            images,
            storedAt: new Date().toISOString(),
        };

        const envelopeBuffer = Buffer.from(JSON.stringify(envelope), "utf-8");
        const envelopeResult = await ipfs.add(envelopeBuffer, { pin: true, cidVersion: 1 });
        const pollCID = envelopeResult.cid.toString();

        return res.status(201).json({
            success: true,
            type: "poll",
            cid: pollCID,
            title,
            imageCount: images.length,
            storedAt: envelope.storedAt,
        });
    } catch (err) {
        next(err);
    }
}

async function getPoll(req, res, next) {
    try {
        const { cid } = req.params;
        const ipfs = await getIPFSClient();
        const chunks = [];

        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }

        const envelope = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

        if (envelope.type !== "poll") {
            return res.status(400).json({
                success: false,
                error: "WRONG_TYPE",
                message: "CID does not point to a poll.",
            });
        }

        return res.status(200).json({ success: true, cid, ...envelope });
    } catch (err) {
        next(err);
    }
}

export { storePoll, getPoll };