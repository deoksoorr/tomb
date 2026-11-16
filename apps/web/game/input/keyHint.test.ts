import { afterEach, describe, expect, it, vi } from "vitest";

// isTouchUi는 MediaQueryList를 모듈 안에 붙잡아 두므로, 기기 흉내를 바꿀 때마다 모듈을 새로 읽는다
async function load(coarse: boolean | null) {
  vi.resetModules();
  if (coarse === null) vi.stubGlobal("window", undefined);
  else vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" && coarse }) });
  return import("./keyHint");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keyHint (기기별 키 안내)", () => {
  it("데스크톱은 키 이름, 터치는 화면 버튼 이름", async () => {
    const k = await load(false);
    expect(k.keyName("E", false)).toBe("E");
    expect(k.keyName("Space", false)).toBe("Space");
    expect(k.keyName("X", false)).toBe("X");
    expect(k.keyName("E", true)).toBe("[상호작용]");
    expect(k.keyName("Space", true)).toBe("[점프]");
    expect(k.keyName("X", true)).toBe("[앉기]");
  });

  it("조사: 데스크톱 E를/E로, 터치 [상호작용] 버튼을/버튼으로", async () => {
    const k = await load(false);
    expect(k.keyJosa("E", "를", false)).toBe("E를");
    expect(k.keyJosa("E", "로", false)).toBe("E로");
    expect(k.keyJosa("X", "를", false)).toBe("X를");
    expect(k.keyJosa("E", "를", true)).toBe("[상호작용] 버튼을");
    expect(k.keyJosa("E", "로", true)).toBe("[상호작용] 버튼으로");
    expect(k.keyJosa("X", "를", true)).toBe("[앉기] 버튼을");
  });

  it("떠 있는 라벨: 데스크톱 'E · 둘러보기'·'E 잠수', 터치는 동작 이름만", async () => {
    const k = await load(false);
    expect(k.interactLabel("둘러보기", false)).toBe("E · 둘러보기");
    expect(k.interactLabel("둘러보기", true)).toBe("둘러보기");
    expect(`${k.interactPrefix(false)}잠수`).toBe("E 잠수");
    expect(`${k.interactPrefix(true)}잠수`).toBe("잠수");
  });

  it("터치 판정은 GameShell의 MobileControls와 같은 (pointer: coarse)", async () => {
    expect((await load(true)).isTouchUi()).toBe(true);
    const touch = await load(true);
    expect(touch.keyName("E")).toBe("[상호작용]");
    expect(touch.interactLabel("행운권 보기")).toBe("행운권 보기");
    expect((await load(false)).isTouchUi()).toBe(false);
    const desk = await load(false);
    expect(desk.keyJosa("E", "를")).toBe("E를");
    // 서버 렌더·테스트처럼 window가 없으면 데스크톱 문구
    expect((await load(null)).isTouchUi()).toBe(false);
  });
});
