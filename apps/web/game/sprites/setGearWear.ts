import { itemById } from "@tomb/protocol";
import { gearById, type GearSlot } from "@/lib/rpg/catalog";
import { SG_SETS } from "@/lib/rpg/setGear";
import { huntGearIds } from "@/lib/rpg/huntGear";
import { darken, lighten, type Color, Grid } from "./pixel";
import { SET_GOLD, setWearPal, type SetGearGrade, type SetGearSet, type SetTierPal } from "./setGear";

// 11/15 사냥 중 입은 세트 장비: 아바타 시트(avatar.ts drawFrame)에 꾸미기처럼 같이 그린다 — 앞·옆·뒷모습, 걷기·달리기 흔들림(m)을 따른다.
// 착용 목록에 "sgw.{부위}.{세트}{직급}" 가짜 id를 넣어 시트 키가 장비 조합마다 하나 → 장비가 바뀔 때만 시트를 새로 만든다 (프레임마다 그리지 않는다).
//  - 갑옷: 몸통(망토·몸 색 칸)을 세트 색으로 칠하고 세트 무늬(넥타이·결재판·커튼 주름·퀼팅)를 얹는다
//  - 머리: 고글·돋보기 안경·프로젝터 왕관·목베개 (눈 자리·머리 둘레 기준)
//  - 장신구: 가슴·귀의 작은 표시 (몸에서는 몇 픽셀이라 세트마다 하나로)
// 직급: 사원 = 빛바랜 색 · 대리 = 세트 색 · 과장 = 은 테 · 임원 = 금 테 + 보석 + 반짝임 (시트 프레임 홀짝으로 두 장)

export const SGW_PREFIX = "sgw.";
/** 입은 사냥 장비 한 부위: 세트 장비(세트·직급) 또는 상점·주운 장비(id·그림 종류·두 색, hi = 강화 +5 이상) */
export type WearPiece = { set: SetGearSet; grade: SetGearGrade } | { shop: string; shape: string; main: Color; accent: Color; hi: boolean };
export type SgWear = { a: WearPiece | null; h: WearPiece | null; c: WearPiece[] };

const WEAR_RE = /^sgw\.([ahc])\.(?:([0-3])([0-3])|([a-z]_[a-z_]{1,30})(\+)?)$/;

/** 착용 목록 → 입은 사냥 장비 */
export function sgWearOf(look: readonly string[]): SgWear {
  const out: SgWear = { a: null, h: null, c: [] };
  for (const id of look) {
    const m = WEAR_RE.exec(id);
    if (!m) continue;
    let v: WearPiece | null = null;
    if (m[2] !== undefined) v = { set: SG_SETS[Number(m[2])], grade: Number(m[3]) as SetGearGrade };
    else {
      const g = gearById(m[4]);
      if (g && g.kind !== "weapon") v = { shop: g.id, shape: g.art.shape, main: g.art.main, accent: g.art.accent, hi: !!m[5] };
    }
    if (!v) continue;
    if (m[1] === "a") out.a = v;
    else if (m[1] === "h") out.h = v;
    else if (!out.c.some((c) => sameKind(c, v!))) out.c.push(v);
  }
  return out;
}
const sameKind = (a: WearPiece, b: WearPiece) => ("set" in a && "set" in b ? a.set === b.set : "shop" in a && "shop" in b ? a.shop === b.shop : false);

/** 두건 꼭지를 덮는 머리 장비 (왕관·목베개·모자·헬멧·헤드셋 띠) */
export function sgHeadCovers(w: SgWear): boolean {
  const h = w.h;
  if (!h) return false;
  if ("set" in h) return h.set === "meeting" || h.set === "trip" || h.set === "overtime";
  return h.shape === "cap" || h.shape === "helmet" || h.shape === "crown";
}
/** 임원급 (반짝임) */
export const isTopWear = (p: WearPiece | null | undefined) => !!p && "set" in p && p.grade === 3;

