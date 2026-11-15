import { bridge } from "@/game/bridge";
import { audioLife } from "@/lib/audioLife";
import { sharedAudioContext } from "@/lib/sharedAudio";
import { busGain, loadSoundMix } from "@/lib/soundMix";

// 11/15 강화 창 소리 (파일 없이 WebAudio 합성). 효과음 갈래(sfx 버스) 볼륨·끄기를 따른다.
//  - charge: 북 연타 + 심장 박동 (높은 강화일수록 길게)   - slam: 결재 도장 쾅
//  - success: 올라가는 차임 (높을수록 음이 많고 밝다, +15는 팡파르)   - fail: 낮은 "뚱"
//  - drop: 내려가는 슬픈 세 음   - shield: 파란 방패 "핑"

export type EnhanceSound = "charge" | "slam" | "success" | "fail" | "drop" | "shield";

function ctxAndGain(): { ac: AudioContext; vol: number } | null {
  const vol = busGain(bridge.last("audio:mix") ?? loadSoundMix(), "sfx");
  if (vol <= 0 || audioLife.hidden) return null;
  const ac = sharedAudioContext();
  if (!ac) return null;
  if (ac.state !== "running") void ac.resume().catch(() => undefined);
  return { ac, vol };
}

function tone(ac: AudioContext, out: AudioNode, f0: number, t: number, dur: number, peak: number, type: OscillatorType = "sine", f1?: number): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(ac: AudioContext, out: AudioNode, t: number, dur: number, peak: number, lp = 1200): void {
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = ac.createGain();
  g.gain.value = peak;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

/** level = 목표 강화 (소리 크기·길이), ms = 기다림 길이 (charge) */
export function playEnhance(name: EnhanceSound, level = 1, ms = 600): void {
  const c = ctxAndGain();
  if (!c) return;
  const { ac, vol } = c;
  const out = ac.createGain();
  out.gain.value = Math.min(1, vol) * 0.8;
  out.connect(ac.destination);
  const t = ac.currentTime + 0.01;
  switch (name) {
    case "charge": {
      // 북 연타가 점점 빨라지고, 높은 강화는 심장 박동이 깔린다
      const n = Math.max(4, Math.round(ms / 70));
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const at = t + (ms / 1000) * (1 - (1 - k) ** 1.6);
        tone(ac, out, 90 + 60 * k, at, 0.08, 0.18 + 0.25 * k, "triangle", 50);
        noise(ac, out, at, 0.04, 0.05 + 0.08 * k, 900);
      }
      if (level >= 11) for (let b = 0; b < ms / 520; b++) tone(ac, out, 55, t + b * 0.52, 0.18, 0.35, "sine", 40);
      break;
    }
    case "slam":
      tone(ac, out, 160, t, 0.25, 0.7, "sine", 45);
      noise(ac, out, t, 0.18, 0.5, 2200);
      break;
    case "success": {
      // 도·미·솔·도 … 높을수록 음이 많고 위로
      const steps = [0, 4, 7, 12, 16, 19, 24];
      const n = Math.min(steps.length, 3 + Math.floor(level / 4));
      const base = 523.25 * (level >= 13 ? 1.12 : 1);
      steps.slice(0, n).forEach((s, i) => {
        tone(ac, out, base * 2 ** (s / 12), t + i * 0.08, 0.5, 0.32, "triangle");
        tone(ac, out, base * 2 ** (s / 12 + 1), t + i * 0.08, 0.35, 0.08, "sine");
      });
      if (level >= 15) {
        // 팡파르: 화음 세 번
        for (const [i, chord] of [
          [0, 4, 7],
          [5, 9, 12],
          [7, 11, 14, 19],
        ].entries())
          for (const s of chord) tone(ac, out, 392 * 2 ** (s / 12), t + 0.6 + i * 0.22, i === 2 ? 1.4 : 0.3, 0.2, "sawtooth");
        noise(ac, out, t + 1.04, 1.2, 0.08, 6000);
      }
      break;
    }
    case "fail":
      tone(ac, out, 110, t, 0.45, 0.6, "sine", 70);
      tone(ac, out, 220, t, 0.15, 0.1, "square", 120);
      break;
    case "drop":
      [392, 349.23, 293.66].forEach((f, i) => tone(ac, out, f, t + 0.12 + i * 0.22, 0.4, 0.25, "triangle", f * 0.94));
      noise(ac, out, t, 0.25, 0.25, 3000);
      break;
    case "shield":
      tone(ac, out, 880, t, 0.5, 0.3, "sine", 1320);
      tone(ac, out, 1320, t + 0.06, 0.4, 0.15, "sine");
      break;
  }
  setTimeout(() => out.disconnect(), 4000);
}
