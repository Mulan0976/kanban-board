/**
 * Sound effects using the Web Audio API. No external audio files required.
 * All functions are safe to call in any environment -- they silently fail
 * if AudioContext is unavailable.
 */

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    return new Ctx();
  } catch {
    return null;
  }
}

/**
 * Short pop sound -- good for drag-and-drop, adding items, clicking.
 */
export function playPop(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);

    osc.onended = () => {
      ctx.close();
    };
  } catch {
    // Silently ignore
  }
}

/**
 * Ascending two-tone sound -- good for success confirmations, saves.
 */
export function playSuccess(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
    const duration = 0.12;

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      const startTime = ctx.currentTime + i * duration;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);

      if (i === frequencies.length - 1) {
        osc.onended = () => {
          ctx.close();
        };
      }
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Descending tone -- good for delete actions, removals.
 */
export function playDelete(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);

    osc.onended = () => {
      ctx.close();
    };
  } catch {
    // Silently ignore
  }
}

/**
 * Victory jingle -- good for completing all checkpoints, finishing a task.
 * Plays a short ascending arpeggio with a final sustained note.
 */
export function playComplete(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const noteLength = 0.1;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      const startTime = ctx.currentTime + i * noteLength;
      const isLast = i === notes.length - 1;
      const thisDuration = isLast ? 0.35 : noteLength;

      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(isLast ? 0.3 : 0.2, startTime + 0.02);
      gain.gain.setValueAtTime(isLast ? 0.3 : 0.2, startTime + thisDuration * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + thisDuration);

      osc.start(startTime);
      osc.stop(startTime + thisDuration);

      if (isLast) {
        osc.onended = () => {
          ctx.close();
        };
      }
    });
  } catch {
    // Silently ignore
  }
}
