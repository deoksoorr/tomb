import { chunkRgba, chunkSpots, DYE_BOARD_H, DYE_BOARD_W, type DyeBoard, type DyeSpot } from "@/lib/dye/palette";
import { tileKeep, type TileNeed } from "./board";
import type { TileDone, TileJob } from "./tileWorker";

// 11/22 염색 판 타일 창고 (운영자 보고: 판을 옮길 때 끊기고, 새로 보이는 가장자리가 잠깐 검게 나왔다).
// - 구역 그림은 일꾼(Web Worker)이 계산한다 → 화면 스레드는 받은 그림을 캔버스에 올리기만 (한 장 ~0.3ms)
// - 보이는 구역은 거친 그림(1/8)부터 → 곧 선명한 그림. 둘레는 미리 그려 둔다 (board.ts tilePlan 순서)
// - 일꾼마다 한 번에 하나씩만 맡긴다 → 화면이 움직이면 다음 일은 새 순서로 고른다 (지나간 자리는 그리지 않는다)
// - 일꾼을 못 쓰는 브라우저는 화면 스레드에서 프레임마다 조금씩 (거친 그림은 바로, 선명한 그림은 한 프레임에 하나)

type Tile = { low?: HTMLCanvasElement; full?: HTMLCanvasElement; spots?: DyeSpot[]; used: number };

/** 거친 타일 (한 장 4KB) — 선명한 타일 상한은 기기마다 (board.ts tileKeep) */
const LOW_KEEP = 400;

/** 캔버스 그림 메모리를 바로 놓는다 */
function release(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}

function makeCanvas(w: number, h: number, data: Uint8ClampedArray): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return c;
}

export class DyeTiles {
  private tiles = new Map<string, Tile>();
  private busy = new Set<string>();
  private workers: { w: Worker; job: string | null }[] = [];
  private plan: TileNeed[] = [];
  private frame = 0;
  private dead = false;
  /** 선명한 타일 상한 (기기 메모리·화면 크기 — board.ts tileKeep) */
  readonly keep: number;

