import * as Phaser from "phaser";
import {
  CF_BOSS_NOSOUP,
  CF_BOSS_SPECIAL,
  CF_BOSS_SPICY,
  CF_MENUS,
  CF_PUDDLE_CAP,
  CF_QUEUE,
  CF_ROOM_NAMES,
  CF_SPILL,
  cfDish,
  cfLoop,
  type CfLoop,
} from "@/lib/rpg/towerThemes/cafeteria";
import { CF_SPECIAL_SERVERS, cfRiceAdds } from "@/lib/rpg/towerThemes/cafeteriaPlan";
import { makeCanvas, radial } from "../../sprites/pixel";
import type { Layer } from "../../rpg/skillSound";
import { CF_MENU, cfLanes, cfPots, cfSpillBand, digits, type CfLane } from "./cafeteriaMap";
import { FxPool, MonGrid, themeVisit } from "./fxPool";
import { foldMultiply } from "./overlay";
import type { ThemeHost, ThemeMon, TowerThemeRuntime } from "./runtime";

// 11/15 구내식당 실행부 (층마다 하나): 움직이는 배경(국솥 김·화구 불꽃·퇴식 컨베이어·자판기 불빛·메뉴판·특식 줄 깃발),
// 기믹 「점심시간 줄서기」(줄서기 선을 따라 행렬이 밀려와 그 줄 안에 있으면 함께 떠밀린다)와 「뜨거운 국물」(국솥이 끓어 넘쳐 튈 자리 표시 → 뜨거운 웅덩이),
// 몬스터 열다섯 종의 행동, 영양사의 메뉴 세 단계 (매운 날 · 국 없는 날 · 특식).
// 서버 검증과 상관있는 것: 주먹밥(밥솥 한 마리당 cfRiceAdds)·특식 배식 도우미(층마다 CF_SPECIAL_SERVERS)는 층 계획 adds 몫 안에서만 내보낸다.

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;

const D_PUDDLE = -785;
const D_LANE = -770;
const D_FX = -440;
const D_SIGN = -900;
const D_BUNT = 9030;
const D_GLOW = 9056;
const D_VIG = 9600;

const T = {
  soft: "cf-soft",
  px: "cf-px",
  edgeV: "cf-edge-v",
  edgeH: "cf-edge-h",
  person: (i: number) => `cf-person-${i}`,
  can: "cf-can",
  spoon: "cf-spoon",
  tray: "cf-tray",
  drop: "cf-drop",
  flame: (i: number) => `cf-flame-${i}`,
  mini: "cf-minitray",
  sign: (f: number) => `cf-sign-${f}`,
} as const;

/** 줄서기 행렬 사람 수·간격 */
const CROWD = 9;
const CROWD_GAP = 19;
/** 직접 띄우는 탄 (캔·숟가락·식판) 상한 */
const PROJ_CAP = 18;

// ── 소리 (음원 없이 합성 — game/rpg/skillSound Layer) ──

const osc = (wave: "sine" | "square" | "triangle" | "sawtooth", at: number, dur: number, f0: number, f1: number, gain: number, x: Partial<Layer> = {}): Layer => ({ src: "osc", wave, at, dur, f0, f1, gain, atk: 0.004, env: "perc", ...x });
const nz = (at: number, dur: number, gain: number, f0: number, f1: number, q = 1.4, x: Partial<Layer> = {}): Layer => ({ src: "noise", at, dur, gain, atk: 0.004, env: "perc", flt: { type: "bandpass", f0, f1, q }, ...x });
type Snd = "chime" | "bubble" | "splash" | "whistle" | "clank" | "suck" | "can" | "pinch" | "menu";
const SOUNDS: Record<Snd, Layer[]> = {
  // 점심시간 알림 (딩동댕)
  chime: [osc("sine", 0, 0.5, 784, 784, 0.14, { verb: 0.4 }), osc("sine", 0.18, 0.5, 659, 659, 0.14, { verb: 0.4 }), osc("sine", 0.36, 0.7, 523, 523, 0.14, { verb: 0.4 })],
  bubble: [0, 0.09, 0.2].map((t, i) => osc("sine", t, 0.07, 260 + i * 70, 520 + i * 90, 0.08)),
  splash: [nz(0, 0.35, 0.22, 1800, 600, 1.2), osc("sine", 0, 0.12, 300, 120, 0.1)],
  whistle: [osc("sine", 0, 0.7, 1900, 2300, 0.07, { env: "hold", atk: 0.08 }), nz(0, 0.7, 0.08, 5000, 6000, 2, { env: "hold", atk: 0.1 })],
  clank: [osc("triangle", 0, 0.12, 1400, 1300, 0.1), osc("square", 0, 0.05, 2600, 2400, 0.04)],
  suck: [nz(0, 0.6, 0.12, 400, 1800, 3, { env: "swell", atk: 0.4 })],
  can: [osc("square", 0, 0.05, 900, 700, 0.06), osc("triangle", 0.05, 0.1, 500, 420, 0.08)],
  pinch: [osc("triangle", 0, 0.05, 1800, 1800, 0.1), osc("triangle", 0.06, 0.05, 2200, 2200, 0.1)],
  menu: [osc("square", 0, 0.08, 880, 880, 0.06), osc("square", 0.1, 0.08, 1175, 1175, 0.06), osc("square", 0.2, 0.18, 1568, 1568, 0.06)],
};

function ensureTextures(scene: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  };
  add(T.soft, () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  add(T.px, () => {
    const { canvas, ctx } = makeCanvas(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 2, 2);
    return canvas;
  });
  for (const [k, w, h, hor] of [
    [T.edgeV, 4, 64, false],
    [T.edgeH, 64, 4, true],
  ] as const)
    add(k, () => {
      const { canvas, ctx } = makeCanvas(w, h);
      const g = hor ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return canvas;
    });
  // 줄 서는 회사원 넷 (식판을 든 옆모습 — 셔츠·머리·사원증 줄 색이 다르다)
  const looks = [
    { shirt: "#f2f2ee", tie: "#c8302a", hair: "#1a1a20", pants: "#2a2e3a", skin: "#f0c8a0" },
    { shirt: "#7aa8d8", tie: "#2a3a5a", hair: "#4a2a1a", pants: "#3a3a44", skin: "#e8b890" },
    { shirt: "#e8a0b0", tie: "", hair: "#2a1a14", pants: "#2a2e3a", skin: "#f4d0b0" },
    { shirt: "#5a6a50", tie: "", hair: "#6a6a70", pants: "#4a3a2a", skin: "#e0b088" },
  ];
  looks.forEach((lk, i) =>
    add(T.person(i), () => {
      const { canvas, ctx } = makeCanvas(14, 25);
      const r = (x: number, y: number, w: number, h: number, c: string) => {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h);
      };
      const t = i % 2;
      // 외곽선 먼저 (몸 실루엣보다 1칸 크게)
      r(4, 0 + t, 7, 8, "#141218");
      r(2, 7 + t, 10, 11 - t, "#141218");
      r(3, 17, 9, 8, "#141218");
      r(5, 1 + t, 5, 6, lk.skin);
      r(5, 1 + t, 5, 2, lk.hair);
      r(9, 2 + t, 1, 3, lk.hair);
      r(6, 4 + t, 1, 1, "#141218");
      r(3, 8 + t, 8, 9 - t, lk.shirt);
      if (lk.tie) r(6, 8 + t, 1, 5, lk.tie);
      r(8, 9 + t, 1, 3, "#e8c040");
      r(8, 12 + t, 1, 1, "#3a7ad0");
      // 앞으로 든 식판
      r(9, 12, 5, 2, "#141218");
      r(9, 12, 4, 1, "#c8d0d6");
      r(10, 11, 1, 1, "#d8302a");
      r(12, 11, 1, 1, "#f2ead3");
      r(4, 17, 3, 7, lk.pants);
      r(8, 17, 3, 7, lk.pants);
      r(3, 23, 4, 2, "#141218");
      r(8, 23, 4, 2, "#141218");
      return canvas;
    }),
  );
  add(T.can, () => {
    const { canvas, ctx } = makeCanvas(7, 6);
    ctx.fillStyle = "#141218";
    ctx.fillRect(0, 0, 7, 6);
    ctx.fillStyle = "#8a3a2a";
    ctx.fillRect(1, 1, 5, 4);
    ctx.fillStyle = "#f0d8a0";
    ctx.fillRect(2, 2, 3, 1);
    ctx.fillStyle = "#d8dce0";
    ctx.fillRect(1, 1, 1, 4);
    return canvas;
  });
  add(T.spoon, () => {
    const { canvas, ctx } = makeCanvas(11, 6);
    ctx.fillStyle = "#141218";
    ctx.fillRect(0, 1, 5, 4);
    ctx.fillRect(4, 2, 7, 2);
    ctx.fillStyle = "#e8ecf0";
    ctx.fillRect(1, 2, 3, 2);
    ctx.fillRect(5, 2, 5, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1, 2, 1, 1);
    return canvas;
  });
  add(T.tray, () => {
    const { canvas, ctx } = makeCanvas(12, 8);
    ctx.fillStyle = "#141218";
    ctx.fillRect(0, 0, 12, 8);
    ctx.fillStyle = "#a8b4be";
    ctx.fillRect(1, 1, 10, 6);
    ctx.fillStyle = "#f6f4ec";
    ctx.fillRect(2, 2, 3, 2);
    ctx.fillStyle = "#d8302a";
    ctx.fillRect(6, 2, 2, 2);
    ctx.fillStyle = "#d88a3a";
    ctx.fillRect(2, 5, 8, 1);
    return canvas;
  });
  add(T.drop, () => {
    const { canvas, ctx } = makeCanvas(3, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(1, 0, 1, 3);
    ctx.fillRect(0, 1, 3, 1);
    return canvas;
  });
  add(T.mini, () => {
    const { canvas, ctx } = makeCanvas(9, 4);
    ctx.fillStyle = "#7a848c";
    ctx.fillRect(0, 0, 9, 4);
    ctx.fillStyle = "#c8d0d6";
    ctx.fillRect(0, 0, 9, 1);
    ctx.fillStyle = "#e8e0d0";
    ctx.fillRect(1, 1, 3, 2);
    ctx.fillStyle = "#c8502a";
    ctx.fillRect(5, 1, 2, 1);
    return canvas;
  });
  for (let i = 0; i < 3; i++)
    add(T.flame(i), () => {
      const { canvas, ctx } = makeCanvas(6, 7);
      const rows = [
        [2, 6, 2],
        [1, 5, 4],
        [1, 4, 4],
        [2, 3, 3],
        [2, 2, 2],
        [3, 1, 1],
      ];
      const sway = [0, 1, -1][i];
      for (const [x, y, w] of rows) {
        ctx.fillStyle = "#3a8aff";
        ctx.fillRect(x + (y < 4 ? sway : 0), y, w, 1);
        if (y > 3 && w > 2) {
          ctx.fillStyle = "#bfe4ff";
          ctx.fillRect(x + 1, y, w - 2, 1);
        }
      }
      return canvas;
    });
}

