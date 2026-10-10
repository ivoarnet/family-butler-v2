const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const assert = (condition, message) => {
  if (!condition) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
};

const validateId = (value, name) => {
  assert(typeof value === "string" && UUID.test(value), `${name} must be a UUID`);
  return value.toLowerCase();
};

const validateDate = (value, name) => {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000"),
    `${name} must be a valid YYYY-MM-DD date`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  assert(Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value,
    `${name} must be a valid YYYY-MM-DD date`);
  return value;
};

module.exports = { assert, validateId, validateDate };
