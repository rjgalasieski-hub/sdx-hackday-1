// Alarm tone generated with the Web Audio API. No audio file needed.
// We render one 1.2s "beep-beep ... beep-beep" pattern into a buffer and loop it,
// which is jitter-free even if the main thread is busy.

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** Play a silent blip inside a click handler so iOS/Safari unlock audio for later. */
export function unlockAudio(ctx: AudioContext) {
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    void ctx.resume();
  } catch {
    /* ignore */
  }
}

function renderPattern(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * 1.2);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Two quick beeps, then rest. Each beep blends a fundamental with a fifth for a bright, clean tone.
  const beeps = [
    { start: 0.0, dur: 0.14, freq: 1046.5 }, // C6
    { start: 0.2, dur: 0.14, freq: 1046.5 },
  ];
  const attack = 0.008;
  const release = 0.03;

  for (const b of beeps) {
    const s0 = Math.floor(b.start * sr);
    const n = Math.floor(b.dur * sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = 1;
      if (t < attack) env = t / attack;
      else if (t > b.dur - release) env = Math.max(0, (b.dur - t) / release);
      const sample =
        0.7 * Math.sin(2 * Math.PI * b.freq * t) +
        0.3 * Math.sin(2 * Math.PI * b.freq * 1.5 * t);
      data[s0 + i] += sample * env;
    }
  }
  return buffer;
}

export class AlarmSound {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get playing() {
    return this.source !== null;
  }

  start() {
    if (this.source) return;
    void this.ctx.resume();
    this.buffer ??= renderPattern(this.ctx);
    const gain = this.ctx.createGain();
    // Gentle ramp so it doesn't blow out the projector speakers on frame one.
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.45, now + 0.4);
    gain.connect(this.ctx.destination);

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(gain);
    src.start();

    this.source = src;
    this.gain = gain;
  }

  stop() {
    const src = this.source;
    const gain = this.gain;
    this.source = null;
    this.gain = null;
    if (!src || !gain) return;
    try {
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      src.stop(now + 0.06);
    } catch {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}
