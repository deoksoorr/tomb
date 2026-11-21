import * as Phaser from "phaser";
import { addHurt, type HurtCell, type HurtKind } from "./hurtTally";

// 피해 숫자 (큰 도트 숫자 + 외곽선, 색 체계별 그라데이션). 글자는 코드로 그린 5×7 도트를 굵게 한 자체 글꼴.
//  - 타격마다 숫자가 새로 튀어나와 같은 자리 근처에 조금씩 흩어져 겹친다 (새 숫자가 위에 덮어씀) — 짧게 튀었다 사라진다
//  - 연타 묶음(스킬 한 번)이 끝나면 "12 HIT" + 합계 "3,240"을 크게 회전·확대 팝
//  - 치명타: 금→빨강 그라데이션 · 더 크게 · 흔들림 · 위에 "CRITICAL" (별 튐은 SkillFx가 맞은 자리에)
//  - 색 체계: 기본 공격(흰·살구) / 스킬(갈래 색) / 치명타(금·빨강) / 회복(초록 +) / 내가 맞음(빨강 -) / 몬스터 지속 피해(보라 -) / 방패가 막음(파랑 -) / 합계(금)
//  - 11/17 내가 받은 피해(taken): 실제로 깎인 체력 하나만 빨강으로, 지속 피해는 같은 빨강 조금 작게, 방패가 막은 몫은 파랑. 0.3초 안에 또 맞으면 합친다 (hurtTally)
// 동시에 떠 있는 숫자 상한 (휴대폰 40) — 넘으면 가장 오래된 숫자부터 거둔다. 글자 이미지는 풀에서 재사용.

export type NumStyle = "basic" | "ember" | "frost" | "soul" | "worker" | "crit" | "heal" | "hurt" | "dot" | "total" | "shield";

/** 위 → 가운데 → 아래 색, 외곽선 */
const STYLES: Record<NumStyle, { top: string; mid: string; bot: string; edge: string; glint?: string }> = {
  basic: { top: "#ffffff", mid: "#fff4dc", bot: "#ffcf96", edge: "#1a0f0a" },
  ember: { top: "#fff7c8", mid: "#ffc04a", bot: "#ff6a1e", edge: "#3a0e04" },
  frost: { top: "#ffffff", mid: "#c8eeff", bot: "#5ab4f0", edge: "#08223a" },
  soul: { top: "#fbf2ff", mid: "#d6b0ff", bot: "#8a5ae8", edge: "#1c0838" },
  // 11/19 삽자루 일꾼: 흙빛 쇠 (묵직한 갈색)
  worker: { top: "#fff4dc", mid: "#e8b878", bot: "#9a5a2a", edge: "#2a1608" },
  crit: { top: "#fffbd0", mid: "#ffd23a", bot: "#ff2a1a", edge: "#300400", glint: "#ffffff" },
  heal: { top: "#f0ffe0", mid: "#8af08a", bot: "#22a85a", edge: "#04240e" },
  hurt: { top: "#ffe0e0", mid: "#ff7a7a", bot: "#d01a2a", edge: "#280206" },
  dot: { top: "#f4e0ff", mid: "#c88aff", bot: "#7a3ac0", edge: "#1a0630" },
  total: { top: "#ffffff", mid: "#ffe066", bot: "#ff8a1a", edge: "#2a0c00", glint: "#ffffff" },
  shield: { top: "#ffffff", mid: "#b8dcff", bot: "#3a82e8", edge: "#061a3a" },
};

/** 5×7 도트 글자 (# = 칠함). 너비는 글자마다 다르다 */
const GLYPHS: Record<string, string[]> = {
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "# #  ", "  #  ", "  #  ", "  #  ", "#####"],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
  ",": ["  ", "  ", "  ", "  ", " #", " #", "# "],
  "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  "-": ["    ", "    ", "    ", "####", "    ", "    ", "    "],
  "!": ["#", "#", "#", "#", "#", " ", "#"],
  " ": ["  ", "  ", "  ", "  ", "  ", "  ", "  "],
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["###", " # ", " # ", " # ", " # ", " # ", "###"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
};
const CHARS = Object.keys(GLYPHS);
/** 도트 1칸 = 2px, 외곽선 2px */
const P = 2;
const O = 2;
const GH = 7 * P + O * 2 + 1;