/** 머리를 덮는 마을 꾸미기 부위 · 갑옷과 겹치는 등 꾸미기 (망토·도포) */
const ROBE_BACKS = new Set(["back_cape", "q_back_cape", "staff_robe"]);

/**
 * 사냥 중 착용 목록: 마을 꾸미기에 낀 사냥 장비(세트 장비·상점·주운 장비)를 얹는다. 같은 자리면 사냥 장비가 이긴다
 * (머리 장비 → 머리 꾸미기 빼기, 갑옷 → 망토·도포 빼기, 장신구 → 목 꾸미기 빼기). 오라·이름 꾸미기·펫은 그대로. 무기는 손에 따로 든다
 */
export function huntLook(look: readonly string[], equip: Partial<Record<GearSlot, string | null>>): string[] {
  const add = huntGearIds(equip);
  if (!add.length) return [...look];
  return huntPeerLook([...look.filter((id) => !id.startsWith(SGW_PREFIX)), ...add]);
}

/** 화면마다 착용 목록 정리: 사냥 화면이 아니면 사냥 장비 표시(sgw.)를 뺀다 (마을에서는 꾸미기만) */
export const villageLook = (look: readonly string[]) =>
  look.some((id) => id.startsWith(SGW_PREFIX)) ? look.filter((id) => !id.startsWith(SGW_PREFIX)) : [...look];
/** 다른 사람의 착용 목록(사냥 장비 포함)을 사냥 화면 규칙으로: 사냥 장비가 있으면 같은 자리 꾸미기를 뺀다 */
export function huntPeerLook(look: readonly string[]): string[] {
  const w = sgWearOf(look);
  if (!w.a && !w.h && !w.c.length) return [...look];
  return look.filter((id) => {
    const slot = itemById(id)?.slot;
    if (w.h && slot === "head") return false;
    if (w.c.length && slot === "neck") return false;
    if (w.a && ROBE_BACKS.has(id)) return false;
    return true;
  });
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

type BodyArea = {
  y0: number;
  y1: number;
  rowX: [number, number][];
  /** 옷이 보이는 맨 윗줄 (머리 밑) */
  vis: number;
  has: (x: number, y: number) => boolean;
  /** 몸통 칸 전부 칠하기 (pick이 색을 주면 그 색, 아니면 밝은 쪽·그늘 쪽) */
  paint: (main: Color, dark: Color, pick?: (x: number, y: number) => Color | null) => void;
};

/** 몸통 칸 (바탕 몸 색 bodyCols인 칸) — 갑옷이 덮는 자리 */
function bodyArea(g: Grid, fb: Base, m: WearM, bodyCols: readonly Color[], lo: readonly Color[]): BodyArea | null {
  const from = fb === "round" ? Math.round(m.hy) : fb === "sheet" ? m.hy + 3 : 0;
  const mask: boolean[] = new Array(g.w * g.h).fill(false);
  let y0 = 99;
  let y1 = -1;
  const rowX: [number, number][] = [];
  for (let y = from; y < Math.min(g.h, 26); y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.get(x, y);
      if ((v & 255) < 128 || !bodyCols.includes(v >>> 8)) continue;
      mask[y * g.w + x] = true;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      const r = rowX[y] ?? [99, -1];
      rowX[y] = [Math.min(r[0], x), Math.max(r[1], x)];
    }
  // 몸통을 가리는 몸(상자·머그잔·튜브 등)이라 몸 색 칸이 거의 없으면: 몸통 자리에 조끼 모양으로 직접 입힌다 (사냥 장비가 먼저 보이게)
  let count = 0;
  for (const v of mask) if (v) count++;
  if (count < 24) {
    const top = fb === "tall" ? m.hy + 4 : m.neck;
    for (let y = top; y <= 24; y++)
      for (let x = m.cx - 4; x < m.cx + 4; x++) {
        if (x < 0 || x >= g.w) continue;
        mask[y * g.w + x] = true;
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        const r = rowX[y] ?? [99, -1];
        rowX[y] = [Math.min(r[0], x), Math.max(r[1], x)];
      }
  }
  if (y1 < 0) return null;
  const vis = Math.max(y0, fb === "tall" ? m.hy + 4 : fb === "round" ? Math.round(m.hy) + 1 : m.neck);
  const shade = (x: number, y: number) => lo.includes(g.get(x, y) >>> 8) || x >= (rowX[y]?.[1] ?? 99) - 1;
  const has = (x: number, y: number) => y >= 0 && y < g.h && x >= 0 && x < g.w && mask[y * g.w + x];
  const paint = (main: Color, dark: Color, pick?: (x: number, y: number) => Color | null) => {
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < g.w; x++) {
        if (!mask[y * g.w + x]) continue;
        const p = pick?.(x, y);
        g.set(x, y, p ?? (shade(x, y) ? dark : main));
      }
  };
  return { y0, y1, rowX, vis, has, paint };
}

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
  const area = bodyArea(g, fb, m, bodyCols, lo);
  if (!area) return [m.cx, m.shY];
  const { y1, rowX, vis, has, paint } = area;
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

