// Web Audio API synthesized sound effects — no external files needed.

let ctx: AudioContext | null = null;
let input: AudioNode | null = null;
// Loud enough for a TV across a room; a compressor keeps stacked cues from clipping.
// Override with ?volume=0.5 (quieter) up to ?volume=3 (louder).
const volumeParam = Number(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('volume'));
const MASTER_VOLUME = Number.isFinite(volumeParam) && volumeParam > 0 ? Math.min(3, volumeParam) : 1;
const TONE_BOOST = 3.2;
let enabled = false;
const listeners = new Set<() => void>();

// ── Custom clips ──────────────────────────────────
// Files served from the server's data/sounds folder (see /api/sounds) replace
// the synthesized cue with the same name. Anything missing stays synthesized.
const clips: Record<string, AudioBuffer> = {};
let clipsRequested = false;
async function loadClips() {
  if (clipsRequested) return;
  clipsRequested = true;
  try {
    const urls = await (await fetch('/api/sounds')).json() as Record<string, string>;
    const c = getCtx();
    await Promise.all(Object.entries(urls).map(async ([name, url]) => {
      try { clips[name] = await c.decodeAudioData(await (await fetch(url)).arrayBuffer()); }
      catch { /* unreadable file: keep the synthesized cue */ }
    }));
  } catch { clipsRequested = false; }
}

/** Plays the first available clip by name; false when none is loaded. */
function playClip(...names: string[]): boolean {
  if (!enabled) return false;
  const name = names.find(n => clips[n]);
  if (!name) return false;
  let c: AudioContext;
  try { c = getCtx(); } catch { return false; }
  if (c.state === 'suspended') c.resume().catch(() => {});
  const src = c.createBufferSource();
  src.buffer = clips[name];
  src.connect(out(c));
  src.start();
  return true;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  // Create the context up front so a browser block is visible straight away.
  if (value) { try { getCtx(); loadClips(); } catch { /* audio unsupported */ } }
  listeners.forEach(fn => fn());
}

/** Resume audio; must run inside a user gesture (click, key, touch) to satisfy autoplay rules. */
export function unlockAudio() { try { getCtx().resume().then(() => listeners.forEach(fn => fn())).catch(() => {}); } catch { /* audio unsupported */ } }

