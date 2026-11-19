import * as Phaser from "phaser";
import { shakeEnabled } from "@/lib/shakePref";

// 11/17 쓰러졌다 다시 일어나는 연출 (무한 야근 카드·부활 쿠키, 세트 장비 「연차」는 짧은 판).
//  쓰러짐(0.6초, 화면이 흑백 쪽으로 바랜다) → 「카드 발동」 표시가 크게 → 빛 기둥·고리와 함께 일어남 → 이어서 (1.5초 무적은 HuntScene이)
// 연출하는 동안 HuntScene은 게임 시간을 흘리지 않는다 (몬스터·판 시간·층 제한 시간이 멈춘다, 입력도 받지 않는다).
// 시간은 실시간 ms로 쌓는다 (멈춤 메뉴가 열려 있으면 HuntScene이 update를 부르지 않는다). 단계 계산은 순수 함수 (reviveCut.test.ts)

export type DownKind = "card" | "cookie" | "vacation";

export type DownPlan = { fall: number; card: number; rise: number; total: number };

/** 단계 길이 (ms). 연차는 짧은 판: 무릎 꿇었다 바로 (0.4초) */
export function downPlan(kind: DownKind): DownPlan {
  const p = kind === "vacation" ? { fall: 250, card: 0, rise: 150 } : { fall: 600, card: 650, rise: 450 };
  return { ...p, total: p.fall + p.card + p.rise };
}

/** 일어난 뒤 무적 (게임 시간) */
export const REVIVE_INVULN_MS = 1500;

export type DownStage = "fall" | "card" | "rise" | "done";

/** t(ms)가 어느 단계인지와 그 단계 안 진행(0..1) */
export function downStage(plan: DownPlan, t: number): { stage: DownStage; k: number } {
  if (t < plan.fall) return { stage: "fall", k: Math.max(0, t) / plan.fall };
  if (t < plan.fall + plan.card) return { stage: "card", k: (t - plan.fall) / plan.card };
  if (t < plan.total) return { stage: "rise", k: (t - plan.fall - plan.card) / plan.rise };
  return { stage: "done", k: 1 };
}

/** 쓰러진 각도·흑백 정도 (지금 단계 기준). 연차는 반쯤만 기운다 */
export function downPose(kind: DownKind, s: { stage: DownStage; k: number }): { angle: number; gray: number; drop: number } {
  const full = kind !== "vacation";
  const maxA = full ? 90 : 32;
  const maxG = full ? 0.9 : 0.55;
  const down = (v: number) => {
    // 쓰러짐: 처음엔 천천히, 바닥에 닿을 때 살짝 튄다
    if (s.stage === "fall") {
      const k = s.k;
      const e = k < 0.8 ? (k / 0.8) ** 2 : 1 - Math.sin(((k - 0.8) / 0.2) * Math.PI) * 0.08;
      return v * e;
    }
    if (s.stage === "card") return v;
    if (s.stage === "rise") return v * (1 - (1 - (1 - s.k) ** 2));
    return 0;
  };
  const g = s.stage === "fall" ? maxG * s.k : s.stage === "card" ? maxG : s.stage === "rise" ? maxG * (1 - s.k) : 0;
  return { angle: down(maxA), gray: g, drop: down(full ? 3 : 1) };
}

const BEAM = "rpg-revive-beam";

/** 빛 기둥 그림 (가운데가 밝고 위로 갈수록 사라진다) */
function ensureBeam(scene: Phaser.Scene): void {
  if (scene.textures.exists(BEAM) || typeof document === "undefined") return;
  const cv = document.createElement("canvas");
  cv.width = 16;
  cv.height = 96;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) return;
  for (let x = 0; x < 16; x++) {
    const a = Math.max(0, 1 - Math.abs(x - 7.5) / 8) ** 1.6;
    const g = c.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.55, `rgba(255,255,255,${(a * 0.7).toFixed(3)})`);
    g.addColorStop(1, `rgba(255,255,255,${a.toFixed(3)})`);
    c.fillStyle = g;
    c.fillRect(x, 0, 1, 96);
  }
  scene.textures.addCanvas(BEAM, cv);
}