  constructor(
    private board: DyeBoard,
    /** 타일이 새로 들어왔을 때 (다시 그리기 알림 — 없어도 된다) */
    private onTile?: () => void,
  ) {
    const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number });
    const scr = typeof screen === "undefined" ? undefined : screen;
    this.keep = tileKeep(nav?.deviceMemory, scr?.width ?? 0, scr?.height ?? 0);
    if (typeof Worker === "undefined") return;
    const n = (navigator.hardwareConcurrency ?? 2) >= 4 ? 2 : 1;
    try {
      for (let k = 0; k < n; k++) {
        const w = new Worker(new URL("./tileWorker.ts", import.meta.url), { type: "module" });
        const slot = { w, job: null as string | null };
        w.onmessage = (e: MessageEvent<TileDone>) => {
          slot.job = null;
          this.accept(e.data);
          this.pump();
        };
        w.onerror = () => {
          // 일꾼이 죽으면 그 일꾼은 빼고 화면 스레드로 (판은 계속 그려진다)
          if (slot.job) this.busy.delete(slot.job);
          w.terminate();
          this.workers = this.workers.filter((s) => s !== slot);
        };
        this.workers.push(slot);
      }
    } catch {
      this.workers = [];
    }
  }

  get workerCount(): number {
    return this.workers.length;
  }

  private key(i: number, j: number) {
    return `${i},${j}`;
  }

  private jobKey(t: TileNeed) {
    return `${t.i},${t.j},${t.step}`;
  }

  private has(t: TileNeed): boolean {
    const e = this.tiles.get(this.key(t.i, t.j));
    return !!(t.step === 1 ? e?.full : e?.low ?? e?.full);
  }

  private accept(d: TileDone) {
    this.busy.delete(this.jobKey(d));
    if (this.dead || d.seed !== this.board.seed || d.tier !== this.board.tier) return;
    this.put(d.i, d.j, d.step, d.w, d.h, new Uint8ClampedArray(d.buf), d.spots);
  }

  private put(i: number, j: number, step: number, w: number, h: number, px: Uint8ClampedArray, spots: DyeSpot[]) {
    const c = makeCanvas(w, h, px);
    if (!c) return;
    const k = this.key(i, j);
    const e = this.tiles.get(k) ?? { used: this.frame };
    if (step === 1) e.full = c;
    else e.low = c;
    e.spots = spots;
    this.tiles.set(k, e);
    this.trim();
    this.onTile?.();
  }

  /** 오래 안 쓴 타일부터 버린다 (지금 순서에 든 그림은 남긴다 — 순서의 선명한 그림은 keep 장을 넘지 않는다) */
  private trim() {
    let full = 0;
    let low = 0;
    for (const e of this.tiles.values()) {
      if (e.full) full++;
      if (e.low) low++;
    }
    if (full <= this.keep && low <= LOW_KEEP) return;
    const wantFull = new Set<string>();
    const wantLow = new Set<string>();
    for (const t of this.plan) (t.step === 1 ? wantFull : wantLow).add(this.key(t.i, t.j));
    const old = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of old) {
      if (full <= this.keep && low <= LOW_KEEP) break;
      if (full > this.keep && e.full && !wantFull.has(k)) {
        release(e.full);
        e.full = undefined;
        full--;
      }
      if (low > LOW_KEEP && e.low && !wantLow.has(k)) {
        release(e.low);
        e.low = undefined;
        low--;
      }
      if (!e.full && !e.low) this.tiles.delete(k);
    }
  }

  /** 지금 들고 있는 그림 수 (측정·시험용) */
  get counts(): { full: number; low: number; workers: number } {
    let full = 0;
    let low = 0;
    for (const e of this.tiles.values()) {
      if (e.full) full++;
      if (e.low) low++;
    }
    return { full, low, workers: this.workers.length };
  }

  /** 다음에 맡길 일 (순서대로, 없거나 이미 맡긴 것은 건너뛴다) */
  private next(): TileNeed | null {
    for (const t of this.plan) if (!this.has(t) && !this.busy.has(this.jobKey(t))) return t;
    return null;
  }

  private pump() {
    if (this.dead) return;
    for (const slot of this.workers) {
      if (slot.job) continue;
      const t = this.next();
      if (!t) return;
      const job: TileJob = { seed: this.board.seed, tier: this.board.tier, i: t.i, j: t.j, step: t.step };
      slot.job = this.jobKey(t);
      this.busy.add(slot.job);
      slot.w.postMessage(job);
    }
  }

  /**
   * 프레임마다: 지금 화면의 그릴 순서를 받는다 (board.ts tilePlan). 일꾼이 없으면 여기서 조금씩 계산한다
   * (거친 그림은 보이는 구역 것을 바로, 선명한 그림은 한 프레임에 하나)
   */
  update(plan: TileNeed[], visible: (t: TileNeed) => boolean): void {
    this.frame++;
    this.plan = plan;
    if (this.workers.length) {
      this.pump();
      return;
    }
    let fullBudget = 1;
    for (const t of plan) {
      if (this.has(t)) continue;
      if (t.step !== 1 && visible(t)) this.local(t);
      else if (t.step === 1 && fullBudget > 0) {
        fullBudget--;
        this.local(t);
      }
    }
  }

  private local(t: TileNeed) {
    const px = chunkRgba(this.board, t.i, t.j, t.step);
    this.put(t.i, t.j, t.step, Math.ceil(DYE_BOARD_W / t.step), Math.ceil(DYE_BOARD_H / t.step), px, chunkSpots(this.board, t.i, t.j));
  }

  /** 그릴 그림: 선명한 것, 없으면 거친 것 (없으면 null) */
  get(i: number, j: number): { canvas: HTMLCanvasElement; sharp: boolean; spots: DyeSpot[] } | null {
    const e = this.tiles.get(this.key(i, j));
    if (!e) return null;
    e.used = this.frame;
    const c = e.full ?? e.low;
    return c ? { canvas: c, sharp: !!e.full, spots: e.spots ?? [] } : null;
  }

  /** 판을 닫음: 일꾼을 끝내고 그림을 모두 놓는다 (캔버스 크기를 0으로 — 사파리가 그림 메모리를 바로 돌려주게) */
  dispose(): void {
    this.dead = true;
    for (const s of this.workers) s.w.terminate();
    this.workers = [];
    for (const e of this.tiles.values()) {
      if (e.full) release(e.full);
      if (e.low) release(e.low);
    }
    this.tiles.clear();
    this.busy.clear();
    this.plan = [];
  }
}

