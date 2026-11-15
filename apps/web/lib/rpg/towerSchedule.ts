import type { MonsterId, ZoneId } from "./catalog";
import { seeded } from "./formulas";
// 11/15 옥상 정원 폭풍·임원층 순서표 (테마 파일에 있다)
import { RF_SCHEDULE } from "./towerThemes/rooftop";
import { EX_SCHEDULE } from "./towerThemes/exec";
// 11/15 지하 주차장·구내식당 순서표 (테마 파일에 있다)
import { PK_SCHEDULE } from "./towerThemes/parking";
import { CF_SCHEDULE } from "./towerThemes/cafeteria";

// 11/15 야근 빌딩 층 순서표: 테마마다 블록(5층) 안 층별 몬스터 구성을 정해 둔다 (몬스터 종류는 판 시드로 섞지 않는다 — 외워서 오를 수 있게).
// 11/15 테마 순서가 판마다 무작위가 되면서, 표는 "그 판에서 이 테마에 몇 번째로 왔나(visit)"로 고른다:
// 처음 오면 층마다 새 몬스터가 한두 종씩 들어온다 (첫 층 두 종 → … → 우두머리), 두 번째는 아는 몬스터를 판(정전·야근 회의 …)에 맞춰 다시 섞고
// 남은 몇 종이 마저 들어온다, 세 번째부터는 섞은 구성 두 벌을 번갈아 쓴다. 웨이브 마릿수·무리·나오는 자리만 판 시드로 정한다.
// 정예: 처음 온 블록 4번째 층, 두 번째 3·4번째 층, 세 번째부터 2·3·4번째 층. 우두머리는 블록 5번째 층.
// 순수 데이터 — lib/rpg/tower towerPlan(서버 검증과 같은 계획)·게임·안내서가 같이 쓴다. 방 종류는 blockRoom(판 시드·층)으로 테마 모듈이 정한다.

/** 테마 한 블록(5층)의 층별 구성: 보통 층 넷 + 우두머리 층 첫 웨이브 */
export type Block = readonly (readonly MonsterId[])[];
/** 처음 · 두 번째 · 세 번째부터 번갈아 */
export type Schedule = { first: Block; second: Block; remix: readonly Block[] };

/** 지하 서버실 */
const SV: Schedule = {
  first: [
    ["sv_tangled_lan", "sv_excel_macro"],
    ["sv_tangled_lan", "sv_excel_macro", "sv_hot_fan"],
    ["sv_hot_fan", "sv_tangled_lan", "sv_bluescreen", "sv_wifi_router"],
    ["sv_bluescreen", "sv_excel_macro", "sv_reboot", "sv_ransom_lock"],
    ["sv_wifi_router", "sv_reboot", "sv_hot_fan", "sv_tangled_lan"],
  ],
  second: [
    ["sv_tangled_lan", "sv_wifi_router", "sv_printer_jam"],
    ["sv_reboot", "sv_hot_fan", "sv_security_cam"],
    ["sv_excel_macro", "sv_ransom_lock", "sv_bluescreen", "sv_coolant_leak"],
    ["sv_printer_jam", "sv_security_cam", "sv_coolant_leak", "sv_reboot"],
    ["sv_printer_jam", "sv_ransom_lock", "sv_bluescreen", "sv_coolant_leak"],
  ],
  remix: [
    [
      ["sv_tangled_lan", "sv_security_cam", "sv_printer_jam", "sv_excel_macro"],
      ["sv_coolant_leak", "sv_wifi_router", "sv_reboot", "sv_hot_fan"],
      ["sv_bluescreen", "sv_ransom_lock", "sv_printer_jam", "sv_security_cam"],
      ["sv_excel_macro", "sv_coolant_leak", "sv_wifi_router", "sv_ransom_lock"],
      ["sv_hot_fan", "sv_security_cam", "sv_reboot", "sv_printer_jam"],
    ],
    [
      ["sv_hot_fan", "sv_coolant_leak", "sv_bluescreen", "sv_tangled_lan"],
      ["sv_security_cam", "sv_ransom_lock", "sv_excel_macro", "sv_reboot"],
      ["sv_printer_jam", "sv_wifi_router", "sv_coolant_leak", "sv_bluescreen"],
      ["sv_reboot", "sv_tangled_lan", "sv_ransom_lock", "sv_security_cam"],
      ["sv_wifi_router", "sv_excel_macro", "sv_printer_jam", "sv_hot_fan"],
    ],
  ],
};

