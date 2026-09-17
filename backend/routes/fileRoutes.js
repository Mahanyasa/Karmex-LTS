const express = require("express");
const { randomUUID } = require("crypto");
const {
  S3Client,
  HeadBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const auth = require("../middleware/auth");

const router = express.Router();
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function getS3Config() {
  const missing = ["AWS_REGION", "AWS_S3_BUCKET"].filter(
    (name) => !process.env[name]
  );

  if (missing.length) {
    throw new Error(`Missing file storage configuration: ${missing.join(", ")}`);
  }

  return {
    bucket: process.env.AWS_S3_BUCKET,
    client: new S3Client({ region: process.env.AWS_REGION }),
  };
}

function safeSegment(value, fallback = "Other") {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return cleaned || fallback;
}

function autoFolder(contentType = "", fileName = "") {
  const type = contentType.toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (type.startsWith("image/")) return "Images";
  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Audio";
  if (type.includes("pdf") || type.includes("document") || type.includes("sheet") || type.includes("presentation") || type.startsWith("text/")) return "Documents";
  if (["zip", "rar", "7z", "gz", "tar"].includes(extension)) return "Archives";
  if (["js", "jsx", "ts", "tsx", "json", "html", "css", "py", "java", "c", "cpp", "go", "rs", "sql"].includes(extension)) return "Code";
  return "Other";
}

function userRoot(userId) {
  return `users/${userId}/`;
}

function assertOwnedKey(key, userId) {
  if (!key || !key.startsWith(userRoot(userId)) || key.includes("..")) {
    const error = new Error("Invalid file key");
    error.status = 403;
    throw error;
  }
}

function displayName(key) {
  const storedName = key.split("/").pop() || "";
  return storedName.replace(/^[0-9a-f-]{36}-/, "");
}

router.get("/status", auth, async (req, res) => {
  try {
    const { bucket, client } = getS3Config();
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    res.json({ connected: true, bucket, region: process.env.AWS_REGION });
  } catch (err) {
    console.error("[files] Storage status failed:", err.message);
    res.status(503).json({
      connected: false,
      message: err.message || "Storage connection failed",
    });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const { bucket, client } = getS3Config();
    const folder = req.query.folder ? safeSegment(req.query.folder, "") : "";
    const prefix = `${userRoot(req.userId)}${folder ? `${folder}/` : ""}`;
    const result = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" })
    );

    const folders = (result.CommonPrefixes || []).map((item) =>
      item.Prefix.slice(prefix.length).replace(/\/$/, "")
    );
    const files = (result.Contents || [])
      .filter((item) => item.Key !== `${prefix}.keep`)
      .map((item) => ({
        key: item.Key,
        name: displayName(item.Key),
        size: item.Size,
        lastModified: item.LastModified,
        folder,
      }));

    res.json({ folder, folders, files });
  } catch (err) {
    console.error("[files] List failed:", err.message);
    res.status(err.status || 500).json({ message: err.message || "Failed to list files" });
  }
});

router.post("/folders", auth, async (req, res) => {
  try {
    const { bucket, client } = getS3Config();
    const name = safeSegment(req.body.name, "");
    if (!name) return res.status(400).json({ message: "Folder name is required" });

    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: `${userRoot(req.userId)}${name}/.keep`, Body: "" })
    );
    res.status(201).json({ name });
  } catch (err) {
    console.error("[files] Create folder failed:", err.message);
    res.status(500).json({ message: err.message || "Failed to create folder" });
  }
});

router.post("/upload-url", auth, async (req, res) => {
  try {
    const { fileName, contentType, size, folder } = req.body;
    if (!fileName || !contentType) {
      return res.status(400).json({ message: "File name and content type are required" });
    }
    if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > MAX_FILE_SIZE) {
      return res.status(400).json({ message: "Files must be between 1 byte and 100 MB" });
    }

    const { bucket, client } = getS3Config();
    const targetFolder = folder ? safeSegment(folder) : autoFolder(contentType, fileName);
    const storedName = `${randomUUID()}-${safeSegment(fileName, "file")}`;
    const key = `${userRoot(req.userId)}${targetFolder}/${storedName}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: Number(size),
      Metadata: { owner: String(req.userId) },
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });

    res.json({ uploadUrl, key, folder: targetFolder });
  } catch (err) {
    console.error("[files] Upload URL failed:", err.message);
    res.status(500).json({ message: err.message || "Failed to prepare upload" });
  }
});

router.get("/download-url", auth, async (req, res) => {
  try {
    assertOwnedKey(req.query.key, req.userId);
    const { bucket, client } = getS3Config();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: req.query.key,
      ResponseContentDisposition: `attachment; filename="${displayName(req.query.key).replace(/"/g, "")}"`,
    });
    const downloadUrl = await getSignedUrl(client, command, { expiresIn: 60 });
    res.json({ downloadUrl });
  } catch (err) {
    console.error("[files] Download URL failed:", err.message);
    res.status(err.status || 500).json({ message: err.message || "Failed to prepare download" });
  }
});

router.delete("/", auth, async (req, res) => {
  try {
    assertOwnedKey(req.query.key, req.userId);
    const { bucket, client } = getS3Config();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: req.query.key }));
    res.json({ deleted: true });
  } catch (err) {
    console.error("[files] Delete failed:", err.message);
    res.status(err.status || 500).json({ message: err.message || "Failed to delete file" });
  }
});

module.exports = router;

