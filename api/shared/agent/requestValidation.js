const PDF_MIME = "application/pdf";
const IMAGE_SIGNATURES = {
  "image/png": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/webp": (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
  "image/heic": (bytes) =>
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(bytes.toString("ascii", 8, 12)),
};

const ALLOWED_MIME_TYPES = new Set([PDF_MIME, ...Object.keys(IMAGE_SIGNATURES)]);
const toClientError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const normalizeAttachment = (attachment, index, maxFileBytes) => {
  const rawName = typeof attachment?.name === "string" ? attachment.name : "";
  if (rawName.length > 255) {
    throw toClientError(`Attachment ${index + 1} name is too long`);
  }
  const suppliedName = rawName.trim();
  const name = suppliedName.replace(/[\u0000-\u001f\u007f]/g, "") || `attachment-${index + 1}`;
  const rawMimeType = typeof attachment?.mimeType === "string" ? attachment.mimeType : "";
  if (rawMimeType.length > 127) {
    throw toClientError(`Unsupported attachment type for attachment ${index + 1}`);
  }
  const mimeType = rawMimeType.trim().toLowerCase();
  const dataBase64 = typeof attachment?.dataBase64 === "string" ? attachment.dataBase64 : "";

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw toClientError(`Unsupported attachment type for attachment ${index + 1}`);
  }

  if (!dataBase64) {
    throw toClientError(`Attachment payload is missing for attachment ${index + 1}`);
  }

  const maxEncodedBytes = 4 * Math.ceil(maxFileBytes / 3);
  if (dataBase64.length > maxEncodedBytes) {
    throw toClientError(`Attachment exceeds max size for attachment ${index + 1}`);
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) {
    throw toClientError(`Attachment payload is invalid for attachment ${index + 1}`);
  }

  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.length || bytes.length > maxFileBytes || bytes.toString("base64") !== dataBase64) {
    throw toClientError(`Attachment size is invalid for attachment ${index + 1}`);
  }

  const claimedSize = attachment?.sizeBytes;
  if (!Number.isSafeInteger(claimedSize) || claimedSize !== bytes.length) {
    throw toClientError(`Attachment size does not match its payload for attachment ${index + 1}`);
  }

  const hasValidSignature =
    mimeType === PDF_MIME
      ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
      : IMAGE_SIGNATURES[mimeType](bytes);
  if (!hasValidSignature) {
    throw toClientError(`Attachment content does not match its type for attachment ${index + 1}`);
  }

  return {
    name: name || `attachment-${index + 1}`,
    mimeType,
    dataBase64,
    sizeBytes: bytes.length,
    kind: mimeType === PDF_MIME ? "pdf" : "image",
  };
};

module.exports = {
  normalizeAttachment,
  toClientError,
};