/** 머리 한 줄의 반폭 (타원, 머리 밖이면 0) */
function halfAt(m: WearM, y: number): number {
  const d = (y + 0.5 - m.hy) / m.ry;
  return d * d >= 1 ? 0 : m.rx * Math.sqrt(1 - d * d);
}

/** 머리 위를 덮는 둥근 모자 (y0..y1 줄, 머리보다 extra만큼 넓게). 오른쪽은 그늘 */
function dome(g: Grid, m: WearM, y0: number, y1: number, c: Color, lo: Color, extra = 1, hi?: Color): void {
  for (let y = y0; y <= y1; y++) {
    const h = Math.max(1.5, halfAt(m, Math.max(y, m.hy - m.ry + 1)) + extra - Math.max(0, m.hy - m.ry + 1 - y) * 1.6);
    const l = Math.round(m.cx - h);
    const r = Math.round(m.cx + h) - 1;
    for (let x = l; x <= r; x++) g.set(x, y, x >= r - 1 ? lo : hi && x <= l + 1 && y <= y0 + 1 ? hi : c);
  }
}

/**
 * 머리 장비 (모자·얼굴 꾸미기 뒤에). 11/15: 사냥 화면에서 한눈에 보이게 머리 위·옆으로 튀어나오는 크기로 —
 * 고글은 이마에 걸친 큰 알 두 개, 돋보기는 머리띠에 달린 큰 알, 왕관은 뾰족 장식 셋, 목베개는 머리를 두른 두꺼운 고리.
 * 색은 사원급도 세트 색 그대로(빛바래지 않게), 직급은 테·보석으로. 돌려주는 값 = 보석 자리
 */
