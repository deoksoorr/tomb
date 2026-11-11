import { DIR, WALK_SPEED, type DirId } from "@tomb/protocol";
import { AV_ANIM, AV_COLS, AV_H, AV_W, BODY_METRICS, bodyOf, buildAvatarSheet, lookKey } from "@/game/sprites/avatar";
import * as fx from "@/game/sprites/fx";
import { grassTile } from "@/game/sprites/ground";
import { css, makeCanvas, type Color } from "@/game/sprites/pixel";

// 상점 "입어 보기" 무대: 게임과 같은 아바타 시트·꾸미기 그림을 캔버스 2D로 그린다 (Phaser 없이).
// 위치·흔들림 공식은 AvatarView.syncCosmetics를 그대로 옮겼다 (날개 파닥임, 유령 친구 따라오기·둥실,
// 발자국 꽃, 안개, 반딧불, 후광 빛). 걷기는 제자리걸음: 아바타는 가운데 두고 바닥과 꽃이 뒤로 흐른다.

/** 무대 크기 (논리 px). 화면에는 정수 배율로 키운다 */
export const STAGE_W = 72;
export const STAGE_H = 64;
/** 아바타 발바닥 자리 */
const FX = 36;
const FY = 44;

// AvatarView와 같은 값
const FLOWER_POOL = 12;
const FLOWER_STEP = 10;
const FLOWER_MS = 3000;
const PET_LAG_MS = 240;

export type StagePose = { dir: DirId; walking: boolean };
export type StageLook = { color: string; body: string; look: readonly string[] };

type Flower = { x: number; y: number; frame: number; born: number };

type Art = {
  ground: HTMLCanvasElement;
  wings: HTMLCanvasElement;
  pet: HTMLCanvasElement;
  flower: HTMLCanvasElement;
  firefly: HTMLCanvasElement;
  fog: HTMLCanvasElement;
  halo: HTMLCanvasElement;
};

let art: Art | null = null;

/** 흰 빛을 색으로 물들인다 (Phaser setTint와 같은 곱하기 결과) */
function tinted(src: HTMLCanvasElement, color: Color): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, src.width, src.height);
  return canvas;
}

function getArt(): Art {
  if (art) return art;
  // 바닥: 풀밭 타일 4×4칸 (64×64)을 이어 붙여 흐르게 한다
  const { canvas: ground, ctx } = makeCanvas(64, 64);
  const tiles = [1, 2, 3, 4, 5, 6].map((i) => grassTile(100 + i));
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) ctx.drawImage(tiles[(tx * 7 + ty * 3) % tiles.length], tx * 16, ty * 16);
  const glow = fx.glow();
  art = {
    ground,
    wings: fx.avatarWings(),
    pet: fx.petGhost(),
    flower: fx.footFlower(),
    firefly: fx.firefly(),
    fog: tinted(glow, 0xa8c8f0),
    halo: tinted(glow, 0xffe27a),
  };
  return art;
}

const sheets = new Map<string, HTMLCanvasElement>();

/** 색·몸·시트 꾸미기 조합마다 한 번만 굽는다 (상점에서 이것저것 눌러 봐도 다시 그리지 않게) */
function sheetFor(l: StageLook): HTMLCanvasElement {
  const key = `${bodyOf(l.body)}|${l.color}|${lookKey(l.look)}`;
  let s = sheets.get(key);
  if (!s) {
    if (sheets.size > 32) sheets.delete(sheets.keys().next().value!);
    s = buildAvatarSheet(l.color, l.look, l.body);
    sheets.set(key, s);
  }
  return s;
}

/** 방향별 걷는 방향 (화면 기준 단위 벡터) */
function heading(dir: DirId): [number, number] {
  return dir === DIR.left ? [-1, 0] : dir === DIR.right ? [1, 0] : dir === DIR.up ? [0, -1] : [0, 1];
}

/** 유령 친구가 머무는 자리: 몸 뒤쪽으로 조금 떨어져서 (AvatarView와 같은 값) */
function petBack(dir: DirId): [number, number] {
  return dir === DIR.left ? [12, -1] : dir === DIR.right ? [-12, -1] : dir === DIR.up ? [7, 5] : [-9, -5];
}

type Sprite = { depth: number; draw: () => void };

