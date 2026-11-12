import { nanoid } from "nanoid";
import { isPermanentUntil, PERMANENT_UNTIL, permanentPrice, verifyGrant } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts, getGifts } from "../store";
import { kstDay, loadMe } from "../store/accounts";
import { getStyleStore } from "../store/style";
import { buildPalette, cellColor, colorAt, DYE_BOARD_H, DYE_BOARD_W, DYE_CENTER, DYE_GRACE_MS, DYE_TIERS, DYE_TIME_MS } from "./palette";
import { DYE_RESET_PRICE, RESHAPE_PRICE } from "./rules";
import { AdminDyeIssueSchema, DyeFinishSchema, DyeStartSchema } from "./schemas";
import { applyFixedDye, buyPermanent, dyeState, finishDye, issueFixedDye, judgeColor, reshape, resetDye, startDye } from "./service";

// 46번 염색 · 25번 외형 바꾸기 · 30번 영구 코디 (로컬 메모리 저장소 — Redis Lua는 같은 규칙으로 style.ts에)

const distinct = (seed: string, tier: 1 | 2 | 3) => new Set(buildPalette(seed, tier).blobs.map((b) => b.color)).size;

describe("46번 팔레트", () => {
  it("같은 시드·등급이면 같은 판, 시드가 다르면 색도 자리도 다르다", () => {
    const a = buildPalette("seed-aaaa", 2);
    expect(buildPalette("seed-aaaa", 2)).toEqual(a);
    const b = buildPalette("seed-bbbb", 2);
    expect(b.blobs.map((x) => x.color)).not.toEqual(a.blobs.map((x) => x.color));
    // 같은 칸의 색이 판마다 다르다 (여러 칸 중 대부분)
    let same = 0;
    for (let i = 0; i < 40; i++) if (colorAt(a, i * 4, (i * 7) % DYE_BOARD_H) === colorAt(b, i * 4, (i * 7) % DYE_BOARD_H)) same++;
    expect(same).toBeLessThan(5);
  });

  it("비싼 등급일수록 색이 다양하고 조준점이 덜 흔들린다 (시간은 모두 60초)", () => {
    const avg = (t: 1 | 2 | 3) => [1, 2, 3, 4, 5].reduce((n, i) => n + distinct(`s${i}xxxx`, t), 0) / 5;
    expect(avg(1)).toBeLessThan(avg(2));
    expect(avg(2)).toBeLessThan(avg(3));
    expect(DYE_TIERS[1].wobblePx).toBeGreaterThan(DYE_TIERS[2].wobblePx);
    expect(DYE_TIERS[2].wobblePx).toBeGreaterThan(DYE_TIERS[3].wobblePx);
    expect(DYE_TIME_MS).toBe(60_000);
  });

  it("칸 색은 #rrggbb이고 판 밖 좌표는 가장자리로 붙는다", () => {
    const p = buildPalette("edge-test", 3);
    for (let i = 0; i < 50; i++) expect(cellColor(p, i * 3, i)).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorAt(p, -5, -5)).toBe(cellColor(p, 0, 0));
    expect(colorAt(p, 1e9, 1e9)).toBe(cellColor(p, DYE_BOARD_W - 1, DYE_BOARD_H - 1));
  });

  it("요청 검증: 좌표는 판 안, 무작위 염색권만, 색 값을 받는 필드는 없다", () => {
    expect(DyeFinishSchema.safeParse({ seed: "abcdefgh", x: 10, y: 10 }).success).toBe(true);
    expect(DyeFinishSchema.safeParse({ seed: "abcdefgh", x: DYE_BOARD_W, y: 10 }).success).toBe(false);
    expect(DyeStartSchema.safeParse({ itemId: "dye_basic", part: "head" }).success).toBe(true);
    expect(DyeStartSchema.safeParse({ itemId: "hat_cat", part: "head" }).success).toBe(false);
    expect(DyeStartSchema.safeParse({ itemId: "dye_basic", part: "feet" }).success).toBe(false);
    // 관리자 발급 색은 형식을 맞춘다
    expect(AdminDyeIssueSchema.parse({ name: "벚꽃 분홍", color: "F4A7B9", count: 1, target: "all" }).color).toBe("#f4a7b9");
    expect(AdminDyeIssueSchema.safeParse({ name: "x", color: "pink", count: 1, target: "all" }).success).toBe(false);
  });
});