type St = {
  ph: number;
  // 공통 시간표
  next?: number;
  at?: number;
  // 식판
  mode?: "walk" | "wind" | "slide" | "spin";
  vx?: number;
  vy?: number;
  hit?: boolean;
  // 젓가락
  pinch?: { at: number; x: number; y: number; ang: number };
  // 단무지
  ang?: number;
  spin?: number;
  dartUntil?: number;
  // 젤리
  hopUntil?: number;
  hx?: number;
  hy?: number;
  // 잔반통
  openUntil?: number;
  tickAt?: number;
  // 밥솥
  made?: number;
  // 우두머리
  menu?: number;
  pepperAt?: number;
  trayAt?: number;
  served?: number;
  serveAt?: number;
};

type Puddle = { x: number; y: number; r: number; until: number; spicy: boolean };
type Proj = { kind: "can" | "spoon" | "tray"; img: Phaser.GameObjects.Image; m: ThemeMon; x: number; y: number; vx: number; vy: number; until: number; bounce: number; hit: boolean; t0: number; ox: number; oy: number; tx: number; ty: number; back: boolean; on: boolean };

export class CafeteriaStage implements TowerThemeRuntime {
  private readonly sc: Phaser.Scene;
  private readonly floor: number;
  private readonly visit: number;
  private readonly loop: CfLoop;
  private readonly room: number;
  private readonly boss: boolean;
  private readonly pots: { x: number; y: number }[];
  private readonly lanes: CfLane[];
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly st = new Map<ThemeMon, St>();
  private readonly grid = new MonGrid(24);
  private readonly t0: number;
  private rnd: () => number;
  // 배경
  private steam!: FxPool;
  private sparks!: FxPool;
  private steamAt = 0;
  private flames: Phaser.GameObjects.Image[] = [];
  private belt: { img: Phaser.GameObjects.Image; x: number }[] = [];
  private beltSpan: { x0: number; x1: number; y: number } | null = null;
  private blinkG!: Phaser.GameObjects.Graphics;
  private blinkAt = 0;
  private vendLights: { x: number; y: number; ph: number }[] = [];
  private bunt: Phaser.GameObjects.Graphics | null = null;
  private buntAt = 0;
  private menuText!: Phaser.GameObjects.Text;
  private menuHead!: Phaser.GameObjects.Text;
  private menuFlashUntil = 0;
  private edges: Phaser.GameObjects.Image[] = [];
  // 기믹
  private laneG!: Phaser.GameObjects.Graphics;
  private queue: { lane: CfLane; warnAt: number; at: number; speed: number; len: number } | null = null;
  private queueNext: number;
  private crowd: Phaser.GameObjects.Image[] = [];
  private queueTold = false;
  private spillNext: number;
  private puddles: Puddle[] = [];
  private puddleG!: Phaser.GameObjects.Graphics;
  private burnAt = 0;
  private hotTold = false;
  private boil: { pot: number; until: number } | null = null;
  // 몬스터 연출
  private fxG!: Phaser.GameObjects.Graphics;
  private pull = { x: 0, y: 0 };
  private push = { x: 0, y: 0 };
  private proj: Proj[] = [];
  private projImgs: Phaser.GameObjects.Image[] = [];
  private noteAt = 0;
  private laters: { at: number; fn: () => void }[] = [];
  private bossMenu = 0;
  private servedTotal = 0;

  constructor(
    private readonly host: ThemeHost,
    seed: number,
  ) {
    this.sc = host.scene;
    this.floor = host.floor();
    this.visit = themeVisit(host);
    this.loop = cfLoop(this.visit);
    this.room = host.layout().variant;
    this.boss = this.room === CF_ROOM_NAMES.length - 1;
    this.pots = cfPots(this.room);
    this.lanes = cfLanes(this.room);
    this.t0 = host.now();
    this.queueNext = this.t0 + CF_QUEUE.first;
    this.spillNext = this.t0 + CF_SPILL.first;
    let s = (seed ^ 0x43465354) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    ensureTextures(this.sc);
    this.build();
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private snd(k: Snd): void {
    this.host.synth(`cf-${k}`, SOUNDS[k]);
  }

  private later(at: number, fn: () => void): void {
    this.laters.push({ at, fn });
  }

  /** 글자는 방 전체에서 0.7초에 하나만 (몬스터가 많을 때 쏟아지지 않게) */
  private note(x: number, y: number, text: string, color: string): void {
    const now = this.host.now();
    if (now < this.noteAt) return;
    this.noteAt = now + 700;
    this.host.float(x, y, text, color);
  }

  title(): string {
    const name = CF_ROOM_NAMES[this.room] ?? "";
    const dish = this.boss ? "특식" : `오늘은 ${cfDish(this.floor)}`;
    return this.visit > 0 ? `${name} · ${dish} · ${this.loop.name}` : `${name} · ${dish}`;
  }

  // ── 배경 ──

  private build(): void {
    const sc = this.sc;
    const l = this.host.layout();
    const reduced = this.host.reduced;
    // 메뉴판: 층 번호 + 오늘의 메뉴 (분필 글씨)
    const m = CF_MENU;
    const skey = T.sign(this.floor);
    if (!sc.textures.exists(skey))
      sc.textures.addCanvas(
        skey,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(text.length * 8, 11);
          digits(ctx, text, 0, 0, 0xffd04a, 2);
          return canvas;
        })(),
      );
    this.keep(sc.add.image(m.x + 4, m.y + 7, skey).setOrigin(0, 0).setDepth(D_SIGN));
    const font = '"Galmuri11", "Galmuri9", monospace';
    this.menuHead = this.keep(sc.add.text(m.x + 86, m.y + 3, "오늘의 메뉴", { fontFamily: font, fontSize: "14px", color: "#c8e8c8", resolution: 2 }).setOrigin(0.5, 0).setScale(0.5).setDepth(D_SIGN));
    this.menuText = this.keep(sc.add.text(m.x + 86, m.y + 12, this.boss ? "특식 · 갈비찜" : cfDish(this.floor), { fontFamily: font, fontSize: "18px", color: "#ffffff", resolution: 2 }).setOrigin(0.5, 0).setScale(0.5).setDepth(D_SIGN));

