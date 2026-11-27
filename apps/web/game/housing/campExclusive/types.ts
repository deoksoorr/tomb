import { darken, type Grid, lighten, type Color } from "../../sprites/pixel";

// 11/27 캠핑장 전용 가구 그림 틀 (game/housing/art.ts가 DRAW·SPIN_ART·UP·FLOOR·PAPER·벽 테에 끼워 넣는다).
// 종류마다 그림 파일 하나 (caravanArt.ts · pensionArt.ts · ruralArt.ts)가 CxArt 하나를 내보낸다.
//
// 규칙 (campFurnitureArt.ts와 같다):
//  - 그림 크기 = (칸 w×16) × (칸 h×16 + 솟는 높이 up[id]). 옆모습(side, 왼쪽을 봄)은 가로·세로 칸이 바뀐다. 오른쪽은 옆모습을 좌우로 뒤집는다.
//  - 테(outline)는 art.ts가 두른다 (edge 색·진하기). 테 자리로 왼쪽·오른쪽 끝 열과 맨 윗줄은 비운다.
//  - v = 그림 변형 이름 "-"로 이음: 켜기·끄기 가구는 켜짐 "on" · 값 "s1"…, 서서 쓰기 연출은 lib 종류 파일 act.fx.v 이름 (has(v, "open") 처럼 본다).
//  - 바닥(floors)은 16×16 타일 변형 v 0..3, 벽지(papers)는 16×WALL_H(40)에서 위 6줄·아래 6줄(천장 테·걸레받이)을 뺀 사이에 그린다.
//
// 손에 들기 (그림 파일의 선택 내보내기 `export const heldArt: CxHeldArtMap` — 키 = 종류 파일 act.hold.item 이름 "can"·"mug"·"ski"·"mic"·"log"·"gotgam"·"bangmangi"…):
//  - 종류 파일에 act.hold = { item, ms? }를 주면 E로 그 가구를 쓸 때(서서 쓰기 fx · 켜기 toggle이면 켤 때) 캐릭터 손에 작은 그림이 붙는다.
//    ms(기본 4000) 동안, 또는 캐릭터가 움직이면 바로 사라진다. 같은 방 사람에게도 보인다 (fx와 같은 use 이벤트 길 — HouseScene onRemoteUse).
//  - 그림 = 앞을 본 캐릭터의 손에 든 모습, 그림 한가운데가 손 자리(sprites/avatar handAnchor). 왼쪽을 보면 좌우로 뒤집고,
//    뒤를 보면 몸 뒤에 그린다 (손이 몸에 가린다). 크기는 8~12px 정도 (캐릭터 20×28).
//  - 그림이 없는 이름이면 아무것도 붙지 않는다 (연출 이모티콘·한마디는 그대로).
//  - 방향마다 그림: 함수가 dir을 받으면(`(dir) => Grid`) 방향마다 그 그림을 쓰고 뒤집지 않는다. 몸 뒤·자리 옮김은 선택 내보내기
//    `export const heldPose: CxHeldPoseMap` (이름 → (dir) => { behind?, dx?, dy? }). 내 캐릭터는 들고 나면 앞(화면 쪽)을 본다.
//
// 장면·자리 그림 변형 (HouseScene cxVariant가 붙인다 — 그림 함수는 has(v, "…")로 본다):
//  - "lie": 그 가구에 누가 누워 있을 때 (해먹처럼 — 릴렉스 체어 담요). 그리지 않으면 그대로
//  - toggle.anim.frames · seatAnim.frames 조각: 켜진 동안 · 누가 앉은 동안 ms마다 차례로 (움직임 줄이기면 첫 장면)
//  - 그 밖: 켜짐 "on" · 값 "s1"… · fx v (위 규칙)
//
// 누운 사람 덮개 (그림 파일의 선택 내보내기 `export const coverArt: CxCoverArtMap` — 키 = 가구 id, 또는 seats의 cover 문자열):
//  - 종류 파일 seats에서 눕는 자리(lie: true)에 cover: true(그 가구 id) 또는 cover: "키"를 주면, 누운 몸 위에 coverArt[키](방향 d 0~3)를 덮는다
//    (캠핑장 기본 침대 이불과 같은 길 — sprites/indoorPose LieCover). 없으면 마을 침대 보라 이불.
//  - 덮개 그림은 누운 자세 프레임(20×28, 발 원점 = 가운데 아랫줄 — 똑바로 선 모습 기준, 장면이 tilt만큼 돌린다)에 그린다:
//    가로 20px 그대로, 그림 맨 윗줄이 목선(어깨선 — 숨 쉴 때 1px 오르내린다)에 온다. 투명 칸은 몸이 보인다.

export type CxDraw = (g: Grid, W: number, H: number, v: string) => void;
export type CxSpinArt = { side: CxDraw; back: CxDraw };
export type CxTile = (g: Grid, v: number) => void;

/**
 * 손에 든 물건 그림 (act.hold.item 이름 → 그림). `() => Grid` = 한 장 (왼쪽을 보면 뒤집고 뒤를 보면 몸 뒤),
 * `(dir) => Grid` = 방향마다 그림 (dir 0 앞 · 1 왼쪽 · 2 뒤 · 3 오른쪽 — 뒤집지 않는다. 스키를 등에 비스듬히)
 */
