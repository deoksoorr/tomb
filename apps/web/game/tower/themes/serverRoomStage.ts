import * as Phaser from "phaser";
import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { revivable } from "@/lib/rpg/plan";
import { SV_BOSS_CIRCUIT, SV_BOSS_REBOOT, svAccent, svLoop, type SvLoop } from "@/lib/rpg/serverRoom";
import { towerLoop } from "@/lib/rpg/tower";
import { css, makeCanvas, radial } from "../../sprites/pixel";
import { towerSound, type TowerSoundEv } from "../towerSound";
import type { ThemeHost, ThemeMon, TowerThemeRuntime } from "./runtime";
import { digits, propLeds, SV_BEACON, SV_ROOM_NAMES, SV_TRACES } from "./serverRoomMap";

// 11/15 지하 서버실 실행부 (층마다 하나): 움직이는 배경(랙 LED·찬 바람 안개·케이블 트레이 데이터 빛·네온·경광등·층 번호),
// 기믹 「과열」(한 칸에 오래 서 있으면 주황 → 2.5초 뒤 불길, 「냉각 실패」 경보면 두 배로 빨리), 몬스터 열두 종의 행동, 우두머리 세 단계.
// 시간은 씬의 게임 시간(멈춤 제외). 서버 검증과 상관있는 것: 복사(엑셀 매크로 둘까지)·되살리기(백업 테이프 셋까지)는 MonsterDef.clones·revive 몫 안에서만.

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;
const TILE = 24;
const COLS = Math.ceil(AW / TILE);
const ROWS = Math.ceil(AH / TILE);

const D_HEAT = -790;
const D_PUDDLE = -786;
const D_STENCIL = -796;
const D_FLOORLIGHT = -700;
const D_CONE = -447;
const D_DARK = 9002;
const D_TRAY = 9030;
const D_GLOW = 9056;
const D_VIG = 9600;

const T = {
  soft: "sv-soft",
  mist: "sv-mist",
  vig: "sv-vig",
  px: "sv-px",
  seg: "sv-seg",
  paper: "sv-paper",
  pulse: "sv-pulse",
  tray: "sv-tray",
  spark: "sv-spark",
  flame: (i: number) => `sv-flame-${i}`,
  code: (i: number) => `sv-code-${i}`,
  sign: (f: number, col: number) => `sv-sign-${f}-${col}`,
  stencil: (f: number) => `sv-stencil-${f}`,
  num: (n: number) => `sv-num-${n}`,
} as const;

/** 과열: 불길 지속·피해 간격·피해 (최대 HP 비율) */
const BURN_MS = 3500;
const BURN_TICK = 500;
const BURN_PCT = 0.04;
/** 냉각 실패 경보: 처음·주기·지속·미리 알림 */
const FAIL_FIRST = 15_000;
const FAIL_EVERY = 22_000;
const FAIL_DUR = 7000;
const FAIL_WARN = 1600;

type St = {
  phase: number;
  // 엉킨 랜선
  tail?: Phaser.GameObjects.Image[];
  path?: { x: number; y: number }[];
  grabAt?: number;
  grabUntil?: number;
  grabReady?: number;
  // 무선 공유기·프린터·카메라·매크로
  next?: number;
  emitAt?: number;
  jamUntil?: number;
  bursts?: number[];
  clones?: number;
  clone?: boolean;
  copyAt?: number;
  seen?: number;
  alarmReady?: number;
  base?: number;
  // 재부팅
  rebooting?: boolean;
  rebooted?: boolean;
  final?: boolean;
  rebootAt?: number;
  ring?: Phaser.GameObjects.Graphics;
  num?: Phaser.GameObjects.Image;
  // 날뜀 (보안 카메라 경보)
  enrageUntil?: number;
  baseSpeed?: number;
  // 누수
  lastDrop?: { x: number; y: number };
  // 우두머리
  spiralAt?: number;
  spiral?: { t0: number; n: number; base: number };
  circuitAt?: number;
  rebootWaveAt?: number;
  wave?: { at: number; x: number; y: number; r: number };
  lockNote?: number;
};

type Ring = { m: ThemeMon; x: number; y: number; r: number; gaps: number[]; hit: boolean };
type Puddle = { x: number; y: number; r: number; until: number };
type Mist = { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number };
type Pulse = { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number; v: number };
type Led = { x: number; y: number; col: number; period: number; phase: number; duty: number };

function ensureTextures(scene: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  };
  add(T.soft, () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  add(T.mist, () => radial(32, [[0, "rgba(255,255,255,0.7)"], [0.6, "rgba(255,255,255,0.18)"], [1, "rgba(255,255,255,0)"]]));
  add(T.vig, () =>
    radial(128, [
      [0, "rgba(255,255,255,0)"],
      [0.55, "rgba(255,255,255,0)"],
      [0.85, "rgba(255,255,255,0.55)"],
      [1, "rgba(255,255,255,1)"],
    ]),
  );
  add(T.px, () => {
    const { canvas, ctx } = makeCanvas(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 2, 2);
    return canvas;
  });
  add(T.seg, () => {
    const { canvas, ctx } = makeCanvas(6, 6);
    ctx.fillStyle = "#141218";
    ctx.fillRect(1, 0, 4, 6);
    ctx.fillRect(0, 1, 6, 4);
    ctx.fillStyle = "#3a7ad8";
    ctx.fillRect(1, 1, 4, 4);
    ctx.fillStyle = "#7ab0f0";
    ctx.fillRect(1, 1, 4, 1);
    return canvas;
  });
  add(T.paper, () => {
    const { canvas, ctx } = makeCanvas(7, 6);
    ctx.fillStyle = "#141218";
    ctx.fillRect(0, 0, 7, 6);
    ctx.fillStyle = "#f2f2ee";
    ctx.fillRect(1, 1, 5, 4);
    ctx.fillStyle = "#9aa3ad";
    ctx.fillRect(2, 2, 3, 1);
    ctx.fillStyle = "#ff9a2a";
    ctx.fillRect(5, 1, 1, 1);
    return canvas;
  });
  add(T.pulse, () => {
    const { canvas, ctx } = makeCanvas(10, 3);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, 0, 10, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(2, 1, 8, 1);
    return canvas;
  });
  add(T.spark, () => {
    const { canvas, ctx } = makeCanvas(5, 5);
    ctx.fillStyle = "#fff";
    ctx.fillRect(2, 0, 1, 5);
    ctx.fillRect(0, 2, 5, 1);
    return canvas;
  });
  add(T.tray, () => {
    // 천장 케이블 트레이: 사다리 레일 둘 + 가로대 + 색색 케이블 다발
    const { canvas, ctx } = makeCanvas(AW, 9);
    ctx.fillStyle = "#0a0e16";
    ctx.fillRect(0, 0, AW, 9);
    ctx.fillStyle = "#5a6478";
    ctx.fillRect(0, 0, AW, 1);
    ctx.fillRect(0, 8, AW, 1);
    ctx.fillStyle = "#3a4256";
    for (let x = 0; x < AW; x += 8) ctx.fillRect(x, 1, 1, 7);
    const cols = ["#2a5aa8", "#a88a2a", "#a83030", "#2a9a5a"];
    cols.forEach((c, i) => {
      ctx.fillStyle = c;
      for (let x = 0; x < AW; x++) ctx.fillRect(x, 2 + i + Math.round(Math.sin(x / 13 + i) * 0.5), 1, 1);
    });
    return canvas;
  });
  // 불길 세 프레임 (아래 넓고 위로 갈래)
  for (let i = 0; i < 3; i++)
    add(T.flame(i), () => {
      const { canvas, ctx } = makeCanvas(9, 13);
      const shape = [
        [3, 12, 3],
        [2, 11, 5],
        [1, 10, 7],
        [1, 9, 7],
        [1, 8, 6],
        [2, 7, 5],
        [2, 6, 4],
        [3, 5, 3],
        [3, 4, 2],
        [4, 3, 1],
      ];
      const sway = [0, 1, -1][i];
      for (const [x, y, w] of shape) {
        const off = y < 7 ? sway : 0;
        ctx.fillStyle = "#ff5a1a";
        ctx.fillRect(x + off, y, w, 1);
        if (y > 5 && w > 2) {
          ctx.fillStyle = "#ffb03a";
          ctx.fillRect(x + off + 1, y, w - 2, 1);
        }
        if (y > 8 && w > 4) {
          ctx.fillStyle = "#fff0a0";
          ctx.fillRect(x + off + 2, y, w - 4, 1);
        }
      }
      return canvas;
    });
  // 코드 조각 탄: 0 · 1 · { (초록 인광)
  const glyphs = [
    ["###", "#.#", "#.#", "#.#", "###"],
    [".#.", "##.", ".#.", ".#.", "###"],
    [".##", ".#.", "#..", ".#.", ".##"],
  ];
  glyphs.forEach((g, i) =>
    add(T.code(i), () => {
      const { canvas, ctx } = makeCanvas(7, 9);
      ctx.fillStyle = "rgba(10,40,20,0.9)";
      ctx.fillRect(0, 0, 7, 9);
      ctx.fillStyle = "#3aff6a";
      g.forEach((row, j) => [...row].forEach((p, k) => p === "#" && ctx.fillRect(2 + k, 2 + j, 1, 1)));
      return canvas;
    }),
  );
  for (let n = 1; n <= 3; n++)
    add(T.num(n), () => {
      const { canvas, ctx } = makeCanvas(9, 13);
      digits(ctx, String(n), 0, 0, 0x141218, 3);
      digits(ctx, String(n), 0, 1, 0x3aff6a, 2.6);
      return canvas;
    });
}