function glyphW(ch: string): number {
  return (GLYPHS[ch][0].length + 1) * P + O * 2;
}
/** 글자 사이 간격 (외곽선끼리 겹친다) */
const adv = (ch: string) => glyphW(ch) - O * 2 + 1;

function texKey(style: NumStyle): string {
  return `dmgnum-${style}`;
}

function hexMix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** 글꼴 시트 하나 (글자를 가로로 늘어놓고 프레임 이름 = 글자) */
function ensureFont(scene: Phaser.Scene, style: NumStyle): void {
  const key = texKey(style);
  if (scene.textures.exists(key) || typeof document === "undefined") return;
  const st = STYLES[style];
  const total = CHARS.reduce((s, ch) => s + glyphW(ch), 0);
  const cv = document.createElement("canvas");
  cv.width = total;
  cv.height = GH;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) return;
  let x0 = 0;
  const frames: [string, number, number][] = [];
  for (const ch of CHARS) {
    const rows = GLYPHS[ch];
    const w = rows[0].length;
    // 굵게: 오른쪽으로 한 칸 겹쳐 찍는다
    const on = (x: number, y: number) => y >= 0 && y < 7 && ((x >= 0 && x < w && rows[y][x] === "#") || (x - 1 >= 0 && x - 1 < w && rows[y][x - 1] === "#"));
    // 외곽선 (+ 아래로 1px 그림자)
    c.fillStyle = st.edge;
    for (let y = 0; y < 7; y++) for (let x = 0; x <= w; x++) if (on(x, y)) c.fillRect(x0 + x * P, y * P, P + O * 2, P + O * 2 + 1);
    // 채움: 줄마다 위→가운데→아래 그라데이션
    for (let y = 0; y < 7; y++) {
      const t = y / 6;
      c.fillStyle = t < 0.5 ? hexMix(st.top, st.mid, t * 2) : hexMix(st.mid, st.bot, (t - 0.5) * 2);
      for (let x = 0; x <= w; x++) if (on(x, y)) c.fillRect(x0 + O + x * P, O + y * P, P, P);
    }
    // 반짝 (치명타·합계): 각 열의 맨 윗칸을 하얗게
    if (st.glint) {
      c.fillStyle = st.glint;
      for (let x = 0; x <= w; x++)
        for (let y = 0; y < 7; y++)
          if (on(x, y)) {
            c.fillRect(x0 + O + x * P, O + y * P, P, 1);
            break;
          }
    }
    frames.push([ch, x0, glyphW(ch)]);
    x0 += glyphW(ch);
  }
  const tex = scene.textures.addCanvas(key, cv);
  if (!tex) return;
  for (const [ch, x, w] of frames) tex.add(ch, 0, x, 0, w, GH);
}

/** 연타 묶음 (스킬 한 번): 맞힌 수·합계를 모았다가 끝나면 크게 터뜨린다 */
export class DmgGroup {
  hits = 0;
  total = 0;
  crits = 0;
  lastAt = 0;
  closed = false;
  /** 11/21 마지막으로 맞은 몬스터 머리 위 (compact: 합계를 그 오른쪽 위에) */
  hx: number | null = null;
  hy = 0;
  constructor(
    public x: number,
    public y: number,
    public style: NumStyle,
    /** 마지막 타격 뒤 이만큼(ms, 실시간) 조용하면 끝 */
    public idleMs: number,
    /** 이 수 이상 맞혀야 합계를 띄운다 */
    public minHits: number,
  ) {}
}

/** 월드 좌표 사각형 */
export type Box = { x0: number; y0: number; x1: number; y1: number };

type Kind = "pop" | "crit" | "total" | "label" | "word";

