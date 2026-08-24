import { app } from "../server/app";

const input = `<blockquote class="twitter-tweet"><p lang="en">Claude 4.5 beats every benchmark we track. Shipping to API today.</p>&mdash; Anthropic (@AnthropicAI) <a href="https://twitter.com/AnthropicAI/status/99999999999">August 5, 2025</a></blockquote>`;

const res = await app.request("http://localhost/api/posts/resolve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input }),
});
console.log(res.status, JSON.stringify(await res.json(), null, 1));