export type DownCutOpts = {
  kind: DownKind;
  /** 쓰러지는 쪽 (보던 쪽이 왼쪽이면 -1) */
  side: -1 | 1;
  reduced: boolean;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  /** 빛 기둥·고리 색 */
  color: number;
  /** 쓰러진 뒤 (발동 표시) */
  onCard(): void;
  /** 일어나기 시작할 때 (밀어내기·고리·소리) */
  onRise(): void;
  /** 끝 (체력·무적·글) */
  onDone(): void;
};

export class DownCut {
  readonly plan: DownPlan;
  private t = 0;
  private cardDone = false;
  private riseDone = false;
  private over = false;
  private cm: Phaser.FX.ColorMatrix | null = null;
  private veil: Phaser.GameObjects.Rectangle | null = null;
  private beam: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: DownCutOpts,
  ) {
    this.plan = downPlan(o.kind);
    const cam = scene.cameras.main;
    // 흑백: 카메라 색 행렬 (WebGL). 없으면 어두운 막만
    try {
      this.cm = cam.postFX?.addColorMatrix() ?? null;
    } catch {
      this.cm = null;
    }
    this.veil = scene.add
      .rectangle(0, 0, cam.width, cam.height, 0x0a0b12, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(9e5);
    // 줌을 쓰는 카메라라 화면 크기 막은 줌 역수만큼 키운다
    this.veil.setScale(1 / cam.zoom).setPosition(cam.width * 0.5 * (1 - 1 / cam.zoom), cam.height * 0.5 * (1 - 1 / cam.zoom));
    if (!o.reduced && shakeEnabled()) cam.shake(140, 0.004);
    this.apply();
  }

  /** 실시간 ms만큼 흘린다. 끝났으면 false */
  update(dtMs: number): boolean {
    if (this.over) return false;
    this.t += dtMs;
    this.apply();
    return !this.over;
  }

  private apply(): void {
    const s = downStage(this.plan, this.t);
    const pose = downPose(this.o.kind, s);
    if (s.stage !== "fall" && !this.cardDone) {
      this.cardDone = true;
      this.o.onCard();
    }
    if ((s.stage === "rise" || s.stage === "done") && !this.riseDone) {
      this.riseDone = true;
      this.startRise();
      this.o.onRise();
    }
    const sp = this.o.sprite;
    // 몬스터에 가려 쓰러지는 모습이 안 보이지 않게 위로 (일어나면 HuntScene이 다시 y 순서로)
    sp.setAngle(this.o.side * pose.angle).setPosition(Math.round(this.o.x), Math.round(this.o.y + pose.drop)).setDepth(this.o.y + 40);
    if (this.cm) {
      this.cm.reset();
      this.cm.grayscale(pose.gray);
      this.cm.brightness(1 - pose.gray * 0.22, true);
    }
    this.veil?.setFillStyle(0x0a0b12, (this.cm ? 0.12 : 0.4) * (pose.gray / 0.9));
    if (this.beam && s.stage === "rise") {
      const k = s.k;
      this.beam.setScale(0.4 + 1.4 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (1 - k * 0.6), 1).setAlpha(k < 0.7 ? 0.95 : 0.95 * (1 - (k - 0.7) / 0.3));
    }
    if (s.stage === "done") this.end();
  }

  /** 일어남: 발밑에서 빛 기둥 */
  private startRise(): void {
    ensureBeam(this.scene);
    if (!this.scene.textures.exists(BEAM)) return;
    this.beam = this.scene.add
      .image(this.o.x, this.o.y + 2, BEAM)
      .setOrigin(0.5, 1)
      .setTint(this.o.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.o.y + 1)
      .setScale(0.4, 1)
      .setAlpha(0.95);
    if (!this.o.reduced && shakeEnabled()) this.scene.cameras.main.shake(this.o.kind === "vacation" ? 90 : 200, 0.005);
  }

  private end(): void {
    if (this.over) return;
    this.over = true;
    this.o.sprite.setAngle(0);
    this.destroy();
    this.o.onDone();
  }

  destroy(): void {
    this.over = true;
    if (this.cm) {
      try {
        // 타입 선언은 ColorMatrix를 Controller로 안 보지만 실제로는 Controller다
        this.scene.cameras.main?.postFX?.remove(this.cm as unknown as Phaser.FX.Controller);
      } catch {
        // 씬이 이미 닫혔다
      }
      this.cm = null;
    }
    this.veil?.destroy();
    this.veil = null;
    this.beam?.destroy();
    this.beam = null;
  }
}
