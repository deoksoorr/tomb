"use client";

import { useEffect, useState } from "react";
import { DIR, itemName } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { CHAIR_DUO, CHAIR_RANK_POINTS, CHAIR_REWARD, type ChairRewardIds } from "@/lib/chairman/rewards";
import { chairWeek, type ChairMode } from "@/lib/chairman/rules";
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
//  위: 노멀·헬 카드 탭(초상 + 이번 주 현재 1위 이름·피해) → 남은 시간 줄
//  가운데: 1·2·3위 시상대(캐릭터 모습) | 1위 보상 상자(칭호·모자·오라 입어 보기·포인트)
//  아래: 4위부터 목록(고정 높이 스크롤) + 맨 아래 내 순위 줄 → 11/22 명예의 전당 (지난 주들 1위, 노멀·헬 함께). 헬은 붉은 강조색. 폰은 한 줄로 쌓는다
//  11/22 순위는 피해량으로 정한다 — 큰 숫자는 늘 「피해」, 버틴 시간은 작게 「버틴 시간 1:10」
//  11/23 2관왕 (노멀·헬 모두 1위): 보상 상자 아래에 2관왕 전용 한 벌 · 명예의 전당은 그 주를 「2관왕」 한 줄로

const GHOST = "#e8d9b0";

export default function ChairRank({ initial }: { initial: ChairMode }) {
  const [mode, setMode] = useState<ChairMode>(initial);
  const [got, setGot] = useState<ChairRankResponse | null>(null);
  const data = got?.mode === mode ? got : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      chairRank(mode)
        .then((v) => {
          if (!alive) return;
          setGot(v);
          setError(null);
        })
        .catch((e: unknown) => alive && setError(errorMessage(e)));
    void load();
    const t = setInterval(() => !tabHidden() && void load(), RACE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode]);

  // 모드를 바꾸는 동안 1위 피해 칸이 비지 않게 마지막 응답을 쓴다
  const leaders = (data ?? got)?.leaders;
  const rest = data?.rows.slice(3) ?? [];
  return (
    <section className={r.wrap} data-mode={mode} aria-label="회장님 독대 이번 주 순위" data-testid="chair-rank">
      <div className={r.modes} role="tablist" aria-label="모드">
        {(["normal", "hell"] as const).map((m) => {
          const lead = leaders?.[m];
          return (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={r.modeCard} data-mode={m} onClick={() => setMode(m)}>
              <ChairPortrait hell={m === "hell"} className={r.modeArt} />
              <span className={r.modeText}>
                <b>{MODE_NAME[m]}</b>
                {!leaders ? (
                  <span className={r.modeLead}>…</span>
                ) : lead ? (
                  <>
                    <span className={r.modeLead}>
                      <span className={r.leadLabel}>{LEAD_LABEL}</span> <span className={r.leadName}>{lead.name}</span>
                    </span>
                    <span className={r.modeDmg}>{dmgText(lead.damage)}</span>
                  </>
                ) : (
                  <span className={r.modeLead}>아직 1위가 없어요</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <RaceCountdown weekOf={chairWeek} />

      <div className={r.mid}>
        <section className={r.stage} aria-label="이번 주 1·2·3위">
          <h3 className={r.h}>
            이번 주 시상대<span>한 판 최고 피해로 겨뤄요</span>
          </h3>
          <ol className={r.podium}>
            {[1, 0, 2].map((i) => {
              const row = data?.rows[i];
              return row ? <Step key={i} row={row} /> : <li key={i} className={r.blank} data-place={i + 1} aria-hidden="true" />;
            })}
          </ol>
          {!data ? <p className={r.none}>{error ?? "불러오는 중…"}</p> : data.rows.length === 0 && <p className={r.none}>아직 기록이 없어요. 지금 1위가 될 기회!</p>}
        </section>
        <RewardBox mode={mode} />
      </div>

      <section className={r.list} aria-label="4위부터">
        <div className={r.head} aria-hidden="true">
          <span>순위</span>
          <span>이름</span>
          <span>피해량</span>
          <span>버틴 시간</span>
        </div>
        <ol className={r.rows}>
          {rest.map((row) => (
            <Line key={row.rank} row={row} />
          ))}
          {data && rest.length === 0 && <li className={r.empty}>{data.rows.length ? "4위부터는 아직 비어 있어요." : "기록이 생기면 여기에 줄을 서요."}</li>}
        </ol>
        <div className={r.mine} data-testid="chair-mine">
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
      <HallBox />
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

function Line({ row }: { row: ChairTopRow }) {
  return (
    <li className={r.row} data-me={row.me || undefined}>
      <span className={r.place}>{row.rank}위</span>
      <span className={r.who}>
        {row.name}
        {row.me && " (나)"}
      </span>
      <span className={r.dmg}>{num(row.damage)}</span>
      <span className={r.ms}>{msClock(row.ms)}</span>
    </li>
  );
}

/** 1위 보상: 칭호 배지 · 모자 · 오라 (입어 본 모습) · 1~3위 포인트 · 11/23 2관왕 전용 한 벌 */
function RewardBox({ mode }: { mode: ChairMode }) {
  return (
    <section className={r.reward} aria-label={`${MODE_NAME[mode]} 1위 보상`}>
      <h3 className={r.h}>1위 보상</h3>
      <RewardSet w={CHAIR_REWARD[mode]} />
      <ol className={r.pts}>
        {CHAIR_RANK_POINTS.map((p, i) => (
          <li key={i} data-place={i + 1}>
            <span>{i + 1}위</span>
            <b>{num(p)}P</b>
          </li>
        ))}
      </ol>
      <p className={r.small}>포인트는 지갑에만 들어가요.</p>
      <section className={r.duo} aria-label="2관왕 보상" data-testid="chair-duo-reward">
        <span className={r.duoHead}>2관왕</span>
        <RewardSet w={CHAIR_DUO} small />
        <p className={r.small}>노멀과 헬을 모두 1위 하면 2관왕 전용 꾸미기만 받아요. 포인트는 두 모드 1위 몫을 다 받아요.</p>
      </section>
    </section>
  );
}

/** 칭호 배지 + 모자 + 오라 (입어 본 모습) */
function RewardSet({ w, small = false }: { w: ChairRewardIds; small?: boolean }) {
  return (
    <div className={r.rewardTop}>
      <OutfitCanvas color={GHOST} body="hood" look={[w.hat, w.aura]} dir={DIR.down} walking={false} label={`${itemName(w.hat)}와 ${itemName(w.aura)}를 입은 모습`} className={small ? `${r.fit} ${r.fitSmall}` : r.fit} />
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
  );
}
