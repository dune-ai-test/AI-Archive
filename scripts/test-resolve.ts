import { app } from "../server/app";

async function call(input: string, label: string) {
  const res = await app.request("http://localhost/api/posts/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const j = await res.json();
  console.log(`\n[${label}] → ${res.status}`);
  console.log(JSON.stringify(j, null, 1).slice(0, 500));
}

// 1) Plain status URL → oEmbed
await call("https://x.com/jack/status/20", "plain x.com link");

// 2) twitter.com variant
await call("https://twitter.com/jack/status/20", "twitter.com link");

// 3) Pasted embed HTML (offline parse path)
const embedHtml = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">GPT-5 is rolling out to all users starting today — free tier included. Reasoning quality is a step change.<br>More: <a href="https://t.co/abc">pic.twitter.com/xyz</a></p>&mdash; Sam Altman (@sama) <a href="https://twitter.com/sama/status/1234567890?ref_src=twsrc%5Etfw">August 7, 2025</a></blockquote>`;
await call(embedHtml, "embed HTML paste");

// 4) Manual text passthrough
await call("OpenAI announced something big today.", "manual text");
