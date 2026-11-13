"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { speciesOf } from "@/lib/forage/catalog";
import { DIFFICULTIES, gearById, ZONES, type Difficulty } from "@/lib/rpg/catalog";
import type { PublicGrave, RankBoard, RankPeriod, RankResponse } from "@/lib/types";
import RpgIcon from "../rpg/RpgIcon";
import ItemIcon from "../ui/ItemIcon";
import styles from "./RankingPanel.module.css";

// 49번: 랭킹은 포인트·사냥 중심. 묘비(헌화 순)는 작은 탭 하나로만 남긴다 (살려주세요 순위는 없어졌다).

type Tab = "points" | "hunt" | "level" | "fish" | "look" | "house" | "flower";
type HuntMode = "huntKills" | "huntBest";

const TABS: { id: Tab; label: string }[] = [
  { id: "points", label: "포인트" },
  { id: "hunt", label: "사냥" },
  { id: "level", label: "사냥 레벨" },
  { id: "fish", label: "낚시" },
  { id: "look", label: "꾸미기" },
  { id: "house", label: "집 꾸미기" },
  { id: "flower", label: "헌화" },
];
const PERIODS: { id: RankPeriod; label: string }[] = [
  { id: "week", label: "이번 주" },
  { id: "all", label: "전체" },
];
const EMPTY: Record<RankBoard, string> = {
  points: "아직 포인트를 모은 사람이 없어요.",
  huntKills: "아직 사냥 기록이 없어요.",
  huntBest: "아직 이 사냥터를 끝까지 깬 사람이 없어요.",
  house: "아직 꾸민 집이 없어요. 분양 사무소에서 집을 분양받아 보세요.",
  fish: "아직 이 물고기를 낚은 사람이 없어요.",
  look: "아직 코디를 입은 사람이 없어요. 상점에서 꾸미기를 골라 입어 보세요.",
  huntLevel: "아직 사냥터에 다녀온 사람이 없어요.",
};
/** 최대어 랭킹 물고기 고르기 (크기가 있는 물고기만) */
const FISH_OPTIONS = speciesOf("fish").filter((sp) => sp.size);
const STAFF_RANK_NOTE = "운영자는 순위에 들지 않아요.";
const EMPTY_HOUSE_WEEK = "이번 주에 꾸민 집이 아직 없어요.";

const LIMIT = 20;

/** 1:23.4 (최단 클리어) */
export function clearTime(ms: number): string {
  const tenths = Math.round(ms / 100);
  const min = Math.floor(tenths / 600);
  const sec = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return `${min}:${sec}`;
}

export function rankValue(board: RankBoard, value: number): string {
  if (board === "huntBest") return clearTime(value);
  if (board === "huntLevel") return `Lv.${value}`;
  if (board === "huntKills") return `${value.toLocaleString("ko-KR")}마리`;
  if (board === "house" || board === "look") return `${value.toLocaleString("ko-KR")}점`;
  if (board === "fish") return `${(value / 10).toFixed(1)}cm`;
  return `${value.toLocaleString("ko-KR")}P`;
}

type Props = {
  /** 지금 채널 묘비 (헌화 탭은 채널별) */
  graves: readonly PublicGrave[];
  /** 헌화 탭 항목 클릭: 카메라만 그 묘비로 + 상세 */
  onPick: (graveId: string) => void;
};