export function drawSetHead(g: Grid, view: View, fb: Base, m: WearM, wear: [SetGearSet, SetGearGrade]): [number, number] {
  const [set, grade] = wear;
  const t = setWearPal(set, grade);
  const c = setWearPal(set, Math.max(1, grade) as SetGearGrade);
  const { cx, hy } = m;
  const rx = Math.round(m.rx);
  const top = Math.round(m.top);
  const e = eyes(fb, view, m);
  const front = view === "down";
  const side = view === "side";
  const trim = grade >= 2 ? t.t : grade === 1 ? c.a : c.mLo;
  switch (set) {
    case "overtime": {
      // 충혈된 눈 고글 (이마에 올려 쓴 큰 알 두 개 + 남색 끈)
      const sy = top + 2;
      g.hline(cx - rx - 1, cx + rx, sy, c.m);
      g.hline(cx - rx - 1, cx + rx, sy + 1, c.mLo);
      const lens = (x0: number) => {
        g.rect(x0, top - 1, 4, 4, trim === c.mLo ? c.a : trim);
        g.rect(x0 + 1, top, 2, 2, 0xffffff);
        g.set(x0 + 1, top + 1, 0xe0404a);
        g.set(x0 + 2, top, grade >= 2 ? c.a : 0xf0d8d8);
      };
      if (front) {
        lens(cx - 5);
        lens(cx + 1);
        return [cx + 4, top - 1];
      }
      if (side) {
        lens(cx + 1);
        g.set(cx + 5, sy, c.m);
        return [cx + 4, top - 1];
      }
      g.rect(cx - 1, sy - 1, 3, 3, c.a);
      g.set(cx, sy, grade === 3 ? t.G : c.aHi);
      return [cx, sy - 1];
    }
    case "approval": {
      // 돋보기 머리띠: 검은 가죽 띠 + 붉은 줄 + 이마 위로 젖혀 쓴 큰 돋보기 알
      const by = top + 1;
      g.hline(cx - rx - 1, cx + rx, by, c.x);
      g.hline(cx - rx - 1, cx + rx, by + 1, c.m);
      const frame = grade === 0 ? 0x8a6a40 : t.t;
      const lensC = 0xe8f4fa;
      const ring = (lx: number, ly: number) => {
        g.rect(lx - 2, ly - 2, 5, 5, frame);
        g.rect(lx - 1, ly - 1, 3, 3, lensC);
        g.set(lx - 1, ly - 1, 0xffffff);
        g.set(lx + 1, ly + 1, 0xb8d8ec);
      };
      if (front) {
        ring(cx + 2, top - 1);
        g.vline(cx + 2, top + 2, by, frame);
        // 작은 알 (왼눈)
        g.set(e.xs[0] - 1, e.y, frame);
        g.set(e.xs[0] + 1, e.y, frame);
        g.set(e.xs[0], e.y - 1, frame);
        return [cx + 3, top - 3];
      }
      if (side) {
        ring(cx + 4, top);
        return [cx + 5, top - 2];
      }
      g.rect(cx - 1, by - 1, 2, 3, c.m);
      return [cx, by - 1];
    }
    case "meeting": {
      // 프로젝터 왕관: 머리보다 넓은 띠 + 뾰족 장식 셋 (끝에 알) + 가운데 렌즈
      const card = grade === 0;
      const band = c.m;
      const bandHi = card ? c.mHi : trim;
      g.hline(cx - rx - 1, cx + rx, top - 1, bandHi);
      g.hline(cx - rx - 1, cx + rx, top, band);
      g.hline(cx - rx - 1, cx + rx, top + 1, c.mLo);
      const spikes = side ? [cx - 3, cx, cx + 3] : [cx - 4, cx - 1, cx + 3];
      const tip = grade === 3 ? t.G : grade === 2 ? t.tHi : c.L;
      for (const x of spikes) {
        g.vline(x, top - 4, top - 2, bandHi);
        g.set(x, top - 5, tip);
      }
      if (view !== "up") {
        const lx = side ? cx + rx - 2 : cx - 1;
        g.rect(lx, top - 1, 2, 3, c.x);
        g.set(lx, top, c.L);
        g.set(lx + 1, top, c.LHi);
      }
      return [spikes[1], top - 5];
    }
    case "trip": {
      // 목베개 투구: 머리를 두른 두꺼운 주황 고리 (위·옆으로 2칸) + 눈가리개 띠
      for (let y = Math.floor(hy - m.ry - 2); y <= hy + 2; y++)
        for (let x = cx - rx - 2; x <= cx + rx + 1; x++) {
          const o = ((x + 0.5 - cx) / (m.rx + 2.2)) ** 2 + ((y + 0.5 - hy) / (m.ry + 2.2)) ** 2;
          const i = ((x + 0.5 - cx) / (m.rx + 0.2)) ** 2 + ((y + 0.5 - hy) / (m.ry + 0.2)) ** 2;
          if (o > 1 || i <= 1) continue;
          if (view !== "up" && y > hy - 1 && Math.abs(x + 0.5 - cx) < m.rx - 0.5) continue;
          g.set(x, y, x > cx + rx - 1 ? c.mLo : x < cx - rx + 1 && y < hy - 1 ? c.mHi : c.m);
        }
      for (const [dx, dy] of [
        [-4, -5],
        [0, -7],
        [4, -5],
      ] as const)
        g.set(cx + dx, hy + dy, grade === 0 ? c.mHi : c.p);
      if (view !== "up") {
        const by = e.y - 1;
        const x0 = side ? cx - 1 : cx - rx + 1;
        g.hline(x0, cx + rx - 2, by, c.a);
        g.hline(x0, cx + rx - 2, by + 1, c.aLo);
        for (const x of e.xs) g.set(x, by + 1, 0xffffff);
      }
      if (grade >= 2) g.set(cx, Math.floor(hy - m.ry - 2), t.t);
      return [cx, Math.floor(hy - m.ry - 2)];
    }
  }
}

