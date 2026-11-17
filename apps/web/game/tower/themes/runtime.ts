import type * as Phaser from "phaser";
import type { MonsterId, ZoneId } from "@/lib/rpg/catalog";
import type { PatternId } from "@/lib/rpg/patterns";
import type { Layer } from "../../rpg/skillSound";
import type { RpgSound } from "../../rpg/sfx";
import type { TelegraphLayer } from "../../rpg/telegraph";
import type { MapConcept } from "@/lib/mapConcept";

// 11/15 야근 빌딩 테마 실행부 연결점: HuntScene이 층마다(테마가 있으면) 하나 만들고, 몇 군데에서만 부른다.
// 테마는 몬스터 행동·피해 배율·쓰러짐 가로채기·플레이어 이동 손질·매 프레임 연출을 맡는다 (지도 그림·충돌은 arena/).

/** HuntScene Mon 중 테마가 읽고 쓰는 것 */
export type ThemeMon = {
  id: MonsterId;
  x: number;
  y: number;
  hp: number;
  st: { maxHp: number; speed: number; atk: number };
  alive: boolean;
  hidden: boolean;
  wave: number;
  boss: boolean;
  phase: number;
  elite?: boolean;
  minion?: boolean;
  sprite: Phaser.GameObjects.Sprite;
  stunUntil: number;
  windUntil: number;
  cast: { id: PatternId } | null;
};

/** 씬이 테마에 빌려주는 기능 */
export type ThemeHost = {
  readonly scene: Phaser.Scene;
  readonly tele: TelegraphLayer;
  readonly reduced: boolean;
  /** 11/17 이 판의 맵 컨셉 (겨울·크리스마스 — 그림만 바꾼다) */
  readonly concept: MapConcept;
  now(): number;
  floor(): number;
  /** 11/15 그 판에서 이 테마에 몇 번째로 왔나 (0부터 — 판 모양·몬스터 성질이 바뀐다) */
  visit(): number;
  /** 엘리베이터·층 정리 중·쓰러짐 (바닥 과열 같은 기믹을 쉰다) */
  calm(): boolean;
  player(): { x: number; y: number };
  mons(): readonly ThemeMon[];
  /** 몬스터 m의 공격 한 번 (공격력·방어 공식, 상태 이상 굴림) */
  strike(m: ThemeMon, mult: number): void;
  /** 지형 피해: 최대 HP 비율 */
  hurtPct(pct: number): void;
  /** 몬스터가 쏘는 탄 (공격력 × mult) */
  shoot(m: ThemeMon, angle: number, speed: number, mult: number, tex: string): void;
  /** 몬스터 내보내기 (minion = 웨이브 마릿수에 들지 않는다) */
  spawn(id: MonsterId, x: number, y: number, wave: number, minion: boolean): ThemeMon | null;
  /** 바로 쓰러뜨린다 (처치로 센다) */
  kill(m: ThemeMon): void;
  /** 플레이어를 민다 (장애물·벽 충돌 포함) */
  movePlayer(dx: number, dy: number): void;
  moveMon(m: ThemeMon, dx: number, dy: number): void;
  /** 혼란(방향 뒤집힘) ms */
  confuse(ms: number): void;
  place(x: number, y: number, r: number): { x: number; y: number };
  /** 이 층 지도 (소품·바닥 무늬·시작점·배치 번호) */
  layout(): { variant: number; start: { x: number; y: number }; props: readonly { kind: string; x: number; y: number }[]; decals: readonly { kind: string; x: number; y: number; w: number; h: number }[] };
  flash(msg: string, ms: number): void;
  float(x: number, y: number, text: string, color: string): void;
  sfx(name: RpgSound, gain?: number): void;
  synth(key: string, layers: Layer[]): void;
  shake(ms: number, k: number): void;
  /** 11/15 내 버프 하나를 빼앗는다 (남은 시간이 가장 긴 것 — 옥상 고양이). 없으면 null */
  takeBuff(): { id: string; left: number; v: number } | null;
  /** 빼앗긴 버프를 돌려준다 (남은 시간 그대로) */
  giveBuff(b: { id: string; left: number; v: number }): void;
};

export interface TowerThemeRuntime {
  /** 새 몬스터가 나왔다 */
  spawned?(m: ThemeMon): void;
  /** 걸음을 맡으면 true (패턴 중이 아닐 때만 불린다) */
  move?(m: ThemeMon, dt: number): boolean;
  /** 받는 피해 배율 */
  damageMul?(m: ThemeMon): number;
  /** 쓰러지기 직전: true면 쓰러지지 않는다 */
  saveFromDeath?(m: ThemeMon): boolean;
  /** 쓰러진 뒤 (처치를 센 다음) */
  killed?(m: ThemeMon): void;
  /** 몬스터 공격에 맞은 뒤 */
  playerHit?(id: MonsterId, pat: PatternId | undefined): void;
  /** 플레이어 속도 손질 (미끄러짐 등) */
  playerVelocity?(v: { x: number; y: number }, dt: number): { x: number; y: number };
  /** 11/15 내 공격 간격 배율 (끝없는 회의실 시계 보는 사람 곁이면 느려진다) */
  atkCdMul?(): number;
  /** 11/15 탄(내 탄·몬스터 탄 모두)을 휩쓰는 바람 px/s (옥상 돌풍) */
  shotWind?(): { x: number; y: number };
  /** 층 이름 뒤에 붙일 말 (방 종류·바퀴 판 이름) */
  title?(): string;
  update(now: number, dt: number): void;
  destroy(): void;
}

/** 사냥터(테마) id → 실행부. 다른 테마도 여기에 한 줄로 끼운다 */
export type ThemeFactory = (host: ThemeHost, zone: ZoneId, seed: number) => TowerThemeRuntime;
