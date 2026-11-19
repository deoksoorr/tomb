import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GEAR_SLOTS, type MonsterId } from "@/lib/rpg/catalog";
import { ENHANCE_TABLE } from "@/lib/rpg/enhance";
import { encodeSg, SG_EGG_BIT, SG_PIECES, SG_SETS, type SgItem } from "@/lib/rpg/setGear";
import { chestSeals, crossesTen, nextPity, PROT_FROM_FLOOR } from "@/lib/rpg/setGearRoll";
import { approveReview, dropSeedOf, forgetEndgameLaunch, listReviews } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import { checkpointsUpTo, isCheckpoint, isChestFloor, nextCheckpoint, TOWER_CHEST_FROM, towerChestDrops, towerPlan } from "@/lib/rpg/tower";
// 11/19 상자 층 경계는 상수에서 (경계가 바뀌어도 그대로 통과하게)
const floorsOf = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);
const chestsIn = (start: number, n: number) => floorsOf(start, n).filter(isChestFloor);
/** f층 이상에서 처음 고를 수 있는 시작 층 (체크포인트) */
const cpFrom = (f: number) => (isCheckpoint(f) ? f : nextCheckpoint(f));

import { getTowerStore } from "@/lib/rpg/towerStore";
import type { CharacterState, Drop, RpgView, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import type { GearActionResponse } from "@/lib/rpg/gearService";
import { setStaff } from "@/lib/staff";
import { getAccounts, getMegaphone } from "@/lib/store";
import { earnedTitleIds, type TitleFacts } from "@/lib/titles";
import * as session from "../session/route";
import * as gear from "./gear/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";
import * as rpg from "./route";

// 11/15 세트 장비 API: 상자 드롭(천장·재료·꾸미기)이 판 안 미리보기와 같은지, 슈퍼 계정 시험 드롭(테스트 서버만), 강화·분해·끼기, 포인트 한 번에 빼기

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
  forgetEndgameLaunch();
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const call = (path: string, v?: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(v ? { cookie: v.cookie, "x-forwarded-for": v.ip } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function newVisitor(patch: Partial<CharacterState> = { level: 50 }, points = 0): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = {
    cookie,
    ip: `10.31.${++seq}.1`,
    id: ((await res.json()) as { visitorId: string }).visitorId,
  };
  await getRpgStore().update(v.id, (s) => ({
    state: { ...s, runs: 1, ...patch },
    result: null,
  }));
  if (points) await getAccounts().refund(v.id, points, "시험", Date.now());
  return v;
}

async function begin(v: Visitor, tower: number): Promise<RunStartResponse> {
  const res = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "hell", tower }));
  expect(res.status).toBe(200);
  return (await res.json()) as RunStartResponse;
}
function climbed(s: RunStartResponse, floors: number) {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++) for (const w of towerPlan(s.seed, s.tower! + i, s.tower!)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return {
    game: "hunt" as const,
    durationMs: floors * 45_000 + 3_000,
    kills,
    wavesCleared: 0,
    died: true,
    potionsUsed: {},
    floors,
    floorMs: floors * 45_000,
  };
}
async function end(v: Visitor, s: RunStartResponse, floors: number): Promise<RunFinishResponse> {
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + floors * 45_000 + 4_000);
  const res = await finish.POST(
    call("/api/rpg/run/finish", v, {
      ticket: s.ticket,
      result: climbed(s, floors),
    }),
  );
  vi.restoreAllMocks();
  expect(res.status).toBe(200);
  return (await res.json()) as RunFinishResponse;
}
const act = async (v: Visitor, body: object) => {
  const res = await gear.POST(call("/api/rpg/gear", v, body));
  return {
    status: res.status,
    body: (await res.json()) as GearActionResponse & {
      error?: { code: string };
    },
  };
};
const mk = (p: Partial<SgItem> = {}): SgItem => ({
  s: 0,
  p: 0,
  g: 3,
  u: 1,
  e: 0,
  o: [["a", 7]],
  L: 0,
  rr: 0,
  f: 0,
  ...p,
});