// ── 상점·주운 장비 (그림 종류 shape + 두 색) ──

type Shop = Extract<WearPiece, { shop: string }>;
const GOLD_TRIM = 0xf0c040;

/** 상점 갑옷: 몸통을 장비 색으로 칠하고 종류마다 무늬 (+5 이상이면 밑단 금테) */
function drawShopArmor(g: Grid, view: View, fb: Base, m: WearM, bodyCols: readonly Color[], lo: readonly Color[], p: Shop): void {
  const area = bodyArea(g, fb, m, bodyCols, lo);
  if (!area) return;
  const { y1: hem, rowX, vis, has, paint } = area;
  const { main, accent } = p;
  const dark = darken(main, 0.3);
  const cx = m.cx;
  const front = view === "down";
  const side = view === "side";
  switch (p.shape) {
    case "shirt":
      paint(main, dark, (x, y) => ((x + 40) % 3 === 0 || (y - vis) % 3 === 2 ? accent : null));
      break;
    case "plate":
      paint(main, dark, (_x, y) => ((y - vis) % 3 === 1 ? lighten(main, 0.35) : null));
      if (rowX[vis]) {
        g.set(rowX[vis][0], vis, accent);
        g.set(rowX[vis][1], vis, accent);
      }
      break;
    case "rack":
      paint(main, dark, (x, y) => ((y - vis) % 2 === 1 ? lighten(main, 0.18) : x === (rowX[y]?.[1] ?? 0) - 1 && y % 2 === 0 ? accent : null));
      break;
    case "vest":
      paint(main, dark, (x, y) => ((x + 40) % 3 === 1 && (y - vis) % 2 === 1 ? accent : null));
      break;
    case "padding":
      paint(main, dark, (_x, y) => ((y - vis) % 2 === 1 ? accent : null));
      break;
    case "bag":
      paint(main, dark);
      if (view !== "up") for (let y = vis; y <= hem; y++) if (has(cx - 3 + (y - vis), y)) g.set(cx - 3 + (y - vis), y, accent);
      break;
    case "suit":
      paint(main, dark);
      if (front)
        for (let y = vis; y <= Math.min(hem - 1, vis + 3); y++) {
          const w = Math.max(0, 2 - (y - vis));
          for (let x = cx - 1 - w; x <= cx + w; x++) if (has(x, y)) g.set(x, y, accent);
          if (has(cx - 1, y) && y > vis) g.set(cx - 1, y, 0xa83c3c);
        }
      else if (side && rowX[vis + 1]) g.set(rowX[vis + 1][1] - 1, vis + 1, accent);
      break;
    default: {
      // 후드티·카디건: 가운데 앞주머니 + 끈
      paint(main, dark);
      if (front) {
        const py = Math.min(hem - 1, vis + 3);
        for (let x = cx - 2; x <= cx + 1; x++) if (has(x, py)) g.set(x, py, accent);
        if (has(cx - 2, vis)) g.set(cx - 2, vis, 0xf2f2f2);
        if (has(cx + 1, vis)) g.set(cx + 1, vis, 0xf2f2f2);
      }
    }
  }
  // 어두운 장비(캐비닛·롱패딩·정장)도 어두운 몸·테마에서 묻히지 않게 왼쪽 가장자리에 밝은 테, 어깨 줄에 장비 포인트 색
  const rim = lighten(main, luminance(main) < 0.3 ? 0.45 : 0.25);
  for (let y = vis; y <= hem; y++) {
    const r = rowX[y];
    if (r && has(r[0], y)) g.set(r[0], y, rim);
  }
  if (luminance(main) < 0.3 && rowX[vis]) for (let x = rowX[vis][0] + 1; x < rowX[vis][1]; x++) if (has(x, vis)) g.set(x, vis, accent);
  if (p.hi && rowX[hem]) for (let x = rowX[hem][0]; x <= rowX[hem][1]; x++) if (has(x, hem)) g.set(x, hem, GOLD_TRIM);
}

