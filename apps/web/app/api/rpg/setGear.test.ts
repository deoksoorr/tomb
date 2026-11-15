import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MonsterId } from "@/lib/rpg/catalog";
import { encodeSg, type SgItem } from "@/lib/rpg/setGear";
import { nextPity } from "@/lib/rpg/setGearRoll";
import { forgetEndgameLaunch } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import { towerChestDrops, towerPlan } from "@/lib/rpg/tower";
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

/** 판 안 미리보기: 게임이 상자를 여는 순서대로 천장을 센다 */
function preview(s: RunStartResponse, chests: number[], pity: number, sup = false): Drop[] {
  let p = pity;
  return chests.flatMap((f) => {
    const d = towerChestDrops(s.seed, f, s.tower!, p, sup);
    p = nextPity(d, p);
    return d;
  });
}

describe("우두머리 상자: 세트 장비·재료·꾸미기", () => {
  it("판 안에서 떨군 것 = 서버가 준 것 (천장 이어 세기), 재료는 가방에, 천장은 저장", async () => {
    const v = await newVisitor({ level: 50, fBest: 20, sgPity: 5 });
    const s = await begin(v, 11);
    expect(s.superDrops).toBeUndefined();
    const r = await end(v, s, 10);
    expect(r.reward.tower!.chests).toEqual([15, 20]);
    const want = preview(s, [15, 20], 5);
    const sets = (d: Drop[]) => d.filter((x) => x.kind === "set").map((x) => x.id);
    expect(sets(r.reward.drops)).toEqual(sets(want));
    const c = await getRpgStore().get(v.id);
    expect(c.sg).toHaveLength(sets(want).length);
    expect(c.mats!.doc).toBe(want.filter((x) => x.id === "m_doc").reduce((a, x) => a + x.qty, 0));
    // 천장 5에서 상자 둘: 세트 장비가 안 나왔으면 7, 나왔으면 0부터 다시
    let p = 5;
    for (const f of [15, 20]) p = nextPity(towerChestDrops(s.seed, f, 11, p), p);
    expect(c.sgPity).toBe(p);
    // 10층 단위를 처음 넘은 주간 기록 (11~20층) → 보호 문서 1장
    expect(c.mats!.prot).toBe(1);
    expect(r.reward.drops.some((x) => x.id === "m_prot")).toBe(true);
  });

  it("테스트 서버 슈퍼 계정: 상자마다 세트 장비·꾸미기가 늘 하나 (서버가 계정으로 정한다), 운영 서버에서는 켜지지 않는다", async () => {
    const op = await newVisitor({ level: 50, fBest: 20 });
    await setStaff(op.id);
    try {
      const s = await begin(op, 11);
      expect(s.superDrops).toBe(true);
      const r = await end(op, s, 10);
      expect(r.reward.drops.filter((x) => x.kind === "set")).toHaveLength(2);
      expect(r.reward.drops.filter((x) => x.kind === "set").map((x) => x.id)).toEqual(
        preview(s, [15, 20], 0, true)
          .filter((x) => x.kind === "set")
          .map((x) => x.id),
      );
      // 운영 서버 (VERCEL_ENV=production): 같은 운영자 계정이어도 시험 드롭 없음
      vi.stubEnv("VERCEL_ENV", "production");
      try {
        const p = await begin(op, 11);
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
        tower: 11,
        superDrops: true,
      }),
    );
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
    const poor = await act(v, { type: "enhance", sg: 1, cost: 200 });
    expect(poor.status).toBe(409);
    expect(poor.body.error!.code).toBe("NOT_ENOUGH_POINTS");
    expect((await getRpgStore().get(v.id)).mats!.doc).toBe(10);
    // 화면 비용이 다르면 돈을 받지 않는다
    expect((await act(v, { type: "enhance", sg: 1, cost: 500 })).body.error!.code).toBe("COST_CHANGED");
    await getAccounts().refund(v.id, 1000, "시험", Date.now());
    const before = (await getAccounts().get(v.id, "20261115", Date.now())).points;
    const ok = await act(v, { type: "enhance", sg: 1, cost: 200 });
    expect(ok.status).toBe(200);
    expect(ok.body.points).toBe(before - 200);
    expect(ok.body.character.mats!.doc).toBe(8);
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
      3000,
    );
    await setStaff(op.id);
    try {
      expect((await act(op, { type: "enhance", sg: 1, cost: 880 })).body.gear!.enhance!.to).toBe(15);
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
      3000,
    );
    const r = await act(v, { type: "enhance", sg: 1, cost: 880 });
    expect(r.body.gear!.enhance).toMatchObject({
      ok: true,
      to: 15,
      reached15: true,
    });
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

describe("슈퍼 계정 여러 층 (31층부터 10층)", () => {
  it("상자 둘 모두 세트 장비·꾸미기, 오류 없이 정산", async () => {
    const op = await newVisitor({ level: 50, fBest: 60 });
    await setStaff(op.id);
    try {
      for (const st of [31, 11, 1]) {
        const s = await begin(op, st);
        const r = await end(op, s, 10);
        expect(r.reward.drops.filter((x) => x.kind === "set")).toHaveLength(2);
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
