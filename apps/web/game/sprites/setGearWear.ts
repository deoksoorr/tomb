import { itemById } from "@tomb/protocol";
import type { GearSlot } from "@/lib/rpg/catalog";
import { decodeSg, isSgCode, SG_SETS, sgPieceOf } from "@/lib/rpg/setGear";
import { darken, lighten, type Color, Grid } from "./pixel";
import { SET_GOLD, setWearPal, type SetGearGrade, type SetGearSet, type SetTierPal } from "./setGear";

// 11/15 사냥 중 입은 세트 장비: 아바타 시트(avatar.ts drawFrame)에 꾸미기처럼 같이 그린다 — 앞·옆·뒷모습, 걷기·달리기 흔들림(m)을 따른다.
// 착용 목록에 "sgw.{부위}.{세트}{직급}" 가짜 id를 넣어 시트 키가 장비 조합마다 하나 → 장비가 바뀔 때만 시트를 새로 만든다 (프레임마다 그리지 않는다).
//  - 갑옷: 몸통(망토·몸 색 칸)을 세트 색으로 칠하고 세트 무늬(넥타이·결재판·커튼 주름·퀼팅)를 얹는다
//  - 머리: 고글·돋보기 안경·프로젝터 왕관·목베개 (눈 자리·머리 둘레 기준)
//  - 장신구: 가슴·귀의 작은 표시 (몸에서는 몇 픽셀이라 세트마다 하나로)
// 직급: 사원 = 빛바랜 색 · 대리 = 세트 색 · 과장 = 은 테 · 임원 = 금 테 + 보석 + 반짝임 (시트 프레임 홀짝으로 두 장)

export const SGW_PREFIX = "sgw.";
export type SgWear = { a: [SetGearSet, SetGearGrade] | null; h: [SetGearSet, SetGearGrade] | null; c: [SetGearSet, SetGearGrade][] };

const enc = (part: "a" | "h" | "c", set: number, g: number) => `${SGW_PREFIX}${part}.${set}${g}`;

/** 착용 목록 → 입은 세트 장비 */
export function sgWearOf(look: readonly string[]): SgWear {
  const out: SgWear = { a: null, h: null, c: [] };
  for (const id of look) {
    const m = /^sgw\.([ahc])\.([0-3])([0-3])$/.exec(id);
    if (!m) continue;
    const v: [SetGearSet, SetGearGrade] = [SG_SETS[Number(m[2])], Number(m[3]) as SetGearGrade];
    if (m[1] === "a") out.a = v;
    else if (m[1] === "h") out.h = v;
    else if (!out.c.some(([s]) => s === v[0])) out.c.push(v);
  }
  return out;
}

/** 이 머리 장비가 두건 꼭지를 덮나 (왕관·목베개) */
export const sgHeadCovers = (w: SgWear) => !!w.h && (w.h[0] === "meeting" || w.h[0] === "trip");

/** 머리를 덮는 마을 꾸미기 부위 · 갑옷과 겹치는 등 꾸미기 (망토·도포) */
const ROBE_BACKS = new Set(["back_cape", "q_back_cape", "staff_robe"]);

/**
 * 사냥 중 착용 목록: 마을 꾸미기에 낀 세트 장비를 얹는다. 같은 자리면 사냥 장비가 이긴다
 * (세트 머리 → 머리 꾸미기 빼기, 세트 갑옷 → 망토·도포 빼기, 세트 장신구 → 목 꾸미기 빼기). 오라·이름 꾸미기·펫은 그대로
 */
export function huntLook(look: readonly string[], equip: Partial<Record<GearSlot, string | null>>): string[] {
  const add: string[] = [];
  let head = false;
  let armor = false;
  let acc = false;
  for (const id of Object.values(equip)) {
    const it = isSgCode(id) ? decodeSg(id) : null;
    if (!it) continue;
    const piece = sgPieceOf(it);
    if (piece === "armor") {
      add.push(enc("a", it.s, it.g));
      armor = true;
    } else if (piece === "head") {
      add.push(enc("h", it.s, it.g));
      head = true;
    } else if (piece === "acc1" || piece === "acc2") {
      add.push(enc("c", it.s, it.g));
      acc = true;
    }
  }
  if (!add.length) return [...look];
  const keep = look.filter((id) => {
    const slot = itemById(id)?.slot;
    if (head && slot === "head") return false;
    if (acc && slot === "neck") return false;
    if (armor && ROBE_BACKS.has(id)) return false;
    return true;
  });
  return [...keep, ...[...new Set(add)].sort()];
}

