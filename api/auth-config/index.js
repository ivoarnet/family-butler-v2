const cleanString = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

module.exports = async function authConfig(context) {
  const supabaseUrl = cleanString(process.env.VITE_SUPABASE_URL) || cleanString(process.env.SUPABASE_URL);
  const supabasePublishableKey =
    cleanString(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) || cleanString(process.env.SUPABASE_PUBLISHABLE_KEY);

  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: {
      supabaseUrl,
      supabasePublishableKey,
      isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
    },
  };
};
