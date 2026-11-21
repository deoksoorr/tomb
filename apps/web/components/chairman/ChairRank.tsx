"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { DIR, itemName } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { CHAIR_DUO, CHAIR_RANK_POINTS, CHAIR_REWARD, type ChairRewardIds } from "@/lib/chairman/rewards";
import { chairWeek, type ChairMode } from "@/lib/chairman/rules";
import { CHAIR_PERK_OVERLAP, CHAIR_PERK_TERM, chairPerkTags } from "@/lib/chairPerks";
import type { ChairHallResponse, ChairHallRow } from "@/lib/chairman/hall";
import type { ChairRankResponse, ChairTopRow } from "@/lib/chairman/service";
import { tabHidden } from "@/lib/hooks/visibleAgain";
import AvatarThumb from "../account/AvatarThumb";
import RaceCountdown from "../grave/RaceCountdown";
import { RACE_REFRESH_MS } from "../grave/WeeklyRace";
import { OutfitCanvas } from "../shop/OutfitPreview";
import ItemIcon from "../ui/ItemIcon";
import { chairHall, chairRank } from "./chairData";
import ChairPortrait from "./ChairPortrait";
import { dmgText, HALL_EMPTY, hallWeekText, lastedText, LEAD_LABEL, MODE_NAME, msClock, num } from "./chairText";
import r from "./ChairRank.module.css";

// 11/20 레이스 창 [회장님 독대] 탭 (이번 주 레이스 탭과 같은 짜임)
//  11/21 다시 짬: 맨 위 남은 시간 줄 → 노멀(왼쪽)·헬(오른쪽) 두 칸을 나란히 (모드 탭 없음)
//   칸마다 머리(초상 + 이번 주 현재 1위 이름·피해) → 1·2·3위 시상대 → 4위부터 목록(고정 높이 스크롤) → 내 기록 줄.
//   두 칸은 subgrid로 머리·시상대·내 기록 높이를 줄마다 맞춘다. 헬 칸은 붉은 강조색
//  → 그 아래 보상 세 장 한 줄 (노멀 1위 · 헬 1위 · 2관왕) + 1~3위 포인트 한 번 → 11/22 명예의 전당
//  폰(좁은 창)은 노멀 칸 → 헬 칸으로 쌓고, 보상 카드도 한 장씩 쌓는다
//  11/22 순위는 피해량으로 정한다 — 큰 숫자는 늘 「피해」, 버틴 시간은 작게 「버틴 시간 1:10」
//  11/23 2관왕 (노멀·헬 모두 1위): 보상 줄 셋째 카드 · 명예의 전당은 그 주를 「2관왕」 한 줄로
//  11/24 카드마다 1주일 혜택 줄 (lib/chairPerks chairPerkTags — 다음 1위가 정해질 때까지)

const GHOST = "#e8d9b0";
const MODES = ["normal", "hell"] as const;
type Both = Record<ChairMode, ChairRankResponse>;

