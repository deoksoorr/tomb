import { bridge } from "@/game/bridge";
import { audioLife } from "./audioLife";
import { releaseOnEnd, sharedAudioContext } from "./sharedAudio";
import { busGain, loadSoundMix } from "./soundMix";

// 새 칭호 알림음: 짧은 반짝 세 음 (공용 오디오 컨텍스트에서 바로 합성 — lib/chatChime과 같은 방식). 효과음 갈래 볼륨·끄기를 따른다
export function playTitleChime(): void {
  const vol = busGain(bridge.last("audio:mix") ?? loadSoundMix(), "sfx");
  if (vol <= 0 || audioLife.hidden) return;
  const ac = sharedAudioContext();
  if (!ac || ac.state !== "running") return;
  try {
    const t0 = ac.currentTime;
    // 도·미·솔 위로 반짝 (높은 음역, 아주 짧게)
    [1046.5, 1318.5, 1568].forEach((f, i) => {
      const t = t0 + i * 0.07;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.07 * vol), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.24);
      releaseOnEnd(o, g);
    });
  } catch {
    // 오디오를 못 쓰면 조용히
  }
}
