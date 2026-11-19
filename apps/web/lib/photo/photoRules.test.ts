import { describe, expect, it } from "vitest";
import {
  PHOTO_DEFAULT,
  photoAllowed,
  photoAmbience,
  photoFileName,
  photoFiltered,
  photoKeyAction,
  photoModeKey,
  photoScale,
  type PhotoGate,
  type PhotoKeyEvent,
} from "./photoRules";

// 11/19 촬영 모드: 단축키 막는 조건 · 파일 이름(KST) · 필터 되돌리기

const open: PhotoGate = { ready: true, scene: "world", riding: false, viewing: false, covered: false, houseEditing: false };

function key(code: string, more: Partial<PhotoKeyEvent> = {}): PhotoKeyEvent {
  return { code, key: code === "KeyK" ? "k" : code, type: "keydown", repeat: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...more };
}

describe("photoAllowed — 촬영 모드를 열 수 있는 곳", () => {
  it("마을·캠핑장·바닷가(world)·잡화점(shop)·집과 분양 마을(house), 장면을 아직 모를 때 열려요", () => {
    for (const scene of ["world", "shop", "house", undefined]) expect(photoAllowed({ ...open, scene }), String(scene)).toBe(true);
  });

  it("사냥(hunt)·별자리와 미니게임(minigame) 중엔 안 열려요", () => {
    expect(photoAllowed({ ...open, scene: "hunt" })).toBe(false);
    expect(photoAllowed({ ...open, scene: "minigame" })).toBe(false);
  });

  it("게임 준비 전·버스 연출·바라보는 장면·창이 떠 있을 때·집 꾸미기 중엔 안 열려요", () => {
    expect(photoAllowed({ ...open, ready: false })).toBe(false);
    expect(photoAllowed({ ...open, riding: true })).toBe(false);
    expect(photoAllowed({ ...open, viewing: true })).toBe(false);
    expect(photoAllowed({ ...open, covered: true })).toBe(false);
    expect(photoAllowed({ ...open, houseEditing: true })).toBe(false);
  });
});

describe("photoKeyAction — K·PrintScreen", () => {
  it("K를 누르면 열고, 촬영 모드 중엔 닫아요", () => {
    expect(photoKeyAction(key("KeyK"), false, false, open)).toBe("open");
    expect(photoKeyAction(key("KeyK"), false, true, open)).toBe("close");
  });

  it("채팅 입력칸에 쓰는 중·IME 조합 중·꾹 누름(반복)·Ctrl/Cmd/Alt 조합은 무시해요", () => {
    expect(photoKeyAction(key("KeyK"), true, false, open)).toBeNull();
    expect(photoKeyAction(key("KeyK", { isComposing: true }), false, false, open)).toBeNull();
    expect(photoKeyAction(key("KeyK", { key: "Process" }), false, false, open)).toBeNull();
    expect(photoKeyAction(key("KeyK", { repeat: true }), false, false, open)).toBeNull();
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) expect(photoKeyAction(key("KeyK", { [mod]: true }), false, false, open), mod).toBeNull();
  });

  it("열 수 없는 곳(사냥 K=구르기·창이 떠 있음)이면 K는 그냥 지나가요", () => {
    expect(photoKeyAction(key("KeyK"), false, false, { ...open, scene: "hunt" })).toBeNull();
    expect(photoKeyAction(key("KeyK"), false, false, { ...open, covered: true })).toBeNull();
  });

  it("PrintScreen은 keyup에서만 열어요 (윈도우는 keydown을 안 보내요)", () => {
    expect(photoKeyAction(key("PrintScreen", { type: "keyup" }), false, false, open)).toBe("open");
    expect(photoKeyAction(key("PrintScreen"), false, false, open)).toBeNull();
    expect(photoKeyAction(key("PrintScreen", { type: "keyup" }), false, true, open)).toBeNull();
  });

  it("K keyup·다른 키는 아무것도 안 해요", () => {
    expect(photoKeyAction(key("KeyK", { type: "keyup" }), false, false, open)).toBeNull();
    expect(photoKeyAction(key("KeyJ"), false, false, open)).toBeNull();
  });
});

