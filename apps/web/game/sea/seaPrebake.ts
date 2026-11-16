import type * as Phaser from "phaser";
import { SEA_ARRIVE, SEA_HEIGHT, SEA_WIDTH } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { makeCanvas } from "../sprites/pixel";
import * as Art from "./seaArt";
import { clampEdges, forEachSeaTexture, type SeaTexBuild } from "./SeaMap";

// 11/16 바닷가 그림 미리 굽기 (캠핑장 campPrebake와 같은 틀): 버스를 기다리는 동안·창밖 연출 동안 프레임마다 조금씩(예산 ms) 구워요.
// 여기서 구워 두면 SeaMap은 이미 있는 텍스처를 건너뛰어요 (tex·makeChunk가 exists를 봐요).

const CHUNK = Art.SEA_CHUNK;

export class SeaPrebake {
  private readonly it: Generator<void, void>;
  private finished = false;
  /** 지금까지 쓴 시간 (ms, QA) */
  spent = 0;
  /** 가장 오래 걸린 한 조각 (ms, QA) */
  maxJob = 0;
  private readonly fresh: string[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    /** 바닥을 먼저 구울 자리 (도착하는 곳) */
    private readonly near: { x: number; y: number } = SEA_ARRIVE,
  ) {
    this.it = this.steps();
  }

  get done(): boolean {
    return this.finished;
  }

  /** budgetMs 동안만 구워요. 다 구웠으면 true */
  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const j0 = performance.now();
      const r = this.it.next();
      this.maxJob = Math.max(this.maxJob, performance.now() - j0);
      if (r.done) {
        this.finished = true;
        break;
      }
    }
    this.spent += performance.now() - t0;
    return this.finished;
  }

  /** 새로 올린 텍스처 키를 꺼내요 (꺼내면 비어요) */
  takeFresh(): string[] {
    return this.fresh.splice(0);
  }

  /** 남은 것을 지금 다 구워요 (연출이 먼저 끝났을 때 — 화면이 어두운 순간에) */
  finish(): void {
    while (!this.finished) this.step(1000);
  }

  private *steps(): Generator<void, void> {
    const tex = this.scene.textures;
    const jobs: [string, SeaTexBuild, boolean][] = [];
    forEachSeaTexture((key, build, linear) => jobs.push([key, build, !!linear]));
    for (const [key, build, linear] of jobs) {
      if (tex.exists(key)) continue;
      const out = build();
      const a: Art.ArtOut = "grid" in out ? out : { grid: out };
      addCanvasTexture(this.scene, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
      this.fresh.push(key);
      yield;
    }
    // 바닥 덩어리: 도착하는 곳에 가까운 것부터, 줄 묶음마다 끊어서
    const chunks: { cx: number; cy: number; d: number }[] = [];
    for (let cy = 0; cy < Math.ceil(SEA_HEIGHT / CHUNK); cy++)
      for (let cx = 0; cx < Math.ceil(SEA_WIDTH / CHUNK); cx++) chunks.push({ cx, cy, d: Math.hypot(cx * CHUNK + CHUNK / 2 - this.near.x, cy * CHUNK + CHUNK / 2 - this.near.y) });
    chunks.sort((a, b) => a.d - b.d);
    for (const { cx, cy } of chunks) {
      const key = Art.SEA_TEX.ground(cx, cy);
      if (tex.exists(key)) continue;
      const g = Art.seaGroundSteps(cx, cy, CHUNK, 16);
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
        this.fresh.push(key);
      }
      yield;
    }
  }
}
