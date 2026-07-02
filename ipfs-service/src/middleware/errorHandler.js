function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // File too large (multer)
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: "FILE_TOO_LARGE",
      message: `File exceeds maximum allowed size of ${process.env.MAX_FILE_SIZE / (1024 * 1024)}MB`,
    });
  }

  // JSON body too large (express.json limit)
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "TEXT_TOO_LARGE",
      message: `Request body exceeds the allowed limit.`,
    });
  }

  // Wrong field name used
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      error: "WRONG_FIELD_NAME",
      message: "Use field name 'image' when sending the file.",
    });
  }

  // Wrong file type
  if (err.message && err.message.includes("not allowed")) {
    return res.status(415).json({
      success: false,
      error: "UNSUPPORTED_FILE_TYPE",
      message: err.message,
    });
  }

  // Malformed JSON body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "INVALID_JSON",
      message: "Request body contains invalid JSON.",
    });
  }

  // IPFS daemon not running
  if (err.message && err.message.includes("ECONNREFUSED")) {
    return res.status(503).json({
      success: false,
      error: "IPFS_UNAVAILABLE",
      message: "Cannot reach IPFS node. Make sure the IPFS daemon is running.",
    });
  }

  // Default
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: err.message || "An unexpected error occurred.",
  });
}

export default errorHandler;