    // 김 (국솥·조리실 화구) · 불꽃 · 국물 방울
    this.steam = new FxPool(sc, T.soft, 44, 9020, false);
    this.sparks = new FxPool(sc, T.drop, 60, D_GLOW);
    for (const p of l.props) {
      if (p.kind === "cf_stove")
        for (let k = 0; k < 3; k++) this.flames.push(this.keep(sc.add.image(p.x - 8 + k * 8, p.y - 15, T.flame(k)).setOrigin(0.5, 1).setDepth(p.y + 0.5).setBlendMode(Phaser.BlendModes.ADD)));
      if (p.kind === "cf_vending") for (let k = 0; k < 2; k++) this.vendLights.push({ x: p.x - 3 + k * 2, y: p.y - 33, ph: this.rnd() * 3000 });
      if (p.kind === "cf_return") {
        this.beltSpan = { x0: p.x - 44, x1: p.x + 44, y: p.y - 9 };
        for (let k = 0; k < 5; k++) {
          const x = p.x - 44 + k * 20;
          this.belt.push({ img: this.keep(sc.add.image(x, p.y - 9, T.mini).setDepth(p.y + 0.5)), x });
        }
      }
    }
    this.blinkG = this.keep(sc.add.graphics().setDepth(D_GLOW).setBlendMode(Phaser.BlendModes.ADD));

