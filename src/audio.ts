// Procedural audio: every sound and the music loop are synthesized with Web Audio.
// No audio files, so nothing copyrighted and nothing to download.
type Prefs = { sound: boolean; music: boolean };
type MusicMode = "off" | "lobby" | "flight" | "storm" | "won" | "lost";

const KEY = "lastsignal-audio";
let context: AudioContext | undefined;
let master: GainNode | undefined;
let sfx: GainNode | undefined;
let musicBus: GainNode | undefined;
let noise: AudioBuffer | undefined;
let prefs: Prefs = load();
let mode: MusicMode = "off";
let scheduler: ReturnType<typeof setInterval> | undefined;
let step = 0;
let nextTime = 0;
const listeners = new Set<(p: Prefs) => void>();

function load(): Prefs {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { sound: false, music: true, ...JSON.parse(raw) };
  } catch {
    /* Storage can be unavailable in some embedded browsers. */
  }
  return { sound: false, music: true };
}
function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* Ignore: the preference simply lasts until reload. */
  }
  for (const listener of listeners) listener({ ...prefs });
}
export function audioPrefs(): Prefs {
  return { ...prefs };
}
export function onAudioPrefs(listener: (p: Prefs) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
/** True when the user wants sound but the browser has not allowed it yet (needs a click). */
export function audioBlocked() {
  return prefs.sound && (!context || context.state !== "running");
}

function ensure() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
    sfx = context.createGain();
    sfx.gain.value = 1;
    sfx.connect(master);
    musicBus = context.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state !== "running") void context.resume().then(applyMusic);
  return context;
}
/** Call from a click or key handler: browsers only start audio after a user gesture. */
export function unlockAudio() {
  if (prefs.sound) {
    ensure();
    applyMusic();
  }
}
export function setSound(value: boolean) {
  prefs.sound = value;
  save();
  if (value) ensure();
  applyMusic();
}
export function setMusic(value: boolean) {
  prefs.music = value;
  save();
  if (value && prefs.sound) ensure();
  applyMusic();
}
export function setMusicMode(next: MusicMode) {
  if (next === mode) return;
  const previous = mode;
  mode = next;
  if (context && context.state === "running" && prefs.sound) {
    if (next === "won" && previous !== "won") fanfare(true);
    if (next === "lost" && previous !== "lost") fanfare(false);
  }
  applyMusic();
}

// ---------- Music: a 4-chord synthwave loop at 116 BPM, scheduled 16th by 16th ----------
const BPM = 116;
const SIXTEENTH = 60 / BPM / 4;
// Am, F, C, G as MIDI roots with chord tones for the arpeggio.
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] },
  { root: 41, tones: [53, 57, 60, 65] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 3, 2, 1, 3, 0, 2, 1, 3];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function applyMusic() {
  const playing =
    prefs.sound &&
    prefs.music &&
    context?.state === "running" &&
    (mode === "lobby" || mode === "flight" || mode === "storm");
  if (!context || !musicBus) return;
  const level = !playing ? 0 : mode === "lobby" ? 0.16 : mode === "storm" ? 0.24 : 0.21;
  musicBus.gain.cancelScheduledValues(context.currentTime);
  musicBus.gain.setTargetAtTime(level, context.currentTime, playing ? 0.4 : 0.25);
  if (playing && !scheduler) {
    nextTime = context.currentTime + 0.08;
    scheduler = setInterval(schedule, 25);
  } else if (!playing && scheduler) {
    // Let the fade finish before the sequencer stops.
    setTimeout(() => {
      if (musicBus && musicBus.gain.value < 0.02 && scheduler) {
        clearInterval(scheduler);
        scheduler = undefined;
      }
    }, 1200);
  }
}
function schedule() {
  if (!context || !musicBus) return;
  while (nextTime < context.currentTime + 0.12) {
    playStep(step, nextTime);
    step = (step + 1) % 128;
    nextTime += SIXTEENTH;
  }
}
function playStep(n: number, t: number) {
  const chord = CHORDS[Math.floor(n / 32) % 4];
  const beat = n % 16;
  const intense = mode === "flight" || mode === "storm";
  // Bass: pulsing eighths with an octave hop.
  if (n % 2 === 0)
    voice(hz(chord.root + (beat % 8 === 6 ? 12 : 0)), t, SIXTEENTH * 1.8, "sawtooth", 0.11, 520 + (intense ? 300 : 0));
  // Arpeggio: square lead, softer in the lobby.
  voice(hz(chord.tones[ARP[beat]] + 12), t, SIXTEENTH * 0.9, "square", intense ? 0.035 : 0.025, 2400);
  // Pad on each bar for warmth.
  if (beat === 0)
    for (const tone of chord.tones.slice(0, 3)) voice(hz(tone), t, SIXTEENTH * 15, "triangle", 0.03, 1200, 0.3);
  if (!intense) return;
  if (beat % 4 === 0) kick(t);
  if (beat === 4 || beat === 12) hat(t, 0.09, 0.12, 1800);
  if (beat % 2 === 1 || mode === "storm") hat(t, 0.03, 0.04, 7000);
}
function voice(freq: number, t: number, length: number, type: OscillatorType, level: number, cutoff: number, attack = 0.005) {
  const ctx = context!;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(filter).connect(gain).connect(musicBus!);
  osc.start(t);
  osc.stop(t + length + 0.05);
}
function kick(t: number) {
  const ctx = context!;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  gain.gain.setValueAtTime(0.32, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain).connect(musicBus!);
  osc.start(t);
  osc.stop(t + 0.25);
}
function hat(t: number, level: number, length: number, cutoff: number, bus = musicBus!) {
  const ctx = context!;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise!;
  filter.type = "highpass";
  filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(bus);
  src.start(t, Math.random() * 0.5, length + 0.05);
}
function fanfare(won: boolean) {
  const ctx = context!;
  const t = ctx.currentTime + 0.05;
  const notes = won ? [69, 72, 76, 81, 84, 88] : [69, 65, 62, 57];
  notes.forEach((note, i) => tone(hz(note), t + i * (won ? 0.11 : 0.22), won ? 0.5 : 0.7, won ? "square" : "triangle", 0.07));
  if (won) for (const note of [69, 73, 76]) tone(hz(note), t + 0.7, 1.6, "sawtooth", 0.035, 1800);
}

