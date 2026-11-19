import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { inheritNeed, inheritTo } from "@/lib/rpg/enhance";
import { seeded } from "@/lib/rpg/formulas";
import type { GearActionResponse } from "@/lib/rpg/gearService";
import { decodeSg, encodeSg, type SgItem } from "@/lib/rpg/setGear";
import { rollSgFixed } from "@/lib/rpg/setGearRoll";
import { getRpgStore } from "@/lib/rpg/store";
import type { CharacterState } from "@/lib/rpg/types";
import { getAccounts } from "@/lib/store";
import * as session from "../session/route";
import * as gear from "./gear/route";

// 11/19 강화 승계 API: 포인트·서류를 한 번에 빼고, 화면 비용이 다르면 돈을 받지 않는다

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

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

async function newVisitor(patch: Partial<CharacterState>, points: number): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.47.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getRpgStore().update(v.id, (s) => ({ state: { ...s, level: 50, runs: 1, ...patch }, result: null }));
  if (points) await getAccounts().refund(v.id, points, "시험", Date.now());
  return v;
}

const item = (p: Partial<SgItem>): SgItem => ({ u: 1, e: 0, rr: 0, f: 0, ...rollSgFixed(seeded(3 + (p.u ?? 1)), 0, 0, (p.g ?? 0) as 0 | 1 | 2 | 3), ...p });

describe("강화 승계 API", () => {
  it("사원 +15 세트 무기 → 대리 세트 무기, 포인트·서류를 뺀다 · 화면 비용이 다르면 거절", async () => {
    const need = inheritNeed(inheritTo(0, 15, 1));
    const v = await newVisitor({ sg: [encodeSg(item({ u: 1, e: 15, g: 0 })), encodeSg(item({ u: 2, g: 1 }))], sgN: 3, mats: { doc: 20, seal: 0, prot: 0 } }, need.cost + 100);
    const bad = await gear.POST(call("/api/rpg/gear", v, { type: "inherit", fromSg: 1, sg: 2, cost: need.cost + 1 }));
    expect(bad.status).toBe(409);
    const res = await gear.POST(call("/api/rpg/gear", v, { type: "inherit", fromSg: 1, sg: 2, cost: need.cost }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as GearActionResponse;
    expect(body.gear?.inherit).toMatchObject({ src: 15, from: 0, to: inheritTo(0, 15, 1) });
    expect(body.points).toBe(100);
    expect(body.character.sg).toHaveLength(1);
    expect(decodeSg(body.character.sg![0])).toMatchObject({ u: 2, e: inheritTo(0, 15, 1) });
    expect(body.character.mats?.doc).toBe(20 - need.doc);
  });

  it("포인트가 모자라면 아무것도 바뀌지 않는다", async () => {
    const need = inheritNeed(inheritTo(0, 15, 1));
    const v = await newVisitor({ sg: [encodeSg(item({ u: 1, e: 15, g: 0 })), encodeSg(item({ u: 2, g: 1 }))], sgN: 3, mats: { doc: 20, seal: 0, prot: 0 } }, need.cost - 1);
    const res = await gear.POST(call("/api/rpg/gear", v, { type: "inherit", fromSg: 1, sg: 2, cost: need.cost }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const s = await getRpgStore().get(v.id);
    expect(s.sg).toHaveLength(2);
    expect(s.mats?.doc).toBe(20);
  });
});
