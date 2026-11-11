import type { Sfx } from "../Sfx";

// 22번 마을 생물 소리 (파일 없이 WebAudio 합성). 볼륨·음소거는 월드 효과음(Sfx = UI의 audio:settings)을 따른다.
//  purr: 고양이 골골 (낮은 웅웅 + 25Hz 떨림) · meow: 야옹 · coo: 유령 "우우~" · sparkle: 고블린 반짝 · fanfare: 고블린 잡음

export type LifeSound = "purr" | "meow" | "coo" | "sparkle" | "fanfare";

export function playLife(sfx: Sfx, kind: LifeSound, gain = 1): void {
  const ac = sfx.audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  const out = ac.createGain();
  out.gain.value = Math.min(1, sfx.volume * gain);
  out.connect(ac.destination);
  const tone = (type: OscillatorType, f0: number, at: number, dur: number, peak: number, f1?: number, f2?: number) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== undefined) o.frequency.linearRampToValueAtTime(f1, at + dur * 0.4);
    if (f2 !== undefined) o.frequency.linearRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
    return { o, g };
  };
  switch (kind) {
    case "purr": {
      // 낮은 톱니파를 25Hz로 떨게 하고 저역 통과
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 52;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      const amp = ac.createGain();
      amp.gain.value = 0;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 24;
      const depth = ac.createGain();
      depth.gain.value = 0.11;
      lfo.connect(depth).connect(amp.gain);
      const env = ac.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + 0.15);
      env.gain.setValueAtTime(1, t + 1.3);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(lp).connect(amp).connect(env).connect(out);
      o.start(t);
      lfo.start(t);
      o.stop(t + 1.9);
      lfo.stop(t + 1.9);
      break;
    }
    case "meow":
      tone("triangle", 620, t, 0.42, 0.16, 980, 560);
      tone("sine", 1240, t, 0.38, 0.05, 1900, 1100);
      break;
    case "coo": {
      const { o } = tone("sine", 330, t, 0.9, 0.14, 440, 300);
      const vib = ac.createOscillator();
      vib.frequency.value = 6;
      const vd = ac.createGain();
      vd.gain.value = 9;
      vib.connect(vd).connect(o.frequency);
      vib.start(t);
      vib.stop(t + 1);
      break;
    }
    case "sparkle":
      [1568, 2093, 2637].forEach((f, i) => tone("sine", f, t + i * 0.06, 0.35, 0.06));
      break;
    case "fanfare":
      [784, 988, 1175, 1568].forEach((f, i) => tone("square", f, t + i * 0.09, i === 3 ? 0.5 : 0.16, 0.05));
      [1568, 2093, 2637, 3136].forEach((f, i) => tone("sine", f, t + 0.36 + i * 0.05, 0.4, 0.04));
      break;
  }
}
