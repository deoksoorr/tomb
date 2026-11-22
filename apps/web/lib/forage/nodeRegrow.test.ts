import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAccounts } from "../store";
import { setStaff } from "../staff";
import { GATHER_NODES, NODE_CAT, nodeOnMap, type GatherNode, type NodeKind } from "./catalog";
import { testEndUrgent, testStartUrgent, urgentNodeEvent } from "./quests/urgentService";
import {
  activeNodes,
  NODE_DENSITY,
  NODE_FAST_MS,
  NODE_WINDOW_MS,
  nodeBaseWindow,
  nodeBloomRule,
  nodeRefreshAt,
  nodeSeed,
  nodeWindow,
  rollNodeIds,
  takenNow,
  tookMember,
  windowEndsAt,
  type NodeUrgent,
} from "./rules";
import { finishGather, forageState, startGather } from "./service";
import { lk, TOOK_BUCKET, TOOK_TTL_SEC } from "./store";

// 11/22 사용자 「광석 긴급 의뢰 때 광석이 너무 늦게 펴요 (마을 광석 6곳쯤 캐고 10분 기다림)」:
//  - 평소 광석 밀도 0.5 → 0.6 (약초와 같게)
//  - 약초·광석·발굴품 긴급 의뢰가 열려 있는 동안 그 종류 지점은 5분 창·100% (발굴품 = 땅 파기 + 갯벌 구멍). 생선 의뢰·다른 종류는 그대로
//  - 규칙은 rules nodeBloomRule 하나 (서버·화면 공통), 5분 창 id는 음수라 10분 창 「캔 자리」 기록과 겹치지 않는다

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS", "VERCEL_ENV"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
  // 로비(접속자 수)는 응답하지 않는 것으로 → 긴급 의뢰 목표는 기준 접속자 수로
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const MIN = 60_000;
/** 11/23 6시 KST (정해진 긴급 의뢰가 없는 아침 — 낮 12시 ~ 밤 12시에만 열린다). 10분 창 경계 */
const T = Date.UTC(2026, 10, 22, 21, 0);
const KINDS: readonly NodeKind[] = ["herb", "ore", "dig", "bug", "clam"];
const ev = (kind: NodeUrgent["kind"], start = T, end = T + 20 * MIN): NodeUrgent => ({ kind, start, end });
const village = (kind: NodeKind) => GATHER_NODES.filter((n) => nodeOnMap(n, "village") && n.kind === kind);

