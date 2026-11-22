import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "@/game/bridge";
import { NOT_RIDING, rideBlockReason, rideStatusOf, rideStopNotice, sameRide } from "./ridePolicy";
import { dismountPetThen, publishRide, rideBlocked, rideGate, rideKindNow, standForGate, type RideBody } from "./rideGate";

const free = { state: "idle", inBoat: false, inCar: false, pet: false };

describe("rideStatusOf: 탈것은 막고 자리는 일어나기", () => {
  it("배·범퍼카는 자세와 상관없이 탈것", () => {
    expect(rideStatusOf({ ...free, state: "boat", inBoat: true })).toEqual({ ride: "boat", seated: false });
    // 11/16 r13 바닷가 튜브·제트스키 (자세는 boat, 이름은 따로)
    expect(rideStatusOf({ ...free, state: "boat", inBoat: true, seaRide: "tube" })).toEqual({ ride: "tube", seated: false });
    expect(rideBlockReason(rideStatusOf({ ...free, state: "boat", inBoat: true, seaRide: "kayak" }), false, "사냥터에 갈")).toBe("카약에서 내린 다음에 사냥터에 갈 수 있어요.");
    expect(rideBlockReason(rideStatusOf({ ...free, state: "boat", inBoat: true, seaRide: "jetski" }), false, "사냥터에 갈")).toBe("제트스키에서 내린 다음에 사냥터에 갈 수 있어요.");
    expect(rideStatusOf({ ...free, state: "bumper", inCar: true })).toEqual({ ride: "bumper", seated: false });
  });

  it("관람차·열기구·회전목마·시소·트램펄린은 탈것", () => {
    for (const s of ["ferris", "balloon", "carousel", "seesaw", "trampoline"] as const) expect(rideStatusOf({ ...free, state: s }).ride).toBe(s);
  });

  it("의자·벤치·바닥·그네·나무·해먹·침대·책·욕조는 자리 (일어나서 간다)", () => {
    for (const s of ["sitChair", "sitGround", "swing", "hang", "hammock", "lie", "read", "bath"]) expect(rideStatusOf({ ...free, state: s })).toEqual({ ride: null, seated: true });
  });

  it("타는 펫에 올라타 있으면 탈것, 서기·걷기·수영은 그대로", () => {
    expect(rideStatusOf({ ...free, state: "walk", pet: true }).ride).toBe("pet");
    for (const s of ["idle", "walk", "run", "jump", "swim", "dive"]) expect(rideStatusOf({ ...free, state: s })).toEqual(NOT_RIDING);
  });

  it("모르는 새 자세(튜브·제트스키 등)는 기본으로 막는다", () => {
    expect(rideStatusOf({ ...free, state: "tube" }).ride).toBe("other");
  });
});

describe("rideBlockReason", () => {
  it("탈것이면 그 이름으로 안내, 아니면 null", () => {
    expect(rideBlockReason({ ride: "boat", seated: false }, false, "사냥터에 갈")).toBe("배에서 내린 다음에 사냥터에 갈 수 있어요.");
    expect(rideBlockReason({ ride: "bumper", seated: false })).toBe("범퍼카에서 내린 다음에 갈 수 있어요.");
    expect(rideBlockReason({ ride: "other", seated: false })).toBe("탈것에서 내린 다음에 갈 수 있어요.");
    expect(rideBlockReason({ ride: null, seated: true }, false, "사냥터에 갈")).toBeNull();
    expect(rideBlockReason(undefined)).toBeNull();
  });

  it("버스 안이면 버스", () => {
    expect(rideBlockReason(NOT_RIDING, true)).toBe("버스에서 내린 다음에 갈 수 있어요.");
  });

  it("sameRide", () => {
    expect(sameRide(undefined, NOT_RIDING)).toBe(false);
    expect(sameRide({ ride: "pet", seated: false }, { ride: "pet", seated: false })).toBe(true);
    expect(sameRide({ ride: null, seated: true }, NOT_RIDING)).toBe(false);
  });
});

function body(state: string, extra: Partial<RideBody> = {}) {
  const calls: string[] = [];
  const b: RideBody = {
    state,
    inBoat: false,
    inCar: false,
    sitting: state === "sitChair" || state === "sitGround",
    anchored: ["swing", "hang", "hammock", "lie", "read", "bath", "ferris", "balloon", "carousel", "seesaw", "trampoline"].includes(state),
    rideLock: false,
    leaveAnchor: () => void calls.push("leave"),
    stand: () => void calls.push("stand"),
    ...extra,
  };
  return { b, calls };
}

