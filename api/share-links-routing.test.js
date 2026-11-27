const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

test("public share pages load directly without caching, indexing, framing or referrers", () => {
  const config = JSON.parse(readFileSync(path.join(__dirname, "../frontend/public/staticwebapp.config.json"), "utf8"));
  const normalizeRoute = (route) => route.replace(/\/+$/, "") || "/";
  const normalizedRoutes = config.routes.map((entry) => normalizeRoute(entry.route));
  assert.equal(new Set(normalizedRoutes).size, normalizedRoutes.length,
    "Azure treats routes differing only by a trailing slash as duplicates");
  for (const route of ["/shared", "/shared/"]) {
    const entry = config.routes.find((candidate) => normalizeRoute(candidate.route) === normalizeRoute(route));
    assert.equal(entry.rewrite, "/index.html");
    assert.equal(entry.headers["Cache-Control"], "no-store");
    assert.equal(entry.headers["Referrer-Policy"], "no-referrer");
    assert.equal(entry.headers["X-Robots-Tag"], "noindex, nofollow");
    assert.equal(entry.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(entry.headers["Content-Security-Policy"], "frame-ancestors 'none'");
    assert.equal(entry.allowedRoles, undefined);
  }
  assert.equal(config.navigationFallback, undefined, "do not rewrite API failures into the app");
  assert.ok(config.routes.every((entry) => ["/shared", "/shared/"].includes(entry.route)));
});
