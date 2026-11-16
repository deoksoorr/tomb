// 이름표 겹침 풀기 — 위치만 다루는 순수 계산이라 테스트한다 (원점: 가운데 아래).
// - stackLabels: 이름표 묶음(이름 + 바탕판 + 칭호·1위 배지)을 통째로 위로 비킬 양(lift)을 정한다.
//   AvatarView가 그 양만큼 묶음 전체를 함께 올리므로 이름 글자와 바탕판·칭호가 절대 갈라지지 않는다.
// - declutter: 말풍선처럼 따로 노는 상자를 위로 비킨다 (fixed = 움직이지 않는 장애물, 예: 자리 잡은 이름표 묶음).

export type LabelBox = { x: number; y: number; w: number; h: number };

/**
 * 이름표 묶음 (월드 단위). y = 비키기 전 원래 자리의 아랫변(바탕판 아래 여백 포함).
 * 두 칸으로 잰다: 이름 줄(w×h, 바탕판·옆 표시 포함)과 그 위에 얹힌 칭호·1위 배지·하는 일(tw×th, 없으면 th=0).
 * 한 상자(max 너비)로 재면 긴 칭호가 옆 사람 이름 줄과 "겹친다"고 잘못 판단해 괜히 비킨다.
 */
export type LabelUnit = {
  x: number;
  y: number;
  w: number;
  h: number;
  tw: number;
  th: number;
  /** 내 이름표: 늘 제자리 (다른 사람이 비킨다) */
  pin: boolean;
  /** 입력 = 지난 프레임 목표(떨림 막기 기준), 출력 = 새 목표 (위로 비킬 양, ≥0) */
  lift: number;
};

/** 가로·세로로 이만큼(화면 px) 넘게 겹쳐야 비킨다 — 가장자리가 살짝 스치는 정도는 그냥 둔다 */
export const STACK_ENTER_PX = 3;
/** 이미 비켜 있던 묶음은 가로로 이만큼(화면 px) 떨어질 때까지 그대로 (드나들며 깜빡이지 않게. 세로는 겹침이 0이 될 때까지) */
export const STACK_RELEASE_PX = 4;
/** 이미 비켜 있던 묶음이 세로로 이만큼(화면 px) 넘게 겹쳐 있어야 계속 떠 있는다 */
export const STACK_HOLD_Y_PX = 1.5;
/** 쌓을 때 묶음 사이 틈 (화면 px) */
export const STACK_GAP_PX = 1;
/** 앞뒤 순서 히스테리시스: 이미 비켜 있던 쪽은 이만큼(화면 px) 더 뒤에 선 것으로 본다 (앞뒤가 엇비슷할 때 서로 자리를 바꾸며 출렁이지 않게) */
export const STACK_ORDER_PX = 3;

/** 두 구간이 s보다 많이 겹치는지 (s<0이면 그만큼 떨어져 있어도 겹친 것으로 친다) */
function span(a0: number, a1: number, b0: number, b1: number, s: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) > s;
}

/**
 * a(올림 la)와 b(올림 lb)의 두 칸끼리 하나라도 겹치는지. s = 가로 여유, sy = 세로 여유.
 * 세로 여유는 0 밑으로 내리지 않는다: 이름 줄 바로 위에 칭호가 붙어 있듯 맞닿은 칸까지 겹친 것으로 치면 한번 비킨 묶음이 영영 못 내려온다
 */
function unitsHit(a: LabelUnit, la: number, b: LabelUnit, lb: number, s: number, sy: number): boolean {
  const aB = a.y - la;
  const aT = aB - a.h;
  const bB = b.y - lb;
  const bT = bB - b.h;
  // 이름 줄 ↔ 이름 줄
  if (span(a.x - a.w / 2, a.x + a.w / 2, b.x - b.w / 2, b.x + b.w / 2, s) && span(aT, aB, bT, bB, sy)) return true;
  // a 이름 줄 ↔ b 윗칸
  if (b.th > 0 && span(a.x - a.w / 2, a.x + a.w / 2, b.x - b.tw / 2, b.x + b.tw / 2, s) && span(aT, aB, bT - b.th, bT, sy)) return true;
  if (a.th > 0) {
    // a 윗칸 ↔ b 이름 줄
    if (span(a.x - a.tw / 2, a.x + a.tw / 2, b.x - b.w / 2, b.x + b.w / 2, s) && span(aT - a.th, aT, bT, bB, sy)) return true;
    // 윗칸 ↔ 윗칸
    if (b.th > 0 && span(a.x - a.tw / 2, a.x + a.tw / 2, b.x - b.tw / 2, b.x + b.tw / 2, s) && span(aT - a.th, aT, bT - b.th, bT, sy)) return true;
  }
  return false;
}

