const ICON_ID = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const IMAGE_URL = /^https:\/\/web\.getbring\.com\/assets\/images\/items\/[a-z0-9][a-z0-9_-]{0,159}\.png$/;
const validIconId = (value) => typeof value === "string" && !/\s/.test(value) && ICON_ID.test(value);
const validImageUrl = (value) => typeof value === "string" && !/\s/.test(value) && IMAGE_URL.test(value);
const identity = (value) => value.trim().toLowerCase();
const iconSlug = (value) => {
  if (typeof value !== "string") return null;
  const slug = value.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe")
    .replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/é/g, "e")
    .replace(/\s/g, "_").replace(/-/g, "_").replace(/!/g, "");
  return validIconId(slug) ? slug : null;
};
const validText = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 200;

const parseCatalog = (value) => {
  if (!validText(value?.language) || !Array.isArray(value?.catalog?.sections)
    || value.catalog.sections.length > 1000) throw new Error("invalid metadata");
  const items = [];
  for (const section of value.catalog.sections) {
    if (!Array.isArray(section?.items) || items.length + section.items.length > 20000) throw new Error("invalid metadata");
    for (const item of section.items) {
      if (!validText(item?.itemId) || !validText(item.name)) throw new Error("invalid metadata");
      items.push({ itemId: item.itemId, name: item.name });
    }
  }
  return items;
};
const parseDetails = (value, listId) => {
  if (!Array.isArray(value) || value.length > 5000 || value.some((item) =>
    !validText(item?.itemId)
    || item.listUuid !== undefined && item.listUuid !== listId
    || ![undefined, null].includes(item.userIconItemId) && typeof item.userIconItemId !== "string"
    || ![undefined, null].includes(item.imageUrl) && typeof item.imageUrl !== "string")) {
    throw new Error("invalid metadata");
  }
  return value;
};

// Catalogs are public provider data, not a product allowlist. The two fixed
// locales share canonical IDs; translated names are only used for matching.
const createMetadataLoader = (client) => {
  const catalogs = new Map();
  const loadCatalog = (locale, deadline) => {
    const cached = catalogs.get(locale);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const entry = { expires: deadline, pending: true };
    entry.promise = Promise.resolve().then(() => {
      if (Date.now() >= deadline) throw new Error("metadata deadline");
      return client.loadCatalog(locale);
    }).then((value) => {
      const parsed = parseCatalog(value);
      entry.pending = false;
      entry.expires = Date.now() + 3600000;
      return parsed;
    })
      .catch(() => {
        if (catalogs.get(locale) === entry) catalogs.delete(locale);
        return undefined;
      });
    catalogs.set(locale, entry);
    return entry.promise;
  };
  return async (listId, items, callDeadline) => {
    if (!items.length) return items;
    const deadline = Math.min(Date.now() + 3000, callDeadline - 25);
    if (deadline <= Date.now()) return items;
    let timer;
    const safely = async (operation) => {
      try {
        if (Date.now() >= deadline) return undefined;
        return await operation();
      } catch { return undefined; }
    };
    try {
      const result = await Promise.race([
        Promise.all([
          safely(async () => parseDetails(await client.getItemsDetails(listId), listId)),
          ...["de-DE", "en-US"].map((locale) => safely(() => loadCatalog(locale, deadline))),
        ]),
        new Promise((resolve) => {
          timer = setTimeout(() => {
            for (const [locale, entry] of catalogs) {
              if (entry.pending && entry.expires <= deadline) catalogs.delete(locale);
            }
            resolve(undefined);
          }, deadline - Date.now());
        }),
      ]);
      if (!result) return items;
      const [details, ...loadedCatalogs] = result;
      const complete = details !== undefined && loadedCatalogs.every((catalog) => catalog !== undefined);
      // A missing details response could hide a custom icon/image. Do not
      // replace previously cached metadata with a lower-priority fallback.
      if (!complete) return items;
      const ids = new Set();
      const names = new Map();
      for (const item of loadedCatalogs.flatMap((catalog) => catalog || [])) {
        ids.add(item.itemId);
        for (const name of [item.itemId, item.name]) {
          const candidates = names.get(identity(name)) || new Set();
          candidates.add(item.itemId);
          names.set(identity(name), candidates);
        }
      }
      return items.map((item) => {
        const candidates = names.get(identity(item.name));
        const canonical = candidates?.size === 1 ? [...candidates][0] : null;
        const matches = (details || []).filter((detail) => detail.itemId === item.name
          || canonical !== null && detail.itemId === canonical);
        if (matches.length > 1) return item;
        const detail = matches.length === 1 ? matches[0] : undefined;
        // Item IDs can also be free-form custom names. Only catalog-backed
        // identifiers, including explicit icon overrides, become CDN slugs.
        const iconId = iconSlug(ids.has(detail?.userIconItemId) ? detail.userIconItemId : null)
          || iconSlug(ids.has(detail?.itemId) ? detail.itemId : canonical);
        const imageUrl = validImageUrl(detail?.imageUrl) ? detail.imageUrl : null;
        return {
          ...item,
          iconId,
          imageUrl,
        };
      });
    } catch {
      return items;
    } finally {
      clearTimeout(timer);
    }
  };
};

module.exports = { createMetadataLoader, validIconId, validImageUrl };
