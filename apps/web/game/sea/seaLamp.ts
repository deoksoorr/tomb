import * as Phaser from "phaser";
import { SEA_LIGHTHOUSE } from "@tomb/protocol";
import { request } from "@/lib/api";
import { DEPTH } from "../config";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { PLATE_WOOD, SignPlate } from "../world/SignPlate";
import { SEA_LIGHTHOUSE_LAMP } from "./seaLayout";
import { SEA_TEX_PREFIX } from "./seaTypes";

// 11/16 달물결 포구 등대 등불 (Task B). 해가 진 뒤 채널마다 그날 처음 켠 사람이 「오늘의 등대지기」 (서버 lib/sea/lamp.ts).
//  - 켜지기 전 밤에는 등대가 어두워요 (SeaMap.lampLit = false. 안개 낀 날 스스로 켜지는 불은 그대로)
//  - 켜지면 등실에서 빛줄기가 빙글빙글 돌고, 등대 위에 「오늘의 등대지기 ○○」 팻말이 서요
//  - 상태는 맵에 들어올 때 GET 한 번 (CDN 10초), 누가 켜면 그 사람이 act "lamp"를 보내 같은 바닷가 사람들이 새로 받아요

export type LampResponse = { ch: number; day: string; name: string | null };
export type LampLightResponse = LampResponse & { lit: boolean; stamps?: number };

export const lampApi = {
  get: (ch: number, fresh = false) =>
    request<LampResponse>(fresh ? `/api/sea/lamp?ch=${ch}&t=${Date.now()}` : `/api/sea/lamp?ch=${ch}`, fresh ? { cache: "no-store" } : undefined),
  light: (ch: number, force = false) =>
    request<LampLightResponse>("/api/sea/lamp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(force ? { ch, force } : { ch }) }),
};

/** 해가 진 뒤인가 (서버 lampHour와 같은 규칙: 한국 시각 17:30 ~ 새벽 5시) */
export const lampHourOf = (hour: number) => hour >= 17.5 || hour < 5;

const BEAM_KEY = `${SEA_TEX_PREFIX}lampBeam`;
const BEAM_LEN = 220;
const BEAM_W = 70;
/** 한 바퀴 (ms) */
const BEAM_TURN_MS = 7000;

/** 빛줄기 그림: 등실에서 오른쪽으로 퍼지는 부채꼴 (가운데가 밝고 끝으로 갈수록 흐려요) */
function beamCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = BEAM_LEN;
  c.height = BEAM_W;
  const ctx = c.getContext("2d")!;
  const mid = BEAM_W / 2;
  const grad = ctx.createLinearGradient(0, 0, BEAM_LEN, 0);
  grad.addColorStop(0, "rgba(255,246,210,0)");
  grad.addColorStop(0.08, "rgba(255,246,210,0.8)");
  grad.addColorStop(0.4, "rgba(255,240,190,0.4)");
  grad.addColorStop(1, "rgba(255,236,180,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, mid - 2);
  ctx.lineTo(BEAM_LEN, 0);
  ctx.lineTo(BEAM_LEN, BEAM_W);
  ctx.lineTo(0, mid + 2);
  ctx.closePath();
  ctx.fill();
  // 옆 가장자리를 부드럽게 (위아래로 갈수록 투명)
  const img = ctx.getImageData(0, 0, BEAM_LEN, BEAM_W);
  for (let y = 0; y < BEAM_W; y++) {
    const k = 1 - Math.abs(y - mid) / mid;
    for (let x = 0; x < BEAM_LEN; x++) img.data[(y * BEAM_LEN + x) * 4 + 3] *= Math.min(1, k * 1.6);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class SeaLamp {
  /** 오늘 켠 사람 (없으면 null) */
  name: string | null = null;
  private day = "";
  private readonly beam: Phaser.GameObjects.Image;
  private readonly beam2: Phaser.GameObjects.Image;
  private plate: SignPlate | null = null;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly reduced: boolean,
  ) {
    if (!scene.textures.exists(BEAM_KEY)) scene.textures.addCanvas(BEAM_KEY, beamCanvas());
    const L = SEA_LIGHTHOUSE_LAMP;
    this.beam = scene.add.image(L.x, L.y, BEAM_KEY).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 3).setAlpha(0);
    this.beam2 = scene.add.image(L.x, L.y, BEAM_KEY).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 3).setAlpha(0);
  }

  /** 서버 상태 반영 (날이 바뀌면 꺼져요) */
  set(r: LampResponse): void {
    if (this.destroyed) return;
    this.day = r.day;
    if (r.name === this.name && this.plate) return;
    this.name = r.name;
    this.plate?.destroy();
    this.plate = null;
    if (r.name) {
      const L = SEA_LIGHTHOUSE_LAMP;
      this.plate = new SignPlate(this.scene, this.atlas, SEA_LIGHTHOUSE.x, L.y - 36, `오늘의 등대지기\n${r.name}`, PLATE_WOOD, DEPTH.labels - 3, false);
    }
  }

  get lit(): boolean {
    return !!this.name;
  }

  get today(): string {
    return this.day;
  }

  /** 매 프레임: on = 어둠 정도 0..1 (켜졌을 때만 빛줄기), s = 이름표 크기 (1/zoom) */
  update(time: number, on: number, s: number): void {
    if (this.destroyed) return;
    this.plate?.setScale(s);
    const a = this.lit ? on : 0;
    if (a <= 0.01) {
      this.beam.setAlpha(0);
      this.beam2.setAlpha(0);
      return;
    }
    // 동작 줄이기: 돌지 않고 바다 쪽(아래)으로 은은하게
    const ang = this.reduced ? Math.PI * 0.62 : ((time % BEAM_TURN_MS) / BEAM_TURN_MS) * Math.PI * 2;
    // 위에서 비스듬히 내려다본 맵이라 세로로 납작한 원을 돌아요
    const dx = Math.cos(ang);
    const dy = Math.sin(ang) * 0.45;
    const rot = Math.atan2(dy, dx);
    const len = Math.hypot(dx, dy);
    this.beam.setRotation(rot).setScale(0.55 + 0.45 * len, 0.8).setAlpha(a * 0.26);
    this.beam2.setRotation(rot + Math.PI).setScale(0.55 + 0.45 * len, 0.8).setAlpha(a * 0.26);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.beam.destroy();
    this.beam2.destroy();
    this.plate?.destroy();
    this.plate = null;
  }
}
