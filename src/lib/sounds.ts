// Web Audio API synthesized sound effects — no external files needed.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.15, detune = 0) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

/** Short rising "ding-ding" for XP/feed events */
export function sfxXp() {
  playTone(880, 0.12, 'sine', 0.08);
  setTimeout(() => playTone(1320, 0.1, 'sine', 0.06), 80);
}

/** Ascending triad for level-up */
export function sfxLevelUp() {
  playTone(523, 0.18, 'triangle', 0.12);
  setTimeout(() => playTone(659, 0.18, 'triangle', 0.12), 120);
  setTimeout(() => playTone(784, 0.25, 'triangle', 0.14), 240);
  setTimeout(() => playTone(1047, 0.35, 'triangle', 0.10), 380);
}

/** Rank overtaken — quick whoosh + high ping */
export function sfxOvertaken() {
  playTone(440, 0.08, 'sawtooth', 0.06);
  setTimeout(() => playTone(880, 0.15, 'sine', 0.10), 60);
}

/** Achievement unlock — rarity-scaled cinematic */
export function sfxAchievement(rarity: 'common' | 'rare' | 'legendary') {
  if (rarity === 'common') {
    playTone(660, 0.2, 'triangle', 0.10);
    setTimeout(() => playTone(880, 0.25, 'triangle', 0.12), 150);
    setTimeout(() => playTone(1100, 0.3, 'sine', 0.10), 300);
  } else if (rarity === 'rare') {
    playTone(523, 0.2, 'triangle', 0.12);
    setTimeout(() => playTone(659, 0.2, 'triangle', 0.12), 120);
    setTimeout(() => playTone(784, 0.2, 'triangle', 0.12), 240);
    setTimeout(() => playTone(1047, 0.35, 'sine', 0.14), 380);
    setTimeout(() => playTone(1319, 0.4, 'sine', 0.10), 520);
  } else {
    // Legendary: dramatic chord + shimmer
    playTone(262, 0.4, 'triangle', 0.14);
    playTone(330, 0.4, 'triangle', 0.10);
    setTimeout(() => {
      playTone(392, 0.35, 'triangle', 0.12);
      playTone(523, 0.35, 'sine', 0.10);
    }, 200);
    setTimeout(() => {
      playTone(659, 0.3, 'sine', 0.14);
      playTone(784, 0.3, 'sine', 0.10);
    }, 400);
    setTimeout(() => {
      playTone(1047, 0.5, 'sine', 0.15);
      playTone(1319, 0.5, 'sine', 0.08, 10);
    }, 600);
    setTimeout(() => playTone(1568, 0.6, 'sine', 0.10, 5), 800);
  }
}

/** Boss victory — triumphant fanfare */
export function sfxBossVictory() {
  playTone(392, 0.2, 'triangle', 0.14);
  setTimeout(() => playTone(523, 0.2, 'triangle', 0.14), 150);
  setTimeout(() => playTone(659, 0.2, 'triangle', 0.14), 300);
  setTimeout(() => {
    playTone(784, 0.35, 'sine', 0.14);
    playTone(523, 0.35, 'triangle', 0.08);
  }, 450);
  setTimeout(() => {
    playTone(1047, 0.5, 'sine', 0.12);
    playTone(659, 0.5, 'triangle', 0.06);
  }, 650);
}
