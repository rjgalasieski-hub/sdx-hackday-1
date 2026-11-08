// Coach voice presets. The UI lists these; the call passes voiceId as a TTS override
// and `personality` as a dynamic variable. Sample clips live in public/voices/<id>.mp3.
export type VoicePresetId = "signature" | "hype" | "sunny" | "calm" | "coach";

export type VoicePreset = {
  id: VoicePresetId;
  label: string;
  tagline: string;
  defaultName: string;
  voiceId: string;
  personality: string;
  sample: string;
};

export const VOICE_PRESETS: VoicePreset[] = [
  {
    // Custom voice made with ElevenLabs Voice Design for Wake (not a stock library voice).
    id: "signature",
    label: "Signature",
    tagline: "Designed for Wake",
    defaultName: "Wren",
    voiceId: "uZ50Ubxg5wgY62RReo7l",
    personality:
      "Warm, upbeat friend who has been up for an hour with coffee. Encouraging and a little playful, keeps it moving, never preachy.",
    sample: "Morning! I'm your Wake coach, built just for this. Let's get you up and make today count.",
  },
  {
    id: "hype",
    label: "Hype",
    tagline: "Your loudest friend at 7 AM",
    defaultName: "Jett",
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",
    personality:
      "High energy hype man. Fast, excited, celebrates small wins, treats getting out of bed like game day.",
    sample: "Yo, rise and grind! Big day today, and you're already winning by being up. Let's go!",
  },
  {
    id: "sunny",
    label: "Sunny",
    tagline: "Bright, warm, a little playful",
    defaultName: "Sunny",
    voiceId: "cgSgspJ2msm6clMCkdW9",
    personality:
      "Warm and playful, like a friend who already has coffee. Light teasing, lots of encouragement.",
    sample: "Good morning, sleepyhead! The sun's out and so are you. Want to hear what today looks like?",
  },
  {
    id: "calm",
    label: "Calm",
    tagline: "Slow start, clear head",
    defaultName: "River",
    voiceId: "SAz9YHcvj6GT2YYXdXww",
    personality:
      "Calm, steady and gentle. Speaks slowly, no pressure, helps them feel organized instead of rushed.",
    sample: "Morning. Take a breath, no rush. Let's walk through your day together, one thing at a time.",
  },
  {
    id: "coach",
    label: "Coach",
    tagline: "No snooze. No excuses.",
    defaultName: "Sarge",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    personality:
      "Firm, no-excuses coach. Short commands, zero tolerance for snoozing, but clearly on their side.",
    sample: "Feet on the floor. Now. You've got work to do today, and we're not wasting the morning.",
  },
];

export const DEFAULT_VOICE: VoicePresetId = "sunny";

export function getPreset(id?: string): VoicePreset {
  return VOICE_PRESETS.find((v) => v.id === id) ?? VOICE_PRESETS.find((v) => v.id === DEFAULT_VOICE)!;
}