type Num = {
  glyphs: Phaser.GameObjects.Image[];
  offs: number[];
  x: number;
  y: number;
  age: number;
  life: number;
  k: number;
  kind: Kind;
  delay: number;
  /** 튀어 오르는 방향 (화면 px) */
  hx: number;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** 11/21 회장님 독대 폰·낮은 화면: 크기 배율 · 수명 배율 · 비켜 띄우는 거리(화면 px, 오른쪽 위) · 종류마다 동시에 떠 있는 상한 */
export const COMPACT = { k: 0.64, life: 0.62, dx: 20, dy: -26, pop: 1.8, cap: { pop: 8, total: 1, label: 1, crit: 2, word: 2 } as Partial<Record<Kind, number>> };

export class DamageNumbers {
  private nums: Num[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private groups: DmgGroup[] = [];
  private seq = 0;
  /** 11/17 합치는 중인 내 피해 숫자 (종류마다 하나) */
  private tally: Partial<Record<HurtKind, { cell: HurtCell | null; num: Num | null; x: number; y: number }>> = {};
  readonly cap: number;
  /** 11/21 회장님 독대 폰·낮은 화면 (COMPACT) */
  private compact = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    mobile: boolean,
  ) {
    this.cap = mobile ? 40 : 90;
    // 11/19 글꼴 텍스처는 판 시작 때 모두 미리 만든다 (첫 타격 때 만들면 캔버스 읽기로 100ms 넘게 멈췄다 — 전투 프레임 측정)
    for (const st of Object.keys(STYLES) as NumStyle[]) ensureFont(scene, st);
  }

  private get zoom(): number {
    return this.scene.cameras.main.zoom || 1;
  }

  /**
   * avoid: 내 캐릭터 자리 (숫자가 몸에 걸리면 옆으로 비킨다)
   * keepOut: 내 이름·체력 막대·콤보 칸 (월드 좌표) — 합계·HIT는 절대 여기에 안 걸친다. topPad: 위 HUD가 가리는 화면 px
   */
  setCompact(on: boolean, avoid?: () => { x: number; y: number }, keepOut?: () => Box | null, topPad = 0): void {
    this.compact = on;
    this.avoid = avoid ?? null;
    this.keepOut = keepOut ?? null;
    this.topPad = topPad;
  }
  private avoid: (() => { x: number; y: number }) | null = null;
  private keepOut: (() => Box | null) | null = null;
  private topPad = 0;

  /** compact: 글자가 내 캐릭터 몸(발 기준 위 76px·아래 18px)에 걸리면 오른쪽 옆으로 (k = 글자 배율 — 반폭 계산) */
  private dodge(x: number, y: number, text: string, k: number): [number, number] {
    const me = this.compact ? this.avoid?.() : null;
    if (!me) return [x, y];
    const z = this.zoom;
    const hw = ([...text].reduce((s, ch) => s + (GLYPHS[ch] ? adv(ch) : 0), 0) * k * COMPACT.k) / 2;
    const ox = COMPACT.dx / z;
    const oy = COMPACT.dy / z;
    const sx = (x + ox - me.x) * z;
    const sy = (y + oy - me.y) * z;
    if (Math.abs(sx) > 26 + hw || sy < -76 || sy > 18) return [x, y];
    return [me.x + (34 + hw) / z - ox, me.y - 30 / z - oy];
  }

  /** 새 연타 묶음 (x,y: 합계를 띄울 자리) */
  group(x: number, y: number, style: NumStyle, idleMs = 480, minHits = 2): DmgGroup {
    const g = new DmgGroup(x, y, style, idleMs, minHits);
    g.lastAt = performance.now();
    this.groups.push(g);
    return g;
  }

  /** 몬스터 피해 숫자 (같은 자리 근처에 흩어져 겹친다). group이 있으면 합계에 더한다 */
  /** counted = 묶음 합계에 더할 값 (실제로 깎은 체력 — 없으면 n). 한 방 숫자는 n 그대로 */
  hit(x: number, y: number, n: number, crit: boolean, style: NumStyle, group?: DmgGroup | null, counted?: number): void {
    const z = this.zoom;
    const sx = (Math.random() - 0.5) * 22;
    const sy = (Math.random() - 0.5) * 14 - (crit ? 6 : 0);
    const s = crit ? "crit" : style;
    const k = crit ? 1.7 : style === "basic" ? 0.85 : 1.05;
    [x, y] = this.dodge(x, y, String(Math.round(n)), k);
    this.spawn(String(Math.round(n)), s, x + sx / z, y + sy / z, k, crit ? "crit" : "pop", crit ? 860 : 640, 0, (Math.random() - 0.5) * 10);
    if (crit) this.spawn("CRITICAL", "crit", x + sx / z, y + (sy - 22) / z, 0.6, "word", 760, 30, 0);
    if (group && !group.closed) {
      group.hits++;
      group.total += counted ?? n;
      if (crit) group.crits++;
      group.lastAt = performance.now();
      group.hx = x;
      group.hy = y;
    }
  }

  /** 회복 (+초록) */
  heal(x: number, y: number, n: number, big = false): void {
    this.spawn(`+${Math.round(n)}`, "heal", x, y, big ? 1.4 : 1, "pop", 900, 0, 0);
  }

  /**
   * 11/17 내가 받은 피해: hit = 실제로 깎인 체력(빨강), dot = 지속 피해(같은 빨강, 조금 작게), block = 방패가 막은 몫(파랑).
   * 0.3초 안에 같은 종류가 또 오면 앞 숫자를 지우고 합계를 그 자리에 다시 띄운다
   */
  taken(kind: HurtKind, x: number, y: number, n: number): void {
    const now = performance.now();
    const prev = this.tally[kind];
    const r = addHurt(prev?.cell ?? null, now, Math.round(n));
    if (!r.shown || !r.cell) return;
    let ax = x;
    let ay = y;
    if (r.merged && prev) {
      ax = prev.x;
      ay = prev.y;
      const i = prev.num ? this.nums.indexOf(prev.num) : -1;
      if (i >= 0) this.drop(i);
    }
    const k = kind === "dot" ? 0.85 : kind === "block" ? 0.9 : 1.1;
    const num = this.spawn(`-${r.cell.n}`, kind === "block" ? "shield" : "hurt", ax, ay, k, "pop", kind === "dot" ? 600 : 700, 0, kind === "hit" ? (Math.random() - 0.5) * 8 : 4);
    this.tally[kind] = { cell: r.cell, num, x: ax, y: ay };
  }

  /** 몬스터 지속 피해 (-보라) */
  minor(x: number, y: number, n: number): void {
    this.spawn(`-${Math.round(n)}`, "dot", x, y, 0.8, "pop", 600, 0, 4);
  }

  /** 합계 팝: "12 HIT" + "3,240" */
  private total(g: DmgGroup): void {
    const z = this.zoom;
    const big = g.hits >= 10 || g.crits > 0;
    const kt = big ? 2.3 : 1.9;
    const kl = big ? 1.15 : 1;
    const label = `${g.hits} HIT`;
    // "N HIT"은 합계 숫자 위로 (합계 글자 높이의 절반 + 여백만큼 올린다)
    const gap = (GH * kt * 0.5 + GH * 0.6 + 12) * (this.compact ? COMPACT.k : 1);
    const [gx, gy] = this.compact && this.keepOut ? this.bigSpot(g, fmt(g.total), label, kt, kl, gap) : this.dodge(g.x, g.y, fmt(g.total), kt);
    this.spawn(label, g.style === "basic" ? "total" : g.style, gx, gy - gap / z, kl, "label", 1500, 90, 0);
    this.spawn(fmt(g.total), "total", gx, gy, kt, "total", 1560, 0, 0);
  }

  /**
   * 11/21 폰(compact): 합계·HIT 자리 — 맞은 몬스터 오른쪽 위, 내 이름·막대 칸과 겹치면 그 위로(안 되면 옆으로), 화면 안으로.
   * 돌려주는 값은 spawn이 compact 비킴(dx,dy)을 더하기 전 자리
   */
  private bigSpot(g: DmgGroup, total: string, label: string, kt: number, kl: number, gap: number): [number, number] {
    const z = this.zoom;
    const c = COMPACT.k;
    const w = (t: string) => [...t].reduce((s, ch) => s + (GLYPHS[ch] ? adv(ch) : 0), 0);
    // 처음 박힐 때 COMPACT.pop배까지 커진다 — 그 크기로 잰다
    const p = COMPACT.pop;
    const hw = (Math.max(w(total) * kt, w(label) * kl) * c * p) / 2 / z;
    const up = (gap + (GH * kl * c * p) / 2) / z; // 합계 가운데 → 묶음 위끝
    const dn = (GH * kt * c * p) / 2 / z; // 합계 가운데 → 묶음 아래끝
    const m = 4 / z;
    let x = (g.hx ?? g.x) + hw * 0.6 + 6 / z;
    let y = (g.hx === null ? g.y : g.hy) - dn;
    const v = this.scene.cameras.main.worldView;
    const top = v.y + Math.max(this.topPad, 56) / z + up;
    const fit = () => {
      x = Math.min(Math.max(x, v.x + hw + m), v.right - hw - m);
      y = Math.min(Math.max(y, top), v.bottom - dn - m);
    };
    fit();
    const k = this.keepOut?.();
    const hitK = () => !!k && x + hw + m > k.x0 && x - hw - m < k.x1 && y + dn + m > k.y0 && y - up - m < k.y1;
    if (k && hitK()) {
      // 위로 올려 보고, 화면 위로 넘치면 옆으로 (오른쪽 먼저)
      y = k.y0 - m - dn;
      fit();
      if (hitK()) {
        x = k.x1 + m + hw <= v.right - m - hw ? k.x1 + m + hw : k.x0 - m - hw;
        fit();
      }
    }
    return [x - COMPACT.dx / z, y - COMPACT.dy / z];
  }

  private take(style: NumStyle, ch: string): Phaser.GameObjects.Image {
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, texKey(style), ch);
    img.setTexture(texKey(style), ch).setVisible(true).setActive(true).setAlpha(1).setRotation(0);
    return img;
  }

  private spawn(text: string, style: NumStyle, x: number, y: number, k: number, kind: Kind, life: number, delay: number, hx: number): Num {
    ensureFont(this.scene, style);
    // 상한: 가장 오래된 작은 숫자부터 거둔다 (합계는 남긴다)
    while (this.nums.length >= this.cap) {
      const i = this.nums.findIndex((m) => m.kind === "pop" || m.kind === "crit" || m.kind === "word");
      if (i < 0) break;
      this.drop(i);
    }
    if (this.compact) {
      const z = this.zoom;
      k *= COMPACT.k;
      life *= COMPACT.life;
      delay *= COMPACT.life;
      x += COMPACT.dx / z;
      y += COMPACT.dy / z;
      // 큰 숫자는 같은 종류 상한까지만 (오래된 것부터 거둔다)
      const lim = COMPACT.cap[kind];
      if (lim)
        for (let i = this.nums.length - 1, c = 0; i >= 0; i--)
          if (this.nums[i].kind === kind && ++c >= lim) this.drop(i);
    }
    const chars = [...text].filter((ch) => GLYPHS[ch]);
    const width = chars.reduce((s, ch) => s + adv(ch), 0);
    const offs: number[] = [];
    let cx = -width / 2;
    const depth = 1e6 + 20 + (this.seq++ % 100000) * 0.001 + (kind === "total" || kind === "label" ? 50 : 0);
    const glyphs = chars.map((ch) => {
      offs.push(cx + adv(ch) / 2);
      cx += adv(ch);
      return this.take(style, ch).setDepth(depth).setVisible(delay <= 0);
    });
    const n: Num = { glyphs, offs, x, y, age: 0, life, k, kind, delay, hx };
    this.nums.push(n);
    this.place(n);
    return n;
  }

  private drop(i: number): void {
    const n = this.nums[i];
    for (const g of n.glyphs) {
      g.setVisible(false).setActive(false);
      if (g.scene) this.pool.push(g);
    }
    this.nums.splice(i, 1);
  }

  /** 한 숫자의 모양 (나이에 따라 튀고·흔들리고·사라짐) */
  private place(n: Num): void {
    const z = this.zoom;
    const a = n.age;
    const backOut = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
    let s = 1;
    let rot = 0;
    let dy = 0;
    let dx = 0;
    let alpha = 1;
    const fadeMs = n.kind === "total" || n.kind === "label" ? 320 : 150;
    if (n.kind === "pop") {
      s = a < 90 ? 2.1 + (1 - 2.1) * backOut(a / 90) : 1;
      dy = -10 * Math.min(1, a / 160) * (2 - Math.min(1, a / 160)) - Math.max(0, a - n.life * 0.55) * 0.03;
      dx = n.hx * Math.min(1, a / 300);
    } else if (n.kind === "crit") {
      s = a < 130 ? 2.8 + (1 - 2.8) * backOut(a / 130) : 1 + 0.07 * Math.sin(a / 35) * Math.max(0, 1 - (a - 130) / 400);
      rot = a < 360 && !this.reduced ? Math.sin(a / 22) * 0.12 * (1 - a / 360) : 0;
      dx = a < 260 && !this.reduced ? Math.sin(a / 14) * 2 * (1 - a / 260) : 0;
      dy = -14 * Math.min(1, a / 200) - Math.max(0, a - n.life * 0.6) * 0.04;
    } else if (n.kind === "word") {
      s = a < 100 ? 0.3 + 0.7 * backOut(a / 100) : 1;
      dy = -6 * Math.min(1, a / 200) - Math.max(0, a - n.life * 0.6) * 0.04;
    } else {
      // 합계 · HIT: 크게 돌며 박혔다가, 맥박 → 떠오르며 사라짐
      const t0 = 230;
      // compact: 처음 크게 박히는 배율을 줄인다 (폰에서 3.4배면 잠깐 내 이름 칸까지 덮었다)
      const s0 = this.compact ? COMPACT.pop : 3.4;
      s = a < t0 ? s0 + (1 - s0) * backOut(a / t0) : 1 + 0.05 * Math.sin((a - t0) / 55) * Math.max(0, 1 - (a - t0) / 700);
      rot = a < t0 && !this.reduced ? -0.45 * (1 - backOut(a / t0)) : 0;
      if (n.kind === "label") rot = -rot;
      dy = -Math.max(0, a - (n.life - 360)) * 0.06;
      alpha = a < 60 ? a / 60 : 1;
    }
    if (a > n.life - fadeMs) alpha *= Math.max(0, (n.life - a) / fadeMs);
    const k = (n.k * s) / z;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    for (let i = 0; i < n.glyphs.length; i++) {
      const ox = n.offs[i] * k;
      n.glyphs[i]
        .setPosition(n.x + dx / z + ox * c, n.y + dy / z + ox * sn)
        .setScale(k)
        .setRotation(rot)
        .setAlpha(alpha);
    }
  }

  /** 매 프레임 (실시간 ms) */
  update(deltaMs: number): void {
    const now = performance.now();
    for (const g of this.groups) {
      if (g.closed || now - g.lastAt < g.idleMs) continue;
      g.closed = true;
      if (g.hits >= g.minHits) this.total(g);
    }
    if (this.groups.length > 8) this.groups = this.groups.filter((g) => !g.closed);
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      if (n.delay > 0) {
        n.delay -= deltaMs;
        if (n.delay > 0) continue;
        for (const g of n.glyphs) g.setVisible(true);
      }
      n.age += deltaMs;
      if (n.age >= n.life || !n.glyphs.every((g) => g.scene)) {
        this.drop(i);
        continue;
      }
      this.place(n);
    }
  }

  /** 떠 있는 숫자 수 (검수용) */
  get liveCount(): number {
    return this.nums.length;
  }
}
