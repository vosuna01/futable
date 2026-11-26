/**
 * Tablet sounds, synthesised with the Web Audio API: no audio files to load,
 * license or cache. Browsers only let a page play sound after a tap, so the
 * tablet calls `unlockSound()` on its first touch; until then plays are silent.
 */

const STORAGE_KEY = "futable.tablet.sound";
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Sound on by default; the choice is kept on this tablet only. */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the choice lasts until reload.
  }
}

/** Call from a tap: browsers keep audio suspended until the user interacts. */
export function unlockSound() {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

/** Lets tests (and anyone curious) see which sound was asked for, even muted. */
function announce(kind: "goal" | "final") {
  try {
    window.dispatchEvent(new CustomEvent("futable-sound", { detail: kind }));
  } catch {
    // Old browsers without CustomEvent: nothing to announce.
  }
}

function ready(): AudioContext | null {
  if (!soundEnabled()) return null;
  const c = context();
  if (!c || c.state !== "running") return null;
  return c;
}

/** One enveloped oscillator note. */
function tone(
  c: AudioContext,
  out: AudioNode,
  freq: number,
  start: number,
  length: number,
  type: OscillatorType = "triangle",
  volume = 0.25,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** Band-passed noise swell: a short "crowd" roar. */
function roar(c: AudioContext, out: AudioNode, start: number, length: number) {
  const buffer = c.createBuffer(
    1,
    Math.floor(c.sampleRate * length),
    c.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 900;
  band.Q.value = 0.6;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  noise.connect(band).connect(gain).connect(out);
  noise.start(start);
  noise.stop(start + length);
}

/** Referee-style whistle blast with a little trill. */
function whistle(
  c: AudioContext,
  out: AudioNode,
  start: number,
  length: number,
) {
  const osc = c.createOscillator();
  const trill = c.createOscillator();
  const depth = c.createGain();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 2900;
  trill.frequency.value = 28;
  depth.gain.value = 90;
  trill.connect(depth).connect(osc.frequency);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
  gain.gain.setValueAtTime(0.16, start + length - 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  trill.start(start);
  osc.stop(start + length + 0.02);
  trill.stop(start + length + 0.02);
}

/**
 * Goal: quick rising fanfare over a crowd roar. `level` 1–4 (doblete,
 * hat-trick…) adds notes, a longer roar and a final trill.
 */
export function playGoal(level = 1) {
  announce("goal");
  const c = ready();
  if (!c) return;
  try {
    const out = c.createGain();
    out.gain.value = 0.9;
    out.connect(c.destination);
    const t = c.currentTime + 0.02;
    const lvl = Math.max(1, Math.min(4, level));
    roar(c, out, t, 1.3 + 0.5 * (lvl - 1));
    // Each level climbs one note higher before the top chord.
    const scale = [523.25, 659.25, 783.99, 880, 987.77, 1174.66];
    const steps = scale.slice(0, 2 + lvl);
    steps.forEach((f, i) =>
      tone(c, out, f, t + i * 0.09, 0.16, "square", 0.12),
    );
    const top = t + steps.length * 0.09;
    tone(c, out, 1046.5, top, 0.55, "square", 0.14);
    tone(c, out, 1318.5, top, 0.55, "triangle", 0.1);
    if (lvl >= 3)
      for (let i = 0; i < 6; i++)
        tone(
          c,
          out,
          i % 2 ? 1568 : 1318.5,
          top + 0.6 + i * 0.07,
          0.08,
          "square",
          0.08,
        );
  } catch {
    // Sound is a bonus: never break the scoreboard for it.
  }
}

/** Descending "wah wah wah wahhh" for whoever lost. */
function sadTrombone(
  c: AudioContext,
  out: AudioNode,
  start: number,
  long: boolean,
) {
  const notes = [311.13, 293.66, 277.18, 261.63];
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    const at = start + i * 0.42;
    const length = last ? (long ? 1.4 : 0.9) : 0.36;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, at);
    if (last) {
      // The final note wobbles, like a real trombone slide.
      const wob = c.createOscillator();
      const depth = c.createGain();
      wob.frequency.value = 6;
      depth.gain.value = 6;
      wob.connect(depth).connect(osc.frequency);
      wob.start(at);
      wob.stop(at + length + 0.02);
    }
    const soft = c.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 1200;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.04);
    gain.gain.setValueAtTime(0.12, at + length - 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(soft).connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.02);
  });
}

/**
 * End of match: three whistle blasts, a victory chord and a sad trombone for
 * the losers (~4.5 s). `shutout` = the losers did not score: longer trombone.
 */
export function playFinal(shutout = false) {
  announce("final");
  const c = ready();
  if (!c) return;
  try {
    const out = c.createGain();
    out.gain.value = 0.9;
    out.connect(c.destination);
    const t = c.currentTime + 0.02;
    whistle(c, out, t, 0.18);
    whistle(c, out, t + 0.28, 0.18);
    whistle(c, out, t + 0.56, 0.7);
    const chord = t + 1.4;
    [392, 493.88, 587.33, 783.99].forEach((f) =>
      tone(c, out, f, chord, 1.2, "triangle", 0.12),
    );
    roar(c, out, chord, 1.2);
    sadTrombone(c, out, chord + 1.4, shutout);
  } catch {
    // Sound is a bonus: never break the scoreboard for it.
  }
}
