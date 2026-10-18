const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");
const { assert, validateId } = require("./validation");

const readKey = (env = process.env) => {
  const value = env.BRING_CREDENTIALS_KEY;
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 && key.toString("base64") === value ? key : null;
};

const validateCredentials = (input) => {
  assert(input && typeof input === "object" && !Array.isArray(input)
    && Object.keys(input).length === 2 && Object.hasOwn(input, "mail")
    && Object.hasOwn(input, "password"), "mail and password are required");
  assert(typeof input.mail === "string" && input.mail.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.mail)
    && !/[\u0000-\u001f\u007f]/.test(input.mail), "mail is invalid");
  assert(typeof input.password === "string" && input.password.length > 0
    && input.password.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(input.password), "password is invalid");
  return { mail: input.mail, password: input.password };
};

const aad = (householdId, version) =>
  Buffer.from(`bring:${validateId(householdId, "householdId").toLowerCase()}:${version}`, "utf8");
const encryptCredentials = (householdId, input, env = process.env) => {
  const key = readKey(env);
  if (!key) throw new Error("unavailable");
  const credentials = validateCredentials(input);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(householdId, 1));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return { version: 1, ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64") };
};
const decode = (value, length, max = length) => {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("unavailable");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < length || bytes.length > max || bytes.toString("base64") !== value) throw new Error("unavailable");
  return bytes;
};
const decryptCredentials = (householdId, envelope, env = process.env) => {
  try {
    const key = readKey(env);
    if (!key || envelope?.version !== 1) throw new Error("unavailable");
    const decipher = createDecipheriv("aes-256-gcm", key, decode(envelope.iv, 12));
    decipher.setAAD(aad(householdId, envelope.version));
    decipher.setAuthTag(decode(envelope.tag, 16));
    const plaintext = Buffer.concat([decipher.update(decode(envelope.ciphertext, 1, 8192)), decipher.final()]);
    return validateCredentials(JSON.parse(plaintext.toString("utf8")));
  } catch (_) { throw new Error("unavailable"); }
};

module.exports = { readKey, validateCredentials, encryptCredentials, decryptCredentials };
