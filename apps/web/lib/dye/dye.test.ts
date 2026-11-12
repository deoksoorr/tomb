import { nanoid } from "nanoid";
import { BODY_TIER_INFO, bodyUnlockPrice, isPermanentUntil, PERMANENT_UNTIL, permanentPrice, verifyGrant } from "@tomb/protocol";
import { describe, expect, it, vi } from "vitest";
import { env } from "../env";
import { getAccounts, getGifts } from "../store";
import { kstDay, loadMe } from "../store/accounts";
import { setStaff } from "../staff";
import { getStyleStore } from "../store/style";
import type { MemoryAccounts } from "../store/accounts-memory";
import { buildPalette, cellColor, cellHex, cellRgb, cellSpecial, colorAt, DYE_BOARD_H, DYE_BOARD_W, DYE_GRACE_MS, DYE_TIERS, DYE_TIME_MS, samplePoints, type DyeTier } from "./palette";
import { DYE_DECIDE_MS, DYE_RESET_PRICE } from "./rules";
import { AdminDyeIssueSchema, DyeFinishSchema, DyeStartSchema } from "./schemas";
import { applyFixedDye, buyPermanent, cancelDye, chooseDye, dyeState, finishDye, issueFixedDye, judgeColor, reshape, resetDye, startDye, timeoutDye } from "./service";

// node(V8)·사파리 엔진(JavaScriptCore, osascript)에서 같은 값임을 확인했다 (11/12 개편 2: 무늬 구역·색 계열·특수 색, 등급 1~8)
const GOLDEN = ["a929804f", "d04df9bf", "54bb9d36", "4184b72", "b9a4360a", "9183ac7d", "42377504", "a78dd314"];
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly DyeTier[];

// 46번 염색 · 25번 외형 바꾸기 · 30번 영구 코디 (로컬 메모리 저장소 — Redis Lua는 같은 규칙으로 style.ts에)

/** 판 전체에서 서로 다른 색 수 */
const distinct = (seed: string, tier: DyeTier) => {
  const p = buildPalette(seed, tier);
  const set = new Set<number>();
  for (let y = 0; y < DYE_BOARD_H; y++) for (let x = 0; x < DYE_BOARD_W; x++) set.add(cellRgb(p, x, y));
  return set.size;
};
/** 판 전체 색의 해시 (FNV-1a) — 같은 함수면 어느 엔진에서나 같은 값 */
const boardHash = (seed: string, tier: DyeTier) => {
  const p = buildPalette(seed, tier);
  let h = 0x811c9dc5;
  for (let y = 0; y < DYE_BOARD_H; y++) for (let x = 0; x < DYE_BOARD_W; x++) h = Math.imul(h ^ cellRgb(p, x, y), 0x01000193);
  return (h >>> 0).toString(16);
};
const rgb = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];

