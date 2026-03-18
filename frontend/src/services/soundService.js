// Sound Settings Service — manages confirmation sounds with localStorage persistence

const STORAGE_KEYS = {
  enabled: 'soundEnabled',
  choice: 'soundChoice',
  volume: 'soundVolume',
};

export const SOUND_OPTIONS = [
  // Nature
  { name: 'Droplet', category: 'Nature', description: 'Water-drop plop with gentle ripple' },
  { name: 'Birdsong', category: 'Nature', description: 'Short cheerful tweet' },
  { name: 'Thunder', category: 'Nature', description: 'Distant rolling rumble' },
  // Instrument
  { name: 'Marimba', category: 'Instrument', description: 'Warm wooden mallet tap' },
  { name: 'Harp', category: 'Instrument', description: 'Soft plucked string shimmer' },
  { name: 'Piano', category: 'Instrument', description: 'Clean major chord strike' },
  // Digital
  { name: 'Glass', category: 'Digital', description: 'Crisp crystal ding' },
  { name: 'Swoosh', category: 'Digital', description: 'Upward sweep into soft ping' },
  { name: 'Coin', category: 'Digital', description: 'Retro coin collect blip' },
  { name: 'Laser', category: 'Digital', description: 'Quick sci-fi zap pulse' },
  // Ambient
  { name: 'Chime', category: 'Ambient', description: 'Wind chime triple tone' },
  { name: 'Gong', category: 'Ambient', description: 'Deep resonant bowl ring' },
];

export const SOUND_CATEGORIES = ['Nature', 'Instrument', 'Digital', 'Ambient'];

// ── Preference getters/setters ──────────────────────────

export function getSoundEnabled() {
  const val = localStorage.getItem(STORAGE_KEYS.enabled);
  return val === null ? true : val === 'true';
}

export function setSoundEnabled(enabled) {
  localStorage.setItem(STORAGE_KEYS.enabled, String(enabled));
}

export function getSoundChoice() {
  return localStorage.getItem(STORAGE_KEYS.choice) || 'Droplet';
}

export function setSoundChoice(name) {
  localStorage.setItem(STORAGE_KEYS.choice, name);
}

export function getSoundVolume() {
  const val = localStorage.getItem(STORAGE_KEYS.volume);
  return val === null ? 75 : parseInt(val, 10);
}

export function setSoundVolume(volume) {
  localStorage.setItem(STORAGE_KEYS.volume, String(volume));
}

// ── Sound generators ────────────────────────────────────

function playDroplet(ctx, dest) {
  const t = ctx.currentTime;
  const drop = ctx.createOscillator();
  const dropGain = ctx.createGain();
  drop.type = 'sine';
  drop.frequency.setValueAtTime(1400, t);
  drop.frequency.exponentialRampToValueAtTime(300, t + 0.06);
  dropGain.gain.setValueAtTime(0.4, t);
  dropGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  drop.connect(dropGain).connect(dest);
  drop.start(t);
  drop.stop(t + 0.1);
  const ripple = ctx.createOscillator();
  const ripGain = ctx.createGain();
  ripple.type = 'sine';
  ripple.frequency.setValueAtTime(600, t + 0.04);
  ripple.frequency.exponentialRampToValueAtTime(500, t + 0.25);
  ripGain.gain.setValueAtTime(0.001, t);
  ripGain.gain.linearRampToValueAtTime(0.12, t + 0.05);
  ripGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  ripple.connect(ripGain).connect(dest);
  ripple.start(t + 0.04);
  ripple.stop(t + 0.25);
  return 350;
}