// ── 그리기 (avatar.ts drawFrame이 부른다) ──

type View = "down" | "side" | "up";
type Base = "hood" | "cat" | "bun" | "sheet" | "tall" | "round";
/** avatar.ts metrics()와 같은 모양 */
export type WearM = { cx: number; hy: number; rx: number; ry: number; top: number; neck: number; shY: number };

/** 몸마다 눈 자리 (avatarGear eyes와 같은 값) */
function eyes(fb: Base, view: View, m: WearM): { xs: number[]; y: number } {
  const { cx, hy } = m;
  const side = view === "side";
  switch (fb) {
    case "tall":
      return side ? { xs: [cx + 2], y: hy } : { xs: [cx - 2, cx + 1], y: hy };
    case "round":
      return side ? { xs: [cx + 4], y: Math.round(hy - 2) } : { xs: [cx - 2, cx + 1], y: Math.round(hy - 2) };
    case "cat":
    case "bun":
      return side ? { xs: [cx + 2], y: hy } : { xs: [cx - 3, cx + 2], y: hy };
    case "sheet":
      return side ? { xs: [cx + 3], y: hy } : { xs: [cx - 3, cx + 2], y: hy };
    default:
      return side ? { xs: [cx + 3], y: hy + 1 } : { xs: [cx - 2, cx + 1], y: hy + 1 };
  }
}

/** 시트 프레임 홀짝 (임원급 반짝임 두 장) — 자세의 흔들림·밑단 물결로 고른다 */
export const sparkFrame = (pose: { bob: number; hem: number }) => (pose.hem + Math.abs(pose.bob)) % 2;

/**
 * 갑옷: 몸통 칸(바탕 몸 색 bodyCols)을 세트 색으로 칠하고 무늬를 얹는다. 팔까지 그린 뒤 부른다 (머리는 그 위에).
 * 돌려주는 값 = 보석 자리 (임원급 반짝임)
 */
