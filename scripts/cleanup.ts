import { db } from "../server/db";

const del = db.prepare(`DELETE FROM posts WHERE raw_text LIKE 'OpenAI just announced%'`).run();
console.log("deleted test posts:", del.changes);
const rest = db.prepare(`SELECT id, status, substr(raw_text, 1, 60) AS preview FROM posts`).all();
console.log("remaining posts:", JSON.stringify(rest, null, 2));
