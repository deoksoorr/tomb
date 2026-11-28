import type { z } from "zod";
import { HttpError } from "../http";
import { isStaff } from "../staff";
import { josa } from "./skillText";
import { displayName, earnPointsOnly } from "../store";
import { kstDay } from "../store/accounts";
import { pushVillageNotice } from "../weeklyChamp";
import { forgetTitles } from "../titlesServer";
import { RpgError } from "./character";
import { chairEnhanceDiscount } from "../chairPerks";
import { chairPerkSafe } from "../chairman/settle";
import { disassemble, enhance, enhanceNeed, enhanceState, equipSg, exchange, inherit, inheritPlan, returnSg, reroll, rerollCost, sellSg, sgUnsold, type EnhanceResult, type EnhTarget, type InheritFrom, type InheritResult } from "./enhance";
import type { GearActionSchema } from "./schemas";
import { effectiveLevel, queueFirstTitles, rpgView } from "./service";
import { decodeSg, discoverEgg, SG_SETS, sgUid } from "./setGear";
import { getRpgStore } from "./store";
import { isSuperHunter } from "./superHunter";
import type { CharacterState, RpgView, SoldInfo } from "./types";

// 11/15 세트 장비·강화 서버 (라우트 app/api/rpg/gear). 포인트를 쓰는 강화·옵션 굴리기는 포인트 빼기·재료 빼기·결과 저장을
// 저장소 명령 한 번(updatePaid)으로 한다 — 버튼 한 번에 한 번, 중간에 실패해서 포인트만 빠지는 일이 없다.
// 운이 걸린 굴림은 서버 난수로만 (화면은 결과만 받는다).

export type GearActionResponse = RpgView & {
  gear?: {
    enhance?: EnhanceResult;
    /** 11/19 강화 승계 결과 */
    inherit?: InheritResult;
    /** 굴리기·바꾸기로 새로 생긴 코드 */
    code?: string;
    /** 분해로 받은 재료 */
    got?: { doc: number; seal: number };
    /** 11/27 세트 장비 판매: 받은 포인트(value) · 지갑 상한에 막혔나(capped) · 실제로 판 개수(count — 못 판 것은 가방에 되돌렸다) */
    sold?: SoldInfo;
  };
};

/** 강화 칭호 서버 최초 (신화 「강화의 시작」) */
export const FIRST_ENH15_ID = "t_firstEnh15";

const rnd = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};

async function http<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof RpgError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
}

const titleBits = (s: CharacterState) => `${s.sgDone ?? 0}|${s.enhMax ?? 0}`;

