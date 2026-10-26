// Nhạc nền + hiệu ứng âm thanh tổng hợp trực tiếp bằng Web Audio (không dùng file nhạc → không vướng bản quyền, tải nhẹ)
// Âm giai ngũ cung Rê trưởng (D E F# A B) cho màu sắc dân gian, vòng hòa âm D – Bm – G – A.
// Phần soạn nhạc (scheduleStep, các nhạc cụ) là hàm thuần nhận AudioContext → dùng được cho cả phát trực tiếp lẫn kết xuất thử (OfflineAudioContext).

export type Mode = "lobby" | "question" | "reveal" | "ended";

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
export const BPM: Record<Mode, number> = { lobby: 108, question: 128, reveal: 108, ended: 120 };

type Bar = { root: number; chord: number[] };
const D: Bar = { root: 38, chord: [62, 66, 69] };
const Bm: Bar = { root: 35, chord: [59, 62, 66] };
const G: Bar = { root: 43, chord: [59, 62, 67] };
const A: Bar = { root: 45, chord: [61, 64, 69] };
const PROG: Record<Mode, Bar[]> = { lobby: [D, Bm, G, A], reveal: [D, Bm, G, A], question: [Bm, G, D, A], ended: [D, G, A, D] };

// Giai điệu chính (bước 16 phân, cao độ MIDI, độ dài theo bước) – 4 ô nhịp
const MELODY: [number, number, number][][] = [
  [[0, 69, 2], [2, 66, 2], [4, 69, 2], [6, 71, 2], [8, 69, 4], [12, 66, 2], [14, 64, 2]],
  [[0, 62, 2], [2, 64, 2], [4, 66, 4], [8, 64, 2], [10, 62, 2], [12, 59, 4]],
  [[0, 71, 2], [2, 69, 2], [4, 71, 2], [6, 74, 2], [8, 71, 4], [12, 69, 4]],
  [[0, 69, 2], [2, 71, 2], [4, 76, 4], [8, 74, 2], [10, 71, 2], [12, 69, 4]],
];

export type Kit = { ctx: BaseAudioContext; noise: AudioBuffer };

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// ---------- Nhạc cụ ----------
function kick({ ctx }: Kit, out: AudioNode, t: number, vol = 0.9) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, vol, 0.004, 0.28);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.32);
}
function noiseHit({ ctx, noise }: Kit, out: AudioNode, t: number, type: BiquadFilterType, freq: number, vol: number, decay: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  env(g, t, vol, 0.002, decay);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay + 0.05);
}
function snare(k: Kit, out: AudioNode, t: number, vol = 0.32) {
  noiseHit(k, out, t, "bandpass", 1900, vol, 0.16);
  const o = k.ctx.createOscillator();
  const g = k.ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(190, t);
  env(g, t, vol * 0.6, 0.002, 0.08);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.12);
}
const hat = (k: Kit, out: AudioNode, t: number, vol = 0.09, open = false) => noiseHit(k, out, t, "highpass", 7500, vol, open ? 0.22 : 0.035);

function tone(
  { ctx }: Kit,
  out: AudioNode,
  t: number,
  freq: number,
  dur: number,
  o: { type?: OscillatorType; vol?: number; cutoff?: number; attack?: number; glide?: number; vibrato?: number; detune?: number },
) {
  const osc = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = o.type ?? "triangle";
  if (o.glide) {
    // vuốt nhẹ lên nốt như tiếng đàn bầu
    osc.frequency.setValueAtTime(freq * Math.pow(2, -o.glide / 12), t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  } else osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  let lfo: OscillatorNode | null = null;
  if (o.vibrato) {
    lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = freq * o.vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t + 0.12);
    lfo.stop(t + dur + 0.2);
  }
  f.type = "lowpass";
  f.frequency.value = o.cutoff ?? 2400;
  const vol = o.vol ?? 0.1;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.01));
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.2);
}