/** 탭 7개: 포인트(이번 주·전체) · 사냥(처치 수·사냥터별 최단 클리어) · 사냥 레벨(같으면 경험치) · 낚시(물고기별·전체 최대어) · 꾸미기(지금 입은 코디 점수) · 집 꾸미기(F11 꾸밈 점수) · 헌화(지금 채널 묘비) */
export default function RankingList({ graves, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("points");
  const [period, setPeriod] = useState<RankPeriod>("week");
  const [hunt, setHunt] = useState<HuntMode>("huntBest");
  const [zone, setZone] = useState<Difficulty>(DIFFICULTIES[0]);
  const [fish, setFish] = useState("all");
  const baseId = useId();
  const flowered = useMemo(
    () => (tab === "flower" ? graves.filter((g) => g.flowers > 0).sort((a, b) => b.flowers - a.flowers).slice(0, LIMIT) : []),
    [graves, tab],
  );
  const board: RankBoard = tab === "hunt" ? hunt : tab === "house" ? "house" : tab === "fish" ? "fish" : tab === "look" ? "look" : tab === "level" ? "huntLevel" : "points";

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="랭킹 기준">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${baseId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-list`}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "look" && (
        <div className={styles.filters}>
          <span className={styles.hint}>꾸미기 점수 = 지금 입은 코디 파츠 점수 합 (비쌀수록 높아요 · 기간이 끝나면 빠져요)</span>
        </div>
      )}
      {tab === "level" && (
        <div className={styles.filters}>
          <span className={styles.hint}>사냥 캐릭터 레벨 순 · 레벨이 같으면 경험치가 많은 순</span>
        </div>
      )}
      {tab !== "flower" && tab !== "look" && tab !== "level" && (
        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="기간">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" className={styles.chip} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                {tab === "house" && p.id === "week" ? "이번 주 꾸민 집" : p.label}
              </button>
            ))}
          </div>
          {tab === "house" && <span className={styles.hint}>꾸밈 점수 = 안팎 물건 점수 + 좋아요 × 3</span>}
          {tab === "fish" && (
            <select className={styles.zone} value={fish} onChange={(e) => setFish(e.target.value)} aria-label="물고기">
              <option value="all">모든 물고기</option>
              {FISH_OPTIONS.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
          )}
          {tab === "hunt" && (
            <>
              <div className={styles.chips} role="group" aria-label="사냥 기록">
                <button type="button" className={styles.chip} aria-pressed={hunt === "huntBest"} onClick={() => setHunt("huntBest")}>
                  최단 클리어
                </button>
                <button type="button" className={styles.chip} aria-pressed={hunt === "huntKills"} onClick={() => setHunt("huntKills")}>
                  처치 수
                </button>
              </div>
              {hunt === "huntBest" && (
                <select className={styles.zone} value={zone} onChange={(e) => setZone(e.target.value as Difficulty)} aria-label="사냥터">
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {ZONES[d].name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      )}
      <div id={`${baseId}-list`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.listWrap}>
        {tab === "flower" ? (
          flowered.length === 0 ? (
            <p className={styles.empty}>이 채널 묘비에 아직 놓인 꽃이 없어요.</p>
          ) : (
            <ol className={styles.list}>
              {flowered.map((g, i) => (
                <li key={g.id}>
                  <button type="button" className={styles.item} onClick={() => onPick(g.id)}>
                    <span className={styles.rank}>{i + 1}</span>
                    <span className={styles.name}>{g.name}</span>
                    <span className={styles.metric}>🌼 {g.flowers}</span>
                  </button>
                </li>
              ))}
            </ol>
          )
        ) : (
          <BoardRanking
            key={`${board}-${board === "look" || board === "huntLevel" ? "all" : period}-${board === "huntBest" ? zone : board === "fish" ? fish : ""}`}
            board={board}
            period={board === "look" || board === "huntLevel" ? "all" : period}
            zone={zone}
            fish={fish}
          />
        )}
      </div>
    </>
  );
}

/** 서버 랭킹 한 판. 내 줄은 강조하고, 50위 밖이면 맨 아래에 따로 */
function BoardRanking({ board, period, zone, fish }: { board: RankBoard; period: RankPeriod; zone: Difficulty; fish: string }) {
  const [data, setData] = useState<RankResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .rank(board, period, board === "huntBest" ? zone : undefined, board === "fish" ? fish : undefined)
      .then((r) => alive && setData(r))
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [board, period, zone, fish]);

  if (!data) return <p className={styles.empty}>{error ?? "불러오는 중…"}</p>;
  // 운영자 본인 화면: 내 순위 대신 안내 (운영자는 어느 순위에도 들지 않는다)
  const staffNote = data.staff ? <p className={styles.empty}>{STAFF_RANK_NOTE}</p> : null;
  if (data.rows.length === 0)
    return (
      <>
        <p className={styles.empty}>{board === "house" && period === "week" ? EMPTY_HOUSE_WEEK : EMPTY[board]}</p>
        {staffNote}
      </>
    );
  const mineOutside = data.mine && !data.rows.some((r) => r.me) ? data.mine : null;
  return (
    <>
      <ol className={styles.list}>
        {[...data.rows, ...(mineOutside ? [mineOutside] : [])].map((r) => (
          <li key={`${r.rank}-${r.name}`} className={styles.pointRow} data-me={r.me}>
            <span className={styles.rank}>{r.rank}</span>
            <span className={styles.name}>
              {r.name}
              {r.me && (board === "house" ? " (내 집)" : " (나)")}
              {r.sub && <span className={styles.sub}>{r.sub}</span>}
            </span>
            {r.gear && gearById(r.gear) && (
              <span className={styles.parts} title={gearById(r.gear)!.name}>
                <RpgIcon art={gearById(r.gear)!.art} size={16} />
              </span>
            )}
            {r.items && r.items.length > 0 && (
              <span className={styles.parts} aria-hidden="true">
                {r.items.map((id) => (
                  <ItemIcon key={id} itemId={id} size={16} />
                ))}
              </span>
            )}
            <span className={styles.metric}>{rankValue(board, r.value)}</span>
          </li>
        ))}
      </ol>
      {staffNote}
    </>
  );
}