// ---------- Sound effects ----------
function tone(freq: number, t: number, length: number, type: OscillatorType, level: number, cutoff = 6000, to?: number) {
  const ctx = context!;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(filter).connect(gain).connect(sfx!);
  osc.start(t);
  osc.stop(t + length + 0.05);
}
function sweep(t: number, from: number, to: number, length: number, level: number) {
  const ctx = context!;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise!;
  filter.type = "bandpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(sfx!);
  src.start(t, 0, length + 0.05);
}
export function playSound(type: string, command?: string) {
  if (!prefs.sound || !context || context.state !== "running" || !sfx) return;
  const t = context.currentTime + 0.01;
  if (type === "command" && command === "boost") {
    sweep(t, 300, 3200, 0.5, 0.22);
    tone(110, t, 0.45, "sawtooth", 0.05, 900, 220);
  } else if (type === "command" && command === "shield") {
    [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.04, 0.35, "sine", 0.05));
  } else if (type === "command") {
    tone(392, t, 0.12, "triangle", 0.05);
    tone(587, t + 0.08, 0.18, "triangle", 0.05);
  } else if (type === "join") {
    tone(660, t, 0.1, "square", 0.025, 3000);
    tone(990, t + 0.07, 0.14, "square", 0.025, 3000);
  } else if (type === "rejected") {
    tone(180, t, 0.12, "triangle", 0.03);
  } else if (type === "hit") {
    hat(t, 0.5, 0.35, 200, sfx);
    tone(90, t, 0.4, "sawtooth", 0.12, 600, 40);
  } else if (type === "blocked") {
    tone(880, t, 0.25, "sine", 0.07, 6000, 1320);
    hat(t, 0.12, 0.15, 3000, sfx);
  } else if (type === "rescue") {
    [440, 554, 659, 880].forEach((f, i) => tone(f, t + i * 0.08, 0.4, "triangle", 0.07));
  } else if (type === "sync") {
    [440, 554, 659, 880, 1109].forEach((f, i) => tone(f, t + i * 0.05, 0.7, "sawtooth", 0.035, 2600));
    sweep(t, 200, 4000, 0.8, 0.15);
  } else if (type === "laser") {
    tone(1250, t, 0.09, "square", 0.022, 4000, 420);
  } else if (type === "crack") {
    hat(t, 0.08, 0.06, 2500, sfx);
  } else if (type === "boom") {
    hat(t, 0.32, 0.4, 120, sfx);
    tone(140, t, 0.35, "sine", 0.12, 900, 38);
  } else if (type === "dash") {
    sweep(t, 600, 5000, 0.45, 0.25);
    tone(220, t, 0.4, "sawtooth", 0.05, 1500, 880);
  } else if (type === "drop") {
    [784, 988].forEach((f, i) => tone(f, t + i * 0.07, 0.15, "triangle", 0.04));
  } else if (type === "pickup") {
    [659, 880, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.05, 0.22, "square", 0.035, 5000));
  } else if (type === "powerup") {
    sweep(t, 150, 6000, 0.9, 0.3);
    [220, 330, 440, 660].forEach((f) => tone(f, t, 1.1, "sawtooth", 0.035, 2200));
  } else if (type === "meteor") {
    [880, 660, 880, 660].forEach((f, i) => tone(f, t + i * 0.12, 0.11, "square", 0.04, 3000));
  } else if (type === "destroyed") {
    [523, 784].forEach((f, i) => tone(f, t + i * 0.06, 0.18, "triangle", 0.05));
  } else if (type === "tick") {
    tone(660, t, 0.12, "square", 0.04, 2500);
  } else if (type === "go") {
    tone(880, t, 0.4, "square", 0.05, 3000);
    sweep(t, 400, 3000, 0.6, 0.12);
  } else if (type === "system" || type === "missed") {
    tone(330, t, 0.2, "sine", 0.04);
    tone(type === "missed" ? 247 : 440, t + 0.1, 0.25, "sine", 0.04);
  }
}

// Read-only diagnostics for browser tests: confirms the music loop is actually scheduled.
(globalThis as { __lastSignalAudio?: () => unknown }).__lastSignalAudio = () => ({
  context: context?.state ?? "none",
  mode,
  sequencer: Boolean(scheduler),
  musicLevel: musicBus ? Number(musicBus.gain.value.toFixed(3)) : 0,
  ...prefs,
});