describe("photoModeKey — 촬영 모드 중 키", () => {
  it("Esc·K는 끝내기", () => {
    expect(photoModeKey(key("Escape"), false)).toBe("exit");
    expect(photoModeKey(key("KeyK"), false)).toBe("exit");
    expect(photoModeKey(key("KeyK", { repeat: true }), false)).toBe("block");
  });

  it("촬영 중엔 내 캐릭터가 멈춰 있어요: 걷기·달리기·점프·앉기 키도 막아요", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "Space", "KeyX", "KeyC"]) expect(photoModeKey(key(code), false), code).toBe("block");
  });

  it("창 단축키·말 걸기·채팅·표현도 막아요", () => {
    for (const code of ["KeyE", "Enter", "KeyT", "KeyY", "KeyI", "KeyP", "KeyG", "KeyM", "KeyL", "KeyR", "KeyV", "Digit1"]) expect(photoModeKey(key(code), false), code).toBe("block");
  });

  it("Tab(단추 옮겨 다니기)은 그대로", () => {
    expect(photoModeKey(key("Tab"), false)).toBe("pass");
  });

  it("입력칸·브라우저 단축키는 그대로", () => {
    expect(photoModeKey(key("KeyE"), true)).toBe("pass");
    expect(photoModeKey(key("KeyR", { metaKey: true }), false)).toBe("pass");
  });
});

describe("photoFileName — 게임 이름_KST 날짜_시각", () => {
  it("KST로 적어요 (UTC 18:15:22 → 다음 날 03:15:22)", () => {
    expect(photoFileName(Date.UTC(2026, 10, 18, 18, 15, 22))).toBe("AtOneTime_2026-11-19_031522.png");
  });

  it("한 자리 수는 0을 채워요", () => {
    expect(photoFileName(Date.UTC(2026, 0, 1, 0, 0, 5))).toBe("AtOneTime_2026-01-01_090005.png");
  });

  it("KST 자정을 넘기면 날짜가 바뀌어요 (연말)", () => {
    expect(photoFileName(Date.UTC(2026, 11, 31, 15, 0, 0))).toBe("AtOneTime_2027-01-01_000000.png");
  });
});

describe("필터 — 내 화면 미리보기와 되돌리기", () => {
  it("처음·끝은 평소 그대로 (미리보기 없음)", () => {
    expect(photoFiltered(PHOTO_DEFAULT)).toBe(false);
    expect(photoAmbience(PHOTO_DEFAULT)).toBeNull();
  });

  it("시간대 → 그 시간대 KST 시각, 날씨 → 그 날씨", () => {
    expect(photoAmbience({ time: "night", weather: null })).toEqual({ hour: 22 });
    expect(photoAmbience({ time: null, weather: "snow" })).toEqual({ weather: "snow" });
    expect(photoAmbience({ time: "dawn", weather: "rain" })).toEqual({ hour: 6, weather: "rain" });
  });

  it("하나라도 바꾸면 되돌릴 것이 있어요", () => {
    expect(photoFiltered({ ...PHOTO_DEFAULT, names: false })).toBe(true);
    expect(photoFiltered({ ...PHOTO_DEFAULT, me: false })).toBe(true);
    expect(photoFiltered({ ...PHOTO_DEFAULT, time: "dusk" })).toBe(true);
    expect(photoFiltered({ ...PHOTO_DEFAULT, weather: "fog" })).toBe(true);
  });
});

describe("photoScale — 사진 배율", () => {
  it("보통 화면은 2배", () => {
    expect(photoScale(1280, 800)).toBe(2);
    expect(photoScale(390, 844)).toBe(2);
  });

  it("긴 변이 2048보다 크면 1배 (4096 넘지 않게)", () => {
    expect(photoScale(2560, 1440)).toBe(1);
    expect(photoScale(2048, 1152)).toBe(2);
  });
});