describe("규칙 (서버·화면 공통 nodeBloomRule)", () => {
  it("평소: 광석 0.6(약초와 같게), 다른 종류 그대로 · 10분 창", () => {
    expect(NODE_DENSITY).toEqual({ herb: 0.6, ore: 0.6, dig: 0.4, bug: 0.55, clam: 0.6 });
    const now = T + 3 * MIN;
    for (const k of KINDS) {
      for (const e of [null, undefined]) expect(nodeBloomRule(k, now, e), k).toEqual({ density: NODE_DENSITY[k], window: nodeWindow(now), endsAt: windowEndsAt(nodeWindow(now)) });
      expect(windowEndsAt(nodeWindow(now))).toBe(T + NODE_WINDOW_MS);
    }
  });

  it("긴급 의뢰 동안 맞는 종류만 5분 창·100% (발굴품은 땅 파기 + 갯벌 구멍), 생선 의뢰는 아무것도 안 바뀐다", () => {
    const now = T + 7 * MIN;
    const want: Record<NodeUrgent["kind"], NodeKind[]> = { fish: [], herb: ["herb"], ore: ["ore"], dig: ["dig", "clam"] };
    for (const kind of ["fish", "herb", "ore", "dig"] as const) {
      for (const k of KINDS) {
        const r = nodeBloomRule(k, now, ev(kind));
        if (want[kind].includes(k)) {
          expect(NODE_CAT[k]).toBe(kind);
          expect(r, `${kind} ${k}`).toEqual({ density: 1, window: -(Math.floor(now / NODE_FAST_MS) + 1), endsAt: T + 10 * MIN });
        } else expect(r, `${kind} ${k}`).toEqual(nodeBloomRule(k, now, null));
      }
    }
  });

  it("의뢰 시작 전·끝난 뒤는 평소 규칙, 경계: 5분 창 끝은 의뢰 끝을 넘지 않고 곧 시작할 의뢰면 시작 시각에 바뀐다", () => {
    const e = ev("ore", T + 3 * MIN, T + 17 * MIN);
    expect(nodeBloomRule("ore", T + 2 * MIN, e)).toEqual({ density: 0.6, window: nodeWindow(T), endsAt: T + 3 * MIN });
    expect(nodeBloomRule("herb", T + 2 * MIN, e).endsAt).toBe(T + 10 * MIN);
    expect(nodeBloomRule("ore", T + 3 * MIN, e).density).toBe(1);
    expect(nodeBloomRule("ore", T + 16 * MIN, e).endsAt).toBe(T + 17 * MIN);
    expect(nodeBloomRule("ore", T + 17 * MIN, e)).toEqual(nodeBloomRule("ore", T + 17 * MIN, null));
    expect(nodeRefreshAt(T + 16 * MIN, e)).toBe(T + 17 * MIN);
    expect(nodeRefreshAt(T + 11 * MIN, e)).toBe(T + 15 * MIN);
    expect(nodeRefreshAt(T + 11 * MIN, null)).toBe(T + 20 * MIN);
  });

  it("창 id: 5분 창은 음수라 10분 창과 안 겹치고, 자기가 든 10분 창의 묶음 키를 같이 쓴다 (보관 시간도 그 안)", () => {
    for (let t = T; t < T + 3 * NODE_WINDOW_MS; t += MIN) {
      const fast = nodeBloomRule("ore", t, ev("ore", T, T + 60 * MIN)).window;
      const base = nodeWindow(t);
      expect(fast).toBeLessThan(0);
      expect(base).toBeGreaterThanOrEqual(0);
      expect(nodeBaseWindow(fast)).toBe(base);
      expect(nodeBaseWindow(base)).toBe(base);
      expect(lk.took("A", fast)).toBe(lk.took("A", base));
      // 5분 창은 10분 창 안에서 끝난다 → 10분 창 묶음 키 보관(TOOK_TTL_SEC)이 그대로 덮는다
      expect(windowEndsAt(fast)).toBeGreaterThan(t);
      expect(windowEndsAt(fast)).toBeLessThanOrEqual(windowEndsAt(base));
      expect(windowEndsAt(fast) - t).toBeLessThanOrEqual(NODE_FAST_MS);
    }
    expect(TOOK_TTL_SEC * 1000).toBeGreaterThan(NODE_WINDOW_MS * TOOK_BUCKET);
    // 한 10분 창 안의 5분 창 둘은 서로 다르다
    expect(nodeBloomRule("ore", T + MIN, ev("ore")).window).not.toBe(nodeBloomRule("ore", T + 6 * MIN, ev("ore")).window);
  });

  it("캔 자리: 지점마다 자기 규칙 창 기록만 본다 (의뢰 전에 캔 광석도 5분 창에선 다시 핀다, 약초는 10분 창 그대로)", () => {
    const ore = village("ore")[0];
    const herb = village("herb")[0];
    const w = nodeWindow(T);
    const members = [tookMember(w, ore.id), tookMember(w, herb.id)];
    expect([...takenNow(members, T + 2 * MIN, null)].sort()).toEqual([herb.id, ore.id].sort());
    const live = ev("ore", T + 3 * MIN);
    expect([...takenNow(members, T + 4 * MIN, live)]).toEqual([herb.id]);
    const f = nodeBloomRule("ore", T + 4 * MIN, live).window;
    expect([...takenNow([...members, tookMember(f, ore.id)], T + 4 * MIN, live)].sort()).toEqual([herb.id, ore.id].sort());
    // 다음 5분 창이면 광석은 다시
    expect([...takenNow([...members, tookMember(f, ore.id)], T + 5 * MIN, live)]).toEqual([herb.id]);
  });

  it("마을 광석: 10분에 평소 6 → 7.2곳, 광석 의뢰 동안 24곳 (5분마다 12곳 모두)", () => {
    const ores = village("ore").length;
    expect(ores).toBe(12);
    expect(ores * 0.5).toBe(6);
    expect(ores * NODE_DENSITY.ore).toBeCloseTo(7.2, 5);
    const live = ev("ore", T, T + 20 * MIN);
    let n = 0;
    for (const t of [T, T + 5 * MIN]) n += activeNodes("acct-ore", t, new Set(), live).filter((x) => nodeOnMap(x, "village") && x.kind === "ore").length;
    expect(n).toBe(24);
  });

  it("화면 다시 굴리기 = 서버 목록: 바뀐 창의 지점만 새로, 그대로인 창은 캔 것이 빠진 채", () => {
    for (const a of ["acct-1", "acct-2", "t-x"]) {
      const seed = nodeSeed(a);
      const live = ev("ore", T + 3 * MIN, T + 23 * MIN);
      const at0 = T + MIN;
      const ids0 = activeNodes(a, at0, new Set(), null).map((n) => n.id);
      const herbTaken = ids0.find((id) => GATHER_NODES.find((n) => n.id === id)!.kind === "herb")!;
      const held = ids0.filter((id) => id !== herbTaken);
      // 의뢰가 열림 (같은 10분 창): 광석만 모두 새로, 캔 약초는 여전히 빈 자리
      const at1 = T + 4 * MIN;
      const ids1 = rollNodeIds(seed, held, { at: at0, ev: null }, { at: at1, ev: live });
      expect(ids1).toEqual(activeNodes(a, at1, new Set([herbTaken]), live).map((n) => n.id));
      expect(ids1.filter((id) => GATHER_NODES.find((n) => n.id === id)!.kind === "ore").length).toBe(GATHER_NODES.filter((n) => n.kind === "ore").length);
      // 다음 5분 창 (10분 창 그대로): 광석만 다시, 약초 목록은 그대로
      const oreTaken = ids1.find((id) => id.startsWith("o"))!;
      const ids2 = rollNodeIds(seed, ids1.filter((id) => id !== oreTaken), { at: at1, ev: live }, { at: T + 5 * MIN, ev: live });
      expect(ids2).toContain(oreTaken);
      expect(ids2).not.toContain(herbTaken);
      // 새 10분 창이면 서버 목록(아직 캔 것 없음)과 같다
      for (const t of [T + 10 * MIN, T + 25 * MIN, T + 30 * MIN])
        expect(rollNodeIds(seed, ids2, { at: T + 5 * MIN, ev: live }, { at: t, ev: live }), String(t)).toEqual(activeNodes(a, t, new Set(), live).map((n) => n.id));
    }
  });
});