describe("46번 팔레트 (11/12 개편: 연속 색 공간)", () => {
  it("같은 시드·등급이면 같은 판, 시드가 다르면 칸 색이 다르다", () => {
    const a = buildPalette("seed-aaaa", 2);
    expect(buildPalette("seed-aaaa", 2)).toEqual(a);
    const b = buildPalette("seed-bbbb", 2);
    let same = 0;
    for (let i = 0; i < 40; i++) if (colorAt(a, i * 7, (i * 11) % DYE_BOARD_H) === colorAt(b, i * 7, (i * 11) % DYE_BOARD_H)) same++;
    expect(same).toBeLessThan(3);
  });

  it("정수 연산만: 삼각함수·지수·제곱근 없이 계산한다 (엔진마다 결과가 달라질 여지가 없다)", () => {
    const names = ["sin", "cos", "tan", "atan2", "exp", "log", "pow", "sqrt", "hypot", "cbrt"] as const;
    const saved = names.map((n) => [n, Math[n]] as const);
    const spies = names.map((n) => vi.spyOn(Math, n).mockImplementation(() => {
      throw new Error(`Math.${n} 사용`);
    }));
    try {
      for (const t of TIERS) {
        const p = buildPalette("int-only", t);
        for (let i = 0; i < 200; i++) cellColor(p, (i * 37) % DYE_BOARD_W, (i * 53) % DYE_BOARD_H);
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(saved.every(([n, f]) => Math[n] === f)).toBe(true);
  });

  it("고정 시드의 판 전체가 기록해 둔 값과 한 칸도 다르지 않다 (클라이언트·서버가 같은 판을 본다)", () => {
    // 이 값이 바뀌면 판 함수가 바뀐 것: 이미 열린 판의 색이 화면과 서버에서 달라질 수 있으니 CLIENT_VERSION도 함께 올린다
    expect(TIERS.map((t) => boardHash("golden-seed", t))).toEqual(GOLDEN);
    // 서버 판정(judgeColor)과 화면 그리기(cellColor)는 같은 칸에서 같은 색
    const p = buildPalette("golden-seed", 3);
    for (let i = 0; i < 100; i++) {
      const x = (i * 31.7) % DYE_BOARD_W;
      const y = (i * 17.3) % DYE_BOARD_H;
      expect(judgeColor({ seed: "golden-seed", tier: 3 }, x, y)).toBe(cellColor(p, Math.floor(x), Math.floor(y)));
    }
  });

  it("부드러운 그라데이션 + 무늬: 옆 칸끼리 거의 조금씩만 다르고(체크·띠 경계만 또렷), 칸마다 색이 거의 다 다르다", () => {
    for (const t of TIERS) {
      const p = buildPalette(`smooth-${t}`, t);
      let big = 0;
      let sumStep = 0;
      let n = 0;
      for (let y = 0; y < DYE_BOARD_H; y++)
        for (let x = 0; x + 1 < DYE_BOARD_W; x++) {
          const a = rgb(cellRgb(p, x, y));
          const b = rgb(cellRgb(p, x + 1, y));
          const d = Math.max(...a.map((v, k) => Math.abs(v - b[k])));
          if (d >= 40) big++;
          sumStep += d;
          n++;
        }
      // 뚝 끊기는 곳은 체크·띠·특수 색 무리 경계뿐 (5% 미만)
      expect(big / n, `등급 ${t} 끊기는 비율`).toBeLessThan(0.05);
      // 그렇다고 같은 색이 이어지지도 않는다 (평균 몇 단계씩 흐른다)
      expect(sumStep / n, `등급 ${t} 평균 차이`).toBeGreaterThan(1.5);
      expect(distinct(`smooth-${t}`, t), `등급 ${t} 색 수`).toBeGreaterThan(8000);
      // 색 표본(격자점)은 수천 개
      expect(samplePoints(p)).toBeGreaterThan(1000);
    }
  });

  it("염색권 종류마다 색 범위가 다르다: 파스텔은 밝고, 형광·원색은 쨍하고, 금속은 차분하다", () => {
    const stats = (t: DyeTier) => {
      let light = 0;
      let sat = 0;
      let n = 0;
      for (let s = 0; s < 3; s++) {
        const p = buildPalette(`range${s}`, t);
        for (let y = 0; y < DYE_BOARD_H; y += 5)
          for (let x = 0; x < DYE_BOARD_W; x += 5) {
            const [r, g, b] = rgb(cellRgb(p, x, y));
            light += (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
            sat += Math.max(r, g, b) - Math.min(r, g, b);
            n++;
          }
      }
      return { light: light / n, sat: sat / n };
    };
    const pastel = stats(5);
    const vivid = stats(4);
    const neon = stats(6);
    const metal = stats(7);
    expect(pastel.light).toBeGreaterThan(vivid.light);
    expect(pastel.light).toBeGreaterThan(190);
    expect(neon.sat).toBeGreaterThan(metal.sat * 2);
    expect(vivid.sat).toBeGreaterThan(metal.sat * 2);
    expect(vivid.sat).toBeGreaterThan(pastel.sat);
  });

  it("특수 색 무리: 드물게 숨어 있고(반짝 염색권은 여럿), 그 칸의 색은 \"#rrggbb~종류\"", () => {
    const spots = (t: DyeTier) => Array.from({ length: 40 }, (_, i) => buildPalette(`spot${i}`, t).spots.length).reduce((a, b) => a + b, 0) / 40;
    expect(spots(1)).toBeLessThan(1);
    expect(spots(8)).toBeGreaterThan(4);
    expect(spots(8)).toBeGreaterThan(spots(3));
    expect(spots(7)).toBeGreaterThan(spots(1));
    // 금속 염색권은 금빛 광택이 가장 흔하다
    const kinds = new Map<string, number>();
    for (let i = 0; i < 60; i++) for (const s of buildPalette(`metal${i}`, 7).spots) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    expect(Math.max(...kinds.values())).toBe(kinds.get("g"));
    // 무리 칸: 색 문자열에 종류가 붙고, 서버 판정도 같다. 무리 밖은 바탕 색 그대로
    const p = buildPalette("spot-check", 8);
    const s = p.spots[0];
    expect(cellSpecial(p, s.x, s.y)).toBe(s.kind);
    expect(cellColor(p, s.x, s.y)).toBe(`${cellHex(p, s.x, s.y)}~${s.kind}`);
    expect(judgeColor({ seed: "spot-check", tier: 8 }, s.x + 0.5, s.y + 0.5)).toBe(cellColor(p, s.x, s.y));
    let plain = 0;
    for (let y = 0; y < DYE_BOARD_H; y++) for (let x = 0; x < DYE_BOARD_W; x++) if (!cellSpecial(p, x, y)) plain++;
    // 반짝 염색권이어도 무리는 판의 몇 %뿐
    expect(plain / (DYE_BOARD_W * DYE_BOARD_H)).toBeGreaterThan(0.95);
  });

  it("비싼 등급일수록 색이 다양하고 조준점이 덜 흔들린다 (시간은 모두 60초)", () => {
    const hueSpan = (t: DyeTier) => {
      // 판 색을 색상 30도 칸 12개로 나눠, 채워진 칸 수 (5개 판 평균)
      let total = 0;
      for (let s = 0; s < 5; s++) {
        const p = buildPalette(`span${s}xx`, t);
        const bins = new Set<number>();
        for (let y = 0; y < DYE_BOARD_H; y += 4)
          for (let x = 0; x < DYE_BOARD_W; x += 4) {
            const [r, g, b] = rgb(cellRgb(p, x, y));
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            if (mx - mn < 24) continue; // 거의 회색은 빼고
            const d = mx - mn;
            const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            bins.add(Math.floor(h * 2));
          }
        total += bins.size;
      }
      return total / 5;
    };
    expect(hueSpan(1)).toBeLessThan(hueSpan(3));
    expect(hueSpan(2)).toBeLessThanOrEqual(hueSpan(3));
    expect(DYE_TIERS[1].wobblePx).toBeGreaterThan(DYE_TIERS[2].wobblePx);
    expect(DYE_TIERS[2].wobblePx).toBeGreaterThan(DYE_TIERS[3].wobblePx);
    expect(DYE_TIME_MS).toBe(60_000);
  });

  it("칸 색은 #rrggbb이고 판 밖 좌표는 가장자리로 붙는다", () => {
    const p = buildPalette("edge-test", 3);
    for (let i = 0; i < 50; i++) expect(cellColor(p, i * 3, i)).toMatch(/^#[0-9a-f]{6}(~[gsrn])?$/);
    for (let i = 0; i < 50; i++) expect(cellHex(p, i * 3, i)).toMatch(/^#[0-9a-f]{6}$/);
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

  it("특수 색: 무리 칸을 골라 확정하면 그 부위가 \"#rrggbb~종류\"로 저장되고 착용 증서에도 실린다 (새 염색권 종류)", async () => {
    const id = await account(0, { dye_sparkle: 1 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_sparkle", "head", t0);
    expect(s.session.tier).toBe(8);
    const p = buildPalette(s.session.seed, 8);
    const spot = p.spots[0];
    if (!spot) return; // 반짝 염색권은 무리가 거의 언제나 여럿이지만, 혹시 없으면 건너뛴다
    const done = await finishDye(id, s.session.seed, spot.x + 0.5, spot.y + 0.5, t0 + 10_000);
    expect(done.color).toBe(`${cellHex(p, spot.x, spot.y)}~${spot.kind}`);
    expect(done.me.dye).toEqual({ head: done.color });
    const g = await verifyGrant(env.joinSecret(), done.lookGrant);
    expect(g?.kind === "look" && g.dye).toEqual({ head: done.color });
  });

  it("시간이 지나 온 좌표는 무시하고 색 그대로, 안 끝낸 판도 다음에 열 때 색 그대로 끝난다, 창을 닫으면 포기", async () => {
    const id = await account(0, { dye_basic: 3 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_basic", "accent", t0);
    const late = await finishDye(id, s.session.seed, 5, 5, t0 + DYE_TIME_MS + DYE_GRACE_MS + 1);
    expect(late).toMatchObject({ late: true, kept: true, part: "accent" });
    expect(late.color).toBeUndefined();
    expect(late.me.dye).toEqual({});
    // 창을 닫고 떠난 판 → 상태를 열면 색을 바꾸지 않고 끝난다 (염색권은 쓴 것으로)
    await startDye(id, "dye_basic", "head", t0 + 100_000);
    const st = await dyeState(id, t0 + 100_000 + DYE_TIME_MS + DYE_GRACE_MS + 5);
    expect(st.session).toBeNull();
    expect(st.ended).toEqual({ part: "head" });
    expect(st.dye).toEqual({});
    // 도중에 포기: 색 그대로, 염색권은 돌아오지 않는다
    const s3 = await startDye(id, "dye_basic", "body", t0 + 200_000);
    expect(s3.me.inventory.dye_basic ?? 0).toBe(0);
    expect(await cancelDye(id, s3.session.seed)).toEqual({ cancelled: true });
    expect(await cancelDye(id, s3.session.seed)).toEqual({ cancelled: false });
    const after = await dyeState(id, t0 + 200_001);
    expect(after.session).toBeNull();
    expect(after.dye).toEqual({});
    await expect(startDye(id, "dye_basic", "body", t0 + 200_002)).rejects.toMatchObject({ code: "NO_ITEM" });
  });

  it("시간이 끝나면 그 순간 조준점 색이 후보 → 새 색으로 바꾸기 / 지금 색 유지 / 안 고르면 유지", async () => {
    const id = await account(0, { dye_fine: 4 });
    const t0 = Date.now();
    // 새 색으로 바꾸기
    const a = await startDye(id, "dye_fine", "head", t0);
    await expect(timeoutDye(id, a.session.seed, 10, 10, t0 + 1000)).rejects.toMatchObject({ code: "TOO_EARLY" });
    const ta = await timeoutDye(id, a.session.seed, 12.5, 20.5, a.session.endsAt);
    expect(ta.candidate).toEqual({ color: judgeColor(a.session, 12.5, 20.5), decideBy: a.session.endsAt + DYE_DECIDE_MS });
    // 두 번 와도 처음 후보 그대로, 후보가 있는 판은 finish로 다른 좌표를 칠할 수 없다
    expect((await timeoutDye(id, a.session.seed, 1, 1, a.session.endsAt + 10)).candidate).toEqual(ta.candidate);
    await expect(finishDye(id, a.session.seed, 1, 1, a.session.endsAt + 20)).rejects.toMatchObject({ code: "DYE_DECIDING" });
    // 다시 열면 고르는 중인 판이 그대로
    expect((await dyeState(id, a.session.endsAt + 100)).session?.candidate).toEqual(ta.candidate);
    const applied = await chooseDye(id, a.session.seed, true, a.session.endsAt + 5000);
    expect(applied).toMatchObject({ color: ta.candidate!.color, part: "head" });
    expect(applied.me.dye).toEqual({ head: ta.candidate!.color });
    const g = await verifyGrant(env.joinSecret(), applied.lookGrant);
    expect(g?.kind === "look" && g.dye).toEqual({ head: ta.candidate!.color });
    await expect(chooseDye(id, a.session.seed, true, a.session.endsAt + 6000)).rejects.toMatchObject({ code: "NO_SESSION" });
    // 지금 색 유지
    const b = await startDye(id, "dye_fine", "head", t0 + 100_000);
    await timeoutDye(id, b.session.seed, 30, 30, b.session.endsAt + 500);
    const kept = await chooseDye(id, b.session.seed, false, b.session.endsAt + 1000);
    expect(kept).toMatchObject({ kept: true, part: "head" });
    expect(kept.me.dye).toEqual({ head: ta.candidate!.color });
    // 안 고르면 유지 (고르는 시간이 지난 뒤에 와도, 상태를 열어도)
    const c = await startDye(id, "dye_fine", "body", t0 + 200_000);
    const tc = await timeoutDye(id, c.session.seed, 40, 40, c.session.endsAt);
    const tooLate = await chooseDye(id, c.session.seed, true, tc.candidate!.decideBy + DYE_GRACE_MS + 1);
    expect(tooLate).toMatchObject({ kept: true, late: true });
    expect(tooLate.me.dye).toEqual({ head: ta.candidate!.color });
    // 여유 시간까지 지나서 온 시간 끝 → 후보 없이 색 그대로
    const d = await startDye(id, "dye_fine", "accent", t0 + 300_000);
    const td = await timeoutDye(id, d.session.seed, 40, 40, d.session.endsAt + DYE_GRACE_MS + 1);
    expect(td).toMatchObject({ part: "accent", candidate: null });
    expect((await dyeState(id, d.session.endsAt + DYE_GRACE_MS + 2)).dye).toEqual({ head: ta.candidate!.color });
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

  it("외형 바꾸기: 처음 6종끼리는 150P씩, 몸 모양만 바뀌고 염색은 그대로, 증서에 몸이 실린다", async () => {
    const id = await account(300, { dye_basic: 1 });
    const t0 = Date.now();
    const s = await startDye(id, "dye_basic", "body", t0);
    const dyed = await finishDye(id, s.session.seed, 50, 50, t0 + 100);
    await expect(reshape(id, "hood")).rejects.toMatchObject({ code: "NO_CHANGE" });
    const r = await reshape(id, "cat");
    expect(r.me.body).toBe("cat");
    expect(r.me.dye).toEqual(dyed.me.dye);
    expect(await pts(id)).toBe(150);
    const g = await verifyGrant(env.joinSecret(), r.lookGrant);
    expect(g?.kind === "look" && g.body).toBe("cat");
    expect((await reshape(id, "bun")).me.body).toBe("bun");
    expect(await pts(id)).toBe(0);
  });

  it("프리미엄 외형: 처음엔 등급별 선택권 값(해금 + 바꾸기), 소장한 뒤엔 기본 외형과 오가도 무료", async () => {
    const unlock = bodyUnlockPrice("suit")!;
    expect(unlock).toBe(BODY_TIER_INFO.common.price);
    expect(bodyUnlockPrice("king")).toBe(BODY_TIER_INFO.legend.price);
    expect(bodyUnlockPrice("hood")).toBeNull();
    const id = await account(unlock + 150);
    const r = await reshape(id, "suit");
    expect(r.unlocked).toBe(true);
    expect(r.me.body).toBe("suit");
    expect(r.me.bodies).toEqual(["suit"]);
    expect(await pts(id)).toBe(150);
    const g = await verifyGrant(env.joinSecret(), r.lookGrant);
    expect(g?.kind === "look" && g.body).toBe("suit");
    // 버그 재현: 원래 캐릭터(후드)로 돌아갔다가 다시 정장으로 — 선택권 값을 다시 내지 않고 무료 (포인트 0이어도 된다)
    const hood = await reshape(id, "hood");
    expect(hood.unlocked).toBeUndefined();
    expect(hood.me.bodies).toEqual(["suit"]);
    expect((await loadMe(accounts, id)).bodies).toEqual(["suit"]);
    const back = await reshape(id, "suit");
    expect(back.unlocked).toBeUndefined();
    expect(back.me.body).toBe("suit");
    expect(back.me.bodies).toEqual(["suit"]);
    expect(await pts(id)).toBe(0);
    // 해금 안 한 다른 외형은 선택권 값이 모자라다
    await expect(reshape(id, "king")).rejects.toMatchObject({ code: "NOT_ENOUGH_POINTS" });
    expect((await loadMe(accounts, id)).body).toBe("suit");
  });

  it("프리미엄 외형: 입고 있던 외형이 소장 기록에 빠져 있어도 바꿀 때 채워서, 돌아올 때 다시 값을 받지 않는다", async () => {
    const id = await account(150);
    // 소장 기록 없이 이미 정장을 입고 있는 계정 (옛 기록·누락)
    (accounts as MemoryAccounts).styleSetBody(id, "suit");
    expect((await loadMe(accounts, id)).bodies).toBeUndefined();
    const hood = await reshape(id, "hood");
    expect(hood.me.bodies).toEqual(["suit"]);
    const back = await reshape(id, "suit");
    expect(back.unlocked).toBeUndefined();
    expect(back.me.body).toBe("suit");
    expect(await pts(id)).toBe(0);
  });

  it("운영자 전용: 저승사자 몸·운영자 꾸미기는 운영자만 (일반 계정은 403)", async () => {
    const user = await account(100_000);
    await expect(reshape(user, "reaper")).rejects.toMatchObject({ status: 403 });
    await expect(buyPermanent(user, "staff_crown")).rejects.toMatchObject({ status: 403 });
    const op = await account(0);
    await setStaff(op);
    try {
      const r = await reshape(op, "reaper");
      expect(r.me.body).toBe("reaper");
      // 운영자는 내 정보를 불러올 때 운영자 전용 꾸미기가 영구로 자동으로 들어온다 → 다시 받기는 이미 가짐
      expect(r.me.stash.some((e) => e.itemId === "staff_crown" && isPermanentUntil(e.until))).toBe(true);
      await expect(buyPermanent(op, "staff_crown")).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    } finally {
      await setStaff(null);
    }
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
    const r2 = await buyPermanent(id, "neck_scarf", now);
    expect(r2.me.stash.some((e) => e.itemId === "neck_scarf" && e.until === PERMANENT_UNTIL)).toBe(true);
    // 펫은 상점에서 영구로 팔지 않는다 (동물원 사육사에게서만)
    await expect(buyPermanent(id, "pet_ghost", now)).rejects.toMatchObject({ code: "INVALID_INPUT" });
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