/** initial: 입장 창 [이번 주 순위]에서 고른 모드 — 칸이 쌓이는 좁은 창이면 그 칸이 보이게 내려 준다 */
export default function ChairRank({ initial }: { initial: ChairMode }) {
  const [data, setData] = useState<Both | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hellRef = useRef<HTMLElement>(null);

  // 노멀·헬을 한꺼번에 받는다 (서버 순위판은 30초 캐시라 두 번 불러도 가볍다)
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(MODES.map((m) => chairRank(m)))
        .then(([normal, hell]) => {
          if (!alive) return;
          setData({ normal, hell });
          setError(null);
        })
        .catch((e: unknown) => alive && setError(errorMessage(e)));
    void load();
    const t = setInterval(() => !tabHidden() && void load(), RACE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // 헬로 열었고 칸이 쌓여 있으면 (폰) 헬 칸으로 한 번 내려 준다
  const loaded = !!data;
  const scrolled = useRef(false);
  useEffect(() => {
    if (!loaded || scrolled.current || initial !== "hell") return;
    scrolled.current = true;
    const el = hellRef.current;
    const prev = el?.previousElementSibling as HTMLElement | null;
    if (el && prev && el.offsetTop > prev.offsetTop) el.scrollIntoView({ block: "start" });
  }, [loaded, initial]);

  return (
    <section className={r.wrap} aria-label="회장님 독대 이번 주 순위" data-testid="chair-rank">
      {/* 11/21 남은 시간 줄은 이번 주 레이스 탭처럼 맨 위에 */}
      <RaceCountdown weekOf={chairWeek} />
      <div className={r.cols}>
        {MODES.map((m) => (
          <ModeColumn key={m} mode={m} data={data?.[m] ?? null} error={error} ref={m === "hell" ? hellRef : undefined} />
        ))}
      </div>
      <RewardRow />
      <HallBox />
    </section>
  );
}

/** 모드 한 칸: 머리 → 시상대 → 내 기록 (11/21 상은 1~3위뿐이라 4위부터 목록은 뺐다. 두 칸이 줄마다 높이를 맞춘다) */
function ModeColumn({ mode, data, error, ref }: { mode: ChairMode; data: ChairRankResponse | null; error: string | null; ref?: Ref<HTMLElement> }) {
  const lead = data?.leaders[mode];
  return (
    <section ref={ref} className={r.col} data-mode={mode} aria-label={`${MODE_NAME[mode]} 이번 주 순위`} data-testid={`chair-col-${mode}`}>
      <header className={r.colHead}>
        <ChairPortrait hell={mode === "hell"} className={r.modeArt} />
        <span className={r.modeText}>
          <b>{MODE_NAME[mode]}</b>
          {!data ? (
            <span className={r.modeLead}>…</span>
          ) : lead ? (
            <>
              <span className={r.modeLead}>
                <span>{LEAD_LABEL}</span> <span className={r.leadName}>{lead.name}</span>
              </span>
              <span className={r.modeDmg}>{dmgText(lead.damage)}</span>
            </>
          ) : (
            <span className={r.modeLead}>아직 1위가 없어요</span>
          )}
        </span>
      </header>

      <div className={r.stage} aria-label={`${MODE_NAME[mode]} 1·2·3위`}>
        <ol className={r.podium}>
          {[1, 0, 2].map((i) => {
            const row = data?.rows[i];
            return row ? <Step key={i} row={row} /> : <li key={i} className={r.blank} data-place={i + 1} aria-hidden="true" />;
          })}
        </ol>
        {!data ? <p className={r.none}>{error ?? "불러오는 중…"}</p> : data.rows.length === 0 && <p className={r.none}>아직 기록이 없어요. 지금 1위가 될 기회!</p>}
      </div>

      <div className={r.mine} data-testid={`chair-mine-${mode}`}>
        {!data ? (
          <span className={r.mineNote}>…</span>
        ) : data.staff ? (
          <span className={r.mineNote}>운영자는 순위에 들지 않아요.</span>
        ) : data.mine ? (
          <>
            <span className={r.place}>{data.mine.rank}위</span>
            <span className={r.who}>내 기록</span>
            <span className={r.mineStat}>
              <b>{dmgText(data.mine.damage)}</b>
              <small>버틴 시간 {msClock(data.mine.ms)}</small>
            </span>
          </>
        ) : (
          <span className={r.mineNote}>이번 주 내 기록이 아직 없어요.</span>
        )}
      </div>
    </section>
  );
}

/** 11/22 명예의 전당: 지난 주들 1위 (노멀·헬 함께, 최근 주부터). 맨 위 주는 크게. 한 번만 받는다 (주마다 바뀐다) */
function HallBox() {
  const [hall, setHall] = useState<ChairHallResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    chairHall()
      .then((v) => alive && setHall(v))
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);
  const latest = hall?.rows[0]?.week;
  return (
    <section className={r.hall} aria-label="회장님 독대 명예의 전당" data-testid="chair-hall">
      <h3 className={r.hallTitle}>
        명예의 전당<span>지난 주 1위를 모아 둬요</span>
      </h3>
      {!hall ? (
        <p className={r.none}>{error ?? "불러오는 중…"}</p>
      ) : hall.rows.length === 0 ? (
        <p className={r.hallEmpty}>{HALL_EMPTY}</p>
      ) : (
        <ol className={r.hallList}>
          {hall.rows.map((h) => (
            <HallLine key={`${h.week}:${h.mode}`} h={h} top={h.week === latest} />
          ))}
        </ol>
      )}
    </section>
  );
}

function HallLine({ h, top }: { h: ChairHallRow; top: boolean }) {
  if (h.mode === "duo") return <DuoHallLine h={h} top={top} />;
  return (
    <li className={r.hallRow} data-mode={h.mode} data-top={top || undefined}>
      <span className={r.hallWeek}>{hallWeekText(h.week)}</span>
      <span className={r.modeBadge} data-mode={h.mode}>
        {MODE_NAME[h.mode]}
      </span>
      <span className={r.hallName}>
        <span className={r.crown} aria-hidden="true">
          ♛
        </span>
        {h.name}
        {h.streak && h.streak > 1 && <small>{h.streak}주 연속</small>}
      </span>
      <span className={r.hallDmg}>{dmgText(h.damage)}</span>
      <span className={r.hallMs}>{lastedText(h.ms) ?? "버틴 시간 -"}</span>
    </li>
  );
}