/** 앞뒤 순서 (pin 먼저, 그다음 앞(아래)에 선 사람부터) — 지난 lift로 판단하므로 정렬은 lift를 고치기 전에 */
let orderPx = 1;
function byFront(a: LabelUnit, b: LabelUnit): number {
  if (a.pin !== b.pin) return a.pin ? -1 : 1;
  const ka = a.y - (a.lift > 0 ? STACK_ORDER_PX * orderPx : 0);
  const kb = b.y - (b.lift > 0 ? STACK_ORDER_PX * orderPx : 0);
  return kb - ka;
}

/**
 * 앞의 n개 units의 lift를 정한다 (프레임마다 호출, 할당 없음). order는 재사용 배열, px = 화면 1px의 월드 길이(이름표 배율).
 * 내 이름표(pin)는 늘 제자리. 나머지는 앞(아래)에 선 사람부터 자리를 잡고, 이미 자리 잡은 묶음과 겹치면 그 묶음 꼭대기 위로 통째로 올린다.
 * 옆으로는 밀지 않는다 (옆으로 밀면 이름이 주인 머리에서 멀어져 누구 이름인지 헷갈린다).
 */
export function stackLabels(units: LabelUnit[], order: LabelUnit[], n: number, px: number): void {
  order.length = 0;
  for (let i = 0; i < n; i++) order.push(units[i]);
  orderPx = px;
  order.sort(byFront);
  const gap = STACK_GAP_PX * px;
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    const was = a.lift;
    a.lift = 0;
    if (a.pin || i === 0) continue;
    // 들어올 때는 3px 넘게 겹쳐야, 이미 비킨 묶음은 가로로 4px 떨어지거나 세로 겹침이 1.5px 이하가 될 때까지 그대로 (둘 사이 띠가 떨림을 막는다).
    // 세로 1.5px: 바탕판 두께(종류마다 0~1px 다르다) 차이만큼 이름 줄이 옆 사람 칭호 칸에 걸쳐도 계속 떠 있지 않게
    const s = (was > 0 ? -STACK_RELEASE_PX : STACK_ENTER_PX) * px;
    const sy = (was > 0 ? STACK_HOLD_Y_PX : STACK_ENTER_PX) * px;
    for (let pass = 0; pass <= i; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        const b = order[j];
        if (!unitsHit(a, a.lift, b, b.lift, s, sy)) continue;
        // b 묶음 꼭대기(윗칸 포함) 위로
        const need = a.y - (b.y - b.lift - b.h - b.th) + gap;
        if (need > a.lift + 1e-6) {
          a.lift = need;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}

/** 묶음이 지금(lift 적용) 차지하는 칸을 out[k..]에 적는다 (말풍선 겹침 풀기의 장애물). 적은 다음 칸 번호를 돌려준다 */
export function unitBoxes(u: LabelUnit, lift: number, out: LabelBox[], k: number): number {
  let b = out[k];
  if (!b) out.push((b = { x: 0, y: 0, w: 0, h: 0 }));
  b.x = u.x;
  b.y = u.y - lift;
  b.w = u.w;
  b.h = u.h;
  k++;
  if (u.th <= 0) return k;
  let c = out[k];
  if (!c) out.push((c = { x: 0, y: 0, w: 0, h: 0 }));
  c.x = u.x;
  c.y = u.y - lift - u.h;
  c.w = u.tw;
  c.h = u.th;
  return k + 1;
}

function boxesHit(a: LabelBox, b: LabelBox): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y > b.y - b.h && a.y - a.h < b.y;
}

/**
 * 앞의 n개 boxes의 y를 고친다 (프레임마다 호출, 할당 없음). order는 재사용 배열.
 * 아래쪽(앞에 선) 상자는 그대로 두고 겹치는 위쪽 상자를 위로 비킨다. fixed(앞의 nf개)는 움직이지 않는 장애물 — 겹치면 상자가 그 위로 간다.
 */
export function declutter(boxes: LabelBox[], order: LabelBox[], n: number = boxes.length, fixed?: readonly LabelBox[], nf = 0): void {
  order.length = 0;
  for (let i = 0; i < n; i++) order.push(boxes[i]);
  order.sort((a, b) => b.y - a.y);
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    // 장애물·이미 자리 잡은 상자들과 겹치지 않을 때까지 위로
    for (let pass = 0; pass <= order.length + nf; pass++) {
      let moved = false;
      for (let j = 0; j < nf; j++) {
        const b = fixed![j];
        if (boxesHit(a, b)) {
          a.y = b.y - b.h;
          moved = true;
        }
      }
      for (let j = 0; j < i; j++) {
        const b = order[j];
        if (boxesHit(a, b)) {
          a.y = b.y - b.h;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}
