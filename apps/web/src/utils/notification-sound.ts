// Notification bell using Web Audio API — zero external files needed.
// Produces a clean two-tone chime (C6 → E6) that's pleasant but unmistakable.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playBellSound(volume = 0.5): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.value = Math.max(0, Math.min(1, volume));
    masterGain.connect(ctx.destination);

    // First tone: C6 (1047 Hz) — bright ping
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 1047;
    gain1.gain.setValueAtTime(0.6, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // Second tone: E6 (1319 Hz) — uplifting resolution, slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1319;
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.5, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);

    // Subtle harmonic overtone for richness
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.value = 2094; // C7 octave above
    gain3.gain.setValueAtTime(0.15, now);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc3.connect(gain3);
    gain3.connect(masterGain);
    osc3.start(now);
    osc3.stop(now + 0.3);

    // Cleanup: disconnect nodes after sound completes
    setTimeout(() => {
      osc1.disconnect();
      osc2.disconnect();
      osc3.disconnect();
      gain1.disconnect();
      gain2.disconnect();
      gain3.disconnect();
      masterGain.disconnect();
    }, 600);
  } catch {
    // Audio not available (SSR, restricted context, etc.) — fail silently
  }
}