/** 무대 하나 (미리보기 컴포넌트마다 하나). 아바타 위치는 가상의 월드 좌표로 움직이고 화면은 아바타를 따라간다 */
export class OutfitStage {
  private ax = 0;
  private ay = 0;
  private petX = 0;
  private petY = 0;
  private walked = 0;
  private flowers: Flower[] = [];
  private flowerNext = 0;
  private last = 0;
  private started = false;

  /**
   * 한 장면을 그린다. now: ms (performance.now), still: 움직임 줄이기 (첫 프레임에 멈춘 그림 + 걷기면 꽃 몇 송이를 미리 깔아 둔다)
   */
  draw(ctx: CanvasRenderingContext2D, now: number, pose: StagePose, l: StageLook, still: boolean): void {
    const a = getArt();
    const { dir, walking } = pose;
    const [hx, hy] = heading(dir);
    const back = petBack(dir);
    const flowersOn = l.look.includes("feet_flowers");

    // ── 시뮬레이션 (AvatarView.sync와 같은 규칙) ──
    if (still) {
      // 멈춘 그림: 걷는 중이면 유령 친구는 따라오느라 조금 뒤처진 자리
      const lag = walking ? (WALK_SPEED * PET_LAG_MS) / 1000 : 0;
      this.ax = 0;
      this.ay = 0;
      this.petX = back[0] - hx * lag;
      this.petY = back[1] - hy * lag;
      this.flowers =
        walking && flowersOn
          ? [1, 2, 3].map((k) => ({ x: -hx * k * FLOWER_STEP + (k % 2 ? 3 : -3), y: -hy * k * FLOWER_STEP - 1, frame: k % 3, born: now }))
          : [];
    } else {
      if (!this.started) {
        this.started = true;
        this.petX = this.ax + back[0];
        this.petY = this.ay + back[1];
      }
      const dt = this.last ? Math.min(100, Math.max(0, now - this.last)) : 16;
      this.last = now;
      if (walking) {
        const step = (WALK_SPEED * dt) / 1000;
        this.ax += hx * step;
        this.ay += hy * step;
        if (flowersOn) {
          this.walked += step;
          if (this.walked >= FLOWER_STEP) {
            this.walked = 0;
            const f: Flower = {
              x: Math.round(this.ax + (Math.random() - 0.5) * 6),
              y: Math.round(this.ay - 1 + (Math.random() - 0.5) * 2),
              frame: Math.floor(Math.random() * 3),
              born: now,
            };
            if (this.flowers.length < FLOWER_POOL) this.flowers.push(f);
            else this.flowers[this.flowerNext] = f;
            this.flowerNext = (this.flowerNext + 1) % FLOWER_POOL;
          }
        }
      } else this.walked = 0;
      if (!flowersOn) this.flowers = [];
      const k = 1 - Math.exp(-dt / PET_LAG_MS);
      this.petX += (this.ax + back[0] - this.petX) * k;
      this.petY += (this.ay + back[1] - this.petY) * k;
      // 숫자가 너무 커지지 않게 가끔 원점으로 되돌린다 (화면은 아바타 기준이라 보이는 그림은 같다)
      if (Math.abs(this.ax) + Math.abs(this.ay) > 4096) this.recenter();
    }

    // 멈춘 그림은 시각 0의 모습
    const t = still ? 0 : now;
    // 월드 → 화면
    const sx = (x: number) => Math.round(x - this.ax + FX);
    const sy = (y: number) => Math.round(y - this.ay + FY);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;

    // ── 바닥 (흐르는 풀밭 + 밤빛) ──
    const gx = ((Math.round(-this.ax) % 64) + 64) % 64;
    const gy = ((Math.round(-this.ay) % 64) + 64) % 64;
    for (let y = gy - 64; y < STAGE_H; y += 64) for (let x = gx - 64; x < STAGE_W; x += 64) ctx.drawImage(a.ground, x, y);
    ctx.fillStyle = "rgba(14, 16, 28, 0.38)";
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // ── 발자국 꽃 (바닥 장식, 3초 뒤 사라진다) ──
    for (const f of this.flowers) {
      const u = still ? 0 : (t - f.born) / FLOWER_MS;
      if (u < 0 || u >= 1) continue;
      ctx.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3;
      ctx.drawImage(a.flower, f.frame * 5, 0, 5, 5, sx(f.x) - 2, sy(f.y) - 2, 5, 5);
    }
    ctx.globalAlpha = 1;

    // ── 깊이 순서대로: 유령 친구·날개·몸·안개 ──
    const sheet = sheetFor(l);
    const anim = walking ? AV_ANIM.walk : AV_ANIM.idle;
    const frame = still ? 0 : Math.floor((t / 1000) * anim.fps) % anim.frames;
    const col = dir * AV_COLS + anim.col + frame;
    const body = bodyOf(l.body);
    const m = BODY_METRICS[body];
    const sprites: Sprite[] = [];
    sprites.push({
      depth: this.ay,
      draw: () =>
        ctx.drawImage(sheet, (col % AV_COLS) * AV_W, Math.floor(col / AV_COLS) * AV_H, AV_W, AV_H, sx(this.ax) - 10, sy(this.ay) - (AV_H - 1), AV_W, AV_H),
    });

    if (l.look.includes("back_wings")) {
      const side = dir === DIR.left || dir === DIR.right;
      const flap = still ? 1 : 1 + 0.16 * Math.sin(t / 150);
      const w = Math.round(26 * flap);
      const cx = sx(this.ax) + (dir === DIR.right ? 2 : dir === DIR.left ? -2 : 0);
      const cy = sy(this.ay) - m.shoulder - 3;
      sprites.push({
        // 뒷모습이면 날개가 앞에 보이고, 나머지는 몸 뒤
        depth: this.ay + (dir === DIR.up ? 0.05 : -0.05),
        draw: () => {
          ctx.save();
          ctx.translate(cx, cy - 6);
          if (dir === DIR.right) ctx.scale(-1, 1);
          ctx.drawImage(a.wings, side ? 26 : 0, 0, 26, 12, -Math.round(w / 2), 0, w, 12);
          ctx.restore();
        },
      });
    }

    if (l.look.includes("pet_ghost")) {
      const bob = still ? 0 : Math.sin(t / 420) * 1.5;
      const px = Math.round(this.petX);
      const py = Math.round(this.petY - 4 + bob);
      const flip = this.petX > this.ax;
      sprites.push({
        depth: this.petY,
        draw: () => {
          ctx.save();
          ctx.globalAlpha = 0.72;
          ctx.translate(sx(px), sy(py));
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(a.pet, -Math.round(a.pet.width / 2), -a.pet.height);
          ctx.restore();
        },
      });
    }

    if (l.look.includes("aura_fog")) {
      sprites.push({
        depth: this.ay + 0.03,
        draw: () => {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          for (let i = 0; i < 3; i++) {
            const ang = t / 1800 + i * 2.1;
            const w = 64 * 0.42;
            const h = 64 * 0.14;
            ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t / 700 + i);
            ctx.drawImage(a.fog, sx(this.ax) + Math.cos(ang) * 6 - w / 2, sy(this.ay) - 1 + Math.sin(ang * 1.4) * 1.5 - h / 2, w, h);
          }
          ctx.restore();
        },
      });
    }