function playBirdsong(ctx, dest) {
  const t = ctx.currentTime;
  // First chirp — quick ascending trill
  const c1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  c1.type = 'sine';
  c1.frequency.setValueAtTime(1800, t);
  c1.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
  c1.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
  g1.gain.setValueAtTime(0.3, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  c1.connect(g1).connect(dest);
  c1.start(t);
  c1.stop(t + 0.1);
  // Second chirp — higher reply
  const c2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  c2.type = 'sine';
  c2.frequency.setValueAtTime(2200, t + 0.12);
  c2.frequency.exponentialRampToValueAtTime(3000, t + 0.17);
  c2.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
  g2.gain.setValueAtTime(0.25, t + 0.12);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  c2.connect(g2).connect(dest);
  c2.start(t + 0.12);
  c2.stop(t + 0.25);
  return 350;
}

function playThunder(ctx, dest) {
  const t = ctx.currentTime;
  // Low rumble via filtered noise
  const bufferSize = ctx.sampleRate * 0.6;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(150, t);
  filter.frequency.exponentialRampToValueAtTime(60, t + 0.5);
  filter.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.linearRampToValueAtTime(0.6, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  noise.connect(filter).connect(gain).connect(dest);
  noise.start(t);
  noise.stop(t + 0.6);
  // Subtle crack at the start
  const crack = ctx.createOscillator();
  const cGain = ctx.createGain();
  crack.type = 'sawtooth';
  crack.frequency.setValueAtTime(80, t);
  crack.frequency.exponentialRampToValueAtTime(30, t + 0.15);
  cGain.gain.setValueAtTime(0.2, t);
  cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  crack.connect(cGain).connect(dest);
  crack.start(t);
  crack.stop(t + 0.15);
  return 700;
}

function playMarimba(ctx, dest) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(660, t + 0.15);
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.3);
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(1760, t);
  osc2.frequency.exponentialRampToValueAtTime(1320, t + 0.1);
  gain2.gain.setValueAtTime(0.15, t);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc2.connect(gain2).connect(dest);
  osc2.start(t);
  osc2.stop(t + 0.15);
  return 400;
}

function playHarp(ctx, dest) {
  const t = ctx.currentTime;
  // Fundamental string pluck
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, t); // C5
  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.6);
  // Shimmer overtone
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1046, t); // C6
  g2.gain.setValueAtTime(0.15, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc2.connect(g2).connect(dest);
  osc2.start(t);
  osc2.stop(t + 0.4);
  // Third partial — airy
  const osc3 = ctx.createOscillator();
  const g3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(1568, t); // G6
  g3.gain.setValueAtTime(0.06, t);
  g3.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc3.connect(g3).connect(dest);
  osc3.start(t);
  osc3.stop(t + 0.3);
  return 700;
}

function playPiano(ctx, dest) {
  const t = ctx.currentTime;
  // C major chord: C4, E4, G4
  const notes = [261.6, 329.6, 392.0];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.25, t + i * 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(dest);
    osc.start(t + i * 0.015);
    osc.stop(t + 0.5);
    // Add harmonic richness
    const h = ctx.createOscillator();
    const hg = ctx.createGain();
    h.type = 'triangle';
    h.frequency.setValueAtTime(freq * 2, t);
    hg.gain.setValueAtTime(0.06, t + i * 0.015);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    h.connect(hg).connect(dest);
    h.start(t + i * 0.015);
    h.stop(t + 0.3);
  });
  return 600;
}

function playGlass(ctx, dest) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2200, t);
  osc.frequency.exponentialRampToValueAtTime(1800, t + 0.4);
  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.5);
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(3300, t);
  osc2.frequency.exponentialRampToValueAtTime(2700, t + 0.3);
  gain2.gain.setValueAtTime(0.12, t);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc2.connect(gain2).connect(dest);
  osc2.start(t);
  osc2.stop(t + 0.35);
  return 600;
}

