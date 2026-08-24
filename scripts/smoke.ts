import { app } from "../server/app";

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status} ${text.slice(0, 220)}`);
  return { status: res.status, text };
}

console.log("--- multi-connection smoke ---");
await call("GET", "/api/connections");                       // list (may contain migrated Default)
await call("POST", "/api/connections", {
  name: "Test Groq",
  base_url: "https://api.groq.com/openai/v1",
  api_key: "gsk_fake_key_123",
  model: "llama-3.3-70b-versatile",
});
await call("GET", "/api/connections");
await call("POST", "/api/connections/1/activate").catch(() => {});
await call("PATCH", "/api/connections/2", { model: "llama-3.1-8b-instant" });
await call("DELETE", "/api/connections/2");
await call("GET", "/api/connections");
await call("GET", "/api/settings");                          // active connection public view
