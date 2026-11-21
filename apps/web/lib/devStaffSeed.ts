import { nameKey } from "@tomb/protocol";
import { env } from "./env";
import { normalizeCode, CODE_RE } from "./economy";
import { TRANSCEND_MAX } from "./rpg/endgame";
import { MAX_LEVEL } from "./rpg/formulas";
import { SKILL_TREE_VERSION } from "./rpg/skillRules";
import { SKILLS } from "./rpg/skillTree";
import { getRpgStore } from "./rpg/store";
import { T_NODES } from "./rpg/transcendTree";
import type { CharacterState } from "./rpg/types";
import { setStaff } from "./staff";
import { codeHash } from "./store/accounts";
import { addPresetGear, hasPresetGear } from "./devGear";
import { devRpgLoad } from "./devPersist";
import { normalize } from "./rpg/character";
import type { AccountStore } from "./store/types";

// 11/19 로컬 개발 전용 운영자 계정: 메모리 저장소가 비워져도(로컬 서버를 다시 켜거나 모듈을 새로 읽어도) 같은 코드·같은 id로 다시 만든다.
// apps/web/.env.local의 DEV_STAFF_CODE(로그인 코드)·DEV_STAFF_NAME(닉네임). 운영(NODE_ENV=production)·Redis 연결·테스트에서는 아무것도 하지 않는다.
// 사냥 캐릭터는 늘 레벨 50 · 초월 ★100(TRANSCEND_MAX), 일반 스킬·초월 수련은 모두 최대 랭크 (운영자는 테스트 서버 슈퍼 계정 — lib/rpg/superHunter)

/** 11/20 사용자 「관리자 계정에는 고정으로」: 최종 세트(회의 세트 임원급 +15, 마법) 다섯 부위가 없으면 넣고 낀다 */
function dressed(s: CharacterState): CharacterState {
  if (hasPresetGear(s, "finalMagic15")) return s;
  try {
    return addPresetGear(s, "finalMagic15", true);
  } catch (e) {
    console.warn("[devStaff] 최종 세트를 넣지 못했어요", e);
    return s;
  }
}

/** 고정 계정 id (세션 쿠키가 로컬 서버를 다시 켜도 같은 계정을 가리키게). 세션 쿠키 규칙(lib/session VISITOR_ID_RE) 그대로 21자 */
export const DEV_STAFF_ID = "devstaff-local-moon01";

/** 이미 맞춘 저장소 (같은 저장소 객체엔 한 번만 — 모듈을 다시 읽어 저장소가 새로 생기면 다시) */
const done = new WeakSet<object>();

/** 메모리 계정 저장소를 만들 때마다 부른다. 계정이 이미 있어도 코드·운영자 지정·초월 레벨을 다시 맞춘다 (가방·포인트는 그대로) */
export function ensureDevStaff(accounts: AccountStore): void {
  if (env.isProd() || env.redis() || process.env.VITEST || done.has(accounts)) return;
  const raw = process.env.DEV_STAFF_CODE?.trim();
  if (!raw) return;
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) {
    console.warn("[devStaff] DEV_STAFF_CODE 모양이 맞지 않아 건너뛰어요 (XXXX-XXXX-XXXX)");
    return;
  }
  done.add(accounts);
  const now = Date.now();
  // 메모리 저장소는 함수 본문이 바로 돌아 코드 색인이 곧장 생긴다 (로그인이 바로 뒤따라도 찾게)
  void accounts.setCode(DEV_STAFF_ID, codeHash(code));
  void (async () => {
    try {
      const name = process.env.DEV_STAFF_NAME?.trim() || "로컬운영자";
      await accounts.enter(DEV_STAFF_ID, { name }, now);
      // 이름을 옛 계정 기록(메모리가 비워지며 코드를 잃은 예전 로컬 운영자 등)이 붙잡고 있으면 그쪽 이름을 바꿔 비워 두고 가져온다
      const holder = await accounts.nameOwner(nameKey(name), now);
      if (holder && holder !== DEV_STAFF_ID) await accounts.changeName(holder, `옛${holder.slice(0, 4)}`, now, 0, 0).catch(() => undefined);
      const mine = (await accounts.appearance(DEV_STAFF_ID, now)).name;
      if (mine !== name) {
        const r = await accounts.claimName(DEV_STAFF_ID, name, now).catch(() => null);
        if (r !== "ok") await accounts.changeName(DEV_STAFF_ID, name, now, 0, 0).catch(() => undefined);
      }
      await accounts.setTutorialDone(DEV_STAFF_ID);
      await setStaff(DEV_STAFF_ID, now, name);
      // 레벨 50 · ★100, 스킬·초월 수련은 전부 최대 랭크로 찍어 두고(슈퍼 계정 예산), 능력치 포인트는 모두 남겨 둔다 (직접 배분해 시험)
      // 11/20 저장해 둔 캐릭터(능력치 배분·장비·단축키)가 있으면 그걸로 시작 (lib/devPersist)
      const saved = devRpgLoad<unknown>();
      await getRpgStore().update(DEV_STAFF_ID, (cur) => {
        const s = saved ? normalize(saved) : cur;
        const skills = Object.fromEntries(SKILLS.map((k) => [k.id, k.maxLevel])) as CharacterState["skills"];
        const tSkills = Object.fromEntries(T_NODES.map((n) => [n.id, n.maxLevel])) as CharacterState["tSkills"];
        return {
          // 11/20 회장님 독대 시험: 야근 빌딩 120층 기록 (입장 조건 100층)
          state: dressed({ ...s, level: Math.max(s.level, MAX_LEVEL), exp: 0, tLevel: TRANSCEND_MAX, tExp: 0, skills, tSkills, treeVer: SKILL_TREE_VERSION, skillPoints: 0, fBest: Math.max(s.fBest ?? 0, 120) }),
          result: null,
        };
      });
    } catch (e) {
      console.warn("[devStaff] 로컬 운영자 계정을 맞추지 못했어요", e);
    }
  })();
}