describe("서버 (긴급 의뢰는 서버가 스스로 본다)", () => {
  let op = "";
  const S = T + 30 * MIN; // 시험 의뢰 시작 (10분 창 경계)
  beforeAll(async () => {
    op = `t-regrow-op-${Date.now().toString(36)}`;
    await getAccounts().enter(op, { name: "채집운영자" }, S);
    await setStaff(op, S);
  });
  afterAll(async () => {
    await testEndUrgent(op, true, S + 60 * MIN).catch(() => undefined);
    await setStaff(null, S);
  });

  const oreNode = (): GatherNode => village("ore")[0];
  /** 그 시각 평소 규칙으로 이 지점이 피어 있는 계정 */
  function acctWith(n: GatherNode, t: number, tag: string): string {
    for (let i = 0; ; i++) {
      const a = `t-regrow-${tag}-${i}`;
      if (activeNodes(a, t, new Set(), null).some((x) => x.id === n.id)) return a;
    }
  }
  async function take(a: string, n: GatherNode, t: number) {
    const s = await startGather(a, n.id, t);
    if (s.mode !== "gauge") throw new Error("gauge");
    return finishGather(a, s.ticket, undefined, t + s.durationMs);
  }

  it("의뢰 전: 캔 광석은 이번 10분 창 동안 빈다 (5분 뒤에도)", async () => {
    const n = oreNode();
    const t = S - 10 * MIN + 30_000;
    const a = acctWith(n, t, "before");
    expect(await urgentNodeEvent(t)).toBeNull();
    await take(a, n, t);
    await expect(startGather(a, n.id, t + 5 * MIN)).rejects.toMatchObject({ status: 409, code: "NODE_EMPTY" });
  });

  it("광석 의뢰 동안: 광석은 5분 뒤 다시 캐고, 같은 5분 창엔 한 번만. 약초는 그대로 10분 창", async () => {
    await testStartUrgent(op, "ore", S);
    const t = S + 30_000;
    expect(await urgentNodeEvent(t)).toEqual({ kind: "ore", start: S, end: S + 20 * MIN });
    const n = oreNode();
    const a = `t-regrow-live-${Date.now().toString(36)}`;
    // 상태: 광석은 모두 피어 있고 의뢰를 같이 알려 준다, 다음 갱신은 5분 창 끝
    const st = await forageState(a, t);
    expect(st.nodes.ev).toEqual({ kind: "ore", start: S, end: S + 20 * MIN });
    expect(st.nodes.refreshAt).toBe(S + 5 * MIN);
    for (const o of GATHER_NODES.filter((x) => x.kind === "ore" && !x.map)) expect(st.nodes.ids).toContain(o.id);
    const f = await take(a, n, t);
    expect(f.items.length).toBeGreaterThanOrEqual(1);
    expect(f.state.nodes.ids).not.toContain(n.id);
    await expect(startGather(a, n.id, t + 2 * MIN)).rejects.toMatchObject({ code: "NODE_EMPTY" });
    // 5분 뒤 (같은 10분 창) 다시
    const f2 = await take(a, n, S + 5 * MIN + 10_000);
    expect(f2.items.length).toBeGreaterThanOrEqual(1);
    await expect(startGather(a, n.id, S + 6 * MIN)).rejects.toMatchObject({ code: "NODE_EMPTY" });

    // 맞지 않는 종류(약초)는 평소처럼: 캔 뒤 5분이 지나도 같은 10분 창이면 빈다
    const h = village("herb")[0];
    const b = acctWith(h, t, "herb");
    await take(b, h, t);
    await expect(startGather(b, h.id, S + 5 * MIN + 10_000)).rejects.toMatchObject({ code: "NODE_EMPTY" });
  });

  it("의뢰가 끝나면 평소 규칙으로 (끝난 뒤 5분이 지나도 같은 10분 창에 캔 광석은 빈다)", async () => {
    const t = S + 40 * MIN + 30_000;
    expect(await urgentNodeEvent(t)).toBeNull();
    const n = oreNode();
    const a = acctWith(n, t, "after");
    await take(a, n, t);
    await expect(startGather(a, n.id, t + 5 * MIN)).rejects.toMatchObject({ code: "NODE_EMPTY" });
    const st = await forageState(a, t);
    expect(st.nodes.ev).toBeUndefined();
    expect(st.nodes.refreshAt).toBe(S + 50 * MIN);
  });

  it("생선 의뢰는 지점 규칙에 아무 영향이 없다", async () => {
    const s2 = S + 60 * MIN;
    await testStartUrgent(op, "fish", s2);
    expect(await urgentNodeEvent(s2 + 1_000)).toBeNull();
  });
});
