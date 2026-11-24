"use client";

import { useEffect, useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { lookPartName } from "@/lib/lookScore";
import { speciesOf } from "@/lib/forage/catalog";
import { gearById, ZONE_IDS, type ZoneId } from "@/lib/rpg/catalog";
import { stayText } from "@/lib/stayTime";
import type { RankBoard, RankPeriod, RankResponse } from "@/lib/types";
import RpgIcon from "../rpg/RpgIcon";
import ItemIcon from "../ui/ItemIcon";
import { watchMoreBelow } from "../ui/moreBelow";
import StyledName from "../ui/StyledName";
import styles from "./RankingPanel.module.css";

// 49번: 랭킹은 포인트·사냥 중심. 묘비(헌화 순)는 작은 탭 하나로만 남긴다 (살려주세요 순위는 없어졌다).

type Tab = "points" | "hunt" | "level" | "tower" | "fish" | "look" | "house" | "stay";

const TABS: { id: Tab; label: string }[] = [
  { id: "points", label: "포인트" },
  { id: "hunt", label: "사냥" },
  { id: "level", label: "사냥 레벨" },
  { id: "tower", label: "야근 빌딩" },
  { id: "fish", label: "낚시" },
  { id: "look", label: "꾸미기" },
  { id: "house", label: "집 꾸미기" },
  { id: "stay", label: "접속 시간" },
];
/** 탭 → 서버 랭킹 (사냥은 처치 수·최단 클리어 중 고른 것, 없으면 포인트) */
const TAB_BOARD: Partial<Record<Tab, RankBoard>> = { house: "house", fish: "fish", look: "look", level: "huntLevel", tower: "tower", stay: "stay" };
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
  tower: "아직 야근 빌딩을 오른 사람이 없어요. 사냥 레벨 50부터 들어갈 수 있어요.",
  stay: "아직 마을에 머문 기록이 없어요.",
};
/** 최대어 랭킹 물고기 고르기 (크기가 있는 물고기만) */
const FISH_OPTIONS = speciesOf("fish").filter((sp) => sp.size);
const STAFF_RANK_NOTE = "운영자는 순위에 들지 않아요.";
const EMPTY_HOUSE_WEEK = "이번 주에 꾸민 집이 아직 없어요.";


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
  if (board === "tower") return `${value.toLocaleString("ko-KR")}층`;
  if (board === "huntKills") return `${value.toLocaleString("ko-KR")}마리`;
  if (board === "house" || board === "look") return `${value.toLocaleString("ko-KR")}점`;
  if (board === "fish") return `${(value / 10).toFixed(1)}cm`;
  if (board === "stay") return stayText(value);
  return `${value.toLocaleString("ko-KR")}P`;
}

export default function RankingList() {
  const [tab, setTab] = useState<Tab>("points");
  const [period, setPeriod] = useState<RankPeriod>("week");
  const [fish, setFish] = useState("all");
  const baseId = useId();
  // 11/24 사냥 탭은 처치 수(이번 주·전체)만, 집 꾸미기는 전체 기간 점수만
  const board: RankBoard = tab === "hunt" ? "huntKills" : (TAB_BOARD[tab] ?? "points");
  /** 기간 없이 전체만 있는 판 */
  const allOnly = board === "look" || board === "huntLevel" || board === "stay" || board === "house";

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
          <span className={styles.hint}>지금 입은 코디 점수를 더한 값이에요. 비쌀수록 높고, 기간이 끝나면 빠져요.</span>
        </div>
      )}
      {tab === "level" && (
        <div className={styles.filters}>
          <span className={styles.hint}>레벨이 높은 순이에요. 같으면 경험치가 많은 순이에요.</span>
        </div>
      )}
      {tab === "stay" && (
        <div className={styles.filters}>
          <span className={styles.hint}>마을에 머문 시간을 모두 더했어요. 오래 머문 순이에요.</span>
        </div>
      )}
      {tab !== "look" && tab !== "level" && tab !== "stay" && tab !== "house" && (
        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="기간">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" className={styles.chip} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          {tab === "tower" && <span className={styles.hint}>높이 오른 순이에요. 같은 층이면 먼저 오른 사람이 위예요. 이번 주 1위는 다음 한 주 동안 신화 칭호 「지난주 최고층」을 달아요.</span>}
          {tab === "fish" && <span className={styles.hint}>직접 낚은 물고기만 올라요. 자동 낚시로 낚은 것은 도감에만 남아요.</span>}
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
        </div>
      )}
      <div id={`${baseId}-list`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} ref={watchMoreBelow} className={`${styles.listWrap} more-fade`}>
        <BoardRanking
          key={`${board}-${allOnly ? "all" : period}-${board === "fish" ? fish : ""}`}
          board={board}
          period={allOnly ? "all" : period}
          zone={ZONE_IDS[0]}
          fish={fish}
        />
      </div>
    </>
  );
}

/** 서버 랭킹 한 판. 내 줄은 강조하고, 50위 밖이면 맨 아래에 따로 */
function BoardRanking({ board, period, zone, fish }: { board: RankBoard; period: RankPeriod; zone: ZoneId; fish: string }) {
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
              {/* 11/16 긴 이름(닉네임 12자 · 집 이름 20자)은 이름만 "…" — (나)·(내 집)은 잘리지 않게 따로, 전체는 title */}
              <span className={styles.nameLine}>
                <span className={styles.nameText} title={r.name}>
                  <StyledName name={r.name} look={r.ns} />
                </span>
                {r.me && <span className={styles.me}>{board === "house" ? "(내 집)" : "(나)"}</span>}
              </span>
              {r.sub && (
                <span className={styles.sub} title={r.sub}>
                  {r.sub}
                </span>
              )}
              {r.items && r.items.length > 0 && <WornParts items={r.items} />}
            </span>
            {r.gear && gearById(r.gear) && (
              <span className={styles.parts} title={gearById(r.gear)!.name}>
                <RpgIcon art={gearById(r.gear)!.art} size={16} />
              </span>
            )}
            <span className={styles.metric}>
              {rankValue(board, r.value)}
              {/* 11/15 초월 레벨 (레벨 50) */}
              {r.star ? ` ★${r.star}` : ""}
            </span>
          </li>
        ))}
      </ol>
      {staffNote}
    </>
  );
}

/** 꾸미기 랭킹: 이름 아래 줄에 지금 착용한 파츠 전부 (부위 순, 같은 크기). 마우스를 올리면 이름, 화면 읽기에는 목록으로 */
function WornParts({ items }: { items: readonly string[] }) {
  const names = items.map(lookPartName);
  return (
    <span className={styles.worn} role="img" aria-label={`착용: ${names.join(", ")}`}>
      {items.map((id, i) => (
        <span key={id} className={styles.wornIcon} title={names[i]}>
          <ItemIcon itemId={id} size={16} />
        </span>
      ))}
    </span>
  );
}
