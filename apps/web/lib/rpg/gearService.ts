import type { z } from "zod";
import { HttpError } from "../http";
import { isStaff } from "../staff";
import { josa } from "./skillText";
import { displayName } from "../store";
import { pushVillageNotice } from "../weeklyChamp";
import { forgetTitles } from "../titlesServer";
import { RpgError } from "./character";
import { disassemble, enhance, enhanceNeed, enhanceState, equipSg, exchange, reroll, rerollCost, type EnhanceResult, type EnhTarget } from "./enhance";
import type { GearActionSchema } from "./schemas";
import { claimFirstTitles, effectiveLevel, rpgView } from "./service";
import { decodeSg, sgUid } from "./setGear";
import { getRpgStore } from "./store";
import { isSuperHunter } from "./superHunter";
import type { CharacterState, RpgView } from "./types";

// 11/15 세트 장비·강화 서버 (라우트 app/api/rpg/gear). 포인트를 쓰는 강화·옵션 굴리기는 포인트 빼기·재료 빼기·결과 저장을
// 저장소 명령 한 번(updatePaid)으로 한다 — 버튼 한 번에 한 번, 중간에 실패해서 포인트만 빠지는 일이 없다.
// 운이 걸린 굴림은 서버 난수로만 (화면은 결과만 받는다).

export type GearActionResponse = RpgView & {
  gear?: {
    enhance?: EnhanceResult;
    /** 굴리기·바꾸기로 새로 생긴 코드 */
    code?: string;
    /** 분해로 받은 재료 */
    got?: { doc: number; seal: number };
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

export async function gearAction(acct: string, a: z.output<typeof GearActionSchema>, now = Date.now()): Promise<GearActionResponse> {
  const store = getRpgStore();
  const before = await store.get(acct);
  let state: CharacterState;
  let gear: GearActionResponse["gear"];
  switch (a.type) {
    case "enhance": {
      const t: EnhTarget | null = a.sg !== undefined ? { sg: a.sg } : a.shop ? { shop: a.shop } : null;
      if (!t) throw new HttpError(400, "INVALID_INPUT", "강화할 장비를 골라 주세요.");
      const r = await http(
        store.updatePaid(
          acct,
          (s) => {
            const need = enhanceNeed(t, enhanceState(s, t).e);
            // 화면에 보인 비용과 다르면 (다른 탭에서 먼저 강화 등) 돈을 받지 않고 다시 보여 준다
            if (need && need.cost !== a.cost)
              throw new RpgError(409, "COST_CHANGED", `강화 비용이 ${need.cost.toLocaleString("ko-KR")}P로 바뀌었어요. 다시 확인해 주세요.`);
            return enhance(s, t, a.protect, rnd);
          },
          "사냥터 강화",
          now,
        ),
      );
      state = r.state;
      gear = { enhance: r.result };
      // 서버 최초 +15 (운영자 계정은 빠진다)
      const staff = await isStaff(acct);
      if (r.result.reached15 && !staff) await claimFirstTitles(acct, [FIRST_ENH15_ID], now, () => "서버 최초로 장비를 +15까지 강화했어요!");
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
