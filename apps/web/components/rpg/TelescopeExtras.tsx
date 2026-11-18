"use client";

import { PHASE_LABELS, WEATHER_LABELS } from "@/lib/ambience";
import { useAmbience } from "@/lib/hooks/useAmbience";
import type { DexEntry } from "@/lib/forage/types";
import { DIFFS, type Difficulty } from "@/lib/rpg/catalog";
import { CONSTELLATIONS, constellationById } from "@/lib/rpg/constellations";
import { readItem, writeItem } from "@/lib/storage";
import { InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
import styles from "./TelescopeExtras.module.css";

// 22번 망원경 창의 남는 자리: 밤하늘 미리보기 · 지금 하늘 · 별자리 도감 진행 · 이 기기에서 본 최근 기록 · 팁.

const RECORDS_KEY = "tomb.ui.starsRecords";
const RECORDS_MAX = 5;

/** cons: 그 판에 완성한 별자리 수 (예전 기록에는 없다) */
export type StarsRecord = { at: number; diff: Difficulty; perfect: number; good: number; miss: number; points: number; night: boolean; cons?: number };

export function readStarsRecords(): StarsRecord[] {
  try {
    const v: unknown = JSON.parse(readItem(RECORDS_KEY) ?? "[]");
    return Array.isArray(v) ? (v as StarsRecord[]).filter((r) => r && typeof r.at === "number" && r.diff in DIFFS).slice(0, RECORDS_MAX) : [];
  } catch {
    return [];
  }
}

export function saveStarsRecord(r: StarsRecord): void {
  writeItem(RECORDS_KEY, JSON.stringify([r, ...readStarsRecords()].slice(0, RECORDS_MAX)));
}

/** 미리보기 별 (x, y 백분율) — 이어진 별자리 하나(헬스장 회원권자리 = 아령)와 흩어진 별들 */
const LINKED: readonly [number, number][] = (constellationById("c_gym")?.stars ?? []).map(([x, y]) => [Math.round(28 + x * 44), Math.round(12 + y * 64)]);
const LOOSE: readonly [number, number][] = [
  [6, 18],
  [18, 84],
  [30, 14],
  [44, 76],
  [58, 64],
  [70, 82],
  [82, 58],
  [94, 74],
  [52, 8],
  [36, 30],
];

export function StarsPreview({ starry }: { starry: boolean }) {
  const ambience = useAmbience();
  return (
    <div className={styles.sky} data-starry={starry || undefined}>
      <svg className={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={LINKED.map(([x, y]) => `${x},${y}`).join(" ")} className={styles.line} />
      </svg>
      {LINKED.map(([x, y], i) => (
        <span key={`l${i}`} className={styles.star} data-big style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.3}s` }} />
      ))}
      {LOOSE.map(([x, y], i) => (
        <span key={`s${i}`} className={styles.star} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 5) * 0.5}s` }} />
      ))}
      {LINKED[3] && <span className={styles.ring} style={{ left: `${LINKED[3][0]}%`, top: `${LINKED[3][1]}%` }} aria-hidden="true" />}
      <p className={styles.caption}>
        지금 하늘은 {ambience ? `${PHASE_LABELS[ambience.phase]}, ${WEATHER_LABELS[ambience.weather]}` : "…"}
        {starry ? ". 진짜 별이 잘 보이는 밤이에요!" : ""}
      </p>
    </div>
  );
}

const dateText = (at: number) => new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export function StarsInfo({ records }: { records: StarsRecord[] }) {
  const best = records.reduce<StarsRecord | null>((b, r) => (!b || r.perfect > b.perfect ? r : b), null);
  return (
    <InfoGrid>
      <InfoCard title="최근 기록" icon="list" aside={best ? `최고 완벽 ${best.perfect}개` : undefined}>
        {records.length === 0 ? (
          <p className={styles.muted}>아직 이 기기에서 본 기록이 없어요. 한 판 들여다보면 여기에 남아요.</p>
        ) : (
          <ul className={styles.records}>
            {records.map((r) => (
              <li key={r.at}>
                <span className={styles.recordHead}>
                  <b>{DIFFS[r.diff].name}</b>
                  <span className={styles.muted}>{dateText(r.at)}</span>
                </span>
                <span className={styles.recordStats}>
                  완벽 {r.perfect} · 좋음 {r.good} · 놓침 {r.miss} · +{r.points}P{r.cons ? ` · 별자리 ${r.cons}` : ""}
                  {r.night ? " · 맑은 밤" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>
      <InfoCard title="잘 잇는 요령" icon="info">
        <TipList
          tips={[
            "고리가 별에 딱 겹칠 때 누르면 '완벽'이에요. 조금 일찍 누른 건 놓침이 아니니 다시 누르면 돼요.",
            "한 별자리를 하나도 놓치지 않고 이으면 도감의 '별자리' 칸에 올라가요.",
            "마구 누르면 별을 놓쳐요. 1초에 서너 번씩 누르지 마세요.",
            "어디를 눌러도 다음 별로 이어져요. 폰에서는 화면 아무 데나 탭하세요.",
            "Esc를 누르면 잠깐 멈춰요. 폰에서는 멈춤 버튼을 눌러요. 2분 넘게 멈추면 결과를 받을 수 없어요.",
            "DEX가 높을수록 판정이 넉넉해져요. 능력치 포인트나 장비로 DEX를 올릴 수 있어요.",
            "누가 보고 있는 망원경은 쓸 수 없어요. 그럴 땐 옆 망원경으로 가 보세요.",
          ]}
        />
      </InfoCard>
    </InfoGrid>
  );
}

/** 별자리 도감 진행: 모은 수, 희귀(어려움 이상)·전설(맑은 밤) 안내 */
export function StarsDexCard({ dex, starry }: { dex: Record<string, DexEntry> | undefined; starry: boolean }) {
  const got = CONSTELLATIONS.filter((c) => (dex?.[c.id]?.n ?? 0) > 0);
  const legend = CONSTELLATIONS.filter((c) => c.rarity === 5);
  return (
    <InfoCard title="별자리 도감" icon="book" aside={dex ? `${got.length}/${CONSTELLATIONS.length}` : "…"}>
      <p className={styles.muted}>
        흔한 별자리는 어느 난이도에서나 떠요. <b>희귀</b> 별자리는 어려움과 지옥에서만 떠요. <b>전설</b> 별자리 {legend.length}개는 맑은 밤에만
        떠요. 계절 별자리는 그 계절에만 떠요. 새벽 별자리는 새벽 5시부터 7시 사이에만 떠요. 한 판에 새로 등록되는 별자리는 3개까지예요.
        {starry ? " 지금은 맑은 밤이라 전설 별자리가 뜰 수 있어요!" : ""}
      </p>
      {got.length > 0 && <p className={styles.consNames}>{got.map((c) => c.name).join(" · ")}</p>}
    </InfoCard>
  );
}