export function drawSetArmor(
  g: Grid,
  view: View,
  fb: Base,
  m: WearM,
  bodyCols: readonly Color[],
  lo: readonly Color[],
  wear: [SetGearSet, SetGearGrade],
): [number, number] {
  const [set, grade] = wear;
  const t = setWearPal(set, grade);
  const from = fb === "round" ? Math.round(m.hy) : fb === "sheet" ? m.hy + 3 : 0;
  const isBody = (c: number) => bodyCols.includes(c);
  const mask: boolean[] = new Array(g.w * g.h).fill(false);
  let y0 = 99;
  let y1 = -1;
  const rowX: [number, number][] = [];
  for (let y = from; y < Math.min(g.h, 26); y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.get(x, y);
      if ((v & 255) < 128) continue;
      const c = v >>> 8;
      if (!isBody(c)) continue;
      mask[y * g.w + x] = true;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      const r = rowX[y] ?? [99, -1];
      rowX[y] = [Math.min(r[0], x), Math.max(r[1], x)];
    }
  if (y1 < 0) return [m.cx, m.shY];
  // 옷이 보이는 맨 윗줄 (머리 밑) — 무늬는 여기부터
  const vis = Math.max(y0, fb === "tall" ? m.hy + 4 : fb === "round" ? Math.round(m.hy) + 1 : m.neck);
  const shade = (x: number, y: number) => lo.includes(g.get(x, y) >>> 8) || x >= (rowX[y]?.[1] ?? 99) - 1;
  const paint = (main: Color, dark: Color, pick?: (x: number, y: number) => Color | null) => {
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < g.w; x++) {
        if (!mask[y * g.w + x]) continue;
        const p = pick?.(x, y);
        g.set(x, y, p ?? (shade(x, y) ? dark : main));
      }
  };
  const has = (x: number, y: number) => y >= 0 && y < g.h && x >= 0 && x < g.w && mask[y * g.w + x];
  const cx = m.cx;
  const front = view === "down";
  const side = view === "side";
  const hem = y1;
  const mid = Math.round((vis + hem) / 2);
  let gem: [number, number] = [cx, vis + 1];
  switch (set) {
    case "overtime": {
      // 사흘째 같은 셔츠: 구겨진 밝은 셔츠 + 형광 넥타이 (뒷모습은 커피 얼룩)
      paint(t.p, t.pLo, (x, y) => ((x * 7 + y * 3) % 11 === 0 ? t.pLo : null));
      if (front) {
        for (let y = vis; y <= Math.min(hem - 1, vis + 4); y++) {
          g.set(cx - 1, y, y === vis ? t.a : t.m);
          g.set(cx, y, y === vis ? t.aHi : t.a);
        }
        g.set(cx - 2, vis, 0xffffff);
        g.set(cx + 1, vis, 0xffffff);
      } else if (side) {
        const fx = (rowX[vis + 1]?.[1] ?? cx + 2) - 1;
        for (let y = vis; y <= Math.min(hem - 1, vis + 3); y++) if (has(fx, y)) g.set(fx, y, y === vis ? t.aHi : t.a);
      } else if (has(cx + 1, mid)) {
        g.set(cx + 1, mid, t.x);
        if (has(cx + 2, mid)) g.set(cx + 2, mid, t.xLo);
      }
      gem = [cx, vis + 1];
      break;
    }
    case "approval": {
      // 결재판 흉갑: 검은 가죽 + 상아색 결재판 (도장 칸, 직급마다 늘어난다)
      paint(t.x, t.xLo);
      if (front) {
        const bx = cx - 2;
        for (let y = vis; y <= Math.min(hem - 1, vis + 3); y++) for (let x = bx; x < bx + 4; x++) if (has(x, y)) g.set(x, y, y === vis ? t.t : t.p);
        const stamps = Math.min(3, grade + 1);
        for (let i = 0; i < 3; i++) if (has(bx + i, vis + 2)) g.set(bx + i, vis + 2, i < stamps ? (grade === 3 && i === 2 ? SET_GOLD.c : t.m) : t.pLo);
        gem = [bx + 2, vis + 2];
      } else if (side) {
        const fx = rowX[vis + 1]?.[1] ?? cx + 2;
        for (let y = vis; y <= Math.min(hem - 1, vis + 3); y++) if (has(fx, y)) g.set(fx, y, t.p);
        gem = [fx, vis + 1];
      }
      // 어깨 테
      const r = rowX[vis];
      if (r) {
        g.set(r[0], vis, t.t);
        g.set(r[1], vis, t.tLo);
      }
      break;
    }
    case "meeting": {
      // 회의실 커튼 로브: 버건디 주름 + 어깨의 커튼 봉 + 허리끈
      paint(t.m, t.mLo, (x) => {
        const ph = (x + 30) % 3;
        return ph === 0 ? t.mLo : ph === 1 ? t.mHi : null;
      });
      const r = rowX[vis];
      if (r) for (let x = r[0]; x <= r[1]; x++) g.set(x, vis, x % 2 ? t.t : t.tHi);
      if (!side || true) {
        const rope = grade === 0 ? t.mLo : grade === 1 ? t.a : t.t;
        const rr = rowX[mid];
        if (rr && view !== "up") for (let x = rr[0]; x <= rr[1]; x++) if (has(x, mid)) g.set(x, mid, rope);
      }
      if (grade >= 1) {
        const rh = rowX[hem];
        if (rh) for (let x = rh[0]; x <= rh[1]; x++) if (x % 2 && has(x, hem)) g.set(x, hem, t.a);
      }
      gem = r ? [r[0], vis] : [cx, vis];
      break;
    }
    case "trip": {
      // 경량 패딩: 주황 가로 퀼팅 + 흰 띠 + 지퍼
      paint(t.m, t.mLo, (x, y) => ((y - vis) % 2 === 1 ? t.mLo : (y - vis) % 4 === 0 && x % 4 === 3 ? t.mHi : null));
      const band = Math.min(hem - 1, vis + 2);
      const rb = rowX[band];
      if (rb) for (let x = rb[0]; x <= rb[1]; x++) if (has(x, band)) g.set(x, band, grade === 0 ? t.pLo : t.p);
      const r = rowX[vis];
      if (r) for (let x = r[0] + 1; x < r[1]; x++) if (has(x, vis)) g.set(x, vis, t.a);
      if (front) for (let y = vis + 1; y <= hem; y++) if (has(cx - 1, y)) g.set(cx - 1, y, grade === 0 ? t.aLo : t.t);
      if (side) {
        const fx = rowX[vis + 1]?.[1];
        if (fx !== undefined) for (let y = vis + 1; y <= hem; y++) if (has(fx, y)) g.set(fx, y, grade === 0 ? t.aLo : t.t);
      }
      gem = [cx + 2, vis + 1];
      break;
    }
  }
  // 과장급부터 밑단 테 (은·금), 임원급은 보석
  if (grade >= 2) {
    const rh = rowX[hem];
    if (rh) for (let x = rh[0]; x <= rh[1]; x++) if (has(x, hem) && (set !== "meeting" || x % 2 === 0)) g.set(x, hem, x === rh[1] ? t.tLo : t.t);
  }
  if (grade === 3 && has(gem[0], gem[1])) g.set(gem[0], gem[1], t.G);
  return gem;
}

