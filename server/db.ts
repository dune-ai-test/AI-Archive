// Legacy module — kept so existing imports of `slugify` / `TAXONOMY` still work.
// The database lives in ./storage now (local SQLite or Cloudflare D1).
export { slugify, TAXONOMY } from "./storage/bootstrap";
