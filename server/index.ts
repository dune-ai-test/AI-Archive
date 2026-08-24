import { serve } from "@hono/node-server";
import { app } from "./app";

console.log("[boot] imports done, starting server");

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`archive-ai-x running at http://localhost:${info.port}`);
});

