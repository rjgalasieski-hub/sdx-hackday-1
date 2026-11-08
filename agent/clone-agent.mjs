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
delete config._knowledge_base_note;

// Upload the knowledge base doc into your account and attach it.
const kbText = readFileSync(new URL("./knowledge/morning-playbook.md", import.meta.url), "utf8");
const kbRes = await fetch("https://api.elevenlabs.io/v1/convai/knowledge-base/text", {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({ text: kbText, name: "Wake Morning Playbook" }),
});
const kb = await kbRes.json().catch(() => ({}));
if (kbRes.ok && kb.id) {
  config.conversation_config.agent.prompt.knowledge_base = [
    { type: "text", name: "Wake Morning Playbook", id: kb.id, usage_mode: "prompt" },
  ];
} else {
  console.warn("Knowledge base upload failed, creating the agent without it:", JSON.stringify(kb.detail ?? kb));
}
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
