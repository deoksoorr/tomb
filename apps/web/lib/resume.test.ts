import { describe, expect, it } from "vitest";
import { MAP_VERSION, SPAWN } from "@tomb/protocol";
import { parseResume, RESUME_KEY, RESUME_MAX_AGE_MS, saveResume, setResumeExtras, takeResume, type ResumeState } from "./resume";

const base: Omit<ResumeState, "bgm"> = {
  channel: 2,
  x: 340,
  y: 352,
  seatId: "kWn-0",
  pose: "sitChair",
  dir: 0,
  savedAt: 1_000_000,
  name: "모닥불",
  color: "#e8d9b0",
  body: "cat",
  map: MAP_VERSION,
};

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("resume (새로고침 뒤 자리 복원 기록)", () => {
  it("저장한 것을 그대로 읽는다 (음악 여부는 UI가 덧붙인다)", () => {
    const st = memStore();
    setResumeExtras(() => ({ bgm: true }));
    saveResume(base, st);
    setResumeExtras(() => ({}));
    expect(takeResume(base.savedAt + 2_000, st)).toEqual({ ...base, bgm: true });
  });

  it("읽자마자 지운다 → 복제한 탭·두 번째 읽기는 아무것도 못 받는다", () => {
    const st = memStore();
    saveResume(base, st);
    expect(takeResume(base.savedAt + 1, st)).not.toBeNull();
    expect(st.m.has(RESUME_KEY)).toBe(false);
    expect(takeResume(base.savedAt + 2, st)).toBeNull();
  });

  it("1분이 지난 기록은 버린다 (지우기는 한다)", () => {
    const st = memStore();
    saveResume(base, st);
    expect(takeResume(base.savedAt + RESUME_MAX_AGE_MS + 1, st)).toBeNull();
    expect(st.m.has(RESUME_KEY)).toBe(false);
    expect(parseResume(JSON.stringify(base), base.savedAt + RESUME_MAX_AGE_MS)).not.toBeNull();
  });

  it("맵 개편 전(맵 버전이 없거나 다름)에 남긴 기록: 채널·입장 정보는 잇고 자리는 입구에서, 서 있기로", () => {
    const old = { ...base, map: undefined };
    const r = parseResume(JSON.stringify(old), base.savedAt);
    expect(r).toMatchObject({ channel: 2, name: "모닥불", x: SPAWN.x, y: SPAWN.y, pose: "idle", seatId: null, map: MAP_VERSION });
    expect(parseResume(JSON.stringify({ ...base, map: MAP_VERSION - 1 }), base.savedAt)).toMatchObject({ x: SPAWN.x, y: SPAWN.y, pose: "idle" });
    expect(parseResume(JSON.stringify({ ...base, pose: "hammock" }), base.savedAt)).toMatchObject({ pose: "hammock", x: base.x });
  });

  it("형식이 틀리면 null, 이상한 자세는 서 있기로, 좌석 없는 의자 앉기는 바닥 앉기로", () => {
    const now = base.savedAt;
    expect(parseResume("{", now)).toBeNull();
    expect(parseResume(JSON.stringify({ ...base, channel: 0 }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ ...base, x: -1 }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ ...base, name: "" }), now)).toBeNull();
    expect(parseResume(JSON.stringify({ ...base, savedAt: now + 60_000 }), now)).toBeNull(); // 미래 시각
    expect(parseResume(JSON.stringify({ ...base, pose: "fly" }), now)).toMatchObject({ pose: "idle", seatId: null });
    expect(parseResume(JSON.stringify({ ...base, seatId: null }), now)).toMatchObject({ pose: "sitGround", seatId: null });
    expect(parseResume(JSON.stringify({ ...base, pose: "swing" }), now)).toMatchObject({ pose: "swing", seatId: null });
    expect(parseResume(JSON.stringify({ ...base, dir: 9 }), now)?.dir).toBe(0);
  });

  it("저장소가 없거나 막혀 있어도 던지지 않는다", () => {
    expect(takeResume(0, null)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(takeResume(0, broken)).toBeNull();
  });
});