/** 밝기 0..1 */
const luminance = (c: Color) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;

/** 상점 머리 장비 (모자·헤드셋·고글·왕관·안경·헬멧·후광) — 머리 위·옆으로 보이게 */
function drawShopHead(g: Grid, view: View, fb: Base, m: WearM, p: Shop): [number, number] {
  const { cx, hy } = m;
  const rx = Math.round(m.rx);
  const top = Math.round(m.top);
  const e = eyes(fb, view, m);
  const { main, accent } = p;
  const lo = darken(main, 0.3);
  const front = view === "down";
  const side = view === "side";
  let spot: [number, number] = [cx, top - 1];
  switch (p.shape) {
    case "cap": {
      dome(g, m, top - 1, top + 2, main, lo, 1, lighten(main, 0.25));
      if (front) {
        g.hline(cx - rx, cx + rx - 1, top + 3, lo);
        g.rect(cx - 1, top, 2, 2, accent);
      } else if (side) {
        g.hline(cx + 1, cx + rx + 3, top + 3, lo);
        g.set(cx - 2, top + 1, accent);
      } else g.set(cx, top + 1, accent);
      break;
    }
    case "helmet": {
      dome(g, m, top - 2, top + 2, main, lo, 1, lighten(main, 0.3));
      for (let y = top - 2; y <= top + 2; y++) {
        if (view !== "side") g.set(cx - 1, y, accent);
        g.set(view === "side" ? cx + 1 : cx + 2, y, accent);
      }
      if (side) g.hline(cx - rx - 1, cx - rx + 1, top + 3, lo);
      spot = [cx, top - 2];
      break;
    }
    case "headset": {
      g.hline(cx - rx + 1, cx + rx - 2, top - 1, accent);
      g.set(cx - rx, top, accent);
      g.set(cx + rx - 1, top, accent);
      const cup = (x: number) => {
        g.rect(x, hy - 2, 3, 4, main);
        g.hline(x, x + 2, hy - 2, accent);
        g.set(x + 1, hy, accent);
      };
      if (side) {
        g.vline(cx - 1, top - 1, hy - 3, main);
        cup(cx - 2);
      } else {
        g.vline(cx - rx, top, hy - 3, main);
        g.vline(cx + rx - 1, top, hy - 3, main);
        cup(cx - rx - 2);
        cup(cx + rx - 1);
      }
      break;
    }
    case "goggles": {
      const y = e.y - 1;
      if (view === "up") {
        g.hline(cx - rx, cx + rx - 1, y, accent);
        break;
      }
      const x0 = side ? cx - 1 : cx - rx;
      const x1 = side ? cx + rx + 1 : cx + rx - 1;
      g.rect(x0, y - 1, x1 - x0 + 1, 3, main);
      g.hline(x0, x1, y, accent);
      g.set(x0, y - 1, lighten(main, 0.4));
      if (!side) {
        g.set(cx - rx - 1, y, lo);
        g.set(cx + rx, y, lo);
      }
      spot = [x1, y - 1];
      break;
    }
    case "crown": {
      g.hline(cx - rx, cx + rx - 1, top, main);
      g.hline(cx - rx, cx + rx - 1, top + 1, lo);
      for (const x of side ? [cx - 3, cx, cx + 3] : [cx - 4, cx - 1, cx + 2]) {
        g.vline(x, top - 3, top - 1, main);
        g.set(x, top - 3, lighten(main, 0.4));
      }
      if (view !== "up") g.set(side ? cx + 3 : cx - 1, top, accent);
      spot = [cx - 1, top - 3];
      break;
    }
    case "glasses": {
      if (view === "up") {
        g.hline(cx - rx, cx - rx + 1, e.y, main);
        g.hline(cx + rx - 2, cx + rx - 1, e.y, main);
        break;
      }
      for (const x of e.xs) {
        g.rect(x - 1, e.y - 1, 3, 3, main);
        g.set(x, e.y, accent);
      }
      if (!side) g.hline(e.xs[0] + 2, e.xs[1] - 2, e.y - 1, main);
      else g.hline(cx - rx, e.xs[0] - 2, e.y - 1, main);
      break;
    }
    case "halo": {
      const y = top - 3;
      const w = side ? 3 : 4;
      g.hline(cx - w, cx + w - 1, y - 1, main);
      g.hline(cx - w, cx + w - 1, y + 1, main);
      g.set(cx - w - 1, y, main);
      g.set(cx + w, y, main);
      for (let x = cx - w + 1; x <= cx + w - 2; x++) g.set(x, y, lighten(main, 0.5), 160);
      g.set(cx, y - 1, accent);
      spot = [cx + w, y];
      break;
    }
  }
  if (p.hi) g.set(spot[0], spot[1], GOLD_TRIM);
  return spot;
}

