import { app } from "../server/app";

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status} ${text.slice(0, 220)}`);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, text, json };
}

console.log("--- multi-connection smoke ---");
const created = await call("POST", "/api/connections", {
  name: "Test Groq",
  base_url: "https://api.groq.com/openai/v1",
  api_key: "gsk_fake_key_123",
  model: "llama-3.3-70b-versatile",
});
const testId = (created.json as { id?: number })?.id;
if (testId != null) {
  await call("GET", "/api/connections");
  await call("PATCH", `/api/connections/${testId}`, { model: "llama-3.1-8b-instant" });
  await call("DELETE", `/api/connections/${testId}`);
}
await call("GET", "/api/connections"); // list without the test row
await call("GET", "/api/settings"); // active connection public view

console.log("--- storage smoke ---");
await call("GET", "/api/storage/status");
await call("PUT", "/api/storage/mode", { mode: "local" }); // no-op switch
await call("GET", "/api/storage/status");

console.log("--- content smoke ---");
const post = await call("POST", "/api/posts", {
  raw_text:
    "OpenAI just announced GPT-5 with a 10x cheaper API tier — big day for AI coding tools like Cursor.",
});
const postId = Array.isArray(post.json) ? (post.json[0] as { id?: number })?.id : undefined;
console.log(`created test post id=${postId}`);
await call("GET", "/api/posts?limit=1&status=failed");
await call("GET", `/api/posts/${postId}`);
await call("GET", `/api/taxonomy`);
await call("GET", `/api/search?q=gpt-5`);
await call("DELETE", `/api/posts/${postId}`); // leave no trace