export async function gearAction(acct: string, a: z.output<typeof GearActionSchema>, now = Date.now(), ipHash?: string): Promise<GearActionResponse> {
  const store = getRpgStore();
  const before = await store.get(acct);
  let state: CharacterState;
  let gear: GearActionResponse["gear"];
  switch (a.type) {
    case "enhance": {
      const t: EnhTarget | null = a.sg !== undefined ? { sg: a.sg } : a.piece !== undefined ? { piece: a.piece } : a.shop ? { shop: a.shop } : null;
      if (!t) throw new HttpError(400, "INVALID_INPUT", "강화할 장비를 골라 주세요.");
      // 11/24 회장님 독대 노멀 1위·2관왕: 강화 포인트 30% 할인 (재료는 그대로 — lib/chairPerks). 화면은 view.chair로 같은 값을 보여 준다
      const off = chairEnhanceDiscount(await chairPerkSafe(acct, now));
      const r = await http(
        store.updatePaid(
          acct,
          (s) => {
            const need = enhanceNeed(t, enhanceState(s, t).e, off);
            // 화면에 보인 비용과 다르면 (다른 탭에서 먼저 강화 등) 돈을 받지 않고 다시 보여 준다
            if (need && need.cost !== a.cost)
              throw new RpgError(409, "COST_CHANGED", `강화 비용이 ${need.cost.toLocaleString("ko-KR")}P로 바뀌었어요. 다시 확인해 주세요.`);
            // 11/20 증폭권: 쓸지 말지만 받고 장수·확률은 서버 표에서 (옛 화면의 protect는 무시)
            return enhance(s, t, a.amp, rnd, off);
          },
          "사냥터 강화",
          now,
        ),
      );
      state = r.state;
      gear = { enhance: r.result };
      // 서버 최초 +15 (운영자 계정은 빠진다)
      const staff = await isStaff(acct);
      // 11/18 관리자 확인 뒤에 칭호 주인이 된다 (확인 대기 줄)
      if (r.result.reached15 && !staff) await queueFirstTitles(acct, [FIRST_ENH15_ID], now, () => "서버 최초로 장비를 +15까지 강화했어요!");
      // +15 확성기 (장비마다 한 번, 운영자 계정은 조용히)
      if (r.result.announce && !staff) {
        const name = await displayName(acct, now).catch(() => "누군가");
        await pushVillageNotice(`🔨 ${name}님이 「${r.result.name}」${josa(r.result.name, "을", "를").slice(r.result.name.length)} +15로 강화했어요!`, now).catch(() => undefined);
      }
      break;
    }
    case "reroll": {
      const r = await http(
        store.updatePaid(
          acct,
          (s) => {
            const code = (s.sg ?? []).find((c) => sgUid(c) === a.uid);
            const it = code ? decodeSg(code) : null;
            if (it && rerollCost(it.rr) !== a.cost)
              throw new RpgError(409, "COST_CHANGED", `옵션 굴리기 비용이 ${rerollCost(it.rr).toLocaleString("ko-KR")}P로 바뀌었어요. 다시 확인해 주세요.`);
            return reroll(s, a.uid, a.lock, rnd);
          },
          "사냥터 옵션 굴리기",
          now,
        ),
      );
      state = r.state;
      gear = { code: r.result.code };
      break;
    }
    case "exchange": {
      const r = await http(store.update(acct, (s) => exchange(s, a.uids, a.set, a.piece, rnd)));
      state = r.state;
      gear = { code: r.result.code };
      break;
    }
    case "disassemble": {
      const r = await http(store.update(acct, (s) => disassemble(s, a.uids)));
      state = r.state;
      gear = { got: r.result };
      break;
    }
    case "sell": {
      // 11/27 세트 장비 판매: 1) 가방에서 한 번에 뺀다 (값은 서버가 저장된 물건으로 계산 — 화면 말은 안 믿는다)
      const r = await http(store.update(acct, (s) => sellSg(s, a.uids)));
      state = r.state;
      const { sold, value: want } = r.result;
      // 2) 주운 장비 되팔기처럼 사냥 수입으로 적립 (지갑 상한에 막히면 받은 만큼만). 적립이 실패하면 뺀 장비를 모두 되돌린다
      let got: { earned: number; paid: number };
      try {
        got = want > 0 ? await earnPointsOnly(acct, "hunt", want, ipHash) : { earned: 0, paid: 0 };
      } catch (e) {
        await store.update(acct, (s) => ({ state: returnSg(s, sold.map(([c]) => c)), result: null })).catch(() => undefined);
        throw e;
      }
      if (got.earned > 0) await store.addDaily(acct, kstDay(now), { points: got.earned });
      // 3) 한 푼도 못 받은 장비는 가방에 되돌린다
      const back = got.paid < want ? sgUnsold(sold, got.paid) : [];
      if (back.length) state = (await http(store.update(acct, (s) => ({ state: returnSg(s, back), result: null })))).state;
      gear = { sold: { value: got.earned, capped: got.paid < want, count: sold.length - back.length } };
      break;
    }
    case "inherit": {
      const from: InheritFrom | null = a.fromSg !== undefined ? { sg: a.fromSg } : a.fromPiece !== undefined ? { piece: a.fromPiece } : null;
      const to: EnhTarget | null = a.sg !== undefined ? { sg: a.sg } : a.piece !== undefined ? { piece: a.piece } : a.shop ? { shop: a.shop } : null;
      if (!from || !to) throw new HttpError(400, "INVALID_INPUT", "재료 장비와 받을 장비를 골라 주세요.");
      const r = await http(
        store.updatePaid(
          acct,
          (s) => {
            const plan = inheritPlan(s, from, to);
            // 화면에 보인 비용과 다르면 돈을 받지 않고 다시 보여 준다
            if (plan.ok && plan.cost !== a.cost)
              throw new RpgError(409, "COST_CHANGED", `승계 비용이 ${plan.cost.toLocaleString("ko-KR")}P로 바뀌었어요. 다시 확인해 주세요.`);
            return inherit(s, from, to);
          },
          "사냥터 강화 승계",
          now,
        ),
      );
      state = r.state;
      gear = { inherit: r.result };
      break;
    }
    case "egg": {
      // 11/19 숨겨진 5세트 효과 발견: 지금 그 세트 다섯 부위를 다 끼고 있을 때만 비트를 켠다 (이미 켜졌거나 아니면 저장하지 않는다)
      const set = SG_SETS[a.set];
      if (discoverEgg(before.sgEgg, set, before.equip) === (before.sgEgg ?? 0)) {
        state = before;
        break;
      }
      const r = await http(store.update(acct, (s) => ({ state: { ...s, sgEgg: discoverEgg(s.sgEgg, set, s.equip) }, result: null })));
      state = r.state;
      break;
    }
    case "equip": {
      const sup = await isSuperHunter(acct);
      const r = await http(
        store.update(acct, (s) => ({
          state: equipSg(s, a.slot, a.uid, effectiveLevel(s.level, sup)),
          result: null,
        })),
      );
      state = r.state;
      break;
    }
  }
  // 4세트 처음 완성·강화 최고가 바뀌면 칭호 기억을 지운다 (가방 칭호 칸에 바로 보이게)
  if (titleBits(before) !== titleBits(state)) forgetTitles(acct);
  return {
    ...(await rpgView(acct, store, now, state)),
    ...(gear ? { gear } : {}),
  };
}