export class ServerRoomStage implements TowerThemeRuntime {
  private readonly sc: Phaser.Scene;
  private readonly floor: number;
  private readonly loop: SvLoop;
  private readonly accent: number;
  private readonly room: number;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly st = new Map<ThemeMon, St>();
  private readonly t0: number;
  private rnd: () => number;
  // 배경
  private leds: { g: Phaser.GameObjects.Graphics; list: Led[] }[] = [];
  private ledGlow!: Phaser.GameObjects.Graphics;
  private ledAt = 0;
  private neon: { img: Phaser.GameObjects.Image; base: number; ph: number }[] = [];
  private vents: { x: number; y: number; next: number }[] = [];
  private mist: Mist[] = [];
  private pulses: Pulse[] = [];
  private traces: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; hor: boolean; x0: number; len: number; fix: number; t: number; v: number }[] = [];
  private countdown: Phaser.GameObjects.Image | null = null;
  private beam: Phaser.GameObjects.Image | null = null;
  private sweep: Phaser.GameObjects.Image | null = null;
  private vig!: Phaser.GameObjects.Image;
  private blueVig!: Phaser.GameObjects.Image;
  private glitch!: Phaser.GameObjects.Graphics;
  // 과열
  private heat = new Float32Array(COLS * ROWS);
  private burnUntil = new Float64Array(COLS * ROWS);
  private flames = new Map<number, Phaser.GameObjects.Image[]>();
  private heatG!: Phaser.GameObjects.Graphics;
  private cur = -1;
  private burnTick = 0;
  private sizzleAt = 0;
  private heatTold = false;
  private burnTold = false;
  private fail = { next: 0, until: 0, warned: false };
  // 몬스터 연출
  private fxG!: Phaser.GameObjects.Graphics;
  private coneG!: Phaser.GameObjects.Graphics;
  private rings: Ring[] = [];
  private puddles: Puddle[] = [];
  private puddleG!: Phaser.GameObjects.Graphics;
  private pv = { x: 0, y: 0 };
  private slipTold = false;
  private shielded = new Set<ThemeMon>();
  private recent: { id: MonsterId; x: number; y: number; wave: number }[] = [];
  private blueUntil = 0;
  private laters: { at: number; fn: () => void }[] = [];

  constructor(
    private readonly host: ThemeHost,
    seed: number,
  ) {
    this.sc = host.scene;
    this.floor = host.floor();
    this.loop = svLoop(towerLoop(this.floor));
    this.room = host.layout().variant;
    // 정전 판은 초록 비상등, 경보 판은 붉은 빛이 섞인다
    this.accent = this.loop.dark > 0.5 ? 0x3aff9a : this.loop.alarm && this.floor % 2 ? 0xff4a4a : svAccent(this.floor);
    this.t0 = host.now();
    this.fail.next = this.t0 + FAIL_FIRST;
    let s = (seed ^ 0x53565254) >>> 0;
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

  private snd(ev: TowerSoundEv): void {
    this.host.synth(`sv-${ev}`, towerSound(ev));
  }

  title(): string {
    const name = SV_ROOM_NAMES[this.room] ?? "";
    return this.loop.name === "평상시" ? name : `${name} · ${this.loop.name}`;
  }

  // ── 배경 ──

  private build(): void {
    const sc = this.sc;
    const l = this.host.layout();
    const reduced = this.host.reduced;
    // 층 번호: 바닥 페인트(시작점 아래) + 벽 표지
    const fkey = T.stencil(this.floor);
    if (!sc.textures.exists(fkey))
      sc.textures.addCanvas(
        fkey,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(text.length * 16, 22);
          digits(ctx, text, 1, 1, 0xe8c040, 4, 0.55);
          // 닳은 페인트
          ctx.globalCompositeOperation = "destination-out";
          for (let k = 0; k < 90; k++) ctx.fillRect(Math.floor(Math.random() * canvas.width), Math.floor(Math.random() * 22), 1 + (k % 2), 1);
          return canvas;
        })(),
      );
    this.keep(sc.add.image(l.start.x, l.start.y + 26, fkey).setDepth(D_STENCIL).setAlpha(0.8));
    const skey = T.sign(this.floor, this.accent);
    if (!sc.textures.exists(skey))
      sc.textures.addCanvas(
        skey,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(34, 14);
          ctx.fillStyle = "#0a0e16";
          ctx.fillRect(0, 0, 34, 14);
          ctx.fillStyle = css(this.accent);
          ctx.fillRect(0, 0, 34, 1);
          ctx.fillRect(0, 13, 34, 1);
          const w = digits(ctx, text, 0, 0, 0, 2, 0);
          digits(ctx, text, Math.round((34 - w) / 2), 2, this.accent, 2);
          return canvas;
        })(),
      );
    this.keep(sc.add.image(153, 12, skey).setDepth(-900));

    // 랙·패치·배터리 LED (소품마다 자기 박자)
    for (const p of l.props) {
      const spots = propLeds(p.kind, p.x, p.y);
      if (!spots.length) continue;
      const base = 260 + this.rnd() * 900;
      const list: Led[] = spots.map((q) => {
        const r = this.rnd();
        const dim = this.loop.dark > 0.5;
        const col = p.kind === "sv_mainframe" ? (r < 0.5 ? 0xffb03a : 0x3aff6a) : r < (dim ? 0.55 : 0.14) ? 0xffa030 : r < 0.2 ? this.accent : 0x3aff6a;
        return { x: q.x, y: q.y, col, period: base * (0.5 + this.rnd() * 1.8), phase: this.rnd() * 5000, duty: dim ? 0.25 : 0.35 + this.rnd() * 0.5 };
      });
      this.leds.push({ g: this.keep(sc.add.graphics().setDepth(p.y + 0.2)), list });
    }
    this.ledGlow = this.keep(sc.add.graphics().setDepth(D_GLOW).setBlendMode(Phaser.BlendModes.ADD));

    // 네온 띠 빛 (층마다 색)
    for (const d of l.decals) {
      if (d.kind === "sv_neon") {
        const img = this.keep(
          sc.add
            .image(d.x + d.w / 2, d.y + d.h / 2, T.soft)
            .setDisplaySize(d.w + 22, d.h + 18)
            .setTint(this.accent)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(D_GLOW),
        );
        this.neon.push({ img, base: 0.55, ph: this.rnd() * 6 });
        // 띠 자체를 빛 색으로 (바닥 그림은 흰빛)
        this.keep(sc.add.rectangle(d.x, d.y, d.w, d.h, this.accent).setOrigin(0, 0).setDepth(D_FLOORLIGHT).setAlpha(0.85));
      } else if (d.kind === "sv_vent") this.vents.push({ x: d.x + d.w / 2, y: d.y + d.h / 2, next: this.rnd() * 400 });
      else if (d.kind === "sv_trace") {
        // 메인프레임 홀 바닥 회로: 은은한 빛 + 흐르는 데이터 빛 (우두머리 2단계에 전류가 흐르는 길)
        this.keep(sc.add.rectangle(d.x - 1, d.y - 1, d.w + 2, d.h + 2, this.accent).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOORLIGHT).setAlpha(0.35));
        const hor = d.w > d.h;
        for (let k = 0; k < 2; k++) {
          const v = (k ? -1 : 1) * (60 + this.rnd() * 70);
          const img = this.keep(sc.add.image(d.x, d.y, T.pulse).setTint(0x8af8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOORLIGHT + 1).setRotation(hor ? 0 : Math.PI / 2));
          const glow = this.keep(sc.add.image(d.x, d.y, T.soft).setDisplaySize(26, 26).setTint(this.accent).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOORLIGHT));
          this.traces.push({ img, glow, hor, x0: hor ? d.x : d.y, len: hor ? d.w : d.h, fix: hor ? d.y : d.x, t: this.rnd() * (hor ? d.w : d.h), v });
        }
      }
    }

    // 어두운 판: 곱하기로 덮는다 (불빛·LED는 위에서 빛난다)
    if (this.loop.dark > 0) {
      const k = this.loop.dark;
      const c = Phaser.Display.Color.IntegerToColor(0x1a2238);
      const mixc = Phaser.Display.Color.GetColor(255 - (255 - c.red) * k, 255 - (255 - c.green) * k, 255 - (255 - c.blue) * k);
      this.keep(sc.add.rectangle(-200, -200, AW + 400, AH + 400, mixc).setOrigin(0, 0).setDepth(D_DARK).setBlendMode(Phaser.BlendModes.MULTIPLY));
      // 비상 전원 초록 등 (UPS 위)
      for (const p of l.props)
        if (p.kind === "sv_ups") this.neon.push({ img: this.keep(sc.add.image(p.x, p.y - 14, T.soft).setDisplaySize(70, 44).setTint(0x3aff7a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW)), base: 0.7, ph: 0 });
    }

    // 천장 케이블 트레이 두 줄 + 흐르는 데이터 빛 (바닥에 빛이 비친다)
    for (const y of [TOP + 24, AH - 34]) {
      this.keep(sc.add.image(0, y, T.tray).setOrigin(0, 0.5).setDepth(D_TRAY).setAlpha(0.88));
      for (let k = 0; k < 4; k++) {
        const v = (k % 2 ? -1 : 1) * (90 + this.rnd() * 110);
        const col = k % 2 ? 0x3aff9a : this.accent;
        const img = this.keep(sc.add.image(this.rnd() * AW, y, T.pulse).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_TRAY + 1));
        const glow = this.keep(sc.add.image(img.x, y + 30, T.soft).setDisplaySize(56, 26).setTint(col).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOORLIGHT));
        this.pulses.push({ img, glow, x: img.x, y, v });
      }
    }

    // 경광등 (경보 판은 늘, 그 밖엔 냉각 실패 동안)
    this.beam = this.keep(sc.add.image(SV_BEACON.x + 6, SV_BEACON.y + 4, T.soft).setOrigin(0, 0.5).setDisplaySize(260, 40).setTint(0xff2a1a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0));
    this.sweep = this.keep(sc.add.image(AW / 2, AH / 2, T.soft).setDisplaySize(170, 110).setTint(0xff2a1a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0));

    // 과열 바닥·몬스터 연출 그림
    this.heatG = this.keep(sc.add.graphics().setDepth(D_HEAT));
    this.puddleG = this.keep(sc.add.graphics().setDepth(D_PUDDLE));
    this.coneG = this.keep(sc.add.graphics().setDepth(D_CONE));
    this.fxG = this.keep(sc.add.graphics().setDepth(-440));
    // 화면 테두리 (붉은 경보·파란 화면)
    this.vig = this.keep(sc.add.image(0, 0, T.vig).setTint(0xff1a1a).setDepth(D_VIG).setAlpha(0));
    this.blueVig = this.keep(sc.add.image(0, 0, T.vig).setTint(0x2a6aff).setDepth(D_VIG).setAlpha(0));
    this.glitch = this.keep(sc.add.graphics().setDepth(D_VIG + 1));
    if (reduced) for (const n of this.neon) n.ph = 0;
  }

  // ── 몬스터 ──

  private s(m: ThemeMon): St {
    let x = this.st.get(m);
    if (!x) {
      x = { phase: this.rnd() * 1000 };
      this.st.set(m, x);
    }
    return x;
  }

  spawned(m: ThemeMon): void {
    const s = this.s(m);
    if (this.loop.speed !== 1) m.st.speed *= this.loop.speed;
    const now = this.host.now();
    switch (m.id) {
      case "sv_tangled_lan":
        s.tail = Array.from({ length: 6 }, (_, i) => this.keep(this.sc.add.image(m.x, m.y, T.seg).setScale(1 - i * 0.07)));
        s.path = [];
        s.grabReady = now + 1500;
        break;
      case "sv_wifi_router":
        s.next = now + 1800 + this.rnd() * 1200;
        break;
      case "sv_printer_jam":
        s.next = now + 1600 + this.rnd() * 1500;
        s.bursts = [];
        break;
      case "sv_excel_macro":
        s.clones = 0;
        s.copyAt = now + 3400 + this.rnd() * 800;
        break;
      case "sv_security_cam":
        s.base = Math.atan2(AH / 2 + 10 - m.y, AW / 2 - m.x);
        s.seen = 0;
        s.alarmReady = now + 2000;
        break;
      case "sv_legacy_system":
        s.spiralAt = now + 1800;
        s.circuitAt = 0;
        s.rebootWaveAt = 0;
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
    switch (m.id) {
      case "sv_tangled_lan": {
        if ((s.grabUntil ?? 0) > now || (s.grabAt ?? 0) > now) return true;
        // 뱀처럼 좌우로 굽이치며 다가온다
        const a = Math.atan2(dy, dx) + Math.sin(now / 170 + s.phase) * 0.85;
        const sp = m.st.speed * (d < 30 ? 0.7 : 1);
        if (d > 9) this.host.moveMon(m, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
        return true;
      }
      case "sv_hot_fan":
      case "sv_printer_jam": {
        // 거의 제자리 (너무 붙으면 천천히 물러난다)
        if (d < 40) this.host.moveMon(m, (-dx / d) * m.st.speed * dt, (-dy / d) * m.st.speed * dt);
        return true;
      }
      case "sv_security_cam":
        return true;
    }
    return false;
  }

  damageMul(m: ThemeMon): number {
    if (!this.shielded.has(m)) return 1;
    const s = this.s(m);
    const now = this.host.now();
    if ((s.lockNote ?? 0) < now) {
      s.lockNote = now + 900;
      this.host.float(m.x, m.y - MONSTERS[m.id].size - 8, "잠김", "#ffd04a");
    }
    return 0.15;
  }

  saveFromDeath(m: ThemeMon): boolean {
    if (m.id !== "sv_reboot") return false;
    const s = this.s(m);
    if (s.final || s.rebooted) return false;
    if (s.rebooting) {
      s.final = true;
      this.host.float(m.x, m.y - 24, "강제 종료!", "#ff6a4a");
      return false;
    }
    const now = this.host.now();
    s.rebooting = true;
    s.rebootAt = now + 3000;
    m.hp = 1;
    m.stunUntil = now + 3000;
    m.sprite.setTint(0x5a6070).setAlpha(0.75);
    s.ring = this.keep(this.sc.add.graphics().setDepth(m.y + 1));
    s.num = this.keep(this.sc.add.image(m.x, m.y - 26, T.num(3)).setDepth(1e5));
    this.snd("reboot");
    this.host.float(m.x, m.y - 30, "재부팅 중… 밟거나 치면 꺼진다", "#9aff9a");
    return true;
  }

  killed(m: ThemeMon): void {
    const s = this.st.get(m);
    if (s?.tail) for (const t of s.tail) t.destroy();
    s?.ring?.destroy();
    s?.num?.destroy();
    this.st.delete(m);
    const now = this.host.now();
    // 쓰러진 기계가 방전한다 (정전 판)
    if (this.loop.discharge && !m.boss) {
      const x = m.x;
      const y = m.y;
      this.host.tele.add({ kind: "circle", r: 20 }, x, y, 0, now, 650, () => {
        this.snd("zap");
        this.sparks(x, y, 10, 0x8af0ff);
        const p = this.host.player();
        if (Math.hypot(p.x - x, p.y - y) <= 24) this.host.hurtPct(0.05);
      }, 0x6ae0ff);
    }
    // 백업 테이프: 최근에 쓰러진 셋을 되살린다
    if (m.id === "sv_backup_tape") {
      const pick = this.recent.splice(-(MONSTERS.sv_backup_tape.revive ?? 3));
      if (pick.length) {
        this.host.flash(`백업 테이프가 감긴다… ${pick.length}마리 복원!`, 1600);
        this.snd("restore");
      }
      for (const r of pick) {
        this.host.tele.add({ kind: "circle", r: 12 }, r.x, r.y, 0, now, 900, undefined, 0x6aff9a);
        this.tapeLine(m.x, m.y, r.x, r.y);
        this.later(now + 900, () => {
          const n = this.host.spawn(r.id, r.x, r.y, r.wave, true);
          if (!n) return;
          this.host.float(r.x, r.y - 20, "복원!", "#7aff9a");
          this.column(r.x, r.y, 0x6aff9a);
        });
      }
      return;
    }
    if (revivable(m.id) && !m.boss) {
      this.recent.push({ id: m.id, x: m.x, y: m.y, wave: m.wave });
      if (this.recent.length > 8) this.recent.shift();
    }
  }

  playerHit(id: MonsterId): void {
    if (id !== "sv_bluescreen") return;
    this.host.confuse(1000);
    this.blueUntil = this.host.now() + 1000;
    this.host.float(this.host.player().x, this.host.player().y - 34, ":( 방향 뒤집힘", "#8ab8ff");
  }

  playerVelocity(v: { x: number; y: number }, dt: number): { x: number; y: number } {
    const p = this.host.player();
    const on = this.puddles.some((q) => Math.hypot((p.x - q.x) / q.r, (p.y - q.y) / (q.r * 0.6)) <= 1);
    if (!on) {
      this.pv = { ...v };
      return v;
    }
    if (!this.slipTold) {
      this.slipTold = true;
      this.host.flash("냉각수 웅덩이! 미끄러워요", 1200);
    }
    const k = 1 - Math.exp(-dt * 2.2);
    this.pv.x += (v.x - this.pv.x) * k;
    this.pv.y += (v.y - this.pv.y) * k;
    return { ...this.pv };
  }

  // ── 매 프레임 ──

  private later(at: number, fn: () => void): void {
    this.laters.push({ at, fn });
  }

  update(now: number, dt: number): void {
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.at <= now);
      this.laters = this.laters.filter((l) => l.at > now);
      for (const l of due) l.fn();
    }
    this.tickBackground(now, dt);
    this.tickHeat(now, dt);
    this.tickMonsters(now, dt);
    this.tickScreen(now);
  }

  private tickBackground(now: number, dt: number): void {
    const reduced = this.host.reduced;
    const failing = now < this.fail.until;
    // LED: 0.08초마다 다시 그린다
    if (now >= this.ledAt) {
      this.ledAt = now + 80;
      this.ledGlow.clear();
      for (const r of this.leds) {
        r.g.clear();
        for (const l of r.list) {
          const on = reduced ? l.duty > 0.3 : ((now + l.phase) % l.period) / l.period < l.duty;
          if (!on) continue;
          const col = failing && l.col === 0x3aff6a && (l.phase | 0) % 3 === 0 ? 0xff3a2a : l.col;
          r.g.fillStyle(col, 1).fillRect(l.x, l.y, 1, 1);
          this.ledGlow.fillStyle(col, 0.35).fillRect(l.x - 1, l.y - 1, 3, 3);
        }
      }
    }
    for (const n of this.neon) n.img.setAlpha(n.base * (reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 700 + n.ph)) * (failing ? 0.6 : 1));
    // 찬 바람 안개 (냉각 실패면 멎는다)
    if (!failing)
      for (const v of this.vents) {
        if (now < v.next || this.mist.length > 60) continue;
        v.next = now + 140 + this.rnd() * 160;
        const img = this.sc.add.image(v.x + (this.rnd() - 0.5) * 18, v.y + (this.rnd() - 0.5) * 10, T.mist).setTint(0xd8f0ff).setAlpha(0).setScale(0.35).setDepth(v.y + 4);
        this.mist.push({ img, vx: (this.rnd() - 0.5) * 14, vy: -(6 + this.rnd() * 9), life: 0, max: 2000 + this.rnd() * 1400 });
      }
    for (const p of this.mist) {
      p.life += dt * 1000;
      const t = p.life / p.max;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.setScale(0.35 + t * 1.1).setAlpha(Math.sin(Math.min(1, t) * Math.PI) * 0.2);
      if (t >= 1) p.img.destroy();
    }
    this.mist = this.mist.filter((p) => p.life < p.max);
    for (const tr of this.traces) {
      tr.t = (tr.t + tr.v * dt + tr.len) % tr.len;
      const x = tr.hor ? tr.x0 + tr.t : tr.fix;
      const y = tr.hor ? tr.fix : tr.x0 + tr.t;
      tr.img.setPosition(x, y);
      tr.glow.setPosition(x, y);
    }
    // 트레이 데이터 빛
    for (const p of this.pulses) {
      p.x += p.v * dt;
      if (p.x > AW + 20) p.x = -20;
      if (p.x < -20) p.x = AW + 20;
      p.img.setPosition(p.x, p.y).setFlipX(p.v < 0);
      p.glow.setPosition(p.x, p.y + 30);
    }
    // 경광등
    const alarm = this.loop.alarm || failing || (this.fail.warned && now < this.fail.next);
    if (this.beam && this.sweep) {
      const a = (now / 520) % (Math.PI * 2);
      this.beam.setRotation(Math.PI / 2 + Math.sin(a) * 1.1).setAlpha(alarm ? 0.35 + 0.25 * Math.max(0, Math.cos(a)) : 0);
      this.sweep.setPosition(AW / 2 + Math.cos(now / 900) * 150, AH / 2 + 10 + Math.sin(now / 900) * 90).setAlpha(alarm && !reduced ? 0.22 : alarm ? 0.12 : 0);
    }
  }

  private tickHeat(now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    // 냉각 실패 경보 (엘리베이터·정리 중엔 미룬다)
    const f = this.fail;
    if (H.calm() && !f.warned) f.next = Math.max(f.next, now + FAIL_WARN + 1000);
    if (!f.warned && now >= f.next - FAIL_WARN) {
      f.warned = true;
      H.flash("냉각 실패 경보! 곧 바닥이 두 배로 빨리 달아올라요", 1800);
      this.snd("siren");
    }
    if (now >= f.next) {
      f.until = now + FAIL_DUR;
      f.next = now + FAIL_EVERY;
      f.warned = false;
      H.shake(160, 0.002);
    }
    const mul = now < f.until ? 2 : 1;
    const c = Math.floor(p.x / TILE) + Math.floor(p.y / TILE) * COLS;
    if (c !== this.cur) this.cur = c;
    // 엘리베이터·층 정리 중에는 달아오르지 않는다 (식기만)
    const rate = H.calm() ? 0 : (dt * 1000 * mul) / this.loop.heatMs;
    for (let i = 0; i < this.heat.length; i++) {
      if (this.burnUntil[i] > now) continue;
      if (i === this.cur) {
        this.heat[i] = Math.min(1, this.heat[i] + rate);
        if (this.heat[i] >= 1) {
          this.burnUntil[i] = now + BURN_MS;
          this.burnTick = now;
          this.snd("sizzle");
          H.sfx("slam", 0.3);
          if (!this.burnTold) {
            this.burnTold = true;
            H.flash("바닥에 불이 붙었어요! 비켜요", 1300);
          }
        }
      } else if (this.heat[i] > 0) this.heat[i] = Math.max(0, this.heat[i] - dt * 0.5);
    }
    const hc = this.heat[this.cur] ?? 0;
    if (!this.heatTold && hc > 0.45) {
      this.heatTold = true;
      H.flash("바닥이 달아올라요! 한 칸에 오래 서 있지 마세요", 1600);
    }
    if (hc > 0.5 && this.burnUntil[this.cur] <= now && now >= this.sizzleAt) {
      this.sizzleAt = now + 420;
      this.snd("sizzle");
    }
    if (this.burnUntil[this.cur] > now && now >= this.burnTick && !H.calm()) {
      this.burnTick = now + BURN_TICK;
      H.hurtPct(BURN_PCT);
    }
    // 그리기: 달아오른 칸 (주황 → 노랑 테두리 깜빡임), 불붙은 칸은 불길
    const g = this.heatG;
    g.clear();
    const pulse = this.host.reduced ? 1 : 0.8 + 0.2 * Math.sin(now / 90);
    for (let i = 0; i < this.heat.length; i++) {
      const burning = this.burnUntil[i] > now;
      const h = this.heat[i];
      const x = (i % COLS) * TILE;
      const y = Math.floor(i / COLS) * TILE;
      if (burning) {
        g.fillStyle(0xff3a0a, 0.42 * pulse).fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        g.lineStyle(1, 0xffd060, 0.9).strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
        if (!this.flames.has(i)) {
          const fl = [0, 1, 2, 3].map((k) =>
            this.keep(
              this.sc.add
                .image(x + 5 + (k % 2) * 13 + (k > 1 ? 3 : 0), y + 10 + Math.floor(k / 2) * 10, T.flame(k % 3))
                .setOrigin(0.5, 1)
                .setDepth(y + 10 + Math.floor(k / 2) * 10),
            ),
          );
          this.flames.set(i, fl);
        }
        const left = this.burnUntil[i] - now;
        this.flames.get(i)!.forEach((img, k) => img.setTexture(T.flame((Math.floor(now / 90) + k) % 3)).setScale(1, Math.min(1, left / 400) * (0.9 + 0.2 * Math.sin(now / 70 + k))));
      } else {
        const fl = this.flames.get(i);
        if (fl) {
          for (const img of fl) img.destroy();
          this.flames.delete(i);
          this.heat[i] = 0.25;
        }
        if (h > 0.02) {
          g.fillStyle(h > 0.66 ? 0xff7a1a : 0xff9a3a, h * 0.48 * pulse).fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          const blink = h > 0.66 && Math.floor(now / 110) % 2 === 0;
          g.lineStyle(1, blink ? 0xfff0a0 : 0xffb060, Math.min(1, h * 1.3)).strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
          if (h > 0.5 && this.rnd() < dt * 8) this.sparks(x + 4 + this.rnd() * 16, y + 4 + this.rnd() * 16, 1, 0xffb060);
        }
      }
    }
  }

  private tickMonsters(now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    const mons = H.mons();
    const fx = this.fxG;
    fx.clear();
    this.coneG.clear();
    // 랜섬 자물쇠: 사슬로 묶인 몬스터 (매 프레임 다시 센다)
    this.shielded.clear();
    const locks = mons.filter((m) => m.alive && m.id === "sv_ransom_lock" && !m.hidden);
    for (const L of locks)
      for (const m of mons) {
        if (!m.alive || m === L || m.boss || m.id === "sv_ransom_lock") continue;
        if (Math.hypot(m.x - L.x, m.y - L.y) > 84) continue;
        this.shielded.add(m);
        // 사슬: 금빛 점선 + 맞는 쪽에 작은 자물쇠 고리
        const n = Math.max(2, Math.floor(Math.hypot(m.x - L.x, m.y - L.y) / 5));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const wob = Math.sin(now / 200 + k) * 1.2;
          fx.fillStyle(k % 2 ? 0xffd04a : 0xa88a2a, 0.9).fillRect(L.x + (m.x - L.x) * t - 1, L.y - 8 + (m.y - 8 - (L.y - 8)) * t - 1 + wob, 2, 2);
        }
        const s = MONSTERS[m.id].size;
        fx.lineStyle(1, 0xffd04a, 0.55 + 0.25 * Math.sin(now / 150)).strokeEllipse(m.x, m.y - s * 0.45, s * 1.5, s * 1.2);
      }

    for (const m of mons) {
      if (!m.alive) continue;
      const s = this.s(m);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      // 보안 카메라 경보로 날뛰는 중
      if (s.enrageUntil !== undefined) {
        if (now >= s.enrageUntil) {
          m.st.speed = s.baseSpeed ?? m.st.speed;
          s.enrageUntil = undefined;
          if (!s.rebooting) m.sprite.clearTint();
        } else if (Math.floor(now / 120) % 2 === 0) m.sprite.setTint(0xff6a5a);
        else m.sprite.clearTint();
      }
      switch (m.id) {
        case "sv_tangled_lan":
          this.tickLan(m, s, now, dt, d);
          break;
        case "sv_hot_fan":
          // 뜨거운 바람을 내뿜는 중: 아지랑이
          if (m.cast?.id === "breath" && this.rnd() < dt * 30) {
            const a = Math.atan2(p.y - m.y, p.x - m.x) + (this.rnd() - 0.5) * 1.1;
            const r = 10 + this.rnd() * 60;
            this.sparks(m.x + Math.cos(a) * r, m.y - 8 + Math.sin(a) * r, 1, this.rnd() < 0.5 ? 0xff9a3a : 0xffd080);
          }
          break;
        case "sv_reboot":
          if (s.rebooting) {
            const left = (s.rebootAt ?? now) - now;
            s.ring?.clear().lineStyle(2, 0x3aff6a, 0.9).beginPath().arc(m.x, m.y - 8, 13, -Math.PI / 2, -Math.PI / 2 + (1 - left / 3000) * Math.PI * 2).strokePath();
            s.ring?.lineStyle(1, 0x3aff6a, 0.3).strokeCircle(m.x, m.y - 8, 13);
            s.num?.setTexture(T.num(Math.max(1, Math.ceil(left / 1000)))).setPosition(m.x, m.y - 30);
            if (d <= 13) {
              s.final = true;
              H.float(m.x, m.y - 24, "밟아서 강제 종료!", "#ff6a4a");
              H.kill(m);
              continue;
            }
            if (left <= 0) {
              s.rebooting = false;
              s.rebooted = true;
              m.hp = Math.round(m.st.maxHp * 0.5);
              m.sprite.clearTint().setAlpha(1);
              s.ring?.destroy();
              s.num?.destroy();
              s.ring = undefined;
              s.num = undefined;
              this.snd("rebootDone");
              H.float(m.x, m.y - 26, "재부팅 완료", "#9aff9a");
            }
          }
          break;
        case "sv_wifi_router":
          if (s.emitAt !== undefined && now >= s.emitAt) {
            s.emitAt = undefined;
            const toP = Math.atan2(p.y - m.y, p.x - m.x);
            const g0 = toP + (this.rnd() < 0.5 ? 1 : -1) * (0.8 + this.rnd() * 0.9);
            this.rings.push({ m, x: m.x, y: m.y - 6, r: 8, gaps: [g0, g0 + Math.PI * (0.8 + this.rnd() * 0.4)], hit: false });
            this.snd("wifi");
          } else if (s.emitAt === undefined && now >= (s.next ?? 0) && d < 190) {
            s.emitAt = now + 560;
            s.next = now + 3500 + this.rnd() * 600;
            m.windUntil = now + 560;
          }
          break;
        case "sv_printer_jam":
          if (s.jamUntil !== undefined) {
            if (now < s.jamUntil) {
              if (Math.floor(now / 100) % 2) m.sprite.setTint(0xffb060);
              else m.sprite.clearTint();
            } else {
              s.jamUntil = undefined;
              m.sprite.clearTint();
              s.bursts = [now, now + 240, now + 480];
            }
          } else if (now >= (s.next ?? 0) && d < 180 && !m.hidden) {
            s.jamUntil = now + 750;
            s.next = now + 4300 + this.rnd() * 700;
            m.windUntil = now + 750;
            H.tele.add({ kind: "cone", r: 150, arcDeg: 40 }, m.x, m.y - 8, Math.atan2(p.y - m.y + 8, p.x - m.x), now, 750);
            H.float(m.x, m.y - 26, "용지 걸림!", "#ffb060");
            this.snd("jam");
          }
          while (s.bursts?.length && s.bursts[0] <= now) {
            s.bursts.shift();
            const a = Math.atan2(p.y - (m.y - 8), p.x - m.x);
            for (let k = 0; k < 4; k++) H.shoot(m, a + (k - 1.5) * 0.17, 125, 0.5, T.paper);
            H.sfx("flick", 0.5);
          }
          break;
        case "sv_excel_macro":
          if (!m.minion && (s.clones ?? 0) < (MONSTERS.sv_excel_macro.clones ?? 2) && now >= (s.copyAt ?? Infinity)) {
            if (!s.next) {
              s.next = now + 650;
              H.float(m.x, m.y - 18, "Ctrl+C", "#7aff9a");
            } else if (now >= s.next) {
              s.next = 0;
              s.copyAt = now + 4200;
              const alive = mons.filter((o) => o.alive && o.id === "sv_excel_macro").length;
              if (alive < 14) {
                s.clones = (s.clones ?? 0) + 1;
                const a = this.rnd() * Math.PI * 2;
                const at = H.place(m.x + Math.cos(a) * 14, m.y + Math.sin(a) * 10, 6);
                const c = H.spawn("sv_excel_macro", at.x, at.y, m.wave, true);
                if (c) this.s(c).clone = true;
                H.float(m.x, m.y - 18, "Ctrl+V", "#7aff9a");
                this.snd("clone");
              }
            }
            if (s.next) m.sprite.setAlpha(Math.floor(now / 80) % 2 ? 0.5 : 1);
          } else if (m.sprite.alpha < 1 && !m.hidden) m.sprite.setAlpha(1);
          break;
        case "sv_security_cam":
          this.tickCam(m, s, now, dt);
          break;
        case "sv_coolant_leak": {
          const last = s.lastDrop;
          if (!last || Math.hypot(m.x - last.x, m.y - last.y) > 18) {
            s.lastDrop = { x: m.x, y: m.y };
            this.puddles.push({ x: m.x, y: m.y + 1, r: 7 + this.rnd() * 3, until: now + 6500 });
            if (this.puddles.length > 18) this.puddles.shift();
          }
          break;
        }
        case "sv_legacy_system":
          this.tickBoss(m, s, now, dt);
          break;
      }
    }
    // 와이파이 고리: 커지며 지나간다 (틈으로 빠져나가야 한다)
    for (const r of this.rings) {
      r.r += 78 * dt;
      const a0 = Phaser.Math.Clamp(1 - (r.r - 110) / 60, 0, 1);
      const half = 0.36;
      const inGap = (ang: number) => r.gaps.some((gp) => Math.abs(Phaser.Math.Angle.Wrap(ang - gp)) < half);
      fx.lineStyle(3, 0x3ad0ff, 0.65 * a0);
      const steps = 48;
      for (let k = 0; k < steps; k++) {
        const t0 = (k / steps) * Math.PI * 2;
        const t1 = ((k + 1) / steps) * Math.PI * 2;
        if (inGap((t0 + t1) / 2)) continue;
        fx.beginPath().arc(r.x, r.y, r.r, t0, t1).strokePath();
      }
      fx.lineStyle(1, 0xd8f8ff, 0.9 * a0);
      for (const gp of r.gaps)
        for (const e of [gp - half, gp + half]) fx.lineBetween(r.x + Math.cos(e) * (r.r - 3), r.y + Math.sin(e) * (r.r - 3), r.x + Math.cos(e) * (r.r + 3), r.y + Math.sin(e) * (r.r + 3));
      if (!r.hit) {
        const pd = Math.hypot(p.x - r.x, p.y - 4 - r.y);
        if (Math.abs(pd - r.r) < 4.5 && !inGap(Math.atan2(p.y - 4 - r.y, p.x - r.x))) {
          r.hit = true;
          if (r.m.alive) H.strike(r.m, 0.9);
          else H.hurtPct(0.06);
        }
      }
    }
    this.rings = this.rings.filter((r) => r.r < 170);
    // 냉각수 웅덩이
    const pg = this.puddleG;
    pg.clear();
    this.puddles = this.puddles.filter((q) => q.until > now);
    for (const q of this.puddles) {
      const fade = Math.min(1, (q.until - now) / 1200);
      pg.fillStyle(0x2a9ac8, 0.26 * fade).fillEllipse(q.x, q.y, q.r * 2, q.r * 1.2);
      pg.lineStyle(1, 0x7ad8ff, 0.35 * fade).strokeEllipse(q.x, q.y, q.r * 2, q.r * 1.2);
      pg.fillStyle(0xbaf0ff, 0.4 * fade).fillEllipse(q.x - q.r * 0.3, q.y - q.r * 0.15, q.r * 0.6, q.r * 0.25);
    }
  }

  private tickLan(m: ThemeMon, s: St, now: number, dt: number, d: number): void {
    const H = this.host;
    const p = H.player();
    // 꼬리: 지나온 길을 따라 마디가 끌려온다
    const path = s.path!;
    const last = path[path.length - 1];
    if (!last || Math.hypot(m.x - last.x, m.y - last.y) >= 2) path.push({ x: m.x, y: m.y });
    if (path.length > 40) path.shift();
    s.tail?.forEach((img, i) => {
      const q = path[Math.max(0, path.length - 1 - (i + 1) * 3)] ?? { x: m.x, y: m.y };
      img.setPosition(q.x, q.y - 3).setDepth(q.y - 0.1).setVisible(!m.hidden);
    });
    // 감기 → 끌어당기기
    if (s.grabUntil !== undefined && now < s.grabUntil) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd > 10) H.movePlayer((dx / dd) * 95 * dt, (dy / dd) * 95 * dt);
      // 감긴 랜선 (구불구불한 줄)
      const n = Math.max(3, Math.floor(dd / 3));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const w = Math.sin(t * Math.PI * 4 + now / 60) * 2 * Math.sin(t * Math.PI);
        this.fxG.fillStyle(k % 3 ? 0x3a7ad8 : 0x7ab0f0, 1).fillRect(p.x + dx * t - dy / dd * w - 1, p.y - 6 + dy * t + dx / dd * w - 1, 2, 2);
      }
      return;
    }
    if (s.grabAt !== undefined) {
      if (now >= s.grabAt) {
        s.grabAt = undefined;
        if (d < 26 && !m.hidden) {
          s.grabUntil = now + 520;
          s.grabReady = now + 3800;
          H.strike(m, 0.7);
          H.float(p.x, p.y - 30, "감겼다!", "#7ab0f0");
          this.snd("grab");
        } else s.grabReady = now + 900;
      }
      return;
    }
    if (d < MONSTERS[m.id].size / 2 + 9 && now >= (s.grabReady ?? 0) && now >= m.stunUntil) {
      s.grabAt = now + 200;
      m.windUntil = now + 200;
    }
  }

  private tickCam(m: ThemeMon, s: St, now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    const ang = (s.base ?? 0) + Math.sin(now / 1300 + s.phase) * 0.95;
    const len = 112;
    const half = 0.3;
    const ox = m.x + 4;
    const oy = m.y - 8;
    const pa = Math.atan2(p.y - oy, p.x - ox);
    const pd = Math.hypot(p.x - ox, p.y - oy);
    const seen = pd < len && Math.abs(Phaser.Math.Angle.Wrap(pa - ang)) < half && !m.hidden;
    s.seen = seen ? (s.seen ?? 0) + dt : Math.max(0, (s.seen ?? 0) - dt * 2);
    const hot = (s.seen ?? 0) > 0.05;
    const g = this.coneG;
    g.fillStyle(hot ? 0xff3a2a : 0xfff0b0, hot ? 0.18 + (s.seen ?? 0) * 0.3 : 0.1);
    g.beginPath().moveTo(ox, oy).arc(ox, oy, len, ang - half, ang + half).closePath().fillPath();
    g.lineStyle(1, hot ? 0xff5a4a : 0xfff0b0, hot ? 0.8 : 0.35);
    g.beginPath().moveTo(ox, oy).arc(ox, oy, len, ang - half, ang + half).closePath().strokePath();
    if ((s.seen ?? 0) >= 0.45 && now >= (s.alarmReady ?? 0)) {
      s.alarmReady = now + 7000;
      s.seen = 0;
      this.snd("alarm");
      H.flash("보안 카메라에 들켰어요! 주변 몬스터가 날뛰어요", 1500);
      H.float(m.x, m.y - 22, "!", "#ff4a3a");
      for (const o of H.mons()) {
        if (!o.alive || o.boss || o === m || o.id === "sv_security_cam" || Math.hypot(o.x - m.x, o.y - m.y) > 150) continue;
        const os = this.s(o);
        if (os.enrageUntil === undefined) os.baseSpeed = o.st.speed;
        o.st.speed = (os.baseSpeed ?? o.st.speed) * 1.55;
        os.enrageUntil = now + 4000;
        H.float(o.x, o.y - MONSTERS[o.id].size - 6, "!", "#ff6a4a");
      }
    }
  }

  /** 레거시 시스템: 코드 조각 탄막 → (66%) 바닥 회로 전류 → (30%) 전체 재부팅 + 안전 구역 */
  private tickBoss(m: ThemeMon, s: St, now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    const ratio = m.hp / m.st.maxHp;
    const stage = ratio <= SV_BOSS_REBOOT ? 2 : ratio <= SV_BOSS_CIRCUIT ? 1 : 0;
    // 1단계부터: 회전하는 코드 조각 탄막 (세 갈래 소용돌이)
    if (!s.spiral && now >= (s.spiralAt ?? 0) && !s.wave) {
      s.spiral = { t0: now + 420, n: 0, base: this.rnd() * Math.PI * 2 };
      s.spiralAt = now + [2600, 4200, 5200][stage];
      m.windUntil = now + 420;
    }
    if (s.spiral && now >= s.spiral.t0 + s.spiral.n * 110) {
      const k = s.spiral.n++;
      const arms = stage === 0 ? 3 : 4;
      for (let a = 0; a < arms; a++) H.shoot(m, s.spiral.base + (a * Math.PI * 2) / arms + k * 0.23, 72, 0.42, T.code((k + a) % 3));
      if (k % 3 === 0) H.sfx("flick", 0.35);
      if (s.spiral.n >= 8) s.spiral = undefined;
    }
    // 2단계부터: 바닥 회로 두 줄에 전류 (1.1초 경고)
    if (stage >= 1 && now >= (s.circuitAt ?? 0)) {
      s.circuitAt = now + (stage === 1 ? 4600 : 6200);
      const lines: { hor: boolean; v: number }[] = [...SV_TRACES.h.map((v) => ({ hor: true, v })), ...SV_TRACES.v.map((v) => ({ hor: false, v }))];
      const near = lines.reduce((b, l) => (Math.abs((l.hor ? p.y : p.x) - l.v) < Math.abs((b.hor ? p.y : p.x) - b.v) ? l : b));
      const other = lines.filter((l) => l !== near)[Math.floor(this.rnd() * (lines.length - 1))];
      for (const l of [near, other]) {
        const shape = { kind: "line" as const, len: l.hor ? AW - SIDE * 2 : AH - TOP - SIDE, width: 14 };
        H.tele.add(shape, l.hor ? SIDE : l.v, l.hor ? l.v : TOP, l.hor ? 0 : Math.PI / 2, now, 1100, () => {
          this.snd("zap");
          H.shake(90, 0.003);
          const len = shape.len;
          for (let k = 0; k < len; k += 16) this.sparks(l.hor ? SIDE + k : l.v, l.hor ? l.v : TOP + k, 2, 0xaaf4ff);
          this.zapLine(l.hor, l.v);
          const pp = H.player();
          if (Math.abs((l.hor ? pp.y : pp.x) - l.v) <= 9 && m.alive) H.strike(m, 1.3);
        }, 0x3ad8ff);
      }
    }
    // 3단계: 전체 재부팅 — 2.6초 동안 방 전체가 붉어지고 초록 안전 구역만 산다
    if (stage === 2 && !s.wave && now >= (s.rebootWaveAt ?? 0)) {
      s.rebootWaveAt = now + 10_000;
      let at = { x: AW / 2, y: AH / 2 };
      for (let k = 0; k < 12; k++) {
        const a = this.rnd() * Math.PI * 2;
        const r = 70 + this.rnd() * 80;
        const q = H.place(Phaser.Math.Clamp(p.x + Math.cos(a) * r, 44, AW - 44), Phaser.Math.Clamp(p.y + Math.sin(a) * r * 0.7, TOP + 40, AH - 44), 14);
        if (Math.hypot(q.x - m.x, q.y - m.y) > 50) {
          at = q;
          break;
        }
      }
      s.wave = { at: now + 2600, x: at.x, y: at.y, r: 26 };
      m.stunUntil = now + 2600;
      H.flash("전체 재부팅! 초록 안전 구역으로!", 2400);
      this.snd("siren");
    }
    if (s.wave) {
      const w = s.wave;
      const left = w.at - now;
      const g = this.fxG;
      const blink = this.host.reduced ? 0.25 : 0.18 + 0.12 * Math.sin(now / 80);
      g.fillStyle(0xff2a1a, blink).fillRect(SIDE, TOP, AW - SIDE * 2, AH - TOP - SIDE);
      g.fillStyle(0x0a1a10, 0.6).fillCircle(w.x, w.y, w.r);
      g.fillStyle(0x3aff6a, 0.35).fillCircle(w.x, w.y, w.r * (1 - Math.max(0, left) / 2600));
      g.lineStyle(2, 0x3aff6a, 1).strokeCircle(w.x, w.y, w.r);
      g.lineStyle(1, 0xd8ffe0, 0.8).strokeCircle(w.x, w.y, w.r + 3 + Math.sin(now / 90) * 2);
      // 안전 구역 위 큰 초읽기 (3·2·1)
      if (!this.countdown) this.countdown = this.keep(this.sc.add.image(w.x, w.y - w.r - 14, T.num(3)).setDepth(1e5).setScale(2));
      this.countdown.setTexture(T.num(Math.max(1, Math.min(3, Math.ceil(left / 870))))).setPosition(w.x, w.y - w.r - 14).setVisible(left > 0);
      // 내 자리에서 안전 구역으로 화살표 점선
      const dd = Math.hypot(w.x - p.x, w.y - p.y);
      if (dd > w.r) for (let k = 6; k < dd - w.r; k += 6) g.fillStyle(0x7aff9a, 0.9).fillRect(p.x + ((w.x - p.x) * k) / dd - 1, p.y - 6 + ((w.y - p.y) * k) / dd - 1, 2, 2);
      if (left <= 0) {
        s.wave = undefined;
        this.snd("reboot");
        this.snd("zap");
        H.shake(300, 0.008);
        this.sc.cameras.main.flash(260, 220, 255, 230);
        if (Math.hypot(p.x - w.x, p.y - w.y) > w.r + 2) {
          H.hurtPct(0.4);
          H.float(p.x, p.y - 34, "재부팅에 휩쓸렸다!", "#ff6a4a");
        } else H.float(p.x, p.y - 34, "안전!", "#7aff9a");
      }
    }
    void dt;
  }

  private zapLine(hor: boolean, v: number): void {
    const g = this.sc.add.graphics().setDepth(D_GLOW).setBlendMode(Phaser.BlendModes.ADD);
    this.objs.push(g);
    const len = hor ? AW - SIDE * 2 : AH - TOP - SIDE;
    let t = 0;
    const draw = () => {
      g.clear();
      for (const [w, col, a] of [
        [6, 0x3ad8ff, 0.35],
        [2, 0xe8fcff, 1],
      ] as const) {
        g.lineStyle(w, col, a * (1 - t));
        g.beginPath();
        for (let k = 0; k <= len; k += 8) {
          const j = (Math.random() - 0.5) * 6;
          const x = hor ? SIDE + k : v + j;
          const y = hor ? v + j : TOP + k;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    };
    draw();
    this.sc.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 600,
      onUpdate: (tw) => {
        t = tw.getValue() ?? 1;
        draw();
      },
      onComplete: () => g.destroy(),
    });
  }

  private sparks(x: number, y: number, n: number, col: number): void {
    for (let i = 0; i < n; i++) {
      const img = this.sc.add.image(x, y, T.spark).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setScale(0.6);
      const a = this.rnd() * Math.PI * 2;
      this.sc.tweens.add({ targets: img, x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 6 - 6, alpha: 0, scale: 0.2, duration: 320 + this.rnd() * 200, onComplete: () => img.destroy() });
    }
  }

  /** 백업 테이프가 되살릴 자리로 풀려 나가는 갈색 테이프 */
  private tapeLine(x0: number, y0: number, x1: number, y1: number): void {
    const g = this.sc.add.graphics().setDepth(1e4);
    this.objs.push(g);
    this.sc.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 800,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 1;
        g.clear().lineStyle(2, 0x8a5a2a, 1 - Math.max(0, t - 0.7) / 0.3);
        g.beginPath().moveTo(x0, y0 - 8);
        for (let k = 1; k <= 12; k++) {
          const u = (k / 12) * Math.min(1, t * 1.4);
          g.lineTo(x0 + (x1 - x0) * u + Math.sin(u * 12) * 3, y0 - 8 + (y1 - y0) * u - Math.sin(u * Math.PI) * 18);
        }
        g.strokePath();
      },
      onComplete: () => g.destroy(),
    });
  }

  /** 복원 빛 기둥 */
  private column(x: number, y: number, col: number): void {
    const img = this.sc.add.image(x, y - 20, T.soft).setDisplaySize(16, 60).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0.9);
    this.sc.tweens.add({ targets: img, alpha: 0, scaleX: 0.02, duration: 600, onComplete: () => img.destroy() });
  }

  /** 화면 테두리: 냉각 실패·내 칸 과열은 붉게, 블루스크린은 파랗게 + 줄 글리치 */
  private tickScreen(now: number): void {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const cx = v.x + v.width / 2;
    const cy = v.y + v.height / 2;
    const failing = now < this.fail.until;
    const warn = this.fail.warned;
    const hot = (this.heat[this.cur] ?? 0) > 0.65 || this.burnUntil[this.cur] > now;
    const red = failing ? 0.4 + 0.25 * Math.sin(now / 160) : warn ? 0.25 + 0.2 * Math.sin(now / 90) : hot ? 0.1 + 0.07 * Math.sin(now / 120) : this.loop.alarm ? 0.08 + 0.06 * Math.sin(now / 400) : 0;
    this.vig.setPosition(cx, cy).setDisplaySize(v.width * 1.05, v.height * 1.05).setAlpha(this.host.reduced ? Math.min(0.35, red) : Math.max(0, red));
    const blue = this.blueUntil > now ? (this.blueUntil - now) / 1000 : 0;
    this.blueVig.setPosition(cx, cy).setDisplaySize(v.width * 1.05, v.height * 1.05).setAlpha(blue * 0.9);
    this.glitch.clear();
    if (blue > 0 && !this.host.reduced)
      for (let k = 0; k < 5; k++) this.glitch.fillStyle(k % 2 ? 0x2a6aff : 0xd8e8ff, 0.18 * blue).fillRect(v.x, v.y + this.rnd() * v.height, v.width, 1 + this.rnd() * 3);
  }

  destroy(): void {
    for (const p of this.mist) p.img.destroy();
    this.mist = [];
    for (const fl of this.flames.values()) for (const img of fl) img.destroy();
    this.flames.clear();
    for (const s of this.st.values()) {
      s.tail?.forEach((t) => t.destroy());
      s.ring?.destroy();
      s.num?.destroy();
    }
    this.st.clear();
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.laters = [];
  }
}

/** 지하 서버실 실행부 만들기 (game/tower/themes 표에 한 줄로) */
export const makeServerRoom = (host: ThemeHost, _zone: string, seed: number): TowerThemeRuntime => new ServerRoomStage(host, seed);
