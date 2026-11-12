"use client";

import { PHASE_LABELS, WEATHER_LABELS } from "@/lib/ambience";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { DIFFS, type Difficulty } from "@/lib/rpg/catalog";
import { readItem, writeItem } from "@/lib/storage";
import { InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
import styles from "./TelescopeExtras.module.css";

// 22번 망원경 창의 남는 자리: 밤하늘 미리보기 · 지금 하늘 · 이 기기에서 본 최근 기록 · 팁.

const RECORDS_KEY = "tomb.ui.starsRecords";
const RECORDS_MAX = 5;

export type StarsRecord = { at: number; diff: Difficulty; perfect: number; good: number; miss: number; points: number; night: boolean };

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

/** 미리보기 별 (x, y 백분율) — 이어진 별자리 하나와 흩어진 별들 */
const LINKED: readonly [number, number][] = [
  [12, 62],
  [24, 40],
  [38, 48],
  [50, 26],
  [64, 36],
  [76, 20],
  [88, 34],
];
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
      <span className={styles.ring} style={{ left: `${LINKED[3][0]}%`, top: `${LINKED[3][1]}%` }} aria-hidden="true" />
      <p className={styles.caption}>
        지금 하늘 · {ambience ? `${PHASE_LABELS[ambience.phase]} · ${WEATHER_LABELS[ambience.weather]}` : "…"}
        {starry ? " — 진짜 별이 잘 보이는 밤!" : ""}
      </p>
    </div>
  );
}

const dateText = (at: number) => new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export function StarsInfo({ records }: { records: StarsRecord[] }) {
  const best = records.reduce<StarsRecord | null>((b, r) => (!b || r.perfect > b.perfect ? r : b), null);
  return (
    <InfoGrid>
      <InfoCard title="최근 기록" icon="list" aside={best ? `가장 많이 이은 판: 완벽 ${best.perfect}` : undefined}>
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
                  완벽 {r.perfect} · 좋음 {r.good} · 놓침 {r.miss} · +{r.points}P{r.night ? " · 맑은 밤" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>
      <InfoCard title="잘 잇는 요령" icon="info">
        <TipList
          tips={[
            "빛의 고리가 별에 딱 겹치는 순간에 누르면 '완벽'이에요. 서두르면 놓쳐요.",
            "어디를 눌러도 다음 별로 이어져요. 폰은 화면 아무 데나 탭하세요.",
            "Esc(폰은 멈춤 버튼)로 잠깐 멈출 수 있어요. 2분 넘게 멈추면 결과를 받을 수 없어요.",
            "레벨이 오를수록(DEX) 판정이 조금 너그러워져요. 사냥으로 레벨을 올려 보세요.",
          ]}
        />
      </InfoCard>
    </InfoGrid>
  );
}
