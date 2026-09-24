const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const getBearerToken = (headers) => {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const rawAuthorization =
    cleanString(headers.authorization) ||
    cleanString(headers.Authorization);
  if (!rawAuthorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return cleanString(rawAuthorization.slice("bearer ".length));
};

const resolveSupabaseApiKey = () =>
  cleanString(process.env.SUPABASE_SECRET_KEY) ||
  cleanString(process.env.SUPABASE_PUBLISHABLE_KEY);

const getAuthenticatedUserId = async (requestHeaders) => {
  const token = getBearerToken(requestHeaders);
  if (!token) {
    return null;
  }

  const supabaseUrl = cleanString(process.env.SUPABASE_URL);
  const apiKey = resolveSupabaseApiKey();
  if (!supabaseUrl || !apiKey) {
    throw new Error("SUPABASE_URL and a Supabase API key must be configured");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: apiKey,
      Authorization: ["Bearer", token].join(" "),
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return typeof payload?.id === "string" && payload.id ? payload.id : null;
};

module.exports = {
  getAuthenticatedUserId,
};