/** 끝없는 회의실. 블록 3번째 층은 중간 우두머리 「회의록 담당」이 둘째 웨이브에 (meetingRoomPlan) */
const MT: Schedule = {
  first: [
    ["mt_cc_mail", "mt_chat_ping"],
    ["mt_chat_ping", "mt_marker", "mt_no_opinion"],
    ["mt_cc_mail", "mt_marker", "mt_slides"],
    ["mt_no_opinion", "mt_clock_watcher", "mt_chair_intern"],
    ["mt_chat_ping", "mt_slides", "mt_chair_intern"],
  ],
  second: [
    ["mt_marker", "mt_projector", "mt_chat_ping"],
    ["mt_coffee", "mt_no_opinion", "mt_cc_mail"],
    ["mt_howl", "mt_clock_watcher", "mt_slides"],
    ["mt_chair_intern", "mt_projector", "mt_coffee", "mt_chat_ping"],
    ["mt_howl", "mt_marker", "mt_no_opinion"],
  ],
  remix: [
    [
      ["mt_cc_mail", "mt_coffee", "mt_howl", "mt_chat_ping"],
      ["mt_projector", "mt_chair_intern", "mt_no_opinion"],
      ["mt_slides", "mt_clock_watcher", "mt_marker"],
      ["mt_howl", "mt_coffee", "mt_projector", "mt_chair_intern"],
      ["mt_cc_mail", "mt_clock_watcher", "mt_chat_ping"],
    ],
    [
      ["mt_no_opinion", "mt_slides", "mt_coffee", "mt_chat_ping"],
      ["mt_marker", "mt_howl", "mt_clock_watcher"],
      ["mt_projector", "mt_cc_mail", "mt_chair_intern"],
      ["mt_coffee", "mt_slides", "mt_howl", "mt_no_opinion"],
      ["mt_chair_intern", "mt_marker", "mt_projector"],
    ],
  ],
};

/** 테마 → 순서표. 새 테마는 한 줄로 끼운다 */
const TABLES: Partial<Record<ZoneId, Schedule>> = { "server-room": SV, mt_meeting: MT, rf_rooftop: RF_SCHEDULE, ex_exec: EX_SCHEDULE, pk_parking: PK_SCHEDULE, cf_cafeteria: CF_SCHEDULE };

/** 이 테마가 순서표를 쓰나 */
export const hasSchedule = (zone: ZoneId) => zone in TABLES;

/** 블록 안 자리 pos(0~3 보통 층, 4 우두머리 층) · 이 테마에 visit번째(0부터)로 왔을 때 구성. 순서표가 없는 테마면 null */
export function floorRoster(zone: ZoneId, pos: number, visit: number): MonsterId[] | null {
  const t = TABLES[zone];
  if (!t) return null;
  const block = visit <= 0 ? t.first : visit === 1 ? t.second : t.remix[(visit - 2) % t.remix.length];
  return [...block[Math.max(0, Math.min(4, pos))]];
}

/** 정예가 나오나 (둘째 웨이브 한 자리) — 처음 온 블록 4번째 층, 두 번째 3·4번째, 그 뒤 2·3·4번째 */
export function floorElite(pos: number, visit: number): boolean {
  if (pos === 4) return false;
  return visit <= 0 ? pos === 3 : visit === 1 ? pos >= 2 : pos >= 1;
}

/**
 * 11/15 f층 방 종류 (판 시드·층으로 — 같은 판 같은 층은 늘 같은 방): 블록의 보통 층 넷은 n가지 방 중 서로 다른 넷, 우두머리 층은 -1.
 * salt로 테마마다 다르게 섞는다
 */
export function blockRoom(seed: number, f: number, n: number, salt = 0): number {
  const fl = Math.max(1, Math.floor(f));
  const pos = (fl - 1) % 5;
  if (pos === 4) return -1;
  const r = seeded((seed ^ salt ^ Math.imul(Math.floor((fl - 1) / 5) + 1, 0x632be5ab)) >>> 0);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[pos % n];
}