    // 야식 시간: 불을 줄인다 (지도 분위기 층에 곱해 넣는다 — overlay.ts), 국솥 위 불빛만 따뜻하게
    if (this.loop.dark > 0) {
      const k = this.loop.dark;
      const c = Phaser.Display.Color.IntegerToColor(0x2a3050);
      const mixc = Phaser.Display.Color.GetColor(255 - (255 - c.red) * k, 255 - (255 - c.green) * k, 255 - (255 - c.blue) * k);
      const own = foldMultiply(sc, mixc, 9000, () => sc.add.rectangle(-200, -200, AW + 400, AH + 400, mixc).setOrigin(0, 0).setDepth(9000).setBlendMode(Phaser.BlendModes.MULTIPLY));
      if (own) this.keep(own);
      for (const p of this.pots) this.keep(sc.add.image(p.x, p.y + 8, T.soft).setDisplaySize(84, 56).setTint(0xffb060).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW));
      for (const v of this.vendLights) this.keep(sc.add.image(v.x, v.y + 10, T.soft).setDisplaySize(40, 50).setTint(0xd8f0ff).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW));
      this.keep(sc.add.image(m.x + m.w / 2, m.y + 12, T.soft).setDisplaySize(150, 40).setTint(0x9affc0).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW));
    }
    // 특식 날·우두머리 층: 천장에 줄 깃발
    if (this.loop.festive || this.boss) this.bunt = this.keep(sc.add.graphics().setDepth(D_BUNT));

    this.laneG = this.keep(sc.add.graphics().setDepth(D_LANE));
    this.puddleG = this.keep(sc.add.graphics().setDepth(D_PUDDLE));
    this.fxG = this.keep(sc.add.graphics().setDepth(D_FX));
    for (let i = 0; i < CROWD; i++) this.crowd.push(this.keep(sc.add.image(-50, -50, T.person((i * 3 + 1) % 4)).setOrigin(0.5, 1).setVisible(false)));
    this.edges = [
      this.keep(sc.add.image(0, 0, T.edgeV).setOrigin(0.5, 0).setDepth(D_VIG).setVisible(false)),
      this.keep(sc.add.image(0, 0, T.edgeV).setOrigin(0.5, 1).setFlipY(true).setDepth(D_VIG).setVisible(false)),
      this.keep(sc.add.image(0, 0, T.edgeH).setOrigin(0, 0.5).setDepth(D_VIG).setVisible(false)),
      this.keep(sc.add.image(0, 0, T.edgeH).setOrigin(1, 0.5).setFlipX(true).setDepth(D_VIG).setVisible(false)),
    ];
    void reduced;
  }

  // ── 몬스터 ──

  private s(m: ThemeMon): St {
    let x = this.st.get(m);
    if (!x) {
      x = { ph: this.rnd() * 1000 };
      this.st.set(m, x);
    }
    return x;
  }

  spawned(m: ThemeMon): void {
    const s = this.s(m);
    if (this.loop.speed !== 1) m.st.speed *= this.loop.speed;
    const now = this.host.now();
    switch (m.id) {
      case "cf_tray":
        s.mode = "walk";
        s.next = now + 1200 + this.rnd() * 900;
        break;
      case "cf_danmuji":
        s.ang = this.rnd() * Math.PI * 2;
        s.spin = this.rnd() < 0.5 ? 1 : -1;
        s.next = now + 1800 + this.rnd() * 1200;
        break;
      case "cf_chopsticks":
      case "cf_ladle":
      case "cf_vending":
      case "cf_spoon":
      case "cf_bin":
        s.next = now + 1400 + this.rnd() * 1400;
        break;
      case "cf_jelly":
      case "cf_jelly_bit":
        s.next = now + this.rnd() * 500;
        break;
      case "cf_rice_cooker":
        s.next = now + 2600;
        s.made = 0;
        break;
      case "cf_nutritionist":
        s.menu = 0;
        s.served = 0;
        break;
    }
  }

  move(m: ThemeMon, dt: number): boolean {
    const s = this.s(m);
    const p = this.host.player();
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const now = this.host.now();
    const H = this.host;
    switch (m.id) {
      case "cf_tray": {
        if (s.mode === "walk") {
          if (d > 14) H.moveMon(m, (dx / d) * m.st.speed * dt, (dy / d) * m.st.speed * dt);
          return true;
        }
        if (s.mode === "slide") {
          const x0 = m.x;
          const y0 = m.y;
          H.moveMon(m, (s.vx ?? 0) * dt, (s.vy ?? 0) * dt);
          const moved = Math.hypot(m.x - x0, m.y - y0);
          // 벽·탁자에 막히면 튕긴다
          if (moved < Math.hypot(s.vx ?? 0, s.vy ?? 0) * dt * 0.3) {
            s.vx = -(s.vx ?? 0) * 0.6;
            s.vy = -(s.vy ?? 0) * 0.6;
            this.snd("clank");
          }
          const k = Math.exp(-dt * 1.5);
          s.vx = (s.vx ?? 0) * k;
          s.vy = (s.vy ?? 0) * k;
          if (Math.hypot(s.vx, s.vy) < 36) {
            s.mode = "spin";
            s.at = now + 650;
          }
          return true;
        }
        return true;
      }
      case "cf_danmuji": {
        if ((s.dartUntil ?? 0) > now) {
          H.moveMon(m, (s.vx ?? 0) * dt, (s.vy ?? 0) * dt);
          return true;
        }
        if (m.windUntil > now) return true;
        // 나를 빙빙 돈다 (반지름 50 안팎)
        s.ang = (s.ang ?? 0) + (s.spin ?? 1) * dt * 1.7;
        const r = 50 + Math.sin(now / 600 + s.ph) * 10;
        const tx = p.x + Math.cos(s.ang) * r;
        const ty = p.y + Math.sin(s.ang) * r * 0.7;
        const ex = tx - m.x;
        const ey = ty - m.y;
        const ed = Math.hypot(ex, ey) || 1;
        const sp = m.st.speed * (ed > 30 ? 1.1 : 0.8);
        H.moveMon(m, (ex / ed) * Math.min(ed, sp * dt), (ey / ed) * Math.min(ed, sp * dt));
        return true;
      }
      case "cf_meal_ticket": {
        // 떼: 나에게 모이되 서로 너무 붙지 않게, 좌우로 팔랑
        let sx = 0;
        let sy = 0;
        this.grid.near(m.x, m.y, 11, (o) => {
          if (o === m) return;
          const ox = m.x - o.x;
          const oy = m.y - o.y;
          const od = Math.hypot(ox, oy) || 1;
          sx += ox / od;
          sy += oy / od;
        });
        const flut = Math.sin(now / 160 + s.ph) * 0.55;
        let vx = dx / d + sx * 0.9 - (dy / d) * flut;
        let vy = dy / d + sy * 0.9 + (dx / d) * flut;
        const vd = Math.hypot(vx, vy) || 1;
        vx /= vd;
        vy /= vd;
        if (d > 7) H.moveMon(m, vx * m.st.speed * dt, vy * m.st.speed * dt);
        return true;
      }
      case "cf_jelly":
      case "cf_jelly_bit": {
        // 통통 뛰어 다가온다 (뛸 때만 움직인다)
        if ((s.hopUntil ?? 0) > now) {
          H.moveMon(m, (s.hx ?? 0) * dt, (s.hy ?? 0) * dt);
          return true;
        }
        if (now >= (s.next ?? 0) && d > 10) {
          const a = Math.atan2(dy, dx) + (this.rnd() - 0.5) * 0.7;
          const sp = m.st.speed * 2.6;
          s.hx = Math.cos(a) * sp;
          s.hy = Math.sin(a) * sp;
          s.hopUntil = now + 260;
          s.at = now;
          s.next = now + 260 + 420 + this.rnd() * 250;
        }
        return true;
      }
      case "cf_chopsticks":
        return !!s.pinch;
      case "cf_ladle":
        return (s.at ?? 0) > now;
      case "cf_vending":
        // 거의 제자리 (너무 붙으면 뒤로)
        if (d < 36) H.moveMon(m, (-dx / d) * m.st.speed * dt, (-dy / d) * m.st.speed * dt);
        return true;
      case "cf_bin":
        if ((s.openUntil ?? 0) > now) return true;
        if (d > 70) H.moveMon(m, (dx / d) * m.st.speed * dt, (dy / d) * m.st.speed * dt);
        return true;
      case "cf_rice_cooker":
        return (s.at ?? 0) > now;
    }
    return false;
  }

  killed(m: ThemeMon): void {
    const s = this.st.get(m);
    this.st.delete(m);
    m.sprite.setRotation(0);
    // 김치통: 터진 자리에 매운 국물
    if (m.id === "cf_kimchi") {
      this.addPuddle(m.x, m.y + 2, 17, 5200, true);
      for (let k = 0; k < 10; k++) {
        const a = this.rnd() * Math.PI * 2;
        this.sparks.emit(m.x, m.y - 6, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 40 - 40, g: 160, ms: 520, tint: k % 3 ? 0xd8302a : 0xff8a3a, s0: 1, s1: 0.5 });
      }
      this.snd("splash");
    }
    if (m.id === "cf_rice_cooker") this.snd("whistle");
    void s;
  }

  playerVelocity(v: { x: number; y: number }): { x: number; y: number } {
    return { x: v.x + this.push.x + this.pull.x, y: v.y + this.push.y + this.pull.y };
  }

  // ── 매 프레임 ──

  update(now: number, dt: number): void {
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.at <= now);
      this.laters = this.laters.filter((l) => l.at > now);
      for (const l of due) l.fn();
    }
    this.grid.fill(this.host.mons());
    this.tickBackground(now, dt);
    this.tickQueue(now, dt);
    this.tickSpill(now);
    this.tickPuddles(now);
    this.fxG.clear();
    this.pull = { x: 0, y: 0 };
    this.tickMonsters(now, dt);
    this.tickProj(now, dt);
    this.steam.update(dt);
    this.sparks.update(dt);
    this.tickScreen(now);
  }

  private tickBackground(now: number, dt: number): void {
    const reduced = this.host.reduced;
    // 국솥 김 (국 없는 날엔 솥이 식는다), 끓어 넘칠 솥은 김이 펑펑
    const cold = this.bossMenu === 2;
    if (now >= this.steamAt && !cold) {
      this.steamAt = now + (reduced ? 260 : 130);
      this.pots.forEach((p, i) => {
        const boiling = this.boil?.pot === i && now < this.boil.until;
        if (!boiling && this.rnd() < 0.3) return;
        this.steam.emit(p.x + (this.rnd() - 0.5) * 14, p.y - 2, {
          vx: (this.rnd() - 0.5) * 8,
          vy: -(14 + this.rnd() * 12) * (boiling ? 1.8 : 1),
          ms: 1500 + this.rnd() * 700,
          tint: boiling ? 0xe8eef4 : 0xd4dce6,
          s0: boiling ? 0.4 : 0.3,
          s1: boiling ? 1.3 : 0.95,
          a: boiling ? 0.75 : 0.5,
        });
        if (boiling && this.rnd() < 0.5) this.sparks.emit(p.x + (this.rnd() - 0.5) * 18, p.y, { vx: (this.rnd() - 0.5) * 40, vy: -40 - this.rnd() * 40, g: 200, ms: 420, tint: 0xd88a3a, s0: 0.8 });
      });
    }
    for (const [k, f] of this.flames.entries()) f.setTexture(T.flame((Math.floor(now / 90) + k) % 3)).setAlpha(reduced ? 0.8 : 0.65 + 0.35 * Math.sin(now / 70 + k));
    // 퇴식 컨베이어: 반납한 식판이 왼쪽으로 흘러 창 안으로
    if (this.beltSpan)
      for (const b of this.belt) {
        b.x -= 16 * dt;
        if (b.x < this.beltSpan.x0) b.x = this.beltSpan.x1;
        b.img.setX(Math.round(b.x)).setAlpha(Math.min(1, (b.x - this.beltSpan.x0) / 12, (this.beltSpan.x1 - b.x) / 12));
      }
    if (now >= this.blinkAt) {
      this.blinkAt = now + 200;
      const g = this.blinkG.clear();
      for (const v of this.vendLights) {
        const on = reduced || ((now + v.ph) % 1400) / 1400 < 0.6;
        if (on) g.fillStyle(0x6aff8a, 0.9).fillRect(v.x, v.y, 1, 1);
      }
    }
    // 줄 깃발 (흔들흔들)
    if (this.bunt && now >= this.buntAt) {
      this.buntAt = now + 120;
      const g = this.bunt.clear();
      const cols = [0xd8302a, 0xf0c040, 0x3a9a5a, 0x2a6ad8, 0xf2f2ee];
      for (const [y0, sag] of [
        [TOP + 3, 9],
        [TOP + 14, 6],
      ] as const) {
        const sway = reduced ? 0 : Math.sin(now / 700 + y0) * 1.5;
        g.lineStyle(1, 0x5a4a3a, 0.9);
        g.beginPath();
        for (let x = SIDE; x <= AW - SIDE; x += 8) {
          const t = (x - SIDE) / (AW - SIDE * 2);
          const y = y0 + Math.sin(t * Math.PI * 3) ** 2 * sag + sway;
          if (x === SIDE) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
        for (let x = SIDE + 4, k = 0; x < AW - SIDE; x += 12, k++) {
          const t = (x - SIDE) / (AW - SIDE * 2);
          const y = y0 + Math.sin(t * Math.PI * 3) ** 2 * sag + sway;
          g.fillStyle(cols[k % cols.length], 0.95).fillTriangle(x - 3, y, x + 3, y, x + Math.sin(now / 300 + k) * (reduced ? 0 : 1), y + 6);
        }
      }
    }
    // 메뉴판 번쩍 (영양사가 메뉴를 바꿀 때)
    const fl = this.menuFlashUntil > now && Math.floor(now / 120) % 2 === 0;
    this.menuText.setColor(fl ? "#ffd04a" : "#ffffff");
  }

  // ── 점심시간 줄서기 ──

  private tickQueue(now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    this.push = { x: 0, y: 0 };
    const g = this.laneG.clear();
    if (!this.lanes.length) return;
    if (H.calm() && !this.queue) this.queueNext = Math.max(this.queueNext, now + 1500);
    if (!this.queue && now >= this.queueNext) {
      // 내가 있는 쪽 줄부터
      const lane = this.lanes.reduce((b, l) => (Math.abs((l.hor ? p.y : p.x) - l.at) < Math.abs((b.hor ? p.y : p.x) - b.at) ? l : b));
      const len = CROWD * CROWD_GAP;
      const span = lane.to - lane.from;
      this.queue = { lane, warnAt: now, at: now + CF_QUEUE.warn, speed: ((span + len) / CF_QUEUE.dur) * 1000, len };
      const arrow = lane.hor ? (lane.dir > 0 ? "→" : "←") : lane.dir > 0 ? "↓" : "↑";
      H.flash(this.queueTold ? `점심시간! 줄이 밀려와요 ${arrow}` : `점심시간! 노란 줄 안에 있으면 사람들한테 떠밀려요 ${arrow}`, 1700);
      this.queueTold = true;
      this.snd("chime");
    }
    const q = this.queue;
    if (!q) return;
    const L = q.lane;
    const half = CF_QUEUE.width / 2;
    const span = L.to - L.from;
    if (now < q.at) {
      // 경고: 줄이 노랗게 깜빡이고 화살표가 흐른다
      const blink = this.host.reduced ? 0.3 : 0.2 + 0.18 * (0.5 + 0.5 * Math.sin(now / 90));
      if (L.hor) g.fillStyle(0xffd040, blink).fillRect(L.from, L.at - half, span, half * 2);
      else g.fillStyle(0xffd040, blink).fillRect(L.at - half, L.from, half * 2, span);
      const off = ((now - q.warnAt) / 8) % 28;
      for (let k = 0; k < span / 28; k++) {
        const u = L.dir > 0 ? k * 28 + off : span - k * 28 - off;
        if (u < 4 || u > span - 4) continue;
        const cx = L.hor ? L.from + u : L.at;
        const cy = L.hor ? L.at : L.from + u;
        g.lineStyle(2, 0xfff0a0, 0.9);
        if (L.hor) g.lineBetween(cx - 3 * L.dir, cy - 5, cx + 2 * L.dir, cy).lineBetween(cx + 2 * L.dir, cy, cx - 3 * L.dir, cy + 5);
        else g.lineBetween(cx - 5, cy - 3 * L.dir, cx, cy + 2 * L.dir).lineBetween(cx, cy + 2 * L.dir, cx + 5, cy - 3 * L.dir);
      }
      return;
    }
    // 행렬: 앞사람 자리 (선의 시작 끝에서 들어와 반대 끝으로 나간다)
    const front = (now - q.at) * (q.speed / 1000);
    if (front - q.len > span + 10) {
      this.queue = null;
      for (const c of this.crowd) c.setVisible(false);
      this.queueNext = now + CF_QUEUE.every[this.boss ? 1 : 0] * this.loop.queue * (0.85 + this.rnd() * 0.3);
      return;
    }
    const at = (u: number) => (L.dir > 0 ? L.from + u : L.to - u);
    const head = Math.min(span, front);
    const tail = Math.max(0, front - q.len);
    if (L.hor) g.fillStyle(0xffd040, 0.12).fillRect(Math.min(at(head), at(tail)), L.at - half, Math.abs(head - tail), half * 2);
    else g.fillStyle(0xffd040, 0.12).fillRect(L.at - half, Math.min(at(head), at(tail)), half * 2, Math.abs(head - tail));
    this.crowd.forEach((c, k) => {
      const u = front - k * CROWD_GAP;
      const vis = u >= 0 && u <= span;
      c.setVisible(vis);
      if (!vis) return;
      const bob = this.host.reduced ? 0 : Math.abs(Math.sin(now / 110 + k)) * 1.5;
      const side = (k % 2 ? 4 : -3) + (L.hor ? 0 : 0);
      const x = L.hor ? at(u) : L.at + side;
      const y = L.hor ? L.at + 8 + side * 0.5 : at(u);
      c.setPosition(Math.round(x), Math.round(y - bob)).setDepth(y).setFlipX(L.hor ? L.dir < 0 : false);
    });
    // 미는 힘: 행렬이 지나는 칸 안 (앞사람보다 조금 앞까지)
    const inBand = (x: number, y: number) => {
      const across = L.hor ? Math.abs(y - L.at) : Math.abs(x - L.at);
      if (across > half) return false;
      const along = L.hor ? x : y;
      const lo = Math.min(at(head + 8), at(tail));
      const hi = Math.max(at(head + 8), at(tail));
      return along >= lo && along <= hi;
    };
    if (inBand(p.x, p.y) && !H.calm()) {
      const f = CF_QUEUE.push * (this.boss && this.bossMenu === 3 ? 1.2 : 1);
      this.push = L.hor ? { x: f * L.dir, y: 0 } : { x: 0, y: f * L.dir };
      if (this.rnd() < dt * 4) this.note(p.x, p.y - 30, "밀려요!", "#ffe08a");
    }
    for (const m of H.mons()) {
      if (!m.alive || m.boss || m.hidden || !inBand(m.x, m.y)) continue;
      H.moveMon(m, L.hor ? CF_QUEUE.push * L.dir * dt : 0, L.hor ? 0 : CF_QUEUE.push * L.dir * dt);
    }
  }

  // ── 뜨거운 국물 ──

  private spillEvery(): number {
    const base = CF_SPILL.every[this.boss ? 1 : 0] * this.loop.spill;
    return this.bossMenu === 3 ? base * 0.7 : base;
  }

  private tickSpill(now: number): void {
    const H = this.host;
    if (!this.pots.length) return;
    if (H.calm()) {
      this.spillNext = Math.max(this.spillNext, now + 1200);
      return;
    }
    if (this.bossMenu === 2) {
      // 국 없는 날: 솥이 식어 넘치지 않는다
      this.spillNext = Math.max(this.spillNext, now + 600);
      return;
    }
    if (now < this.spillNext) return;
    this.spillNext = now + this.spillEvery() * (0.85 + this.rnd() * 0.3);
    const p = H.player();
    // 가까운 솥이 넘칠 때가 많다
    const order = this.pots.map((q, i) => ({ i, d: Math.hypot(q.x - p.x, q.y - p.y) })).sort((a, b) => a.d - b.d);
    const pick = this.rnd() < 0.65 ? order[0].i : order[Math.floor(this.rnd() * order.length)].i;
    const pot = this.pots[pick];
    this.boil = { pot: pick, until: now + CF_SPILL.warn };
    this.snd("bubble");
    const spicy = this.bossMenu === 1;
    const n = this.boss ? 3 : 1 + Math.floor(this.rnd() * 2);
    for (let k = 0; k < n; k++) {
      // 솥 앞(아래쪽) 부채꼴 안, 매운 날엔 하나는 내 발밑으로
      const band = cfSpillBand(pot);
      let x = pot.x + (this.rnd() - 0.5) * 110;
      let y = band.y0 + this.rnd() * (band.y1 - band.y0);
      if ((spicy && k === 0) || (k === 0 && Math.hypot(p.x - pot.x, p.y - pot.y) < 130)) {
        x = p.x;
        y = p.y;
      }
      const at = H.place(Phaser.Math.Clamp(x, SIDE + 18, AW - SIDE - 18), Phaser.Math.Clamp(y, TOP + 30, AH - SIDE - 12), 4);
      const r = CF_SPILL.r * (spicy ? 1.15 : 1);
      // 마지막 0.25초에 솥에서 국물이 날아간다
      this.later(now + CF_SPILL.warn - 260, () => {
        for (let j = 0; j < 6; j++) {
          const tx = at.x + (this.rnd() - 0.5) * r;
          const ty = at.y + (this.rnd() - 0.5) * r * 0.6;
          const t = 0.26;
          this.sparks.emit(pot.x, pot.y, { vx: (tx - pot.x) / t, vy: (ty - pot.y) / t - 160 * t * 0.5, g: 160, ms: 260, tint: spicy ? 0xd8302a : 0xe0903a, s0: 1.2, s1: 0.8 });
        }
      });
      H.tele.add(
        { kind: "circle", r },
        at.x,
        at.y,
        0,
        now,
        CF_SPILL.warn,
        () => {
          const pp = H.player();
          if (Math.hypot(pp.x - at.x, (pp.y - at.y) / 0.8) <= r + 3) {
            H.hurtPct(0.06 * (spicy ? 1.4 : 1));
            this.note(pp.x, pp.y - 32, spicy ? "앗 매워!" : "앗 뜨거!", "#ff9a5a");
          }
          this.addPuddle(at.x, at.y, r * 0.85, CF_SPILL.burn, spicy);
          this.snd("splash");
        },
        spicy ? 0xff3a2a : 0xff8a2a,
      );
    }
  }

  private addPuddle(x: number, y: number, r: number, ms: number, spicy: boolean): void {
    this.puddles.push({ x, y, r, until: this.host.now() + ms, spicy });
    while (this.puddles.length > CF_PUDDLE_CAP) this.puddles.shift();
  }

  private inPuddle(x: number, y: number): Puddle | null {
    for (const q of this.puddles) if (((x - q.x) / q.r) ** 2 + ((y - q.y) / (q.r * 0.6)) ** 2 <= 1) return q;
    return null;
  }

  private tickPuddles(now: number): void {
    const H = this.host;
    this.puddles = this.puddles.filter((q) => q.until > now);
    const g = this.puddleG.clear();
    for (const q of this.puddles) {
      const fade = Math.min(1, (q.until - now) / 900);
      const pulse = this.host.reduced ? 1 : 0.9 + 0.1 * Math.sin(now / 160 + q.x);
      g.fillStyle(q.spicy ? 0x7a1a12 : 0x8a4a1a, 0.55 * fade).fillEllipse(q.x, q.y + 1, q.r * 2 + 2, q.r * 1.2 + 2);
      g.fillStyle(q.spicy ? 0xd8281e : 0xe0782a, 0.8 * fade * pulse).fillEllipse(q.x, q.y, q.r * 2, q.r * 1.2);
      g.fillStyle(q.spicy ? 0xff6a3a : 0xffb050, 0.75 * fade).fillEllipse(q.x - q.r * 0.25, q.y - q.r * 0.12, q.r * 1.1, q.r * 0.5);
      g.fillStyle(0xfff0c0, 0.6 * fade).fillEllipse(q.x - q.r * 0.4, q.y - q.r * 0.2, q.r * 0.35, q.r * 0.15);
      // 기름 방울 (국물 위 동동)
      for (let k = 0; k < 4; k++) g.fillStyle(q.spicy ? 0xffa040 : 0xffe08a, 0.8 * fade).fillCircle(q.x + Math.cos(k * 1.9 + q.x) * q.r * 0.55, q.y + Math.sin(k * 2.3 + q.y) * q.r * 0.3, 1);
      // 끓는 거품
      for (let k = 0; k < 3; k++) {
        const t = ((now / 500 + k * 0.37 + q.x * 0.01) % 1 + 1) % 1;
        const bx = q.x + Math.cos(k * 2.1 + q.y) * q.r * 0.5;
        const by = q.y + Math.sin(k * 1.7 + q.x) * q.r * 0.3;
        g.lineStyle(1, 0xfff0c0, (1 - t) * 0.8 * fade).strokeCircle(bx, by, 0.5 + t * 2);
      }
      if (q.spicy && this.rnd() < 0.05) this.sparks.emit(q.x + (this.rnd() - 0.5) * q.r, q.y, { vy: -18, ms: 600, tint: 0xff3a2a, s0: 0.7 });
      if (this.rnd() < 0.03) this.steam.emit(q.x + (this.rnd() - 0.5) * q.r, q.y - 2, { vy: -14, ms: 900, tint: 0xffffff, s0: 0.2, s1: 0.5, a: 0.2 });
    }
    // 웅덩이 위면 계속 다친다
    const p = H.player();
    const q = this.inPuddle(p.x, p.y);
    if (q && !H.calm() && now >= this.burnAt) {
      this.burnAt = now + CF_SPILL.tick;
      const spicyBoss = this.bossMenu === 1 ? 1.5 : 1;
      H.hurtPct(CF_SPILL.pct * spicyBoss * (q.spicy ? 1.2 : 1));
      if (!this.hotTold) {
        this.hotTold = true;
        H.flash("뜨거운 국물 웅덩이! 밟고 서 있으면 계속 따가워요", 1400);
      }
    }
  }

  // ── 몬스터 행동 ──

  private hit(m: ThemeMon, mult: number, pct: number): void {
    if (m.alive) this.host.strike(m, mult);
    else this.host.hurtPct(pct);
  }

  private tickMonsters(now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    const fx = this.fxG;
    for (const m of H.mons()) {
      if (!m.alive) continue;
      const s = this.s(m);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      switch (m.id) {
        case "cf_tray":
          if (s.mode === "walk" && now >= (s.next ?? 0) && d < 150 && d > 26 && !m.hidden) {
            s.mode = "wind";
            s.at = now + 450;
            m.windUntil = s.at;
            const a = Math.atan2(p.y - m.y, p.x - m.x);
            s.vx = Math.cos(a);
            s.vy = Math.sin(a);
            H.tele.add({ kind: "line", len: 120, width: 14 }, m.x, m.y - 2, a, now, 450, undefined, 0xc8d8e8);
          } else if (s.mode === "wind" && now >= (s.at ?? 0)) {
            s.mode = "slide";
            s.vx = (s.vx ?? 0) * 260;
            s.vy = (s.vy ?? 0) * 260;
            s.hit = false;
            this.snd("clank");
          } else if (s.mode === "slide") {
            if (!s.hit && d < 11) {
              s.hit = true;
              H.strike(m, 1.1);
            }
            if (this.rnd() < dt * 20) this.sparks.emit(m.x - (s.vx ?? 0) * 0.02, m.y - 1, { ms: 260, tint: 0xd8e8f0, s0: 0.8, s1: 0.2 });
          } else if (s.mode === "spin") {
            m.sprite.setRotation(m.sprite.rotation + dt * 16);
            if (now >= (s.at ?? 0)) {
              m.sprite.setRotation(0);
              s.mode = "walk";
              s.next = now + 1900 + this.rnd() * 800;
            }
          }
          break;
        case "cf_chopsticks":
          this.tickChop(m, s, now, d);
          break;
        case "cf_danmuji":
          if ((s.dartUntil ?? 0) > now) {
            if (!s.hit && d < 9) {
              s.hit = true;
              H.strike(m, 1);
            }
            m.sprite.setRotation(m.sprite.rotation + dt * 20 * (s.spin ?? 1));
          } else if (m.windUntil <= now && now >= (s.next ?? 0) && d < 90 && !m.hidden) {
            // 휙 파고들기 (0.3초 노려본 뒤)
            m.windUntil = now + 320;
            s.next = now + 2400 + this.rnd() * 900;
            this.later(now + 320, () => {
              if (!m.alive) return;
              const q = H.player();
              const a = Math.atan2(q.y - m.y, q.x - m.x);
              s.vx = Math.cos(a) * m.st.speed * 3.4;
              s.vy = Math.sin(a) * m.st.speed * 3.4;
              s.dartUntil = H.now() + 360;
              s.hit = false;
            });
          } else if (m.sprite.rotation !== 0) m.sprite.setRotation(0);
          break;
        case "cf_ladle":
          if ((s.at ?? 0) > now) {
            // 크게 휘두르기 직전: 국자가 빙글
            fx.lineStyle(2, 0xd88a3a, 0.5).beginPath().arc(m.x, m.y - 6, 30, now / 80, now / 80 + 1.4).strokePath();
          } else if (now >= (s.next ?? 0) && d < 44 && !m.hidden) {
            s.at = now + 700;
            s.next = now + 3800 + this.rnd() * 800;
            m.windUntil = s.at;
            const x = m.x;
            const y = m.y;
            H.tele.add({ kind: "circle", r: 36 }, x, y, 0, now, 700, () => {
              if (!m.alive) return;
              const q = H.player();
              if (Math.hypot(q.x - m.x, q.y - m.y) <= 38) H.strike(m, 1.25);
              this.snd("splash");
              // 휘두른 자리에 국물이 흩뿌려진다
              for (let k = 0; k < 2; k++) {
                const a = this.rnd() * Math.PI * 2;
                const at = H.place(m.x + Math.cos(a) * 30, m.y + Math.sin(a) * 20, 4);
                this.addPuddle(at.x, at.y, 10, 2800, false);
              }
              for (let k = 0; k < 12; k++) {
                const a = (k / 12) * Math.PI * 2;
                this.sparks.emit(m.x + Math.cos(a) * 20, m.y - 4 + Math.sin(a) * 12, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 40 - 30, g: 140, ms: 420, tint: 0xe0903a });
              }
            });
            this.note(m.x, m.y - 26, "후루룩!", "#ffb060");
          }
          break;
        case "cf_vending":
          if (now >= (s.next ?? 0) && d < 220 && !m.hidden) {
            s.next = now + 3000 + this.rnd() * 900;
            m.windUntil = now + 500;
            this.later(now + 500, () => {
              if (!m.alive) return;
              const q = H.player();
              const a = Math.atan2(q.y - m.y, q.x - m.x) + (this.rnd() - 0.5) * 0.25;
              this.fire("can", m, m.x, m.y - 3, Math.cos(a) * 118, Math.sin(a) * 118, 3600);
              this.snd("can");
            });
          }
          break;
        case "cf_bin":
          this.tickBin(m, s, now, dt, d);
          break;
        case "cf_spoon":
          if (now >= (s.next ?? 0) && d < 170 && !m.hidden) {
            s.next = now + 3300 + this.rnd() * 900;
            m.windUntil = now + 420;
            this.later(now + 420, () => {
              if (!m.alive) return;
              const q = H.player();
              const a = Math.atan2(q.y - m.y, q.x - m.x);
              const far = Math.min(150, Math.hypot(q.x - m.x, q.y - m.y) + 40);
              const pr = this.fire("spoon", m, m.x, m.y - 6, 0, 0, 2600);
              if (pr) {
                pr.tx = m.x + Math.cos(a) * far;
                pr.ty = m.y - 6 + Math.sin(a) * far;
              }
            });
          }
          break;
        case "cf_jelly":
        case "cf_jelly_bit": {
          // 뛰는 동안 몸이 떠오른다 (그림만)
          if ((s.hopUntil ?? 0) > now) {
            const t = (now - (s.at ?? now)) / 260;
            m.sprite.setY(Math.round(m.y - Math.sin(t * Math.PI) * (m.id === "cf_jelly" ? 6 : 4)));
          }
          break;
        }
        case "cf_rice_cooker":
          this.tickRice(m, s, now);
          break;
        case "cf_nutritionist":
          this.tickBoss(m, s, now);
          break;
      }
    }
  }

  /** 젓가락: 나를 사이에 두고 두 줄 → 0.85초 뒤 가운데로 집는다 (줄 밖으로 빠져나갈 것) */
  private tickChop(m: ThemeMon, s: St, now: number, d: number): void {
    const H = this.host;
    const pc = s.pinch;
    if (pc) {
      const k = Phaser.Math.Clamp(1 - (pc.at - now) / 850, 0, 1);
      const gap = 22 * (1 - k * k);
      const nx = -Math.sin(pc.ang);
      const ny = Math.cos(pc.ang);
      const ax = Math.cos(pc.ang) * 36;
      const ay = Math.sin(pc.ang) * 36;
      for (const sgn of [1, -1]) {
        const ox = pc.x + nx * gap * sgn;
        const oy = pc.y - 6 + ny * gap * sgn;
        this.fxG.lineStyle(3, 0x6a4a22, 0.55).lineBetween(ox - ax, oy - ay + 1, ox + ax, oy + ay + 1);
        this.fxG.lineStyle(2, 0xd8b070, 0.95).lineBetween(ox - ax, oy - ay, ox + ax, oy + ay);
        this.fxG.fillStyle(0xd03a30, 1).fillRect(ox - ax - 1, oy - ay - 1, 3, 3);
      }
      if (now >= pc.at) {
        s.pinch = undefined;
        s.next = now + 3200 + this.rnd() * 700;
        this.snd("pinch");
        const p = H.player();
        const rx = p.x - pc.x;
        const ry = p.y - pc.y;
        const along = rx * Math.cos(pc.ang) + ry * Math.sin(pc.ang);
        const across = Math.abs(rx * nx + ry * ny);
        if (m.alive && across <= 20 && Math.abs(along) <= 40) {
          H.strike(m, 1.3);
          this.note(p.x, p.y - 32, "집혔다!", "#ffd080");
        }
      }
      return;
    }
    if (now >= (s.next ?? 0) && d < 72 && !m.hidden && m.windUntil <= now) {
      const p = H.player();
      const ang = Math.atan2(p.y - m.y, p.x - m.x);
      s.pinch = { at: now + 850, x: p.x, y: p.y, ang };
      m.windUntil = now + 850;
      H.tele.add({ kind: "line", len: 80, width: 40 }, p.x - Math.cos(ang) * 40, p.y - Math.sin(ang) * 40, ang, now, 850, undefined, 0xffc070);
    }
  }

  /** 잔반통: 뚜껑이 열린 2초 동안 나를 빨아들인다 (가까울수록 세게), 입에 닿으면 아프다 */
  private tickBin(m: ThemeMon, s: St, now: number, dt: number, d: number): void {
    const H = this.host;
    const p = H.player();
    if ((s.openUntil ?? 0) > now) {
      m.windUntil = now + 100;
      const R = 120;
      if (d < R && d > 4) {
        const f = (1 - d / R) * 92 + 14;
        this.pull.x += ((m.x - p.x) / d) * f;
        this.pull.y += ((m.y - p.y) / d) * f;
      }
      // 빨려 드는 줄 (나선)
      const g = this.fxG;
      for (let k = 0; k < 5; k++) {
        const t = ((now / 700 + k / 5) % 1 + 1) % 1;
        const rr = (1 - t) * 60 + 6;
        const a = k * 1.25 + t * 4;
        g.fillStyle(0xb0a070, 0.75 * t).fillRect(m.x + Math.cos(a) * rr - 1, m.y - 8 + Math.sin(a) * rr * 0.6 - 1, 2, 2);
      }
      g.lineStyle(1, 0x7a8a5a, 0.4).strokeEllipse(m.x, m.y - 4, R * 2 * 0.5, R * 1.2 * 0.5);
      // 다른 몬스터·떨어진 국물 방울도 끌려온다
      this.grid.near(m.x, m.y, 70, (o) => {
        if (o === m || o.boss || o.id === "cf_bin") return;
        const od = Math.hypot(m.x - o.x, m.y - o.y) || 1;
        if (od > 16) H.moveMon(o, ((m.x - o.x) / od) * 30 * dt, ((m.y - o.y) / od) * 30 * dt);
      });
      if (d < 15 && now >= (s.tickAt ?? 0)) {
        s.tickAt = now + 600;
        H.strike(m, 0.7);
      }
      return;
    }
    if (now >= (s.next ?? 0) && d < 110 && !m.hidden) {
      s.openUntil = now + 2000;
      s.next = now + 5200 + this.rnd() * 900;
      this.snd("suck");
      this.note(m.x, m.y - 26, "후루루룹", "#c8d890");
    }
  }

  /** 압력밥솥: 칙칙 김이 차오르다(1.2초) 증기 고리 → 주먹밥 둘을 튀겨 낸다 (한 마리당 cfRiceAdds까지) */
  private tickRice(m: ThemeMon, s: St, now: number): void {
    const H = this.host;
    if ((s.at ?? 0) > now) {
      const k = 1 - ((s.at ?? now) - now) / 1200;
      if (this.rnd() < 0.5) this.steam.emit(m.x + 4, m.y - 22, { vx: (this.rnd() - 0.5) * 20, vy: -30 - k * 40, ms: 700, tint: 0xffffff, s0: 0.2, s1: 0.7, a: 0.55 });
      this.fxG.fillStyle(0xd03030, 0.9).fillRect(m.x - 8, m.y - 30, 16 * k, 2).lineStyle(1, 0xf2f2ee, 0.8).strokeRect(m.x - 8.5, m.y - 30.5, 17, 3);
      return;
    }
    if (now < (s.next ?? 0) || m.hidden) return;
    s.at = now + 1200;
    s.next = now + 6400;
    m.windUntil = s.at;
    this.snd("whistle");
    this.note(m.x, m.y - 30, "칙칙칙…", "#f2f2ee");
    H.tele.add({ kind: "circle", r: 50 }, m.x, m.y, 0, now, 1200, () => {
      if (!m.alive) return;
      const p = H.player();
      if (Math.hypot(p.x - m.x, p.y - m.y) <= 52) H.strike(m, 1.2);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        this.steam.emit(m.x + Math.cos(a) * 10, m.y - 6 + Math.sin(a) * 6, { vx: Math.cos(a) * 110, vy: Math.sin(a) * 70, ms: 600, tint: 0xffffff, s0: 0.3, s1: 1, a: 0.6 });
      }
      H.shake(120, 0.003);
      const cap = cfRiceAdds(this.visit);
      for (let k = 0; k < 2 && (s.made ?? 0) < cap; k++) {
        const a = this.rnd() * Math.PI * 2;
        const at = H.place(m.x + Math.cos(a) * 18, m.y + Math.sin(a) * 12, 5);
        if (H.spawn("cf_riceball", at.x, at.y, m.wave, true)) s.made = (s.made ?? 0) + 1;
      }
    }, 0xf2f2ee);
  }

  /** 영양사: 체력에 따라 오늘의 메뉴가 바뀐다 — 매운 날(고춧가루 비·더 뜨거운 국물) → 국 없는 날(솥이 식고 식판이 날아온다) → 특식(배식 도우미 + 다시 끓는 솥) */
  private tickBoss(m: ThemeMon, s: St, now: number): void {
    const H = this.host;
    const p = H.player();
    const ratio = m.hp / m.st.maxHp;
    const menu = ratio <= CF_BOSS_SPECIAL ? 3 : ratio <= CF_BOSS_NOSOUP ? 2 : ratio <= CF_BOSS_SPICY ? 1 : 0;
    if (menu !== this.bossMenu) {
      this.bossMenu = menu;
      this.menuHead.setText("메뉴 변경");
      this.menuText.setText(CF_MENUS[menu]);
      this.menuFlashUntil = now + 2400;
      this.snd("menu");
      if (menu === 1) s.pepperAt = now + 1200;
      if (menu === 2) s.trayAt = now + 1000;
      if (menu === 3) {
        s.serveAt = now + 600;
        this.spillNext = Math.min(this.spillNext, now + 1500);
        for (let k = 0; k < 40; k++)
          this.sparks.emit(AW / 2 + (this.rnd() - 0.5) * 300, TOP + 10, { vx: (this.rnd() - 0.5) * 60, vy: 20 + this.rnd() * 60, g: 30, ms: 2200, tint: [0xd8302a, 0xf0c040, 0x3a9a5a, 0x2a6ad8][k % 4], tex: T.px, s0: 1, s1: 1 });
      }
    }
    // 매운 날: 고춧가루가 내 둘레로 쏟아진다 (작은 매운 웅덩이)
    if (menu === 1 && now >= (s.pepperAt ?? 0)) {
      s.pepperAt = now + 3200;
      for (let k = 0; k < 4; k++) {
        const a = this.rnd() * Math.PI * 2;
        const r = k === 0 ? 0 : 26 + this.rnd() * 40;
        const at = H.place(Phaser.Math.Clamp(p.x + Math.cos(a) * r, SIDE + 14, AW - SIDE - 14), Phaser.Math.Clamp(p.y + Math.sin(a) * r * 0.7, TOP + 20, AH - SIDE - 8), 4);
        H.tele.add({ kind: "circle", r: 14 }, at.x, at.y, 0, now, 950, () => {
          const q = H.player();
          if (m.alive && Math.hypot(q.x - at.x, q.y - at.y) <= 15) H.strike(m, 0.6);
          this.addPuddle(at.x, at.y, 11, 3400, true);
          for (let j = 0; j < 5; j++) this.sparks.emit(at.x + (this.rnd() - 0.5) * 16, at.y - 4, { vx: (this.rnd() - 0.5) * 40, vy: -30 - this.rnd() * 30, g: 150, ms: 400, tint: 0xd8302a });
        }, 0xff3a2a);
      }
    }
    // 국 없는 날: 빈 식판을 부채꼴로 던진다 (특식 때도 가끔)
    if ((menu === 2 || menu === 3) && now >= (s.trayAt ?? 0) && !m.hidden) {
      s.trayAt = now + (menu === 2 ? 2400 : 3800);
      m.windUntil = now + 400;
      this.later(now + 400, () => {
        if (!m.alive) return;
        const q = H.player();
        const a = Math.atan2(q.y - m.y, q.x - m.x);
        for (let k = -1; k <= 1; k++) this.fire("tray", m, m.x, m.y - 18, Math.cos(a + k * 0.32) * 175, Math.sin(a + k * 0.32) * 175, 2600);
        this.snd("clank");
      });
    }
    // 특식: 배식대 쪽에서 배식 도우미가 줄지어 (층마다 CF_SPECIAL_SERVERS까지)
    if (menu === 3 && s.serveAt !== undefined && now >= s.serveAt && this.servedTotal < CF_SPECIAL_SERVERS) {
      s.serveAt = this.servedTotal + 2 < CF_SPECIAL_SERVERS ? now + 6000 : undefined;
      for (let k = 0; k < 2 && this.servedTotal < CF_SPECIAL_SERVERS; k++) {
        const pot = this.pots[(this.servedTotal + k) % Math.max(1, this.pots.length)] ?? { x: AW / 2, y: TOP + 20 };
        const at = H.place(pot.x, pot.y + 58, 7);
        if (H.spawn("cf_server", at.x, at.y, m.wave, true)) {
          this.servedTotal++;
          H.float(at.x, at.y - 20, "배식 왔어요!", "#9affb0");
        }
      }
    }
  }

  // ── 직접 띄우는 탄 (굴러오는 캔 · 부메랑 숟가락 · 날아오는 식판) ──

  private fire(kind: Proj["kind"], m: ThemeMon, x: number, y: number, vx: number, vy: number, ms: number): Proj | null {
    const now = this.host.now();
    let pr = this.proj.find((q) => !q.on);
    if (!pr) {
      if (this.proj.length >= PROJ_CAP) return null;
      const img = this.sc.add.image(x, y, T.can).setDepth(1e4);
      this.projImgs.push(img);
      pr = { kind, img, m, x, y, vx, vy, until: 0, bounce: 0, hit: false, t0: now, ox: x, oy: y, tx: x, ty: y, back: false, on: true };
      this.proj.push(pr);
    }
    Object.assign(pr, { kind, m, x, y, vx, vy, until: now + ms, bounce: 0, hit: false, t0: now, ox: x, oy: y, tx: x, ty: y, back: false, on: true });
    pr.img.setTexture(kind === "can" ? T.can : kind === "spoon" ? T.spoon : T.tray).setPosition(x, y).setVisible(true).setRotation(0);
    return pr;
  }

  private tickProj(now: number, dt: number): void {
    const p = this.host.player();
    for (const pr of this.proj) {
      if (!pr.on) continue;
      if (now >= pr.until) {
        pr.on = false;
        pr.img.setVisible(false);
        continue;
      }
      if (pr.kind === "spoon") {
        // 휘어 나갔다가 (0.6초) 던진 숟가락에게 돌아온다 (0.6초)
        const t = (now - pr.t0) / 600;
        if (t >= 1 && !pr.back) {
          pr.back = true;
          pr.hit = false;
        }
        const back = pr.back;
        const u = back ? Math.min(1, t - 1) : t;
        const ex = back ? (pr.m.alive ? pr.m.x : pr.ox) : pr.tx;
        const ey = back ? (pr.m.alive ? pr.m.y - 6 : pr.oy) : pr.ty;
        const sx = back ? pr.tx : pr.ox;
        const sy = back ? pr.ty : pr.oy;
        const dx = ex - sx;
        const dy = ey - sy;
        const L = Math.hypot(dx, dy) || 1;
        const bend = Math.sin(u * Math.PI) * 34 * (back ? -1 : 1);
        pr.x = sx + dx * u + (-dy / L) * bend;
        pr.y = sy + dy * u + (dx / L) * bend;
        pr.img.setRotation(now / 50);
        if (back && u >= 1) {
          pr.on = false;
          pr.img.setVisible(false);
          continue;
        }
      } else {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.kind === "can") {
          // 데굴데굴 굴러 벽에 튕긴다 (두 번까지)
          if (pr.x < SIDE + 4 || pr.x > AW - SIDE - 4) {
            pr.vx = -pr.vx;
            pr.x = Phaser.Math.Clamp(pr.x, SIDE + 4, AW - SIDE - 4);
            pr.bounce++;
            this.snd("can");
          }
          if (pr.y < TOP + 6 || pr.y > AH - SIDE - 2) {
            pr.vy = -pr.vy;
            pr.y = Phaser.Math.Clamp(pr.y, TOP + 6, AH - SIDE - 2);
            pr.bounce++;
            this.snd("can");
          }
          if (pr.bounce > 2) pr.until = now;
          pr.img.setRotation(pr.img.rotation + dt * 10 * Math.sign(pr.vx || 1));
        } else pr.img.setRotation(now / 40);
        if (pr.x < 0 || pr.x > AW || pr.y < 0 || pr.y > AH) pr.until = now;
      }
      pr.img.setPosition(Math.round(pr.x), Math.round(pr.y)).setDepth(pr.y + 6);
      const r = pr.kind === "tray" ? 9 : 7;
      if (!pr.hit && Math.hypot(p.x - pr.x, p.y - 6 - pr.y) < r) {
        pr.hit = true;
        this.hit(pr.m, pr.kind === "can" ? 0.8 : pr.kind === "spoon" ? 0.75 : 0.7, 0.05);
        if (pr.kind !== "spoon") pr.until = now;
      }
    }
  }

  /** 화면 테두리: 뜨거운 웅덩이 위면 주황, 행렬에 떠밀리면 노랑, 잔반통에 빨려 들면 초록빛 */
  private tickScreen(now: number): void {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const cx = v.x + v.width / 2;
    const cy = v.y + v.height / 2;
    const p = this.host.player();
    const hot = this.inPuddle(p.x, p.y);
    const pushed = this.push.x !== 0 || this.push.y !== 0;
    const sucked = Math.hypot(this.pull.x, this.pull.y) > 20;
    const wave = this.host.reduced ? 0 : Math.sin(now / 120);
    const [a, col] = hot ? [0.3 + 0.1 * wave, hot.spicy ? 0xff2a1a : 0xff7a1a] : pushed ? [0.2 + 0.06 * wave, 0xffd040] : sucked ? [0.22, 0x8ac060] : [0, 0];
    const [top, bot, left, right] = this.edges;
    for (const e of this.edges) e.setTint(col).setAlpha(a).setVisible(a > 0.01);
    if (a > 0.01) {
      const bw = v.width * 0.14;
      const bh = v.height * 0.18;
      top.setPosition(cx, v.y).setDisplaySize(v.width, bh);
      bot.setPosition(cx, v.y + v.height).setDisplaySize(v.width, bh);
      left.setPosition(v.x, cy).setDisplaySize(bw, v.height);
      right.setPosition(v.x + v.width, cy).setDisplaySize(bw, v.height);
    }
  }

  destroy(): void {
    this.steam.destroy();
    this.sparks.destroy();
    for (const img of this.projImgs) img.destroy();
    this.projImgs = [];
    this.proj = [];
    for (const m of this.st.keys()) if (m.sprite.active) m.sprite.setRotation(0);
    this.st.clear();
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.laters = [];
  }
}

/** 구내식당 실행부 만들기 (game/tower/themes 표에 한 줄로) */
export const makeCafeteria = (host: ThemeHost, _zone: string, seed: number): TowerThemeRuntime => new CafeteriaStage(host, seed);