/** 판 안 미리보기: 게임이 상자를 여는 순서대로 (11/19 천장은 없앴다 — pity는 굴림에 쓰이지 않는다) */
/** 11/18 상자는 서버 비밀값으로 만든 드롭 시드로 굴린다 (판 시작 응답의 시드가 아니다 — 화면은 /api/rpg/run/reveal로 받는다) */
async function dropSeed(s: RunStartResponse): Promise<number> {
  return dropSeedOf((JSON.parse(Buffer.from(s.ticket.split(".")[0], "base64url").toString()) as { n: string }).n);
}

async function preview(s: RunStartResponse, chests: number[], pity: number, sup = false): Promise<Drop[]> {
  let p = pity;
  const seed = await dropSeed(s);
  return chests.flatMap((f) => {
    const d = towerChestDrops(seed, f, s.tower!, p, sup);
    p = nextPity(d, p);
    return d;
  });
}

describe("우두머리 상자: 세트 장비·재료·꾸미기", () => {
  it("판 안에서 떨군 것 = 서버가 준 것 (11/19 천장 없음 — 못 받은 수와 상관없이 같은 굴림), 재료는 가방에", async () => {
    // 보호 문서가 처음 나오는 층(PROT_FROM_FLOOR)을 넘는 10층 판 — 그 층들이 상자 층 위인지도 본다
    const st = Math.max(cpFrom(TOWER_CHEST_FROM), checkpointsUpTo(PROT_FROM_FLOOR).at(-1)!);
    const chests = chestsIn(st, 10);
    expect(chests.length).toBeGreaterThanOrEqual(2);
    const v = await newVisitor({ level: 50, fBest: st + 9, sgPity: 5 });
    const s = await begin(v, st);
    expect(s.superDrops).toBeUndefined();
    const r = await end(v, s, 10);
    expect(r.reward.tower!.chests).toEqual(chests);
    const want = await preview(s, chests, 5);
    const sets = (d: Drop[]) => d.filter((x) => x.kind === "set").map((x) => x.id);
    expect(sets(r.reward.drops)).toEqual(sets(want));
    // 천장 없음: 못 받은 수가 0이든 천장 근처든 굴림이 같다
    expect(await preview(s, chests, 0)).toEqual(want);
    expect(await preview(s, chests, 999)).toEqual(want);
    const c = await getRpgStore().get(v.id);
    expect(c.sg ?? []).toHaveLength(sets(want).length);
    expect(c.mats!.doc).toBe(want.filter((x) => x.id === "m_doc").reduce((a, x) => a + x.qty, 0));
    // 인감 도장은 chestSeals 층부터
    expect(c.mats!.seal ?? 0).toBe(want.filter((x) => x.id === "m_seal").reduce((a, x) => a + x.qty, 0));
    expect(c.mats!.seal ?? 0).toBe(chests.reduce((a, f) => a + chestSeals(f), 0));
    // 이번 주 기록이 PROT_FROM_FLOOR층부터 새 10층을 넘었다 → 보호 문서 1장
    expect(crossesTen(0, st + 9)).toBe(true);
    expect(c.mats!.prot).toBe(1);
    expect(r.reward.drops.some((x) => x.id === "m_prot")).toBe(true);
  });

  it("테스트 서버 슈퍼 계정: 상자마다 세트 장비·꾸미기가 늘 하나 (서버가 계정으로 정한다), 운영 서버에서는 켜지지 않는다", async () => {
    const st = cpFrom(TOWER_CHEST_FROM);
    const chests = chestsIn(st, 10);
    const op = await newVisitor({ level: 50, fBest: st + 9 });
    await setStaff(op.id);
    try {
      const s = await begin(op, st);
      expect(s.superDrops).toBe(true);
      const r = await end(op, s, 10);
      expect(r.reward.drops.filter((x) => x.kind === "set")).toHaveLength(chests.length);
      expect(r.reward.drops.filter((x) => x.kind === "set").map((x) => x.id)).toEqual(
        (await preview(s, chests, 0, true))
          .filter((x) => x.kind === "set")
          .map((x) => x.id),
      );
      // 운영 서버 (VERCEL_ENV=production): 같은 운영자 계정이어도 시험 드롭 없음
      vi.stubEnv("VERCEL_ENV", "production");
      try {
        const p = await begin(op, st);
        expect(p.superDrops).toBeUndefined();
      } finally {
        vi.stubEnv("VERCEL_ENV", "");
      }
    } finally {
      await setStaff(null);
    }
    // 보통 계정은 화면이 superDrops를 보내도 서버가 듣지 않는다 (요청 형식에 그런 칸이 없다)
    const v = await newVisitor({ level: 50, fBest: 20 });
    const res = await start.POST(
      call("/api/rpg/run/start", v, {
        game: "hunt",
        difficulty: "hell",
        tower: 1,
        superDrops: true,
      }),
    );
    // 11/19 판은 열려야 한다 (예전 11층은 이제 엘리베이터가 아니라 400으로 빈 통과가 됐다)
    expect(res.status).toBe(200);
    expect(((await res.json()) as RunStartResponse).superDrops).toBeUndefined();
  });
});

