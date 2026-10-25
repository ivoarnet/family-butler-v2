const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeAttachment } = require("./shared/agent/requestValidation");

const encode = (bytes) => Buffer.from(bytes).toString("base64");
const attachment = (bytes, mimeType, sizeBytes = bytes.length) => ({
  name: "file",
  mimeType,
  sizeBytes,
  dataBase64: encode(bytes),
});

test("validates canonical base64, decoded size, and supported file signatures", () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const pdf = Buffer.from("%PDF-1.7");
  assert.equal(normalizeAttachment(attachment(png, "image/png"), 0, 100).sizeBytes, png.length);
  assert.equal(normalizeAttachment(attachment(pdf, "application/pdf"), 0, 100).kind, "pdf");

  for (const invalid of [
    { ...attachment(png, "image/png"), sizeBytes: 1 },
    { ...attachment(png, "image/png"), dataBase64: `${encode(png)} ` },
    { ...attachment(png, "image/png"), dataBase64: `${encode(png).slice(0, -2)}!!` },
    attachment(png, "image/jpeg"),
    attachment(Buffer.alloc(101), "application/pdf", 101),
  ]) {
    assert.throws(() => normalizeAttachment(invalid, 0, 100), { statusCode: 400 });
  }
});

test("rejects encoded payloads over the decoded-size bound before decoding", () => {
  assert.throws(
    () => normalizeAttachment({ mimeType: "image/png", dataBase64: "A".repeat(140) }, 0, 100),
    /exceeds max size/
  );
});
