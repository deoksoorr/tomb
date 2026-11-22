import { afterEach, describe, expect, it } from "vitest";
import { bridge } from "@/game/bridge";
import { NOT_RIDING } from "./ridePolicy";
import { clearRideStop, rideGateAlert, rideStopNow, subscribeRideStop } from "./rideStop";

// 11/22 입구에서 막히면 아래 토스트 대신 가운데 알림 하나 (GameShell RideStopHost)
describe("rideGateAlert", () => {
  afterEach(() => {
    clearRideStop();
    bridge.emit("player:ride", NOT_RIDING);
    bridge.emit("bus:state", { riding: false });
  });

  it("펫에 타 있으면 토스트 없이 알림을 띄우고 막는다 (하려는 일·[내리고 가기] 그대로)", () => {
    const toasts: string[] = [];
    const off = bridge.on("toast", ({ message }) => toasts.push(message));
    let n = 0;
    const unsub = subscribeRideStop(() => n++);
    bridge.emit("player:ride", { ride: "pet", seated: false });
    const run = () => undefined;
    expect(rideGateAlert("곤충 채집을 할", { label: "내리고 채집하기", run })).toBe("펫에서 내린 다음에 곤충 채집을 할 수 있어요.");
    expect(rideStopNow()).toEqual({ kind: "pet", todo: "곤충 채집을 할", go: { label: "내리고 채집하기", run } });
    expect(toasts).toEqual([]);
    expect(n).toBe(1);
    clearRideStop();
    expect(rideStopNow()).toBeNull();
    unsub();
    off();
  });

  it("안 타 있으면 통과 (알림 없음), 앉아 있으면 일으켜 세운다", () => {
    let stood = 0;
    const off = bridge.on("player:stand", () => stood++);
    expect(rideGateAlert("잡화점에 갈")).toBeNull();
    bridge.emit("player:ride", { ride: null, seated: true });
    expect(rideGateAlert("잡화점에 갈")).toBeNull();
    expect(stood).toBe(1);
    expect(rideStopNow()).toBeNull();
    off();
  });

  it("버스 안이면 버스로 알린다 ([확인]만 — 닫을 때 onClose)", () => {
    bridge.emit("bus:state", { riding: true });
    let closed = 0;
    expect(rideGateAlert("분양 사무소에 갈", undefined, () => closed++)).toBe("버스에서 내린 다음에 분양 사무소에 갈 수 있어요.");
    expect(rideStopNow()?.kind).toBe("bus");
    rideStopNow()?.onClose?.();
    expect(closed).toBe(1);
  });
});