/** 머리 장비 (모자·얼굴 꾸미기 뒤에). 돌려주는 값 = 보석 자리 */
export function drawSetHead(g: Grid, view: View, fb: Base, m: WearM, wear: [SetGearSet, SetGearGrade]): [number, number] {
  const [set, grade] = wear;
  const t = setWearPal(set, grade);
  const { cx, hy } = m;
  const rx = Math.round(m.rx);
  const e = eyes(fb, view, m);
  const front = view === "down";
  const side = view === "side";
  switch (set) {
    case "overtime": {
      // 충혈된 눈 고글: 끈 + 두 알 (렌즈에 핏발 선 눈)
      const y = e.y - 1;
      g.hline(cx - rx, cx + rx - 1, y, t.m);
      g.hline(cx - rx, cx + rx - 1, y + 1, t.mLo);
      const iris = grade >= 2 ? t.a : grade === 1 ? t.mHi : 0x5a5450;
      const white = grade === 0 ? 0xe8e2d8 : 0xffffff;
      if (view === "up") {
        g.rect(cx - 1, y, 2, 2, t.t);
        return [cx, y];
      }
      for (const x of e.xs) {
        g.set(x - 1, y, t.t);
        g.set(x, y, white);
        g.set(x + 1, y, t.t);
        g.set(x - 1, y + 1, t.mLo);
        g.set(x, y + 1, iris);
        g.set(x + 1, y + 1, grade >= 1 ? 0xe0404a : t.mLo);
      }
      return [e.xs[0], y - 1];
    }
    case "approval": {
      // 돋보기 안경: 작은 알 + 큰 돋보기 알 (눈이 크게)
      const frame = grade === 0 ? 0x6a5a50 : t.t;
      const frameLo = grade === 0 ? 0x4a3e38 : t.tLo;
      const lens = grade === 0 ? 0xd8dcd8 : 0xe8f4fa;
      const y = e.y;
      if (view === "up") {
        g.hline(cx - rx, cx - rx + 1, y, frameLo);
        g.hline(cx + rx - 2, cx + rx - 1, y, frameLo);
        return [cx + rx - 1, y];
      }
      const big = side ? e.xs[0] : e.xs[1];
      if (front) {
        const s = e.xs[0];
        g.set(s - 1, y, frame);
        g.set(s, y, lens);
        g.set(s, y - 1, frame);
        g.hline(s + 1, big - 2, y, frameLo);
      } else g.hline(cx - rx, big - 2, y, frameLo);
      for (let x = big - 1; x <= big + 1; x++) {
        g.set(x, y - 2, frame);
        g.set(x, y + 2, frame);
      }
      g.vline(big - 2, y - 1, y + 1, frame);
      g.vline(big + 2, y - 1, y + 1, frame);
      g.rect(big - 1, y - 1, 3, 3, lens);
      g.rect(big - 1, y, 2, 2, 0x16151a);
      g.set(big - 1, y - 1, 0xffffff);
      if (grade >= 2) g.set(big + 1, y - 2, t.tHi);
      return [big, y - 2];
    }
    case "meeting": {
      // 프로젝터 왕관: 머리 위 띠 + 가운데 렌즈 + 뾰족 장식
      const top = m.top;
      const w = side ? 4 : 5;
      const card = grade === 0;
      const T = card ? 0xa8a090 : t.t;
      const Th = card ? 0xccc4b0 : t.tHi;
      const Tl = card ? 0x787060 : t.tLo;
      g.hline(cx - w, cx + w - 1, top, T);
      g.hline(cx - w, cx + w - 1, top - 1, Th);
      g.hline(cx - w, cx + w - 1, top + 1, Tl);
      const spikes = side ? [cx - 3, cx, cx + 3] : [cx - 4, cx - 1, cx + 2];
      const G = grade === 3 ? t.G : Th;
      for (const x of spikes) {
        g.set(x, top - 2, T);
        g.set(x, top - 3, G);
      }
      if (view !== "up") {
        const lx = side ? cx + w - 2 : cx - 1;
        g.rect(lx, top - 1, 2, 2, t.x);
        g.set(lx, top - 1, t.L);
        g.set(lx + 1, top - 1, t.LHi);
      }
      return [spikes[1], top - 3];
    }
    case "trip": {
      // 목베개 투구: 머리 둘레를 감싼 U자 베개 + 이마에 안대 띠
      for (let y = Math.floor(hy - m.ry - 2); y <= hy + 2; y++)
        for (let x = cx - rx - 2; x <= cx + rx + 1; x++) {
          const dx = (x + 0.5 - cx) / (m.rx + 1.3);
          const dy = (y + 0.5 - hy) / (m.ry + 1.3);
          const di = ((x + 0.5 - cx) / (m.rx - 0.2)) ** 2 + ((y + 0.5 - hy) / (m.ry - 0.2)) ** 2;
          if (dx * dx + dy * dy <= 1 && di > 1 && (view === "up" || y <= hy - 1 || Math.abs(x + 0.5 - cx) > m.rx - 1.5))
            g.set(x, y, x > cx + rx - 2 ? t.mLo : x < cx - rx + 1 && y < hy - 2 ? t.mHi : t.m);
        }
      if (view !== "up") {
        const by = e.y - 2;
        const x0 = side ? cx - 1 : cx - rx + 1;
        const x1 = cx + rx - 2;
        g.hline(x0, x1, by, t.a);
        g.hline(x0, x1, by + 1, t.aLo);
        for (const x of e.xs) g.set(x, by + 1, grade === 0 ? t.pLo : 0xffffff);
      }
      const gx = cx;
      const gy = Math.floor(hy - m.ry - 1);
      if (grade >= 2) g.set(gx, gy, t.t);
      return [gx, gy];
    }
  }
}