describe("강화·분해·끼기 (app/api/rpg/gear)", () => {
  it("강화: 포인트·재료를 한 번에 빼고 결과 저장, 포인트가 모자라면 아무것도 바뀌지 않는다", async () => {
    const v = await newVisitor(
      {
        level: 50,
        sg: [encodeSg(mk({ e: 5 }))],
        sgN: 2,
        mats: { doc: 10, seal: 0, prot: 0 },
      },
      150,
    );
    // 11/19 강화 비용은 표(ENHANCE_TABLE)에서: +5 → +6
    const need = ENHANCE_TABLE[6];
    const poor = await act(v, { type: "enhance", sg: 1, cost: need.cost });
    expect(poor.status).toBe(409);
    expect(poor.body.error!.code).toBe("NOT_ENOUGH_POINTS");
    expect((await getRpgStore().get(v.id)).mats!.doc).toBe(10);
    // 화면 비용이 다르면 돈을 받지 않는다
    expect((await act(v, { type: "enhance", sg: 1, cost: need.cost + 1 })).body.error!.code).toBe("COST_CHANGED");
    await getAccounts().refund(v.id, need.cost + 1000, "시험", Date.now());
    const before = (await getAccounts().get(v.id, "20261115", Date.now())).points;
    const ok = await act(v, { type: "enhance", sg: 1, cost: need.cost });
    expect(ok.status).toBe(200);
    expect(ok.body.points).toBe(before - need.cost);
    expect(ok.body.character.mats!.doc).toBe(10 - need.doc);
    expect([5, 6]).toContain(ok.body.gear!.enhance!.to);
  });

  it("세트 장비 끼기·빼기 → 능력치에 바로, 분해하면 재료", async () => {
    const v = await newVisitor({
      level: 50,
      sg: [encodeSg(mk({ u: 1 })), encodeSg(mk({ u: 2, p: 1, o: [["h", 9]] }))],
      sgN: 3,
    });
    const base = ((await (await rpg.GET(call("/api/rpg", v))).json()) as RpgView).derived;
    const w = await act(v, { type: "equip", slot: "weapon", uid: 1 });
    expect(w.status).toBe(200);
    expect(w.body.derived.atk).toBeGreaterThan(base.atk);
    expect((await act(v, { type: "equip", slot: "head", uid: 2 })).status).toBe(400);
    expect((await act(v, { type: "disassemble", uids: [1] })).body.error!.code).toBe("EQUIPPED");
    const d = await act(v, { type: "disassemble", uids: [2] });
    expect(d.body.gear!.got).toEqual({ doc: 40, seal: 3 });
    expect(d.body.character.sg).toHaveLength(1);
  });

  it("+15 처음: 「강화의 시작」 서버 최초 (운영자 제외) · 확성기", async () => {
    const op = await newVisitor(
      {
        level: 50,
        sg: [encodeSg(mk({ e: 14, f: 50 }))],
        sgN: 2,
        mats: { doc: 99, seal: 9, prot: 0 },
      },
      ENHANCE_TABLE[15].cost + 1000,
    );
    await setStaff(op.id);
    try {
      expect((await act(op, { type: "enhance", sg: 1, cost: ENHANCE_TABLE[15].cost })).body.gear!.enhance!.to).toBe(15);
    } finally {
      await setStaff(null);
    }
    expect((await getTowerStore().firsts()).t_firstEnh15).toBeUndefined();
    const v = await newVisitor(
      {
        level: 50,
        sg: [encodeSg(mk({ e: 14, f: 50 }))],
        sgN: 2,
        mats: { doc: 99, seal: 9, prot: 0 },
      },
      ENHANCE_TABLE[15].cost + 1000,
    );
    const r = await act(v, { type: "enhance", sg: 1, cost: ENHANCE_TABLE[15].cost });
    expect(r.body.gear!.enhance).toMatchObject({
      ok: true,
      to: 15,
      reached15: true,
    });
    // 11/18 서버 최초는 관리자 확인 뒤에 (줄을 선다)
    expect((await getTowerStore().firsts()).t_firstEnh15).toBeUndefined();
    const q = (await listReviews()).find((i) => i.kind === "first" && i.titleId === "t_firstEnh15" && i.acct === v.id)!;
    expect(await approveReview(q.id)).toEqual({ kind: "first", granted: true });
    expect((await getTowerStore().firsts()).t_firstEnh15).toBe(v.id);
    expect(r.body.character.enhMax).toBe(15);
    const lines = await getMegaphone()
      .recent(20)
      .catch(() => []);
    expect(JSON.stringify(lines)).toContain("+15로 강화했어요");
  });
});

