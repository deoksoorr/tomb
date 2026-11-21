import * as Phaser from "phaser";
import type { Arena } from "../rpg/arena/Arena";
import { CTX, ensureChairTextures, EXT_T, WINS } from "./art";
import { ARENA, clampArena, pushOutCovers, WH, WW, type Cover } from "./rules";

// 11/20 회장실 바닥: 사냥터 Arena 대신 HuntScene이 쓰는 것 (그림은 구워 둔 한 장 + 창밖 빛줄기).
// 걸을 수 있는 곳 = 융단 둘레의 판(ARENA) 전체. 가장자리는 벽·책상으로 막혀 판 밖으로 못 나간다.
// 구조물(숨을 곳)도 지나갈 수 없다 (회장님 싸움이 깔고 다시 깐다 — covers()).

/** HuntScene이 지도에서 쓰는 것만 */
export type ArenaLike = Pick<Arena, "start" | "collide" | "place" | "edgePoint" | "steer" | "speedMul" | "shotWind" | "playerVelocity" | "update" | "destroy">;

export class ChairArena implements ArenaLike {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly beams: Phaser.GameObjects.TileSprite[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly covers: () => readonly Cover[],
  ) {
    ensureChairTextures(scene);
    this.objs.push(scene.add.image(0, 0, CTX.room).setOrigin(0, 0).setDepth(-1000));
    // 11/21 폰: 카메라가 판 위·아래로 더 굴러갈 때 보이는 방 밖 (art.ts EXT_T·EXT_B)
    this.objs.push(scene.add.image(0, -EXT_T, CTX.roomUp).setOrigin(0, 0).setDepth(-1000));
    this.objs.push(scene.add.image(0, WH, CTX.roomDown).setOrigin(0, 0).setDepth(-1000));
    // 창밖으로 등대 빛줄기가 지나간다 (창마다 조금씩 늦게)
    for (const [x, y, w, h] of WINS) {
      const t = scene.add.tileSprite(x, y, w, h, CTX.beam).setOrigin(0, 0).setDepth(-990).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
      t.tilePositionX = -x * 3;
      this.beams.push(t);
      this.objs.push(t);
    }
  }

  get start(): { x: number; y: number } {
    return { x: WW / 2 - 40, y: 320 };
  }

  collide(p: { x: number; y: number }, r: number): void {
    pushOutCovers(p, this.covers(), r);
    const q = clampArena(p);
    p.x = q.x;
    p.y = q.y;
  }

  place(x: number, y: number, r: number): { x: number; y: number } {
    const p = clampArena({ x, y }, r);
    pushOutCovers(p, this.covers(), r);
    return p;
  }

  edgePoint(px: number, py: number): { x: number; y: number } {
    return { x: px < WW / 2 ? ARENA.x1 - 20 : ARENA.x0 + 20, y: py < (ARENA.y0 + ARENA.y1) / 2 ? ARENA.y1 - 20 : ARENA.y0 + 20 };
  }

  steer(_x: number, _y: number, mx: number, my: number): { x: number; y: number } {
    return { x: mx, y: my };
  }

  speedMul(): number {
    return 1;
  }

  shotWind(): number {
    return 0;
  }

  playerVelocity(wx: number, wy: number): { x: number; y: number } {
    return { x: wx, y: wy };
  }

  update(_now: number, dt: number): void {
    for (const b of this.beams) b.tilePositionX -= dt * 50;
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.beams.length = 0;
  }
}