/** 장신구 (가슴·귀의 작은 표시). 뒷모습은 거의 안 보인다 */
export function drawSetAcc(g: Grid, view: View, fb: Base, m: WearM, wear: [SetGearSet, SetGearGrade]): void {
  if (view === "up") return;
  const [set, grade] = wear;
  const t = setWearPal(set, grade);
  const { cx } = m;
  const y = m.shY + (fb === "tall" ? 0 : 1);
  const side = view === "side";
  switch (set) {
    case "overtime": {
      // 빈 커피 컵 목걸이
      const x = side ? cx + 2 : cx - 3;
      g.set(x, y - 1, grade === 0 ? t.mLo : t.t);
      g.set(x, y, t.m);
      g.set(x, y + 1, t.pLo);
      break;
    }
    case "approval": {
      // 사장실 출입증 (붉은 목줄)
      const x = side ? cx + 1 : cx + 1;
      g.set(x, y - 1, t.m);
      g.rect(x, y, 2, 2, t.p);
      g.set(x, y, t.m);
      if (grade === 3) g.set(x + 1, y + 1, t.G);
      break;
    }
    case "meeting": {
      // 레이저 포인터 귀걸이 (빨간 점)
      const e = eyes(fb, view, m);
      const x = side ? cx - 1 : cx - Math.round(m.rx);
      g.set(x, e.y + 1, t.t);
      g.set(x, e.y + 2, t.e);
      break;
    }
    case "trip": {
      // 면세점 영수증 (허리춤에 늘어진다)
      const x = side ? cx - 2 : cx + 3;
      g.vline(x, y + 1, y + 3, grade === 0 ? t.pLo : t.p);
      g.set(x, y + 2, 0x8a92a4);
      break;
    }
  }
}

/** 임원급 반짝임 (시트 프레임 홀짝으로 자리를 바꾼다) */
export function drawSetSpark(g: Grid, spots: readonly [number, number][], frame: number): void {
  if (!spots.length) return;
  const [x, y] = spots[frame % spots.length];
  g.set(x, y, SET_GOLD.hi);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const v = g.get(x + dx, y + dy);
    g.set(x + dx, y + dy, (v & 255) >= 128 ? lighten(v >>> 8, 0.55) : darken(SET_GOLD.hi, 0.1), (v & 255) >= 128 ? 255 : 200);
  }
}

export type { SetTierPal };