describe.skipIf(!!env.redis())("46·25·30번 서버 흐름 (메모리)", () => {
  const accounts = getAccounts();
  async function account(points: number, items: Record<string, number> = {}): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
    await accounts.adjustPoints(id, points);
    for (const [itemId, n] of Object.entries(items)) for (let i = 0; i < n; i++) {
      await accounts.adjustPoints(id, 1000);
      await accounts.buy(id, itemId, 1000);
    }
    return id;
  }
  const pts = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;

  it("무작위 염색: 염색권 1장 → 판, 좌표만 보내면 서버가 그 판의 색으로 칠한다 (두 번 끝낼 수 없다)", async () => {
    const id = await account(0, { dye_fine: 1 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_fine", "body", t0);
    expect(s.resumed).toBe(false);
    expect(s.session.tier).toBe(2);
    expect(s.session.endsAt - s.session.startedAt).toBe(DYE_TIME_MS);
    expect(s.me.inventory.dye_fine ?? 0).toBe(0);
    // 다시 시작하면 진행 중인 판 (염색권이 없어도)
    const again = await startDye(id, "dye_fine", "head", t0 + 1000);
    expect(again.resumed).toBe(true);
    expect(again.session.seed).toBe(s.session.seed);
    const done = await finishDye(id, s.session.seed, 33.2, 41.9, t0 + 20_000);
    expect(done.color).toBe(judgeColor(s.session, 33.2, 41.9));
    expect(done.part).toBe("body");
    expect(done.me.dye).toEqual({ body: done.color });
    // 착용 증서에 염색이 실린다 (실시간 서버 → 다른 사람 화면)
    const g = await verifyGrant(env.joinSecret(), done.lookGrant);
    expect(g?.kind === "look" && g.dye).toEqual({ body: done.color });
    await expect(finishDye(id, s.session.seed, 1, 1, t0 + 21_000)).rejects.toMatchObject({ code: "NO_SESSION" });
    await expect(startDye(id, "dye_fine", "head", t0 + 22_000)).rejects.toMatchObject({ code: "NO_ITEM" });
  });

  it("시간이 지나 온 좌표는 무시하고 처음 조준점(판 가운데) 색으로 정한다, 안 끝낸 판도 다음에 열 때 정해진다", async () => {
    const id = await account(0, { dye_basic: 2 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_basic", "accent", t0);
    const late = await finishDye(id, s.session.seed, 5, 5, t0 + DYE_TIME_MS + DYE_GRACE_MS + 1);
    expect(late.late).toBe(true);
    expect(late.color).toBe(judgeColor(s.session, DYE_CENTER.x, DYE_CENTER.y));
    // 창을 닫고 떠난 판 → 상태를 열면 가운데 색으로 정해진다 (무료로 다시 뽑기 막기)
    const s2 = await startDye(id, "dye_basic", "head", t0 + 100_000);
    const st = await dyeState(id, t0 + 100_000 + DYE_TIME_MS + DYE_GRACE_MS + 5);
    expect(st.session).toBeNull();
    expect(st.finalized).toEqual({ part: "head", color: judgeColor(s2.session, DYE_CENTER.x, DYE_CENTER.y) });
    expect(st.dye.head).toBe(st.finalized!.color);
  });

  it("원래 색 되돌리기는 포인트, 이미 원래 색이면 포인트를 쓰지 않는다", async () => {
    const id = await account(DYE_RESET_PRICE + 10, { dye_basic: 1 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_basic", "head", t0);
    await finishDye(id, s.session.seed, 10, 10, t0 + 1000);
    await expect(resetDye(id, "body")).rejects.toMatchObject({ code: "NO_CHANGE" });
    const r = await resetDye(id, "head");
    expect(r.me.dye).toEqual({});
    expect(await pts(id)).toBe(10);
    const g = await verifyGrant(env.joinSecret(), r.lookGrant);
    expect(g?.kind === "look" && g.dye).toEqual({}); // 되돌림도 실시간 서버에 알린다
  });

  it("고정 색 염색권: 관리자가 선물함으로 보내고, 받으면 부위만 골라 그 색 (허용 부위만)", async () => {
    const id = await account(0);
    const { def, giftId } = await issueFixedDye({ name: "벚꽃 분홍 염색권", color: "#f4a7b9", parts: ["accent", "head"], count: 2, target: id });
    expect(def.id).toMatch(/^dyefix_/);
    const claim = await getGifts().claim(id, giftId, Date.now() - 30_000, Date.now());
    expect(claim.ok).toBe(true);
    expect((await loadMe(accounts, id)).inventory[def.id]).toBe(2);
    const st = await dyeState(id);
    expect(st.tickets[def.id]).toMatchObject({ name: "벚꽃 분홍 염색권", color: "#f4a7b9" });
    await expect(applyFixedDye(id, def.id, "body")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const r = await applyFixedDye(id, def.id, "accent");
    expect(r.me.dye).toEqual({ accent: "#f4a7b9" });
    expect(r.me.inventory[def.id]).toBe(1);
    // 없는 염색권 id
    await expect(applyFixedDye(id, "dyefix_nonexist1", "head")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("외형 바꾸기: 포인트를 내고 몸 모양만 바뀌고 염색은 그대로, 증서에 몸이 실린다", async () => {
    const id = await account(RESHAPE_PRICE, { dye_basic: 1 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_basic", "body", t0);
    const dyed = await finishDye(id, s.session.seed, 50, 50, t0 + 100);
    await expect(reshape(id, "hood")).rejects.toMatchObject({ code: "NO_CHANGE" });
    const r = await reshape(id, "cat");
    expect(r.me.body).toBe("cat");
    expect(r.me.dye).toEqual(dyed.me.dye);
    expect(await pts(id)).toBe(0);
    const g = await verifyGrant(env.joinSecret(), r.lookGrant);
    expect(g?.kind === "look" && g.body).toBe("cat");
    await expect(reshape(id, "bun")).rejects.toMatchObject({ code: "NOT_ENOUGH_POINTS" });
  });

  it("영구 코디: 입고 있던 기간제가 영구로, 아니면 벗어 둔 꾸미기에 영구로 — 다시 사거나 하루권을 살 수 없다", async () => {
    const price = permanentPrice("hat_crown")!;
    const id = await account(price * 2 + 200);
    const now = Date.now();
    // 하루권을 입고 있다가 영구로 바꾸기
    await accounts.buy(id, "hat_crown", 120);
    await accounts.equip(id, "hat_crown", "head", now + 86_400_000, now);
    const r = await buyPermanent(id, "hat_crown", now);
    expect(r.me.equipped.find((e) => e.itemId === "hat_crown")?.until).toBe(PERMANENT_UNTIL);
    await expect(buyPermanent(id, "hat_crown", now)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    expect(await accounts.buy(id, "hat_crown", 120, { unique: true, now })).toBe("owned");
    // 벗어도 영구 그대로 (만료되지 않는다)
    await accounts.unequip(id, "head", now);
    const later = await accounts.get(id, kstDay(), now + 400 * 86_400_000);
    expect(later.stash.find((e) => e.itemId === "hat_crown")?.until).toBe(PERMANENT_UNTIL);
    expect(isPermanentUntil(later.stash[0].until)).toBe(true);
    // 안 가진 꾸미기를 영구로 → 벗어 둔 꾸미기
    const r2 = await buyPermanent(id, "pet_ghost", now);
    expect(r2.me.stash.some((e) => e.itemId === "pet_ghost" && e.until === PERMANENT_UNTIL)).toBe(true);
    // 가방에 새 이용권이 있으면 먼저 입게 한다, 포인트 모자람
    await accounts.adjustPoints(id, 1000);
    await accounts.buy(id, "hat_halo", 40);
    await expect(buyPermanent(id, "hat_halo", now)).rejects.toMatchObject({ code: "HAS_TICKET" });
    const poor = await account(10);
    await expect(buyPermanent(poor, "hat_cat", now)).rejects.toMatchObject({ code: "NOT_ENOUGH_POINTS" });
    await expect(buyPermanent(poor, "hat_straw", now)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("옛 계정(염색 기록 없음)은 dye가 비어 있다", async () => {
    const id = await account(0);
    expect((await loadMe(accounts, id)).dye).toEqual({});
    expect((await getStyleStore(accounts).get(id)).session).toBeNull();
  });
});
