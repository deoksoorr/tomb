import type * as Phaser from "phaser";
import { CAMP_ARRIVE, CAMP_HEIGHT, CAMP_WIDTH } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { makeCanvas } from "../sprites/pixel";
import * as Art from "./campArt";
import { clampEdges, forEachCampTexture, type CampTexBuild } from "./CampMap";

// 11/15 캠핑장 그림 미리 굽기: 버스를 기다리는 동안·창밖 연출 동안 프레임마다 조금씩(예산 ms) 굽는다.
// 예전엔 캠핑장 장면을 만들 때 그림 120여 장 + 바닥 덩어리 6장(장당 30ms 남짓)을 한 프레임에 몰아 구워
// 창밖 연출이 몇 번씩 멈췄다. 여기서 구워 두면 CampMap은 이미 있는 텍스처를 건너뛴다(tex·makeChunk가 exists를 본다).

const CHUNK = Art.CAMP_CHUNK;

export class CampPrebake {
  private readonly it: Generator<void, void>;
  private finished = false;
  /** 지금까지 쓴 시간 (ms, QA) */
  spent = 0;
  /** 가장 오래 걸린 한 조각 (ms, QA — 예산을 넘는 큰 그림이 있는지) */
  maxJob = 0;
  /** 지금 굽는 것 (QA) */
  private cur = "";
  /** 오래 걸린 조각들 (QA, 최대 12개) */
  readonly slow: string[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    /** 바닥을 먼저 구울 자리 (도착하는 곳) */
    private readonly near: { x: number; y: number } = CAMP_ARRIVE,
  ) {
    this.it = this.steps();
  }

  get done(): boolean {
    return this.finished;
  }

  /** budgetMs 동안만 굽는다. 다 구웠으면 true */
  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const j0 = performance.now();
      const r = this.it.next();
      const dt = performance.now() - j0;
      if (dt > this.maxJob) this.maxJob = dt;
      if (dt > 8 && this.slow.length < 12) this.slow.push(`${this.cur}:${Math.round(dt)}`);
      if (r.done) {
        this.finished = true;
        break;
      }
    }
    this.spent += performance.now() - t0;
    return this.finished;
  }

  /** 남은 것을 지금 다 굽는다 (연출이 먼저 끝났을 때 — 화면이 어두운 순간에) */
  finish(): void {
    while (!this.finished) this.step(1000);
  }

  private *steps(): Generator<void, void> {
    const tex = this.scene.textures;
    const jobs: [string, CampTexBuild, boolean][] = [];
    forEachCampTexture((key, build, linear) => jobs.push([key, build, !!linear]));
    for (const [key, build, linear] of jobs) {
      if (tex.exists(key)) continue;
      this.cur = key;
      const out = build();
      const a: Art.ArtOut = "grid" in out ? out : { grid: out };
      addCanvasTexture(this.scene, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
      yield;
    }
    // 바닥 덩어리: 도착하는 곳에 가까운 것부터, 줄 묶음마다 끊어서
    const chunks: { cx: number; cy: number; d: number }[] = [];
    for (let cy = 0; cy < Math.ceil(CAMP_HEIGHT / CHUNK); cy++)
      for (let cx = 0; cx < Math.ceil(CAMP_WIDTH / CHUNK); cx++) chunks.push({ cx, cy, d: Math.hypot(cx * CHUNK + CHUNK / 2 - this.near.x, cy * CHUNK + CHUNK / 2 - this.near.y) });
    chunks.sort((a, b) => a.d - b.d);
    for (const { cx, cy } of chunks) {
      const key = Art.CAMP_TEX.ground(cx, cy);
      if (tex.exists(key)) continue;
      this.cur = key;
      const g = Art.campGroundSteps(cx, cy, CHUNK, 16);
      let r = g.next();
      while (!r.done) {
        yield;
        r = g.next();
      }
      const { canvas, ctx } = makeCanvas(CHUNK, CHUNK);
      ctx.putImageData(new ImageData(r.value as unknown as Uint8ClampedArray<ArrayBuffer>, CHUNK, CHUNK), 0, 0);
      yield;
      if (!tex.exists(key)) {
        addCanvasTexture(this.scene, key, { canvas });
        clampEdges(this.scene, key);
      }
      yield;
    }
  }
}
