import { SPROUT_MINUTES, verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readChatLog } from "@/game/logic/chatLog";
import { forgetManagers, getManagerStore } from "@/lib/managers";
import { SPROUT_SINCE, sproutLeftMinutes } from "@/lib/sprout";
import { SPROUT_H, SPROUT_W, sproutPixels } from "@/lib/sproutArt";
import { setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import type { JoinResponse, RoomJoinResponse } from "@/lib/types";
import * as join from "./join/route";
import * as joinRoom from "./join/room/route";
import * as session from "./session/route";

// 11/22 새싹 표시: 총 접속 3시간 미만 새 이웃 → 입장 토큰에 남은 분(nb). 운영자·매니저·기록 전 옛 계정은 아니다

const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no realtime"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
  for (const m of await getManagerStore().list()) await getManagerStore().remove(m.accountId);
  forgetManagers();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { visitor?: Visitor; body?: unknown } = {}) {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130.0.0.0" };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  const ip = `10.22.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
  const res = await session.POST(call("/api/session"));
  const v = { cookie: res.headers.get("set-cookie")!.split(";")[0], ip, visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId };
  await getAccounts().enter(v.visitorId, { name: `새싹${ipSeq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return v;
}
/** 메모리 저장소의 계정 칸을 바로 고친다 (총 접속 시간·처음 입장 시각) */
function patch(id: string, p: { stayMin?: number; createdAt?: number }) {
  const a = (getAccounts() as unknown as { accts: Map<string, { stayMin?: number; createdAt?: number }> }).accts.get(id);
  if (!a) throw new Error("계정 없음");
  Object.assign(a, p);
}
const tokenOf = async (v: Visitor) => {
  const r = await bodyOf<JoinResponse>(join.POST(call("/api/join", { visitor: v, body: { channel: 1, name: "검수", color: "#9fc5a8" } })));
  if (r.mode !== "channel") throw new Error("채널 입장이 아님");
  return verifyJoinToken(SECRET, r.token);
};
const roomTokenOf = async (v: Visitor) => {
  const r = await bodyOf<RoomJoinResponse>(joinRoom.POST(call("/api/join/room", { visitor: v, body: { room: "hunt:forest:hell" } })));
  return verifyJoinToken(SECRET, r.token);
};

describe("11/22 새싹 규칙 (lib/sprout)", () => {
  const fresh = SPROUT_SINCE + 1;
  const none = { staff: false, mgr: false };
  it("총 접속 3시간 미만이면 남은 분, 3시간이 차면 0", () => {
    expect(sproutLeftMinutes({ stayMin: 0, createdAt: fresh }, none)).toBe(SPROUT_MINUTES);
    expect(sproutLeftMinutes({ stayMin: 170, createdAt: fresh }, none)).toBe(10);
    expect(sproutLeftMinutes({ stayMin: 179.5, createdAt: fresh }, none)).toBe(1);
    expect(sproutLeftMinutes({ stayMin: 180, createdAt: fresh }, none)).toBe(0);
    expect(sproutLeftMinutes({ stayMin: 5000, createdAt: fresh }, none)).toBe(0);
  });
  it("11/14 전에 온 계정(총 접속 기록이 모자란 옛 이웃)·기록 없는 계정·운영자·매니저는 새싹이 아니다", () => {
    expect(sproutLeftMinutes({ stayMin: 0, createdAt: SPROUT_SINCE - 1 }, none)).toBe(0);
    expect(sproutLeftMinutes({ stayMin: 0, createdAt: 0 }, none)).toBe(0);
    expect(sproutLeftMinutes({ stayMin: 0, createdAt: fresh }, { staff: true, mgr: false })).toBe(0);
    expect(sproutLeftMinutes({ stayMin: 0, createdAt: fresh }, { staff: false, mgr: true })).toBe(0);
  });
  it("그림은 외곽선까지 11×11, 가장자리 한 칸은 비어 있지 않다 (잘린 데 없이)", () => {
    const px = sproutPixels();
    expect([SPROUT_W, SPROUT_H]).toEqual([11, 11]);
    expect(px).toHaveLength(SPROUT_H);
    expect(px.every((r) => r.length === SPROUT_W)).toBe(true);
    expect(px[0].some(Boolean) && px[SPROUT_H - 1].some(Boolean)).toBe(true);
  });
});

describe("11/22 새싹 입장 토큰", () => {
  it("새 계정은 남은 180분, 총 접속이 쌓이면 줄고 3시간이 차면 빠진다 (채널·사냥터 방 모두)", async () => {
    const v = await newVisitor();
    expect((await tokenOf(v))?.nb).toBe(SPROUT_MINUTES);
    expect((await roomTokenOf(v))?.nb).toBe(SPROUT_MINUTES);
    patch(v.visitorId, { stayMin: 170 });
    expect((await tokenOf(v))?.nb).toBe(10);
    patch(v.visitorId, { stayMin: 180 });
    expect((await tokenOf(v))?.nb).toBeUndefined();
    expect((await roomTokenOf(v))?.nb).toBeUndefined();
  });

  it("기록 전 옛 계정·운영자·매니저 토큰에는 없다", async () => {
    const old = await newVisitor();
    patch(old.visitorId, { createdAt: SPROUT_SINCE - 86_400_000 });
    expect((await tokenOf(old))?.nb).toBeUndefined();
    const staff = await newVisitor();
    await setStaff(staff.visitorId);
    expect((await tokenOf(staff))?.nb).toBeUndefined();
    const mgr = await newVisitor();
    await getManagerStore().add({ accountId: mgr.visitorId, name: null, setAt: Date.now() });
    forgetManagers();
    expect((await tokenOf(mgr))?.nb).toBeUndefined();
  });

  it("지난 대화 기록의 새싹 표시를 읽는다 (true만)", () => {
    const lines = readChatLog(10_000, [{ id: "a", at: 9_000, name: "새싹이", text: "안녕", nb: true }, { id: "b", at: 9_500, name: "고참", text: "어서 와요", nb: 1 }], 50_000);
    expect(lines.map((l) => l.nb)).toEqual([true, undefined]);
  });
});
