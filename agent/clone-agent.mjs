// Creates your own copy of the Wake agent in YOUR ElevenLabs account, so your test calls use
// your credits. Usage (from the repo root):
//   ELEVENLABS_API_KEY=your_key node agent/clone-agent.mjs
// Then put the printed ID in web/.env.local as NEXT_PUBLIC_ELEVENLABS_AGENT_ID=...
// Your key needs the "ElevenLabs Agents: Write" permission. Never commit your key.
import { readFileSync } from "node:fs";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("Set ELEVENLABS_API_KEY first: ELEVENLABS_API_KEY=sk_... node agent/clone-agent.mjs");
  process.exit(1);
}
const config = JSON.parse(readFileSync(new URL("./agent-config.json", import.meta.url), "utf8"));
const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify(config),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`ElevenLabs said ${res.status}:`, JSON.stringify(body.detail ?? body));
  process.exit(1);
}
console.log(`Your agent is ready. Add this to web/.env.local:\nNEXT_PUBLIC_ELEVENLABS_AGENT_ID=${body.agent_id}`);
