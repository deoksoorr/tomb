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

  it("바닷가 놀거리에 오르려고 잠깐 내린 것(stepOff)도 내려서면 다시 타요", () => {
    const { pl, r } = setup();
    r.toggle();
    r.stepOff();
    expect(r.on).toBe(false);
    pl.inBoat = true;
    r.update();
    expect(r.on).toBe(false);
    pl.inBoat = false;
    r.update();
    expect(r.on).toBe(true);
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

// 11/17 DO 요청 수: 서버가 계속 거절(확인 없음)해도 1.5초마다 끝없이 다시 보내지 않아요
describe("올라타기 재전송 간격", () => {
  it("확인이 없으면 15초 동안은 1.5초마다, 그 뒤로는 15초마다 다시 보내요 (1분에 13번 이하)", () => {
    const { r, sent } = setup();
    const real = Date.now;
    let t = 1_000_000;
    Date.now = () => t;
    try {
      r.toggle();
      for (let i = 0; i < 60 * 60; i++) {
        t += 1000 / 60;
        r.update();
      }
    } finally {
      Date.now = real;
    }
    // 처음 1번 + 빠른 재전송 10번 + 늦춘 재전송 (60 − 약 16.5초) / 15초 ≈ 2~3번
    expect(sent.length).toBeLessThanOrEqual(14);
    expect(sent.length).toBeGreaterThanOrEqual(12);
    expect(sent.every((on) => on)).toBe(true);
  });

  it("확인을 받았거나 다시 접속하면 다시 1.5초 간격부터", () => {
    const { r, sent } = setup();
    const real = Date.now;
    let t = 1_000_000;
    Date.now = () => t;
    try {
      r.toggle();
      for (let i = 0; i < 30 * 60; i++) {
        t += 1000 / 60;
        r.update();
      }
      r.onRide(7, true);
      const n = sent.length;
      r.onWelcome();
      t += 1600;
      r.update();
      expect(sent.length).toBe(n + 2);
    } finally {
      Date.now = real;
    }
  });
});
