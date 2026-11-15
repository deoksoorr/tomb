import type { MonsterId, ZoneId } from "./catalog";

// 11/15 야근 빌딩 층 순서표: 테마마다 층별 몬스터 구성을 정해 둔다 (판 시드로 섞지 않는다 — 같은 층은 늘 같은 몬스터, 외워서 오를 수 있게).
// 첫 바퀴는 층마다 새 몬스터가 한두 종씩 들어온다 (1층 두 종 → … → 우두머리), 둘째 바퀴는 아는 몬스터를 판(정전·야근 회의 …)에 맞춰 다시 섞고
// 남은 몇 종이 마저 들어온다, 셋째 바퀴부터는 섞은 구성 두 벌을 번갈아 쓴다. 웨이브 마릿수·무리·나오는 자리만 판 시드로 정한다.
// 정예: 첫 바퀴 4번째 층(4·9층), 둘째 바퀴 3·4번째 층, 셋째 바퀴부터 2·3·4번째 층. 우두머리 5·10층 …
// 순수 데이터 — lib/rpg/tower towerPlan(서버 검증과 같은 계획)·게임·안내서 표가 같이 쓴다. 방 종류는 테마 모듈(svRoom·mtRoomType)이 층 번호로 정한다.

/** 테마 한 블록(5층)의 층별 구성: 보통 층 넷 + 우두머리 층 첫 웨이브 */
type Block = readonly (readonly MonsterId[])[];

/** 지하 서버실 (1~5 · 11~15 · 21~25 …) */
const SV: { first: Block; second: Block; remix: readonly Block[] } = {
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

/** 끝없는 회의실 (6~10 · 16~20 · 26~30 …). 8·18 …층은 중간 우두머리 「회의록 담당」이 둘째 웨이브에 (meetingRoomPlan) */
const MT: { first: Block; second: Block; remix: readonly Block[] } = {
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

const TABLES: Partial<Record<ZoneId, typeof SV>> = { "server-room": SV, mt_meeting: MT };

/** 이 테마가 순서표를 쓰나 */
export const hasSchedule = (zone: ZoneId) => zone in TABLES;

/** f층의 블록 안 자리 (0~3 보통 층, 4 우두머리 층)와 바퀴 (테마 한 바퀴 = 테마 수 × 5층) */
export function floorSlot(f: number, period: number): { pos: number; loop: number } {
  const n = Math.max(1, Math.floor(f));
  return { pos: (n - 1) % 5, loop: Math.floor((n - 1) / period) };
}

/** f층 구성 (같은 층은 늘 같다). 순서표가 없는 테마면 null */
export function floorRoster(zone: ZoneId, f: number, period: number): MonsterId[] | null {
  const t = TABLES[zone];
  if (!t) return null;
  const { pos, loop } = floorSlot(f, period);
  const block = loop === 0 ? t.first : loop === 1 ? t.second : t.remix[(loop - 2) % t.remix.length];
  return [...block[pos]];
}

/** f층에 정예가 나오나 (둘째 웨이브 한 자리) — 첫 바퀴 4번째 층, 둘째 바퀴 3·4번째, 그 뒤 2·3·4번째 */
export function floorElite(f: number, period: number): boolean {
  const { pos, loop } = floorSlot(f, period);
  if (pos === 4) return false;
  return loop === 0 ? pos === 3 : loop === 1 ? pos >= 2 : pos >= 1;
}
