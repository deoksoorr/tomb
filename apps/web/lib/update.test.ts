import { describe, expect, it } from "vitest";
import { countdownLeft, decideUpdate, IDLE_RELOAD_MS, REQUIRED_COUNTDOWN_MS, RETURN_WINDOW_MS, versionLevel, type UpdateInput } from "./update";

const idle = { hard: false, soft: false };
const at = (o: Partial<UpdateInput>): UpdateInput => ({
  level: "patch",
  now: 1_000_000,
  lastInputAt: 1_000_000,
  hidden: false,
  returnedAt: null,
  busy: idle,
  requiredAt: null,
  deployReady: true,
  ...o,
});

describe("versionLevel", () => {
  it("배포 id가 다르면 patch, 최소 버전이 내 버전보다 크면 required", () => {
    expect(versionLevel("a", { version: "a", minClient: 1 }, 1)).toEqual({ level: "none", deployReady: false });
    expect(versionLevel("a", { version: "b", minClient: 1 }, 1)).toEqual({ level: "patch", deployReady: true });
    expect(versionLevel("a", { version: "b", minClient: 2 }, 1)).toEqual({ level: "required", deployReady: true });
    expect(versionLevel("a", { version: "b" }, 1)).toEqual({ level: "patch", deployReady: true }); // 옛 서버 응답
    expect(versionLevel("a", { version: "b", minClient: 1 }, 2)).toEqual({ level: "patch", deployReady: true }); // 내가 더 새것
  });
});

describe("decideUpdate — 평소 패치", () => {
  it("3분 무조작이면 새로고침, 그 전엔 기다린다", () => {
    expect(decideUpdate(at({ lastInputAt: 1_000_000 - IDLE_RELOAD_MS + 1 }))).toBe("wait");
    expect(decideUpdate(at({ lastInputAt: 1_000_000 - IDLE_RELOAD_MS }))).toBe("reload");
  });

  it("숨은 탭에서는 새로고침하지 않고(게임이 못 떠서 남들 화면에서 사라진다), 돌아온 직후 입력 전에 한다", () => {
    expect(decideUpdate(at({ hidden: true, lastInputAt: 0 }))).toBe("wait");
    const back = 1_000_000 - 500;
    expect(decideUpdate(at({ returnedAt: back, lastInputAt: back - 60_000 }))).toBe("reload");
    // 돌아와서 이미 움직이기 시작했으면 그때는 배너만
    expect(decideUpdate(at({ returnedAt: back, lastInputAt: back + 100 }))).toBe("wait");
    // 돌아온 지 한참 지났으면 평소 규칙
    expect(decideUpdate(at({ returnedAt: 1_000_000 - RETURN_WINDOW_MS - 1, lastInputAt: 1_000_000 - RETURN_WINDOW_MS - 2 }))).toBe("wait");
  });

  it("사냥·미니게임·묘비 작성·입력 중이면 미룬다", () => {
    const long = 1_000_000 - IDLE_RELOAD_MS * 2;
    expect(decideUpdate(at({ lastInputAt: long, busy: { hard: true, soft: false } }))).toBe("wait");
    expect(decideUpdate(at({ lastInputAt: long, busy: { hard: false, soft: true } }))).toBe("wait");
  });

  it("새 버전이 없으면 아무것도 안 한다", () => {
    expect(decideUpdate(at({ level: "none", lastInputAt: 0 }))).toBe("wait");
  });
});

describe("decideUpdate — 큰 패치(최소 버전 미달)", () => {
  const req = (o: Partial<UpdateInput>) => at({ level: "required", ...o });
  it("10초 카운트다운 뒤 새로고침 (조작 중이어도, 숨은 탭이어도)", () => {
    expect(decideUpdate(req({ requiredAt: null }))).toBe("wait");
    expect(decideUpdate(req({ requiredAt: 1_000_000 - REQUIRED_COUNTDOWN_MS + 1 }))).toBe("wait");
    expect(decideUpdate(req({ requiredAt: 1_000_000 - REQUIRED_COUNTDOWN_MS }))).toBe("reload");
    expect(decideUpdate(req({ requiredAt: 0, hidden: true }))).toBe("reload");
    expect(decideUpdate(req({ requiredAt: 0, busy: { hard: false, soft: true } }))).toBe("reload");
  });

  it("사냥 한 판·묘비 작성은 끝날 때까지 기다린다", () => {
    expect(decideUpdate(req({ requiredAt: 0, busy: { hard: true, soft: false } }))).toBe("wait");
  });

  it("새 웹 배포가 아직 없으면(실시간 서버만 먼저 바뀜) 새로고침해도 같은 화면 → 기다린다", () => {
    expect(decideUpdate(req({ requiredAt: 0, deployReady: false }))).toBe("wait");
  });

  it("카운트다운 표시", () => {
    expect(countdownLeft(null, 0)).toBe(10);
    expect(countdownLeft(0, 2_500)).toBe(8);
    expect(countdownLeft(0, 20_000)).toBe(0);
  });
});
