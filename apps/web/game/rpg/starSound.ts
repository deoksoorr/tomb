import { AudioHost } from "../world/audioHost";

// 별자리 잇기 합성음 (음원 파일 없이, 앱 공용 WebAudio 컨텍스트 — lib/sharedAudio. <audio>는 쓰지 않는다).
// 사냥터 효과음(sfx.ts)과 따로 둔다 (같은 효과음 갈래 = 볼륨·끄기는 audio:mix sfx 버스를 따른다).
//  - 잇기: 5음 음계 종소리, 별 순서대로 한 칸씩 올라간다. 완벽이면 한 옥타브 위 반짝이 한 겹
//  - 완성: 아르페지오 (희귀할수록 길고 높게), 도감에 처음 오르면 마지막에 반짝 꼬리
//  - 끊김: 낮게 툭 · 별똥별: 높은 음이 스르륵 내려간다

/** 한 번에 울리는 음 상한 (넘으면 새 소리를 건너뛴다 — 폰에서 가볍게) */
const MAX_TONES = 14;
const PENTA = [0, 2, 4, 7, 9];
const note = (base: number, n: number) => base * 2 ** ((PENTA[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5)) / 12);

type Tone = { at: number; f0: number; f1?: number; dur: number; gain: number; wave?: OscillatorType; pan?: number };

export class StarSfx extends AudioHost {
  private live = 0;

  constructor() {
    super("sfx");
  }

  private tones(list: Tone[]): void {
    const vol = this.busGain();
    if (vol <= 0 || this.hidden || this.live + list.length > MAX_TONES) return;
    try {
      const ac = this.audio();
      // 멈춘 컨텍스트에 걸어 두면 깨어날 때 밀린 소리가 한꺼번에 난다 → 건너뛴다
      if (!ac || ac.state !== "running") return;
      const t0 = ac.currentTime + 0.005;
      for (const t of list) {
        const at = t0 + t.at;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = t.wave ?? "sine";
        o.frequency.setValueAtTime(t.f0, at);
        if (t.f1 && t.f1 !== t.f0) o.frequency.exponentialRampToValueAtTime(t.f1, at + t.dur);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, t.gain * vol), at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + t.dur);
        let tail: AudioNode = g;
        if (t.pan && typeof ac.createStereoPanner === "function") {
          const p = ac.createStereoPanner();
          p.pan.value = t.pan;
          g.connect(p);
          tail = p;
        }
        o.connect(g);
        tail.connect(this.output);
        this.live++;
        o.onended = () => {
          this.live = Math.max(0, this.live - 1);
          try {
            o.disconnect();
            tail.disconnect();
            if (tail !== g) g.disconnect();
          } catch {
            /* 이미 뗐다 */
          }
        };
        o.start(at);
        o.stop(at + t.dur + 0.02);
      }
    } catch {
      /* 오디오를 못 쓰면 조용히 */
    }
  }

  /** 별 하나를 이었다: idx = 별자리 안 순서 */
  link(idx: number, perfect: boolean): void {
    const f = note(523.25, idx);
    const out: Tone[] = [
      { at: 0, f0: f, dur: 1.1, gain: perfect ? 0.15 : 0.11 },
      { at: 0, f0: f * 2, dur: 0.5, gain: perfect ? 0.05 : 0.025 },
    ];
    if (perfect) out.push({ at: 0.04, f0: f * 3, f1: f * 4, dur: 0.18, gain: 0.025, pan: idx % 2 ? 0.4 : -0.4 });
    this.tones(out);
  }

  /** 별자리 완성: rarity 1~5, fresh = 도감에 처음 */
  complete(rarity: number, fresh: boolean): void {
    const n = rarity >= 5 ? 6 : rarity >= 3 ? 5 : 4;
    const base = rarity >= 5 ? 587.33 : 523.25;
    const out: Tone[] = [];
    for (let i = 0; i < n; i++) out.push({ at: i * 0.075, f0: note(base, i * 2), dur: 0.9 - i * 0.05, gain: 0.1, pan: (i / (n - 1)) * 1.2 - 0.6 });
    // 바탕 화음 (낮게 깔리는 5도)
    out.push({ at: 0, f0: base / 2, dur: 1.2, gain: 0.06 }, { at: 0, f0: (base / 2) * 1.5, dur: 1.2, gain: 0.04 });
    if (fresh)
      for (let i = 0; i < 3; i++) out.push({ at: n * 0.075 + 0.08 + i * 0.06, f0: note(base * 2, 5 + i * 2), dur: 0.35, gain: 0.04, pan: i % 2 ? 0.5 : -0.5 });
    this.tones(out);
  }

  /** 끊김 */
  miss(): void {
    this.tones([{ at: 0, f0: 220, f1: 150, dur: 0.18, gain: 0.08, wave: "triangle" }]);
  }

  /** 별똥별 (아주 작게) */
  shoot(): void {
    this.tones([{ at: 0, f0: 2600, f1: 1300, dur: 0.45, gain: 0.018 }]);
  }

  destroy(): void {
    this.closeAudio();
  }
}