    sprites.sort((p, q) => p.depth - q.depth);
    for (const s of sprites) s.draw();

    // ── 빛 (더하기 섞기): 후광 빛, 반딧불 ──
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const headY = sy(this.ay);
    const bx = sx(this.ax);
    if (l.look.includes("hat_halo")) {
      const size = 64 * 0.28;
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = still ? 0.45 : 0.38 + 0.14 * Math.sin(t / 500);
      ctx.drawImage(a.halo, bx - size / 2, headY - (m.top + 2) + 1 - size / 2, size, size);
      ctx.imageSmoothingEnabled = false;
    }
    if (l.look.includes("aura_firefly")) {
      for (let i = 0; i < 3; i++) {
        const ang = t / 900 + (i * Math.PI * 2) / 3;
        ctx.globalAlpha = still ? 0.9 : 0.45 + 0.55 * Math.max(0, Math.sin(t / 350 + i * 2.1));
        ctx.drawImage(a.firefly, Math.round(bx + Math.cos(ang) * 10) - 2, Math.round(headY - 9 + Math.sin(ang * 1.3) * 5) - 2);
      }
    }
    ctx.restore();
  }

  private recenter(): void {
    const { ax, ay } = this;
    this.ax = 0;
    this.ay = 0;
    this.petX -= ax;
    this.petY -= ay;
    for (const f of this.flowers) {
      f.x -= ax;
      f.y -= ay;
    }
  }
}