export type CxHeldArtMap = Record<string, (dir?: number) => Grid>;
/** 손에 든 물건 한 방향의 자리 (선택 내보내기 heldPose): behind = 몸 뒤에 (없으면 뒤를 볼 때만), dx·dy = 손 자리에서 더 옮길 px */
export type CxHeldPose = { behind?: boolean; dx?: number; dy?: number };
export type CxHeldPoseMap = Record<string, (dir: number) => CxHeldPose>;
/**
 * 벽지마다 창문 덧칠 (선택 내보내기 `export const windowOver` — 벽지 id → 창문 그림(복사본)을 받아 고친다).
 * 그 벽지를 입힌 집의 창문(기본·종류별 창·눈꽃 창가 모두)에 덧칠한다 (창호 한지 벽이면 창 나무를 짙게)
 */
export type CxWindowOverMap = Record<string, (g: Grid) => void>;
/** 누운 사람 덮개 그림 (가구 id 또는 seats cover 키 → 방향 d 0~3마다 그림) */
export type CxCoverArtMap = Record<string, (dir: number) => Grid>;
/** 누운 자세 덮개 이름 (sprites/indoorPose LieCover — "cx|키|방향") */
export type CxCover = `cx|${string}|${number}`;
export const cxCoverName = (key: string, d: number): CxCover => `cx|${key}|${d}`;
export const isCxCover = (s: string): s is CxCover => s.startsWith("cx|");

export type CxArt = {
  /** 앞모습 (모든 가구) */
  draw: Record<string, CxDraw>;
  /** 옆모습·뒷모습 (네 방향 가구 — 없으면 앞모습을 그대로 쓴다) */
  spin: Record<string, CxSpinArt>;
  /** 칸 위로 솟는 높이 px (키 큰 가구) */
  up: Record<string, number>;
  /** 바닥 타일 */
  floors: Record<string, CxTile>;
  /** 벽지 */
  papers: Record<string, CxTile>;
  /** 옆벽·칸막이 윗면 색 (벽지마다) */
  wallCap: Record<string, Color>;
  /** 가구 테 색·진하기 (0~255) */
  edge: { color: Color; a: number };
};

export const has = (v: string, p: string) => v.split("-").includes(p);

// ── 임시 그림 (그림 담당이 진짜 그림으로 바꾸기 전까지 게임이 뭔가를 그리게) ──
// 가구: 종류 색 상자 + 윗면 밝게 + 앞면 아래 그늘. 켜짐(on)이면 노란 점, 옆·뒤는 조금 어둡게. 바닥·벽지: 두 색 바둑판·세로 줄.

/** TODO(그림 담당): 진짜 그림으로 바꾸면 이 함수는 지운다 */
export function placeholderDraw(base: Color, tone = 0, view: "front" | "side" | "back" = "front"): CxDraw {
  return (g, W, H, v) => {
    const c = tone ? darken(base, tone) : base;
    const top = Math.max(1, H - Math.min(H - 2, 14));
    g.rect(1, top, W - 2, H - top - 1, c);
    g.rect(1, top, W - 2, 3, lighten(c, 0.25));
    g.hline(1, W - 2, H - 2, darken(c, 0.35));
    // 보는 쪽 표시 (앞 = 아래 가운데 밝은 줄, 옆 = 왼쪽 끝 줄 — 오른쪽은 장면이 뒤집는다, 뒤 = 없음)
    if (view === "front") g.hline(Math.max(1, Math.floor(W / 2) - 2), Math.min(W - 2, Math.floor(W / 2) + 1), H - 4, lighten(c, 0.4));
    else if (view === "side") g.vline(2, top + 3, H - 3, lighten(c, 0.4));
    if (has(v, "on")) g.rect(Math.floor(W / 2) - 1, top + 4, 3, 3, 0xffe27a);
    // 서서 쓰기 연출(open·pick…)·켜기 값(s1…): 왼쪽 위 흰 점
    if (v.split("-").some((t) => t && t !== "on" && !/^d\d$/.test(t))) g.rect(2, top + 4, 2, 2, 0xffffff);
  };
}
export const placeholderSpin = (base: Color): CxSpinArt => ({ side: placeholderDraw(base, 0.12, "side"), back: placeholderDraw(base, 0.25, "back") });

/** TODO(그림 담당): 바닥 임시 타일 (두 색 바둑판) */
export const placeholderFloor =
  (a: Color, b: Color): CxTile =>
  (g) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.rect(x * 8, y * 8, 8, 8, (x + y) % 2 ? b : a);
  };

/** TODO(그림 담당): 벽지 임시 (세로 줄 두 색 — 위 6줄·아래 6줄은 천장 테·걸레받이) */
export const placeholderPaper =
  (a: Color, b: Color): CxTile =>
  (g) => {
    for (let x = 0; x < 16; x += 4) g.rect(x, 6, 4, 29, (x / 4) % 2 ? b : a);
  };

/** 종류 줄 ids로 임시 그림 묶음 만들기 (가구 = 같은 색 상자, 바닥·벽지 = 두 색) */
export function placeholderArt(
  ids: { furn: readonly string[]; floors: readonly string[]; walls: readonly string[] },
  pal: { furn: Color; floor: readonly [Color, Color]; wall: readonly [Color, Color]; edge: Color },
): CxArt {
  return {
    draw: Object.fromEntries(ids.furn.map((id) => [id, placeholderDraw(pal.furn)])),
    spin: Object.fromEntries(ids.furn.map((id) => [id, placeholderSpin(pal.furn)])),
    up: {},
    floors: Object.fromEntries(ids.floors.map((id, i) => [id, placeholderFloor(pal.floor[0], darken(pal.floor[1], i * 0.15))])),
    papers: Object.fromEntries(ids.walls.map((id, i) => [id, placeholderPaper(pal.wall[0], darken(pal.wall[1], i * 0.15))])),
    wallCap: Object.fromEntries(ids.walls.map((id) => [id, darken(pal.wall[1], 0.4)])),
    edge: { color: pal.edge, a: 175 },
  };
}
