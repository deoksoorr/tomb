import { bridge } from "@/game/bridge";
import { audioLife } from "./audioLife";
import { releaseOnEnd, sharedAudioContext } from "./sharedAudio";
import { busGain, loadSoundMix } from "./soundMix";
import { readItem, writeItem } from "./storage";

// 채팅 알림음: 다른 사람이 채팅하면 아주 작은 "톡" 한 번.
//  - 소리는 공용 오디오 컨텍스트에서 바로 합성한다 (<audio>를 쓰면 아이폰 다이내믹 아일랜드가 깜빡인다 — lib/sharedAudio 참고)
//  - 효과음 갈래(soundMix "sfx") 볼륨·끄기를 따른다
//  - 내 글, 입장 때 받는 지난 5분 기록(chat:log), 이미 받은 줄, 채팅창이 숨은 장면에서는 울리지 않는다
//  - 연달아 오면 0.6초 안에는 한 번만
//  - 켜기/끄기는 소리 설정 창에서 (기기에 저장, 기본 켜짐)

export const CHAT_CHIME_KEY = "tomb.ui.chatChime";
/** 이 간격 안에 다시 오면 울리지 않는다 (몰아치기 방지) */
export const CHAT_CHIME_GAP_MS = 600;

/** 저장값 → 켜짐 여부 (없거나 모르는 값이면 켜짐) */
export function parseChatChime(raw: string | null): boolean {
  return raw !== "0";
}

export type ChatChimeLine = {
  /** 내가 보낸 글 */
  mine: boolean;
  /** 채팅창에 새로 들어간 줄인지 (지난 기록으로 이미 받은 줄이면 false) */
  added: boolean;
  /** 채팅창이 보이는 장면인지 */
  shown: boolean;
  /** 설정에서 켜져 있는지 */
  enabled: boolean;
};

/** 실시간으로 새로 온 다른 사람 채팅에만, 마지막 알림음에서 gap 이상 지났을 때만 play를 부른다. 울렸으면 true */
export function createChatChimer(play: () => void, gapMs = CHAT_CHIME_GAP_MS) {
  let lastAt = -Infinity;
  return (line: ChatChimeLine, now: number): boolean => {
    if (line.mine || !line.added || !line.shown || !line.enabled) return false;
    if (now - lastAt < gapMs) return false;
    lastAt = now;
    play();
    return true;
  };
}

/** 짧고 부드러운 높은 "톡" (약 0.08초). 효과음 갈래 볼륨을 따른다 */
export function playChatChime(): void {
  const vol = busGain(bridge.last("audio:mix") ?? loadSoundMix(), "sfx");
  if (vol <= 0 || audioLife.hidden) return;
  const ac = sharedAudioContext();
  // 멈춘 컨텍스트에 걸어 두면 깨어날 때 밀린 소리가 한꺼번에 난다 → 건너뛴다
  if (!ac || ac.state !== "running") return;
  try {
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    // 높게 시작해 살짝 내려가며 "톡"
    o.frequency.setValueAtTime(1500, t0);
    o.frequency.exponentialRampToValueAtTime(1050, t0 + 0.06);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.09 * vol), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + 0.09);
    releaseOnEnd(o, g);
  } catch {
    // 오디오를 못 쓰면 조용히
  }
}

/** 설정 저장소 (useSyncExternalStore) */
class ChatChimeStore {
  private on: boolean | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): boolean => {
    this.on ??= parseChatChime(readItem(CHAT_CHIME_KEY));
    return this.on;
  };

  /** 서버 렌더용 (기본 켜짐) */
  getServerSnapshot = (): boolean => true;

  set(on: boolean): void {
    this.on = on;
    writeItem(CHAT_CHIME_KEY, on ? "1" : "0");
    this.listeners.forEach((fn) => fn());
  }
}

export const chatChime = new ChatChimeStore();

/** 앱에서 쓰는 알림음 판정기 (채팅창이 줄을 받을 때 부른다) */
export const chimeForChat = createChatChimer(playChatChime);
