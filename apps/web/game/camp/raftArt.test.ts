import { CAMP_RAFTS, campRaftSeatDx } from "@tomb/protocol";
import { beforeAll, describe, expect, it } from "vitest";
import { BOOTH_LAMPS, BOOTH_WINDOW, CLERK_ROLL, jwadaeBooth, raftClerkWindow } from "./raftBoothArt";
import { RAFT_HOLDER_UP, RAFT_LADDER_DX, raftFloatAt, raftRig, raftRigBaseArt, raftRodTipArt, RIG_OX, RIG_OY, rodPoints, TIP_OX, TIP_OY } from "./raftRodsArt";
import { installFakeCanvas, pixOfCanvas } from "./campTestCanvas";
import { raft4Art } from "./valleyExtraArt";

// 11/27 좌대 매표소·낚싯대 4대 그림 (game/camp/raftBoothArt · raftRodsArt — 장면 덧그림 자리가 그림과 맞는지)

beforeAll(() => installFakeCanvas());

const LADDER = new Set([0xe8ecf0, 0x9aa0a8, 0xffffff]);

describe("좌대 낚싯대 4대", () => {
  it("4~6번(앞 사다리)은 낚싯대·받침틀이 사다리를 가로지르지 않는다 (사다리 그림 픽셀로 범위를 잰다)", () => {
    const art = raft4Art(0, false, "front", { n: 5 });
    const g = art.grid;
    const cx = g.w / 2 + 11;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let y = 40; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const v = g.get(x, y);
        if ((v & 255) >= 128 && LADDER.has(v >>> 8)) {
          x0 = Math.min(x0, x - cx);
          x1 = Math.max(x1, x - cx);
        }
      }
    // 외곽선 한 칸까지 RAFT_LADDER_DX 안
    expect(x0 - 1).toBeGreaterThanOrEqual(RAFT_LADDER_DX[0]);
    expect(x1 + 1).toBeLessThanOrEqual(RAFT_LADDER_DX[1]);
    for (const r of CAMP_RAFTS.filter((q) => !q.link)) {
      const rig = raftRig(r.link);
      expect(campRaftSeatDx(r)).toBe(11);
      expect(rig.holder[0], `${r.n}번 받침틀`).toBeGreaterThan(RAFT_LADDER_DX[1] + 1);
      for (const rd of rig.rods)
        for (const [x, y] of rodPoints(rd.bx, 0, rd.tdx, rd.tdy))
          // 사다리 줄 높이 (받침 y −14 ~ 0 = 받침틀 줄 −5 ~ +9) 안에서는 사다리 오른쪽 끝보다 1칸 이상 오른쪽
          if (y <= RAFT_HOLDER_UP) expect(x, `${r.n}번 낚싯대 (${rd.tdx},${rd.tdy}) 줄 ${y}`).toBeGreaterThan(RAFT_LADDER_DX[1] + 1);
    }
  });

  it("좌대 그림의 빈 받침틀 = 장면이 얹는 받침틀 (같은 자리·같은 폭)", () => {
    for (const ladder of ["left", "front"] as const) {
      const g = raft4Art(0, false, ladder, { n: 1 }).grid;
      const cx = g.w / 2 + (ladder === "front" ? 11 : 0);
      const fy = g.h - RAFT_HOLDER_UP;
      const rig = raftRig(ladder === "left");
      const base = raftRigBaseArt(rig);
      for (let x = rig.holder[0]; x <= rig.holder[1]; x++) if (!rig.rods.some((rd) => rd.bx === x)) expect(g.get(cx + x, fy) >>> 8, `${ladder} ${x}`).toBe(base.get(RIG_OX + x, RIG_OY) >>> 8);
      expect(g.get(cx + rig.holder[0] - 1, fy) >>> 8).not.toBe(0x3e5a3a);
    }
  });

  it("낚싯대 끝·찌가 그림 안에 다 들어간다 (잘리지 않는다)", () => {
    for (const wide of [true, false]) {
      const rig = raftRig(wide);
      const base = raftRigBaseArt(rig);
      for (const rd of rig.rods) {
        expect(base.get(RIG_OX + rd.tdx, RIG_OY + rd.tdy) & 255, `끝 ${rd.tdx}`).toBe(255);
        expect(base.get(RIG_OX + rd.bx, RIG_OY - 1) & 255).toBe(255);
      }
    }
    for (const dir of [-1, 1])
      for (const bob of [false, true])
        for (const bite of [false, true]) {
          const t = raftRodTipArt(dir, false, false, bob, bite);
          const f = raftFloatAt({ bx: 0, tdx: dir, tdy: 0 });
          // 찌 머리 (raftFloatAt — 밤 불빛 자리)
          expect(t.get(TIP_OX + f.x - dir, TIP_OY + f.y + (bob || bite ? 1 : 0)) & 255, `찌 ${dir} ${bob} ${bite}`).toBe(255);
          // 방울
          expect(t.get(TIP_OX + (bite ? 1 : 0), TIP_OY - 1) >>> 8).toBe(0xf6d24a);
        }
  });
});

describe("좌대 매표소", () => {
  it("현황판 등 자리(BOOTH_LAMPS)가 그림의 등 자리와 같다 — 빈 좌대·입장 중을 바꾸면 그 2×2 칸만 바뀐다", () => {
    for (const lit of [false, true]) {
      const a = pixOfCanvas(jwadaeBooth("default", lit, [true, true, true, true, true, true]));
      const b = pixOfCanvas(jwadaeBooth("default", lit, [false, false, false, false, false, false]));
      const want = new Set(BOOTH_LAMPS.flatMap((p) => [0, 1, 2, 3].map((k) => `${p.x + (k % 2)},${p.y + (k >> 1)}`)));
      const diff = new Set<string>();
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.rgba(x, y).join() !== b.rgba(x, y).join()) diff.add(`${x},${y}`);
      expect([...diff].sort()).toEqual([...want].sort());
    }
  });

  it("창 안 직원 그림은 창 칸(13×12)을 빈틈없이 덮고 (표 두루마리 자리만 비운다) 두 프레임이 다르다 (판 셋 × 낮밤)", () => {
    for (const c of ["default", "winter", "christmas"] as const)
      for (const lit of [false, true]) {
        const f0 = raftClerkWindow(c, lit, 0);
        const f1 = raftClerkWindow(c, lit, 1);
        expect([f0.w, f0.h]).toEqual([BOOTH_WINDOW.w, BOOTH_WINDOW.h]);
        let empty = 0;
        let diff = 0;
        for (let y = 0; y < f0.h; y++)
          for (let x = 0; x < f0.w; x++) {
            if ((f0.get(x, y) & 255) < 255 && !(x <= 2 && y <= 3) && !CLERK_ROLL.some(([a, b]) => a === x && b === y)) empty++;
            if (f0.get(x, y) !== f1.get(x, y)) diff++;
          }
        expect(empty, `${c} ${lit}`).toBe(0);
        expect(diff).toBeGreaterThan(4);
      }
  });
});
