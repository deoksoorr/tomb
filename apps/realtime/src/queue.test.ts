import { QUEUE_HOLD_MS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { AdmissionQueue, QUEUE_MAX, QUEUE_STALE_MS } from "./queue";

const cfg = { capacity: 2, maxChannels: 2, threshold: 0.8 };

/** 채널 인원 표 (채널 DO의 보고를 흉내) */
function world(initial: Record<number, number> = { 1: 2, 2: 2 }) {
  const counts = { ...initial };
  return { counts, of: (id: number) => counts[id] ?? 0 };
}

describe("AdmissionQueue", () => {
  it("lines people up in arrival order while every channel is full", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    expect(q.poll("a", 0, w.of)).toEqual({ state: "waiting", position: 1, size: 1 });
    expect(q.poll("b", 0, w.of)).toEqual({ state: "waiting", position: 2, size: 2 });
    expect(q.poll("a", 1_000, w.of)).toEqual({ state: "waiting", position: 1, size: 2 }); // 다시 물어도 자리 유지
  });

  it("holds a freed seat for the head of the line; the others move up", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    q.poll("a", 0, w.of);
    q.poll("b", 0, w.of);
    w.counts[2] = 1; // 2채널에서 한 명이 나갔다(보고)
    q.assign(1_000, w.of);
    expect(q.poll("a", 1_500, w.of)).toEqual({ state: "admitted", channel: 2, holdUntil: 1_000 + QUEUE_HOLD_MS });
    expect(q.poll("b", 1_500, w.of)).toEqual({ state: "waiting", position: 1, size: 1 });
    expect(q.heldIn(2)).toBe(1);
  });

  it("only the holder may take a held seat; newcomers cannot cut in while anyone waits", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    q.poll("a", 0, w.of);
    q.poll("b", 0, w.of);
    w.counts[2] = 1;
    q.assign(1_000, w.of);
    expect(q.admit("intruder", 2, 1, 1_100)).toBe(false); // b가 기다리는 중
    expect(q.admit("b", 2, 1, 1_100)).toBe(false); // b 차례가 아님(자리는 a 몫)
    expect(q.admit("a", 1, 2, 1_100)).toBe(false); // 다른 채널로는 못 들어감
    expect(q.admit("a", 2, 1, 1_200)).toBe(true); // 잡아 둔 자리
    expect(q.heldIn(2)).toBe(0);
  });

  it("admits newcomers directly when nobody waits, counting held seats as taken", () => {
    const q = new AdmissionQueue(cfg);
    const w = world({ 1: 1, 2: 2 });
    expect(q.poll("a", 0, w.of)).toMatchObject({ state: "admitted", channel: 1 }); // 줄이 없고 자리가 있으면 바로
    expect(q.admit("x", 1, 1, 100)).toBe(false); // 1채널의 남은 한 자리는 a 몫
    expect(q.admit("a", 1, 1, 100)).toBe(true);
    expect(q.admit("y", 1, 1, 100)).toBe(true); // 줄도 hold도 없음 (채널 DO가 최종 상한을 다시 본다)
  });

  it("gives an expired hold to the next person", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    q.poll("a", 0, w.of);
    q.poll("b", 0, w.of);
    w.counts[1] = 1;
    q.assign(0, w.of);
    q.poll("b", QUEUE_HOLD_MS - 1, w.of);
    expect(q.poll("b", QUEUE_HOLD_MS, w.of)).toMatchObject({ state: "admitted", channel: 1 }); // a가 30초 안에 안 옴
    expect(q.poll("a", QUEUE_HOLD_MS + 1, w.of)).toEqual({ state: "waiting", position: 1, size: 1 }); // a는 맨 뒤로
  });

  it("drops waiters that stopped polling for 30s", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    q.poll("a", 0, w.of);
    q.poll("b", 0, w.of);
    q.poll("b", QUEUE_STALE_MS, w.of);
    expect(q.poll("b", QUEUE_STALE_MS + 1, w.of)).toEqual({ state: "waiting", position: 1, size: 1 });
    expect(q.admit("x", 1, 1, QUEUE_STALE_MS + 2)).toBe(false); // b가 아직 기다린다
  });

  it("caps the line length", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    for (let i = 0; i < QUEUE_MAX; i++) q.poll(`v${i}`, 0, w.of);
    expect(q.poll("late", 0, w.of)).toEqual({ state: "none" });
  });

  it("survives a restart from its snapshot (order and holds)", () => {
    const q = new AdmissionQueue(cfg);
    const w = world();
    q.poll("a", 0, w.of);
    q.poll("b", 0, w.of);
    q.poll("c", 0, w.of);
    w.counts[1] = 1;
    q.assign(0, w.of);
    expect(q.dirty).toBe(true);
    const r = new AdmissionQueue(cfg, JSON.parse(JSON.stringify(q.snapshot())), 5_000);
    expect(r.poll("c", 5_000, w.of)).toEqual({ state: "waiting", position: 2, size: 2 });
    expect(r.poll("a", 5_000, w.of)).toMatchObject({ state: "admitted", channel: 1 });
  });
});