describe("rideGate (bridge)", () => {
  afterEach(() => {
    bridge.emit("player:ride", NOT_RIDING);
    bridge.emit("bus:state", { riding: false });
  });

  it("publishRide는 바뀔 때만 알린다", () => {
    let n = 0;
    const off = bridge.on("player:ride", () => n++);
    publishRide(body("boat", { inBoat: true }).b, false);
    publishRide(body("boat", { inBoat: true }).b, false);
    expect(n).toBe(1);
    expect(bridge.last("player:ride")).toEqual({ ride: "boat", seated: false });
    publishRide(body("idle").b, false);
    expect(n).toBe(2);
    off();
  });

  it("배 위에서는 막고 토스트, 내리면 통과", () => {
    const toasts: string[] = [];
    const off = bridge.on("toast", ({ message }) => toasts.push(message));
    publishRide(body("boat", { inBoat: true }).b, false);
    expect(rideGate("사냥터에 갈")).toBe("배에서 내린 다음에 사냥터에 갈 수 있어요.");
    expect(toasts).toEqual(["배에서 내린 다음에 사냥터에 갈 수 있어요."]);
    publishRide(body("idle").b, false);
    expect(rideGate("사냥터에 갈")).toBeNull();
    expect(toasts.length).toBe(1);
    off();
  });

  it("앉아 있으면 player:stand로 일으켜 세우고 통과", () => {
    let stood = 0;
    const off = bridge.on("player:stand", () => stood++);
    publishRide(body("sitChair").b, false);
    expect(rideGate()).toBeNull();
    expect(stood).toBe(1);
    off();
  });

  it("버스 안이면 막는다", () => {
    bridge.emit("bus:state", { riding: true });
    expect(rideBlocked()).toBe("버스에서 내린 다음에 갈 수 있어요.");
  });

  it("standForGate: 자리에서만 일어나고 탈것은 그대로", () => {
    const chair = body("sitChair");
    standForGate(chair.b, 0, null);
    expect(chair.calls).toEqual(["stand"]);
    const swing = body("swing");
    standForGate(swing.b, 0, null);
    expect(swing.calls).toEqual(["leave"]);
    const ferris = body("ferris");
    standForGate(ferris.b, 0, null);
    expect(ferris.calls).toEqual([]);
    const boat = body("boat", { inBoat: true });
    standForGate(boat.b, 0, null);
    expect(boat.calls).toEqual([]);
  });
});

describe("11/22 입구 가운데 알림 (rideStopNotice)", () => {
  it("펫이면 [내리고 들어가기]와 내리는 법 (컴퓨터 R, 폰 [내리기])", () => {
    expect(rideStopNotice("pet", "사냥터에 들어갈", false)).toEqual({
      title: "펫에서 내려 주세요",
      text: "펫에서 내린 뒤에 사냥터에 들어갈 수 있어요.",
      hint: "직접 내리려면 R 키를 눌러요.",
      dismount: true,
    });
    expect(rideStopNotice("pet", "야근 빌딩에 들어갈", true).hint).toBe("직접 내리려면 [내리기] 버튼을 눌러요.");
    expect(rideStopNotice("pet", "야근 빌딩에 들어갈", true).text).toBe("펫에서 내린 뒤에 야근 빌딩에 들어갈 수 있어요.");
  });

  it("배·놀이기구는 그 자리에서 못 내리니 [확인]만", () => {
    for (const k of ["boat", "bumper", "ferris", "kayak", "bus", "other"] as const) {
      const n = rideStopNotice(k, "사냥터에 들어갈", false);
      expect(n.dismount).toBe(false);
      expect(n.hint).toBeNull();
    }
    expect(rideStopNotice("boat", "사냥터에 들어갈", false).text).toBe("배에서 내린 뒤에 사냥터에 들어갈 수 있어요.");
    // 입구마다 하려는 일만 바뀐다 (rideGate와 같은 말)
    expect(rideStopNotice("pet", "곤충 채집을 할", false).text).toBe("펫에서 내린 뒤에 곤충 채집을 할 수 있어요.");
  });
});

describe("11/22 rideGate quiet · rideKindNow · dismountPetThen", () => {
  afterEach(() => {
    bridge.emit("player:ride", NOT_RIDING);
    bridge.emit("bus:state", { riding: false });
    bridge.emit("ride:state", { pet: null, riding: false, can: false });
  });

  it("quiet면 막아도 토스트를 띄우지 않는다", () => {
    const toasts: string[] = [];
    const off = bridge.on("toast", ({ message }) => toasts.push(message));
    publishRide(body("idle").b, true);
    expect(rideGate("사냥터에 갈", true)).toBe("펫에서 내린 다음에 사냥터에 갈 수 있어요.");
    expect(toasts).toEqual([]);
    expect(rideKindNow()).toBe("pet");
    bridge.emit("bus:state", { riding: true });
    expect(rideKindNow()).toBe("bus");
    off();
  });

  it("펫에 안 타 있으면 바로 then(true), 내리기도 보내지 않는다", () => {
    let presses = 0;
    const off = bridge.on("input:ride", () => presses++);
    let got: boolean | null = null;
    dismountPetThen((ok) => (got = ok));
    expect(got).toBe(true);
    expect(presses).toBe(0);
    off();
  });

  it("펫에 타 있으면 input:ride로 내리고, 장면이 「안 탔음」을 알리면 then(true)", () => {
    publishRide(body("idle").b, true);
    bridge.emit("ride:state", { pet: "pet_dog", riding: true, can: true });
    let presses = 0;
    const off = bridge.on("input:ride", () => presses++);
    let got: boolean | null = null;
    dismountPetThen((ok) => (got = ok));
    expect(presses).toBe(1);
    expect(got).toBeNull();
    publishRide(body("idle").b, false); // 다음 프레임
    expect(got).toBe(true);
    expect(rideGate("사냥터에 갈")).toBeNull();
    off();
  });

  it("안 내려지면 기다리다 then(false)", async () => {
    vi.useFakeTimers();
    publishRide(body("idle").b, true);
    let got: boolean | null = null;
    dismountPetThen((ok) => (got = ok), 1_500);
    vi.advanceTimersByTime(1_499);
    expect(got).toBeNull();
    vi.advanceTimersByTime(1);
    expect(got).toBe(false);
    vi.useRealTimers();
  });
});