/** True when sound is switched on but the browser is holding audio until someone interacts with the page. */
export function isAudioBlocked() { return enabled && !!ctx && ctx.state !== 'running'; }
export function onAudioState(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.knee.value = 10; compressor.ratio.value = 6;
    compressor.attack.value = 0.003; compressor.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    compressor.connect(master).connect(ctx.destination);
    input = compressor;
    ctx.onstatechange = () => listeners.forEach(fn => fn());
  }
  return ctx;
}
const out = (c: AudioContext) => input || c.destination;

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.15, detune = 0) {
  if (!enabled) return;
  let c: AudioContext;
  try { c = getCtx(); } catch { return; }
  if (c.state === 'suspended') c.resume().catch(() => {});
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(vol * TONE_BOOST, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(out(c));
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

export function playEventSound(type: string) {
  if (!enabled) return;
  switch (type) {
    case 'commit': sfxCommit(); break;
    case 'pr-merged': sfxPRMerged(); break;
    case 'review': sfxReview(); break;
    case 'issue': sfxIssueClosed(); break;
    case 'level-up': sfxLevelUp(); break;
    case 'overtaken': sfxOvertaken(); break;
    case 'achievement': sfxAchievement('rare'); break;
    case 'boss-victory': sfxBossVictory(); break;
    case 'tier-up': sfxUltReady(); break;
    case 'first-blood': sfxFirstBlood(); break;
    case 'ace': sfxAce(); break;
    case 'interstitial': sfxRoundStart(); break;
    case 'spike': sfxSpike(); break;
    case 'spike-planted': sfxSpike(); break;
    case 'spike-defused': sfxDefuse(); break;
    default: sfxXp();
  }
}

/** Short rising "ding-ding" for XP/feed events */
export function sfxXp() {
  playTone(880, 0.12, 'sine', 0.08);
  setTimeout(() => playTone(1320, 0.1, 'sine', 0.06), 80);
}

/** Commit push — soft mechanical click */
export function sfxCommit() {
  if (playClip('commit')) return;
  playTone(600, 0.08, 'square', 0.04);
  setTimeout(() => playTone(900, 0.06, 'sine', 0.05), 50);
}

/** PR opened — ascending sweep */
export function sfxPROpened() {
  playTone(440, 0.15, 'triangle', 0.08);
  setTimeout(() => playTone(660, 0.12, 'triangle', 0.08), 100);
  setTimeout(() => playTone(880, 0.15, 'sine', 0.06), 200);
}

/** PR merged — satisfying chord resolve */
export function sfxPRMerged() {
  if (playClip('merge')) return;
  playTone(523, 0.2, 'triangle', 0.10);
  playTone(659, 0.2, 'triangle', 0.08);
  setTimeout(() => {
    playTone(784, 0.25, 'sine', 0.10);
    playTone(1047, 0.25, 'sine', 0.06);
  }, 150);
}

/** Issue closed — quick victory ping */
export function sfxIssueClosed() {
  playTone(784, 0.10, 'sine', 0.08);
  setTimeout(() => playTone(1047, 0.15, 'sine', 0.07), 80);
}

/** Review submitted — double tap */
export function sfxReview() {
  if (playClip('review')) return;
  playTone(700, 0.08, 'triangle', 0.06);
  setTimeout(() => playTone(1000, 0.08, 'triangle', 0.06), 100);
}

/** Streak bonus — fire crackle */
export function sfxStreak() {
  playTone(200, 0.05, 'sawtooth', 0.04);
  setTimeout(() => playTone(400, 0.08, 'sawtooth', 0.06), 40);
  setTimeout(() => playTone(800, 0.12, 'triangle', 0.08), 80);
  setTimeout(() => playTone(1200, 0.15, 'sine', 0.06), 140);
}

/** Ascending triad for level-up */
export function sfxLevelUp() {
  if (playClip('level-up')) return;
  playTone(523, 0.18, 'triangle', 0.12);
  setTimeout(() => playTone(659, 0.18, 'triangle', 0.12), 120);
  setTimeout(() => playTone(784, 0.25, 'triangle', 0.14), 240);
  setTimeout(() => playTone(1047, 0.35, 'triangle', 0.10), 380);
}

/** Rank overtaken — quick whoosh + high ping */
export function sfxOvertaken() {
  if (playClip('rank-up')) return;
  playTone(440, 0.08, 'sawtooth', 0.06);
  setTimeout(() => playTone(880, 0.15, 'sine', 0.10), 60);
}

/** Achievement unlock — rarity-scaled cinematic */
export function sfxAchievement(rarity: 'common' | 'rare' | 'legendary') {
  if (playClip(`achievement-${rarity}`, 'achievement')) return;
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
  if (playClip('victory')) return;
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

/** First blood — low hit then a sharp sting */
export function sfxFirstBlood() {
  if (playClip('first-blood')) return;
  playTone(110, 0.3, 'sawtooth', 0.12);
  setTimeout(() => playTone(988, 0.12, 'square', 0.07), 90);
  setTimeout(() => playTone(1319, 0.35, 'sine', 0.10), 180);
}

/** Ace — five quick rising hits, then a chord */
export function sfxAce() {
  if (playClip('ace')) return;
  [523, 587, 659, 784, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'square', 0.06), i * 85));
  setTimeout(() => { playTone(1047, 0.6, 'sine', 0.14); playTone(1319, 0.6, 'sine', 0.08); playTone(784, 0.6, 'triangle', 0.08); }, 480);
}

/** Soft sweep for screen takeovers */
export function sfxSweep() {
  [330, 440, 587].forEach((f, i) => setTimeout(() => playTone(f, 0.22, 'sine', 0.05), i * 60));
}

/** Filtered noise burst, used for impacts and whooshes. */
function playNoise(duration: number, vol: number, from: number, to: number) {
  if (!enabled) return;
  let c: AudioContext;
  try { c = getCtx(); } catch { return; }
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
  src.buffer = buffer; filter.type = 'bandpass'; filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);
  gain.gain.setValueAtTime(vol * TONE_BOOST, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.connect(filter).connect(gain).connect(out(c));
  src.start();
}

/**
 * Tactical-shooter style kill confirm: a crisp ping that climbs with each
 * play in a streak (1..5), stacking extra pings like a multi-kill banner.
 */
export function sfxKill(streak: number) {
  if (playClip(`kill-${Math.max(1, Math.min(5, streak))}`, 'kill')) return;
  const n = Math.max(1, Math.min(5, streak));
  const base = [880, 988, 1109, 1245, 1397][n - 1];
  playNoise(0.07, 0.10, 3000, 1200);
  for (let i = 0; i < n; i++) setTimeout(() => { playTone(base + i * 60, 0.09, 'square', 0.045); playTone((base + i * 60) * 2, 0.07, 'sine', 0.03); }, 40 + i * 70);
}

/** "Ultimate ready": a rising charged shimmer that lands on a bright chord. */
export function sfxUltReady() {
  if (playClip('ult-ready')) return;
  playNoise(0.7, 0.05, 400, 5000);
  [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.16, 'triangle', 0.07), i * 90));
  setTimeout(() => { playTone(1047, 0.8, 'sine', 0.12); playTone(1568, 0.8, 'sine', 0.06, 8); playTone(523, 0.8, 'triangle', 0.07); }, 470);
}

/** Round start: low two-tone horn over a whoosh. */
export function sfxRoundStart() {
  if (playClip('round-start')) return;
  playNoise(0.5, 0.06, 300, 2400);
  playTone(196, 0.35, 'sawtooth', 0.05);
  setTimeout(() => playTone(294, 0.5, 'sawtooth', 0.05), 260);
}

/** Planted-device beeps that speed up, then a sharp chirp. */
export function sfxSpike() {
  if (playClip('spike-plant')) return;
  let t = 0, gap = 420;
  for (let i = 0; i < 7; i++) { setTimeout(() => playTone(1760, 0.07, 'square', 0.04), t); t += gap; gap *= 0.72; }
  setTimeout(() => playTone(2349, 0.25, 'sine', 0.06), t + 60);
}

/** Defuse: a descending disarm trill, then a relieved chime. */
export function sfxDefuse() {
  if (playClip('spike-defused')) return;
  [1760, 1568, 1397, 1175].forEach((f, i) => setTimeout(() => playTone(f, 0.06, 'square', 0.035), i * 55));
  setTimeout(() => { playTone(784, 0.5, 'sine', 0.1); playTone(1175, 0.5, 'sine', 0.06); }, 300);
}