// ---------- Soạn nhạc theo từng bước 16 phân (64 bước = 4 ô nhịp) ----------
export function scheduleStep(k: Kit, out: AudioNode, mode: Mode, step: number, t: number, tension = 0, loop = 0) {
  const spb = 60 / BPM[mode] / 4; // giây mỗi bước
  const bar = Math.floor(step / 16) % 4;
  const s = step % 16;
  const ch = PROG[mode][bar];

  if (mode === "question") {
    // căng thẳng, để mọi người suy nghĩ: trống đều, móc 16 phân, không giai điệu
    if (s % 4 === 0) kick(k, out, t, 0.75);
    if (s === 12) snare(k, out, t, 0.22);
    hat(k, out, t, s % 2 ? 0.05 + tension * 0.05 : 0.03);
    if (s % 2 === 0) tone(k, out, t, hz(ch.root), spb * 1.6, { type: "triangle", vol: 0.22, cutoff: 600 });
    const arp = [...ch.chord, ch.chord[0] + 12];
    tone(k, out, t, hz(arp[s % 4]), spb * 0.9, { type: "square", vol: 0.035, cutoff: 900 + tension * 2600, attack: 0.004 });
    return;
  }

  // lobby / reveal / ended: vui tươi, nhịp hơi nảy
  if (s === 0 || s === 7 || s === 8 || (mode === "ended" && s === 4) || (mode === "ended" && s === 12)) kick(k, out, t, 0.8);
  if (s === 4 || s === 12) snare(k, out, t, mode === "ended" ? 0.34 : 0.28);
  if (s % 2 === 0) hat(k, out, t, 0.07, s === 14);
  const bassSteps = [0, 3, 6, 8, 11, 14];
  if (bassSteps.includes(s)) tone(k, out, t, hz(ch.root + (s === 6 || s === 14 ? 12 : 0)), spb * 1.8, { type: "triangle", vol: 0.26, cutoff: 700 });
  // tiếng gảy đệm phách lệch
  if (s % 4 === 2) for (const n of ch.chord) tone(k, out, t, hz(n), spb * 1.2, { type: "sawtooth", vol: 0.018, cutoff: 1800, attack: 0.004 });
  // giai điệu: phòng chờ chơi xen kẽ 1 lượt có, 1 lượt nghỉ; bế mạc chơi cao hơn một quãng tám
  const playLead = mode === "ended" || (mode === "lobby" && loop % 2 === 0);
  if (playLead) {
    const up = mode === "ended" ? 12 : 0;
    for (const [st, n, len] of MELODY[bar]) {
      if (st === s) {
        tone(k, out, t, hz(n + up), spb * len * 0.95, { type: "square", vol: 0.055, cutoff: 2600, glide: 1.2, vibrato: 0.006 });
        tone(k, out, t, hz(n + up), spb * len * 0.95, { type: "triangle", vol: 0.06, cutoff: 3000, detune: 6 });
      }
    }
  }
}

// ---------- Hiệu ứng ----------
export type Sfx = "click" | "tick" | "tickHigh" | "stamp" | "correct" | "wrong" | "join" | "fanfare" | "revive";