describe("칭호", () => {
  it("4세트 처음 완성 (세트마다 은) · +15 「강화의 신」(전설)", () => {
    const facts: TitleFacts = {
      dexTitleNames: [],
      champBoards: [],
      metrics: { sgMeeting: 1, enh: 15 },
    };
    const got = earnedTitleIds(facts);
    expect(got).toContain("t_sgMeeting");
    expect(got).toContain("t_enh15");
    expect(got).not.toContain("t_sgTrip");
  });
});

describe("결과 검증 상한 (장비 힘)", () => {
  it("판 시작 때 서버가 저장된 장착 칸으로 장비 힘을 재서 티켓에 싣는다 (화면 말은 안 믿는다)", async () => {
    const strong = encodeSg(
      mk({
        e: 15,
        o: [
          ["a", 8],
          ["s", 8],
          ["d", 20],
        ],
        L: 2,
      }),
    );
    const v = await newVisitor({
      level: 50,
      sg: [strong],
      sgN: 2,
      equip: {
        weapon: strong,
        armor: null,
        head: null,
        acc1: null,
        acc2: null,
      },
    });
    const s = await begin(v, 1);
    const claims = JSON.parse(Buffer.from(s.ticket.split(".")[0], "base64url").toString()) as { gp?: number };
    expect(claims.gp).toBeGreaterThan(2);
    const plain = await newVisitor({ level: 50 });
    const p = await begin(plain, 1);
    expect((JSON.parse(Buffer.from(p.ticket.split(".")[0], "base64url").toString()) as { gp?: number }).gp).toBeUndefined();
  });
});

describe("슈퍼 계정 여러 층 (11/19 상자는 TOWER_CHEST_FROM층부터 — 그 위 체크포인트 셋에서 10층씩)", () => {
  it("상자마다 세트 장비·꾸미기, 오류 없이 정산", async () => {
    const st0 = cpFrom(TOWER_CHEST_FROM);
    const starts = [st0, nextCheckpoint(st0), nextCheckpoint(nextCheckpoint(st0))];
    const op = await newVisitor({ level: 50, fBest: starts[2] + 9 });
    await setStaff(op.id);
    try {
      for (const st of starts) {
        const s = await begin(op, st);
        const r = await end(op, s, 10);
        expect(r.reward.drops.filter((x) => x.kind === "set")).toHaveLength(chestsIn(st, 10).length);
        expect(chestsIn(st, 10).length).toBeGreaterThan(0);
      }
    } finally {
      await setStaff(null);
    }
  });
});

