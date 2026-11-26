import { readItem, writeItem } from "./storage";

// 11/26 설정 창 (components/overlay/SettingsDialog): 이 기기에만 저장하는 화면 설정.
//  - weather: 날씨 효과 (끄면 비·눈·안개·흐림 막·낙엽·천둥을 그리지 않는다 — 시간대 색은 그대로, 화면 위 날씨 글자에 가로줄)
//  - powerSave: 절전 모드 (가만히 있을 때 초당 20번, 비·눈은 먼 겹만, 반딧불·낙엽 줄이기, 밤 불빛 일렁임 끄기 — game/frameGovernor·Atmosphere)
// 게임(Phaser)과 화면(React)이 같은 값을 읽는다: 게임은 get()을 프레임마다(가볍다), 화면은 useSyncExternalStore로.
// 저장소를 못 쓰면(사생활 보호 모드 등) 기본값으로 동작하고 기억만 못 한다.

export type DeviceSettings = {
  weather: boolean;
  powerSave: boolean;
};

export const DEVICE_SETTINGS_KEY = "tomb.ui.deviceSettings";
/** 버벅임 안내(「절전 모드를 켜 보세요」)를 이미 보여 줬는지 — 기기마다 한 번만 */
export const STUTTER_TIP_KEY = "tomb.ui.stutterTip";

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { weather: true, powerSave: false };

/** 저장값 → 설정 (깨졌거나 없으면 기본값, 모르는 칸은 버린다) */
export function parseDeviceSettings(raw: string | null): DeviceSettings {
  if (!raw) return { ...DEFAULT_DEVICE_SETTINGS };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return { ...DEFAULT_DEVICE_SETTINGS };
    return {
      weather: typeof o.weather === "boolean" ? o.weather : DEFAULT_DEVICE_SETTINGS.weather,
      powerSave: typeof o.powerSave === "boolean" ? o.powerSave : DEFAULT_DEVICE_SETTINGS.powerSave,
    };
  } catch {
    return { ...DEFAULT_DEVICE_SETTINGS };
  }
}

class DeviceSettingsStore {
  private cur: DeviceSettings | null = null;
  private ver = 0;
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): DeviceSettings => {
    this.cur ??= parseDeviceSettings(typeof window === "undefined" ? null : readItem(DEVICE_SETTINGS_KEY));
    return this.cur;
  };

  getServerSnapshot = (): DeviceSettings => DEFAULT_DEVICE_SETTINGS;

  /** 바뀔 때마다 1씩 (게임이 프레임마다 견주어 바뀐 순간만 다시 계산한다) */
  version = (): number => this.ver;

  set(patch: Partial<DeviceSettings>): void {
    const next = { ...this.getSnapshot(), ...patch };
    this.cur = next;
    this.ver++;
    writeItem(DEVICE_SETTINGS_KEY, JSON.stringify(next));
    this.listeners.forEach((fn) => fn());
  }
}

export const deviceSettings = new DeviceSettingsStore();

/** 날씨 효과를 그리는지 */
export const weatherFxOn = (): boolean => deviceSettings.getSnapshot().weather;
/** 절전 모드인지 */
export const powerSaveOn = (): boolean => deviceSettings.getSnapshot().powerSave;