export function playSfx(k: Kit, out: AudioNode, name: Sfx, t: number) {
  const { ctx } = k;
  switch (name) {
    case "click": {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(1320, t + 0.05);
      env(g, t, 0.25, 0.003, 0.07);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.1);
      break;
    }
    case "tick":
    case "tickHigh": {
      const f = name === "tick" ? 1100 : 1650;
      tone(k, out, t, f, 0.03, { type: "sine", vol: 0.35, cutoff: 6000, attack: 0.002 });
      noiseHit(k, out, t, "bandpass", f * 2, 0.12, 0.03);
      break;
    }
    case "stamp": {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      env(g, t, 0.9, 0.003, 0.38);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.45);
      noiseHit(k, out, t, "lowpass", 900, 0.5, 0.18);
      break;
    }
    case "correct":
      [74, 78, 81, 86].forEach((n, i) => tone(k, out, t + i * 0.075, hz(n), 0.16 + (i === 3 ? 0.25 : 0), { type: "square", vol: 0.09, cutoff: 3200 }));
      [86, 90].forEach((n, i) => tone(k, out, t + 0.32 + i * 0.05, hz(n + 12), 0.12, { type: "sine", vol: 0.06, cutoff: 8000 }));
      break;
    case "wrong":
      [[64, 63], [63, 62], [62, 55]].forEach(([a, b], i) => {
        const o = ctx.createOscillator();
        const fl = ctx.createBiquadFilter();
        const g = ctx.createGain();
        const t0 = t + i * 0.32;
        const len = i === 2 ? 0.7 : 0.28;
        o.type = "sawtooth";
        o.frequency.setValueAtTime(hz(a - 12), t0);
        o.frequency.linearRampToValueAtTime(hz(b - 12), t0 + len);
        fl.type = "lowpass";
        fl.frequency.setValueAtTime(400, t0);
        fl.frequency.linearRampToValueAtTime(1400, t0 + 0.1);
        fl.frequency.linearRampToValueAtTime(500, t0 + len);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + 0.05);
        o.connect(fl).connect(g).connect(out);
        o.start(t0);
        o.stop(t0 + len + 0.1);
      });
      break;
    case "join":
      tone(k, out, t, 660, 0.05, { type: "sine", vol: 0.18, cutoff: 6000, attack: 0.003 });
      tone(k, out, t + 0.05, 990, 0.07, { type: "sine", vol: 0.15, cutoff: 6000, attack: 0.003 });
      break;
    case "revive":
      for (let i = 0; i < 8; i++) tone(k, out, t + i * 0.045, hz(62 + [0, 2, 4, 7, 9, 12, 14, 16][i]), 0.09, { type: "triangle", vol: 0.1, cutoff: 5000, attack: 0.003 });
      break;
    case "fanfare": {
      const chords = [[62, 66, 69], [62, 67, 71], [64, 69, 73], [62, 66, 69, 74]];
      const times = [0, 0.18, 0.36, 0.6];
      chords.forEach((c, i) =>
        c.forEach((n) => tone(k, out, t + times[i], hz(n), i === 3 ? 1.1 : 0.14, { type: "sawtooth", vol: 0.05, cutoff: 2200, attack: 0.02, vibrato: i === 3 ? 0.008 : 0 })),
      );
      kick(k, out, t + 0.6, 0.8);
      noiseHit(k, out, t + 0.6, "highpass", 5000, 0.2, 0.8);
      break;
    }
  }
}

// ---------- Bộ phát trực tiếp (trình duyệt) ----------
export class SoundEngine {
  ctx: AudioContext | null = null;
  private kit: Kit | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private loop = 0;
  private nextTime = 0;
  mode: Mode = "lobby";
  tension = 0;
  musicOn = false;
  sfxOn = true;

  // Trình duyệt chỉ cho phát tiếng sau một lần chạm/bấm → gọi trong sự kiện của người dùng
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      const master = this.ctx.createGain();
      master.gain.value = 0.8;
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.45;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.musicBus.connect(comp);
      this.sfxBus.connect(comp);
      comp.connect(master).connect(this.ctx.destination);
      this.kit = { ctx: this.ctx, noise: makeNoise(this.ctx) };
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.musicOn) this.start();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (on && this.ctx) this.start();
    if (!on) this.stop();
  }

  setMode(m: Mode) {
    this.mode = m;
  }

  private start() {
    if (!this.ctx || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.pump(), 25);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private pump() {
    if (!this.ctx || !this.kit || !this.musicBus) return;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      scheduleStep(this.kit, this.musicBus, this.mode, this.step, this.nextTime, this.tension, this.loop);
      this.nextTime += 60 / BPM[this.mode] / 4;
      this.step = (this.step + 1) % 64;
      if (this.step === 0) this.loop++;
    }
  }

  sfx(name: Sfx) {
    if (!this.sfxOn || !this.ctx || !this.kit || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime + 0.01;
    if (name === "stamp" || name === "fanfare" || name === "wrong" || name === "correct") {
      // hạ nhỏ nhạc nền một chút cho hiệu ứng nổi lên
      const g = this.musicBus.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.18, t + 0.05);
      g.linearRampToValueAtTime(0.45, t + 1.6);
    }
    playSfx(this.kit, this.sfxBus, name, t);
  }
}

let engine: SoundEngine | null = null;
export function getSound(): SoundEngine {
  if (!engine) engine = new SoundEngine();
  return engine;
}
