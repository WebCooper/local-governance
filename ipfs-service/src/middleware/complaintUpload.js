import multer from "multer";
import "dotenv/config";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = (
  process.env.ALLOWED_MIME_TYPES || "image/jpeg,image/png,image/gif,image/webp"
)
  .split(",")
  .map((t) => t.trim());

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type '${file.mimetype}' is not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(", ")}`,
      ),
      false,
    );
  }
};

// Accepts 0–5 images under field name "images"
const complaintUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
  fileFilter,
});

export default complaintUpload;
