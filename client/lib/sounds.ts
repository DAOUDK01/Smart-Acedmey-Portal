"use client";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

export function playToastSound(kind: "success" | "error" | "info") {
  const context = getContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    if (kind === "success") {
      tone(context, 659.25, now, 0.26, 0.05);
      tone(context, 880, now + 0.09, 0.32, 0.05);
    } else if (kind === "error") {
      tone(context, 329.63, now, 0.2, 0.045);
      tone(context, 246.94, now + 0.12, 0.3, 0.045);
    } else {
      tone(context, 523.25, now, 0.16, 0.045);
    }
  } catch {
    // Audio is best-effort; never let it break the UI.
  }
}