describe("사냥터 방 입장 토큰에 사냥 장비 표시 (서버가 캐릭터 저장값으로)", () => {
  it("사냥터 방만 낀 갑옷·머리·장신구를 싣고, 마을 방에는 싣지 않는다", async () => {
    const { verifyJoinToken } = await import("@tomb/protocol");
    const roomJoin = await import("../join/room/route");
    const set = encodeSg(mk({ u: 1, p: 1, s: 2, o: [["h", 9]] }));
    const v = await newVisitor({ level: 50, sg: [set], sgN: 2, inv: { h_cap: 1, w_ruler: 1 }, equip: { weapon: "w_ruler", armor: set, head: "h_cap", acc1: null, acc2: null } });
    const join = async (room: string) => (await (await roomJoin.POST(call("/api/join/room", v, { room }))).json()) as { token: string };
    const hunt = await verifyJoinToken("dev-join-secret-change-me", (await join("hunt:slime:a")).token);
    expect(hunt?.look).toEqual(expect.arrayContaining(["sgw.a.23", "sgw.h.h_cap"]));
    expect(hunt?.look?.some((x) => x.includes("w_ruler"))).toBe(false);
    const village = await verifyJoinToken("dev-join-secret-change-me", (await join("village")).token);
    expect(village?.look?.some((x) => x.startsWith("sgw."))).toBe(false);
  });
});

describe("11/19 숨겨진 5세트 효과 발견 (이스터에그)", () => {
  // 같은 세트 다섯 부위 (무기·갑옷·머리·장신구 둘) — 칸 순서가 부위 순서와 같다
  const fiveOf = (s: number, u0: number) => SG_PIECES.map((_, p) => encodeSg(mk({ s, p, u: u0 + p, o: [] })));
  const wearAll = (codes: string[]) => Object.fromEntries(GEAR_SLOTS.map((slot, i) => [slot, codes[i] ?? null])) as CharacterState["equip"];

  it("다섯 부위를 다 끼고 있을 때만 서버가 발견 비트를 켠다 (다른 세트·4부위·빈 요청은 그대로, 다른 비트는 지킨다)", async () => {
    const trip = fiveOf(3, 1);
    const v = await newVisitor({ level: 50, sg: trip, sgN: 6, equip: wearAll(trip), sgEgg: SG_EGG_BIT.overtime });
    // 출장 다섯 부위를 꼈다 → 출장만 켜지고 예전에 찾은 야근은 그대로
    const ok = await act(v, { type: "egg", set: SG_SETS.indexOf("trip") });
    expect(ok.status).toBe(200);
    expect(ok.body.character.sgEgg).toBe(SG_EGG_BIT.overtime | SG_EGG_BIT.trip);
    // 끼지 않은 세트는 켜지 않는다 (화면 말만으로는 못 켠다)
    const no = await act(v, { type: "egg", set: SG_SETS.indexOf("approval") });
    expect(no.status).toBe(200);
    expect(no.body.character.sgEgg).toBe(SG_EGG_BIT.overtime | SG_EGG_BIT.trip);
    // 형식이 틀린 요청은 거절
    expect((await act(v, { type: "egg", set: 4 })).status).toBe(400);
    // 네 부위만 끼면 켜지지 않는다
    const four = fiveOf(1, 1);
    const w = await newVisitor({ level: 50, sg: four, sgN: 6, equip: wearAll(four.slice(0, 4)) });
    expect((await act(w, { type: "egg", set: SG_SETS.indexOf("approval") })).body.character.sgEgg ?? 0).toBe(0);
    // 저장값에도 남는다
    expect((await getRpgStore().get(v.id)).sgEgg).toBe(SG_EGG_BIT.overtime | SG_EGG_BIT.trip);
  });
});
