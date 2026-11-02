let context: AudioContext | undefined;
let enabled = false;
export function setSound(value: boolean) {
  enabled = value;
  if (value) {
    context ??= new AudioContext();
    void context.resume();
  }
}
export function playSound(type: string) {
  if (!enabled || !context || context.state !== "running") return;
  const ctx = context;
  const now = ctx.currentTime;
  const notes =
    type === "rescue" || type === "sync"
      ? [440, 554, 659, 880]
      : type === "hit"
        ? [120, 60]
        : type === "blocked"
          ? [250, 500]
          : type === "system"
            ? [330, 440]
            : [600];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === "hit" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(f, now + i * 0.09);
    gain.gain.setValueAtTime(0, now + i * 0.09);
    gain.gain.linearRampToValueAtTime(
      type === "command" ? 0.015 : 0.055,
      now + i * 0.09 + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.23);
  });
}
