import { localAdapter } from "../server/storage";

const del = localAdapter.prepare(`DELETE FROM posts WHERE raw_text LIKE 'OpenAI just announced%'`).run();
console.log("deleted test posts:", (await del).changes);
const rest = await localAdapter.prepare(`SELECT id, status, substr(raw_text, 1, 60) AS preview FROM posts`).all();
console.log("remaining posts:", JSON.stringify(rest, null, 2));
