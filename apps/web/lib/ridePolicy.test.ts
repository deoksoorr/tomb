import { afterEach, describe, expect, it } from "vitest";
import { bridge } from "@/game/bridge";
import { NOT_RIDING, rideBlockReason, rideStatusOf, sameRide } from "./ridePolicy";
import { publishRide, rideBlocked, rideGate, standForGate, type RideBody } from "./rideGate";

const free = { state: "idle", inBoat: false, inCar: false, pet: false };

describe("rideStatusOf: 탈것은 막고 자리는 일어나기", () => {
  it("배·범퍼카는 자세와 상관없이 탈것", () => {
    expect(rideStatusOf({ ...free, state: "boat", inBoat: true })).toEqual({ ride: "boat", seated: false });
    // 11/16 r13 바닷가 튜브·제트스키 (자세는 boat, 이름은 따로)
    expect(rideStatusOf({ ...free, state: "boat", inBoat: true, seaRide: "tube" })).toEqual({ ride: "tube", seated: false });
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