/** 11/23 2관왕 주: 한 줄에 노멀·헬 피해를 위아래로 (버틴 시간도 같이) */
function DuoHallLine({ h, top }: { h: ChairHallRow; top: boolean }) {
  return (
    <li className={r.hallRow} data-mode="duo" data-top={top || undefined}>
      <span className={r.hallWeek}>{hallWeekText(h.week)}</span>
      <span className={r.modeBadge} data-mode="duo">
        2관왕
      </span>
      <span className={r.hallName}>
        <span className={r.crown} aria-hidden="true">
          ♛
        </span>
        {h.name}
        {h.streak && h.streak > 1 && <small>{h.streak}주 연속</small>}
      </span>
      <span className={r.hallDmg}>
        <span className={r.duoPart}>
          <small>노멀</small> {dmgText(h.damage)}
        </span>
        <span className={r.duoPart}>
          <small>헬</small> {dmgText(h.hell?.damage ?? 0)}
        </span>
      </span>
      <span className={r.hallMs}>
        <span className={r.duoPart}>{lastedText(h.ms) ?? "버틴 시간 -"}</span>
        <span className={r.duoPart}>{lastedText(h.hell?.ms) ?? "버틴 시간 -"}</span>
      </span>
    </li>
  );
}

/** 시상대 한 칸: 캐릭터 + 받침(등수) + 이름 + 「피해 N」 + 작게 「버틴 시간 m:ss」 */
function Step({ row }: { row: ChairTopRow }) {
  const a = row.avatar;
  const lasted = lastedText(row.ms);
  return (
    <li className={r.step} data-place={row.rank} data-me={row.me || undefined}>
      {a ? <AvatarThumb color={a.color} body={a.body} look={a.look} dye={a.dye} label={`${row.rank}위 ${row.name}`} scale={row.rank === 1 ? 2.4 : 1.9} /> : <span className={r.noAvatar} />}
      <span className={r.block}>{row.rank}</span>
      <span className={r.stepWho}>
        {row.name}
        {row.me && " (나)"}
      </span>
      <span className={r.stepDmg}>
        <small>피해</small> {num(row.damage)}
      </span>
      <span className={r.stepMs}>{lasted ?? "버틴 시간 -"}</span>
    </li>
  );
}

/** 보상 세 장 한 줄: 노멀 1위 · 헬 1위 · 2관왕 (카드마다 입어 본 모습 + 칭호 + 모자·오라 + 1위 포인트). 아래에 1~3위 포인트 한 번 */
function RewardRow() {
  const first = CHAIR_RANK_POINTS[0];
  return (
    <section className={r.rewards} aria-label="1위 보상">
      <h3 className={r.h}>
        1위 보상<span>보상 포인트는 바로 쓸 수 있지만 포인트 랭킹에는 안 들어가요</span>
      </h3>
      <div className={r.rewardRow}>
        {MODES.map((m) => (
          <RewardCard key={m} kind={m} label={`${MODE_NAME[m]} 1위 보상`} w={CHAIR_REWARD[m]} points={`${num(first)}P`} />
        ))}
        <RewardCard kind="duo" label="2관왕 보상" w={CHAIR_DUO} points={`${num(first)}P + ${num(first)}P`} testId="chair-duo-reward" />
      </div>
      <div className={r.ptsLine}>
        <span className={r.ptsLabel}>모드마다 순위 포인트</span>
        <ol className={r.pts}>
          {CHAIR_RANK_POINTS.map((p, i) => (
            <li key={i} data-place={i + 1}>
              <span>{i + 1}위</span>
              <b>{num(p)}P</b>
            </li>
          ))}
        </ol>
      </div>
      <p className={r.small}>노멀과 헬을 모두 1위 하면 2관왕 전용 꾸미기만 받아요. 포인트는 두 모드 1위 몫을 다 받아요.</p>
      <p className={r.small}>{CHAIR_PERK_OVERLAP}</p>
    </section>
  );
}

function RewardCard({ kind, label, w, points, testId }: { kind: ChairMode | "duo"; label: string; w: ChairRewardIds; points: string; testId?: string }) {
  return (
    <section className={r.rewardCard} data-kind={kind} aria-label={label} data-testid={testId}>
      <span className={r.cardHead}>{label}</span>
      <div className={r.rewardTop}>
        <OutfitCanvas color={GHOST} body="hood" look={[w.hat, w.aura]} dir={DIR.down} walking={false} label={`${itemName(w.hat)}와 ${itemName(w.aura)}를 입은 모습`} className={r.fit} />
        <div className={r.rewardItems}>
          <span className={r.badge}>♛ {w.titleName}</span>
          <span className={r.item}>
            <ItemIcon itemId={w.hat} size={24} />
            <span>{itemName(w.hat)}</span>
          </span>
          <span className={r.item}>
            <ItemIcon itemId={w.aura} size={24} />
            <span>{itemName(w.aura)}</span>
          </span>
        </div>
      </div>
      {/* 11/24 1주일 혜택 (lib/chairPerks — 판단은 서버, 이 줄은 보여 주기만) */}
      <div className={r.perks} data-testid={`chair-perks-${kind}`}>
        <span className={r.perksHead}>{CHAIR_PERK_TERM}</span>
        <ul className={r.perkList}>
          {chairPerkTags(kind).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <span className={r.cardPts}>
        <small>포인트</small> {points}
      </span>
    </section>
  );
}
