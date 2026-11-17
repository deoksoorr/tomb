import { describe, expect, it } from "vitest";
import { Riding } from "./Riding";

// 11/17 배·놀이기구·앉기로 저절로 내렸다가 일어나면 같은 펫에 다시 올라탄다 (사용자 피드백)

type FakePl = { state: string; sitting: boolean; anchored: boolean; inBoat: boolean; inCar: boolean; inWater: boolean; rideMul: number; view: { wearing: string[]; on: boolean; setRiding(on: boolean): void } };

function setup(pet = "pet_hound") {
  const pl: FakePl = {
    state: "idle",
    sitting: false,
    anchored: false,
    inBoat: false,
    inCar: false,
    inWater: false,
    rideMul: 1,
    view: { wearing: [pet], on: false, setRiding(on) { this.on = on; } },
  };
  const sent: boolean[] = [];
  const net = { online: true, mySid: 7, ride: (on: boolean) => sent.push(on) };
  const r = new Riding({ player: () => pl as never, net: () => net as never, remotes: () => new Map(), toast: () => {} });
  return { pl, r, sent };
}

describe("타는 펫 다시 올라타기", () => {
  it("배에 타서 저절로 내리면, 배에서 내려 서는 순간 다시 올라타요", () => {
    const { pl, r, sent } = setup();
    r.toggle();
    expect(r.on).toBe(true);
    pl.inBoat = true;
    r.update();
    expect(r.on).toBe(false);
    expect(pl.view.on).toBe(false);
    r.update();
    expect(r.on).toBe(false); // 배에 있는 동안은 그대로
    pl.inBoat = false;
    r.update();
    expect(r.on).toBe(true);
    expect(pl.view.on).toBe(true);
    expect(sent).toEqual([true, false, true]);
  });

  it("R 키로 직접 내렸거나 펫을 바꿨으면 다시 타지 않아요", () => {
    const a = setup();
    a.r.toggle();
    a.r.toggle();
    a.r.update();
    expect(a.r.on).toBe(false);
    const b = setup();
    b.r.toggle();
    b.pl.sitting = true;
    b.r.update();
    b.pl.view.wearing = ["pet_cat"];
    b.pl.sitting = false;
    b.r.update();
    b.pl.view.wearing = ["pet_hound"];
    b.r.update();
    expect(b.r.on).toBe(false);
  });

  it("서 있는데 서버가 내렸으면(거절) 다시 타지 않고, 자리 때문에 서버가 먼저 내렸으면 일어나서 다시 타요", () => {
    const a = setup();
    a.r.toggle();
    a.r.onRide(7, true);
    (a.r as unknown as { sentAt: number }).sentAt = 0;
    a.r.onRide(7, false);
    a.r.update();
    expect(a.r.on).toBe(false);
    const b = setup();
    b.r.toggle();
    b.r.onRide(7, true);
    (b.r as unknown as { sentAt: number }).sentAt = 0;
    b.pl.inCar = true;
    b.r.onRide(7, false);
    expect(b.r.on).toBe(false);
    b.pl.inCar = false;
    b.r.update();
    expect(b.r.on).toBe(true);
  });
});