/** 상점 장신구 (가슴·귀·손 옆의 작은 그림) */
function drawShopAcc(g: Grid, view: View, fb: Base, m: WearM, p: Shop): void {
  if (view === "up") return;
  const { cx } = m;
  const y = m.shY + (fb === "tall" ? 0 : 1);
  const side = view === "side";
  const { main, accent } = p;
  switch (p.shape) {
    case "earphones": {
      const e = eyes(fb, view, m);
      for (const x of side ? [cx - 1] : [cx - 3, cx + 2]) {
        g.set(x, e.y + 2, main);
        g.vline(x, e.y + 3, y + 1, accent);
      }
      break;
    }
    case "watch":
    case "ring":
      g.set(side ? cx + 3 : cx + 4, y + 2, main);
      g.set(side ? cx + 3 : cx + 4, y + 1, accent);
      break;
    case "mug":
    case "tumbler": {
      const x = side ? cx + 3 : cx + 4;
      g.rect(x, y, 2, 3, main);
      g.hline(x, x + 1, y + 1, accent);
      break;
    }
    case "lanyard":
      g.set(side ? cx + 1 : cx - 1, y - 1, main);
      g.rect(side ? cx + 1 : cx - 2, y, 2, 2, accent);
      g.set(side ? cx + 1 : cx - 2, y, main);
      break;
    case "envelope":
      g.rect(side ? cx + 1 : cx - 3, y, 3, 2, main);
      g.set(side ? cx + 2 : cx - 2, y, accent);
      break;
    default:
      // 스티커·배지·카드 지갑: 가슴 왼쪽 작은 배지
      g.rect(side ? cx + 1 : cx - 3, y, 2, 2, main);
      g.set(side ? cx + 1 : cx - 3, y, accent);
  }
}

// ── 부위마다 하나로 (세트 장비·상점 장비) ──

export function drawWearArmor(
  g: Grid,
  view: View,
  fb: Base,
  m: WearM,
  bodyCols: readonly Color[],
  lo: readonly Color[],
  p: WearPiece,
): [number, number] | null {
  if ("set" in p) return drawSetArmor(g, view, fb, m, bodyCols, lo, [p.set, p.grade]);
  drawShopArmor(g, view, fb, m, bodyCols, lo, p);
  return null;
}
export function drawWearHead(g: Grid, view: View, fb: Base, m: WearM, p: WearPiece): [number, number] {
  return "set" in p ? drawSetHead(g, view, fb, m, [p.set, p.grade]) : drawShopHead(g, view, fb, m, p);
}
export function drawWearAcc(g: Grid, view: View, fb: Base, m: WearM, p: WearPiece): void {
  if ("set" in p) drawSetAcc(g, view, fb, m, [p.set, p.grade]);
  else drawShopAcc(g, view, fb, m, p);
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
