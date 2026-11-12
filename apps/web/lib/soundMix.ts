import { bridge } from "@/game/bridge";
import { readItem, writeItem } from "./storage";
import { LS } from "./types";

// 13번 소리 따로 조절: BGM(components/bgm/engine — 따로 저장) 말고 환경음·효과음 두 갈래(버스)의 볼륨·끄기.
//  - 환경음(amb): 빗소리·천둥, 모닥불 타는 소리, 물소리(수영·잠수)
//  - 효과음(sfx): 폭죽·종·물 튀기기·말풍선, 놀거리(배·시소·트램펄린·회전목마·그네 삐걱), 낚시·채집, 마을 생물, 집 안 가구, 사냥
// 기기(localStorage)에 저장하고, 게임에는 bridge "audio:mix"(sticky)로 알린다 (AudioHost가 버스마다 읽는다).

export type SoundBus = "amb" | "sfx";
export type BusLevel = { volume: number; muted: boolean };
export type SoundMix = Record<SoundBus, BusLevel>;

export const SOUND_MIX_KEY = "tomb.ui.soundMix";
export const DEFAULT_BUS_VOLUME = 0.7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function level(raw: unknown, fallback: BusLevel): BusLevel {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const v = typeof o.volume === "number" && Number.isFinite(o.volume) ? clamp01(o.volume) : fallback.volume;
  return { volume: v, muted: o.muted === true };
}

/**
 * 저장값 → 소리 설정. 처음이면(저장값 없음) 예전처럼 BGM 볼륨·음소거를 그대로 이어받는다
 * (이전에는 모든 게임 소리가 BGM 볼륨을 따랐다 — 업데이트 뒤 갑자기 커지거나 꺼진 소리가 살아나지 않게)
 */
export function parseSoundMix(raw: string | null, legacy: { volume: string | null; muted: string | null } = { volume: null, muted: null }): SoundMix {
  const lv = legacy.volume !== null && Number.isFinite(+legacy.volume) ? clamp01(+legacy.volume) : DEFAULT_BUS_VOLUME;
  const base: BusLevel = { volume: legacy.volume === null ? DEFAULT_BUS_VOLUME : lv, muted: legacy.muted === "1" };
  if (raw) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      return { amb: level(o.amb, base), sfx: level(o.sfx, base) };
    } catch {
      // 깨진 값은 처음처럼
    }
  }
  return { amb: { ...base }, sfx: { ...base } };
}

/** 기기에 저장된 소리 설정 (게임이 bridge 값을 아직 못 받았을 때도 같은 값으로 시작한다) */
export function loadSoundMix(): SoundMix {
  return parseSoundMix(readItem(SOUND_MIX_KEY), { volume: readItem(LS.volume), muted: readItem(LS.muted) });
}

/** 버스의 실제 크기 0..1 (끄면 0) */
export function busGain(mix: SoundMix, bus: SoundBus): number {
  const b = mix[bus];
  return b.muted ? 0 : b.volume;
}

const SERVER_MIX: SoundMix = { amb: { volume: DEFAULT_BUS_VOLUME, muted: false }, sfx: { volume: DEFAULT_BUS_VOLUME, muted: false } };

/** UI 쪽 저장소 (useSyncExternalStore): 바꾸면 저장하고 게임에 알린다 */
class SoundMixStore {
  private mix: SoundMix | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** 렌더 중에도 불린다 — 부수 효과 없이 읽기만 (게임은 bridge 값이 없으면 같은 저장값을 직접 읽는다) */
  getSnapshot = (): SoundMix => {
    this.mix ??= loadSoundMix();
    return this.mix;
  };

  /** 서버 렌더용 (저장소가 없다) */
  getServerSnapshot = (): SoundMix => SERVER_MIX;

  set(bus: SoundBus, patch: Partial<BusLevel>): void {
    const cur = this.getSnapshot();
    const next = { ...cur[bus], ...patch };
    next.volume = clamp01(next.volume);
    this.mix = { ...cur, [bus]: next };
    writeItem(SOUND_MIX_KEY, JSON.stringify(this.mix));
    bridge.emit("audio:mix", this.mix);
    this.listeners.forEach((fn) => fn());
  }
}

export const soundMix = new SoundMixStore();