function playSwoosh(ctx, dest) {
  const t = ctx.currentTime;
  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(200, t);
  sweep.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
  sweepGain.gain.setValueAtTime(0.15, t);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  sweep.connect(sweepGain).connect(dest);
  sweep.start(t);
  sweep.stop(t + 0.12);
  const ping = ctx.createOscillator();
  const pingGain = ctx.createGain();
  ping.type = 'sine';
  ping.frequency.setValueAtTime(1100, t + 0.06);
  ping.frequency.exponentialRampToValueAtTime(900, t + 0.3);
  pingGain.gain.setValueAtTime(0.001, t);
  pingGain.gain.linearRampToValueAtTime(0.3, t + 0.08);
  pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  ping.connect(pingGain).connect(dest);
  ping.start(t + 0.06);
  ping.stop(t + 0.3);
  return 400;
}

function playCoin(ctx, dest) {
  const t = ctx.currentTime;
  // First blip — lower
  const o1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  o1.type = 'square';
  o1.frequency.setValueAtTime(988, t); // B5
  g1.gain.setValueAtTime(0.25, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o1.connect(g1).connect(dest);
  o1.start(t);
  o1.stop(t + 0.08);
  // Second blip — higher (classic coin)
  const o2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  o2.type = 'square';
  o2.frequency.setValueAtTime(1319, t + 0.07); // E6
  g2.gain.setValueAtTime(0.25, t + 0.07);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o2.connect(g2).connect(dest);
  o2.start(t + 0.07);
  o2.stop(t + 0.22);
  return 300;
}

function playLaser(ctx, dest) {
  const t = ctx.currentTime;
  // Descending zap
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1800, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.18);
  // Bright overtone flash
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(3600, t);
  osc2.frequency.exponentialRampToValueAtTime(200, t + 0.1);
  g2.gain.setValueAtTime(0.1, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc2.connect(g2).connect(dest);
  osc2.start(t);
  osc2.stop(t + 0.1);
  return 250;
}

function playChime(ctx, dest) {
  const t = ctx.currentTime;
  // Three ascending notes like wind chimes
  const freqs = [880, 1109, 1319]; // A5, C#6, E6
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.1);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.25, t + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.35);
    osc.connect(gain).connect(dest);
    osc.start(t + i * 0.1);
    osc.stop(t + i * 0.1 + 0.35);
  });
  return 600;
}

function playGong(ctx, dest) {
  const t = ctx.currentTime;
  // Deep fundamental
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.8);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.9);
  // Mid resonance
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(220, t);
  osc2.frequency.exponentialRampToValueAtTime(200, t + 0.6);
  g2.gain.setValueAtTime(0.2, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  osc2.connect(g2).connect(dest);
  osc2.start(t);
  osc2.stop(t + 0.7);
  // Metallic shimmer
  const osc3 = ctx.createOscillator();
  const g3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(554, t);
  osc3.frequency.exponentialRampToValueAtTime(520, t + 0.4);
  g3.gain.setValueAtTime(0.08, t);
  g3.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc3.connect(g3).connect(dest);
  osc3.start(t);
  osc3.stop(t + 0.5);
  return 1000;
}

const GENERATORS = {
  Droplet: playDroplet,
  Birdsong: playBirdsong,
  Thunder: playThunder,
  Marimba: playMarimba,
  Harp: playHarp,
  Piano: playPiano,
  Glass: playGlass,
  Swoosh: playSwoosh,
  Coin: playCoin,
  Laser: playLaser,
  Chime: playChime,
  Gong: playGong,
};

// ── Public API ──────────────────────────────────────────

/** Play the user's chosen confirmation sound (respects enabled setting). */
export function playConfirmation() {
  if (!getSoundEnabled()) return;
  const choice = getSoundChoice();
  previewSound(choice);
}

/** Play a specific sound by name (ignores enabled setting — used for previews). */
export function previewSound(name) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const volume = getSoundVolume() / 100;

    // Create a master gain node for volume control
    const masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);

    const generator = GENERATORS[name] || GENERATORS.Droplet;
    const duration = generator(ctx, masterGain);
    setTimeout(() => ctx.close(), duration);
  } catch {
    // AudioContext not available
  }
}
