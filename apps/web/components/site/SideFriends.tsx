import type { CSSProperties } from "react";
import type { SiteNav } from "./SiteHeader";
import styles from "./site.module.css";

// 11/20 개발자 노트 PC 화면 좌우 여백의 도트 친구들 (장식).
//  그림은 게임 그림 코드에서 그대로 뽑은 것 (public/devnotes/brand/side/<id>.png — 1배, 재생 순서대로 프레임을 가로로 이어 붙임):
//  마을 NPC(분양사 보리·총무팀 문대리·사육사 곰이·계절/가구 보따리상) · 마을 주민(아바타 몸·색·꾸미기) · 품종 펫·새 펫.
//  자리는 페이지 종류마다 정해진 섞기라 서버·브라우저가 늘 같다 (수화 오류·깜빡임 없음). 넓은 화면(1440px+)에서만 보인다 — site.module.css .sf
//  세로로 쌓다 본문 끝을 넘는 친구는 옆 칸으로 밀려나 잘려 보이지 않는다 (flex-wrap 열 + overflow:hidden).

/** id → [폭, 높이, 프레임 수, 프레임당 ms] (1배 픽셀) */
const ART: Record<string, readonly [number, number, number, number]> = {
  bori: [22, 25, 10, 650],
  mundaeri: [23, 21, 2, 650],
  gomi: [21, 22, 2, 650],
  peddler: [28, 31, 2, 650],
  crafter: [25, 31, 2, 650],
  "res-kimdr": [13, 20, 2, 500],
  "res-parkjj": [14, 20, 2, 500],
  "res-firekeeper": [18, 20, 2, 500],
  "res-leegj": [19, 19, 2, 500],
  "res-jungcj": [14, 28, 2, 500],
  "res-ohbj": [18, 20, 2, 500],
  "res-yoonjj": [14, 18, 2, 500],
  "res-seogj": [18, 21, 2, 500],
  "res-jangin": [15, 21, 2, 500],
  "res-songjj": [14, 18, 2, 500],
  "res-handr": [20, 27, 24, 250],
  "res-baeksw": [16, 25, 24, 250],
  "res-choisw": [16, 25, 24, 250],
  shiba: [13, 11, 4, 500],
  corgi: [15, 11, 4, 500],
  pom: [13, 11, 4, 500],
  bichon: [15, 12, 4, 500],
  dachs: [16, 11, 4, 500],
  jindo: [13, 11, 4, 500],
  cheese: [13, 11, 4, 650],
  tux: [12, 12, 4, 650],
  mackerel: [13, 11, 4, 650],
  siam: [12, 12, 4, 650],
  hedgehog: [13, 10, 4, 600],
  otter: [12, 11, 4, 650],
  redpanda: [12, 12, 4, 650],
};
/** 옆모습(오른쪽을 봄) 펫 — 오른쪽 여백에서는 뒤집어 본문 쪽을 보게 한다 */
const SIDE_FACING = new Set(["corgi", "bichon", "dachs", "tux", "siam", "hedgehog", "otter", "redpanda"]);
/** 한 자리에 서는 무리 (주민 + 펫은 주민이 바깥, 펫이 본문 쪽) */
const GROUPS: readonly (readonly string[])[] = [
  ["bori"],
  ["mundaeri"],
  ["gomi", "jindo"],
  ["peddler"],
  ["crafter"],
  ["res-parkjj", "corgi"],
  ["res-jangin", "cheese"],
  ["res-handr"],
  ["res-leegj", "hedgehog"],
  ["res-yoonjj", "pom"],
  ["res-baeksw"],
  ["res-ohbj", "otter"],
  ["res-kimdr", "tux"],
  ["res-firekeeper"],
  ["res-seogj", "bichon"],
  ["res-jungcj", "redpanda"],
  ["res-choisw"],
  ["res-songjj", "mackerel"],
  ["dachs", "siam"],
  ["shiba"],
];

/** 페이지 종류마다 고정된 난수 (mulberry32) */
function rng(seed: string): () => number {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (Math.imul(a ^ seed.charCodeAt(i), 2654435761) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Slot = { ids: readonly string[]; gap: number; delays: number[] };

function arrange(page: string): { left: Slot[]; right: Slot[] } {
  const r = rng(`devnotes-side-${page}`);
  const order = [...GROUPS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const left: Slot[] = [];
  const right: Slot[] = [];
  // 왼쪽은 머리글 바로 아래부터, 오른쪽은 반 칸 늦게 → 화면 높이마다 한두 마리가 좌우 번갈아 나온다
  const leftStart = 150 + Math.round(r() * 90);
  const rightStart = leftStart + 380 + Math.round(r() * 120);
  order.forEach((ids, i) => {
    const side = i % 2 === 0 ? left : right;
    const first = side.length === 0;
    const gap = first ? (side === left ? leftStart : rightStart) : 680 + Math.round(r() * 260);
    side.push({ ids, gap, delays: ids.map(() => Math.round(r() * 2000)) });
  });
  return { left, right };
}

function Sprite({ id, flip, delay }: { id: string; flip: boolean; delay: number }) {
  const [w, h, n, ms] = ART[id];
  // 배율은 CSS --sfs (보통 2배, 아주 넓은 화면 3배)
  const style: CSSProperties = {
    width: `calc(${w}px * var(--sfs))`,
    height: `calc(${h}px * var(--sfs))`,
    backgroundImage: `url(/devnotes/brand/side/${id}.png)`,
    backgroundSize: `calc(${w * n}px * var(--sfs)) calc(${h}px * var(--sfs))`,
    animationDuration: `${n * ms}ms`,
    animationTimingFunction: `steps(${n}, jump-none)`,
    animationDelay: `-${delay}ms`,
  };
  return <i className={flip ? `${styles.sfSp} ${styles.sfFlip}` : styles.sfSp} style={style} />;
}

/** 무리의 1배 폭 (그림 폭 합 + 사이 2px — CSS gap은 배율을 곱해 계산) */
function groupWidth(ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + ART[id][0], 0) + (ids.length - 1) * 2;
}

function Column({ slots, right }: { slots: Slot[]; right: boolean }) {
  return (
    <div className={`${styles.sf} ${right ? styles.sfR : styles.sfL}`} aria-hidden="true">
      {slots.map((s, i) => (
        <span key={i} className={styles.sfGroup} style={{ marginTop: s.gap, ["--gw" as string]: `${groupWidth(s.ids)}px` }}>
          {s.ids.map((id, k) => (
            <Sprite key={id} id={id} flip={right && SIDE_FACING.has(id)} delay={s.delays[k]} />
          ))}
        </span>
      ))}
    </div>
  );
}

export default function SideFriends({ page }: { page: SiteNav }) {
  const { left, right } = arrange(page ?? "legal");
  return (
    <>
      <Column slots={left} right={false} />
      <Column slots={right} right />
    </>
  );
}
