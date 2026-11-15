import { bridge } from "@/game/bridge";
import { audioLife } from "@/lib/audioLife";
import { releaseOnEnd, sharedAudioContext } from "@/lib/sharedAudio";
import { busGain, loadSoundMix } from "@/lib/soundMix";

// 11/15 「수집가의 뒷주머니」 여는 소리 (공용 오디오 컨텍스트에서 바로 합성 — lib/titleChime과 같은 방식). 효과음 갈래 볼륨·끄기를 따른다
//  - rustle: 흔들 때 부스럭 (짧은 잡음 세 번)
//  - pop: 펑 (낮은 음이 툭 떨어지고 높은 반짝 두 음)

function ctx(): { ac: AudioContext; vol: number } | null {
  const vol = busGain(bridge.last("audio:mix") ?? loadSoundMix(), "sfx");
  if (vol <= 0 || audioLife.hidden) return null;
  const ac = sharedAudioContext();
  if (!ac || ac.state !== "running") return null;
  return { ac, vol };
}

export function playPocketRustle(): void {
  const c = ctx();
  if (!c) return;
  const { ac, vol } = c;
  try {
    const len = Math.floor(ac.sampleRate * 0.08);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    for (let k = 0; k < 3; k++) {
      const t = ac.currentTime + k * 0.22;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800 + k * 300;
      const g = ac.createGain();
      g.gain.value = 0.12 * vol;
      src.connect(f).connect(g).connect(ac.destination);
      src.start(t);
      releaseOnEnd(src, f, g);
    }
  } catch {
    // 오디오를 못 쓰면 조용히
  }
}

export function playPocketPop(): void {
  const c = ctx();
  if (!c) return;
  const { ac, vol } = c;
  try {
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(320, t0);
    o.frequency.exponentialRampToValueAtTime(90, t0 + 0.14);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.22 * vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + 0.2);
    releaseOnEnd(o, g);
    [1318.5, 1760].forEach((f, i) => {
      const t = t0 + 0.08 + i * 0.08;
      const s = ac.createOscillator();
      const sg = ac.createGain();
      s.type = "triangle";
      s.frequency.setValueAtTime(f, t);
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.07 * vol), t + 0.01);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      s.connect(sg).connect(ac.destination);
      s.start(t);
      s.stop(t + 0.27);
      releaseOnEnd(s, sg);
    });
  } catch {
    // 오디오를 못 쓰면 조용히
  }
}
