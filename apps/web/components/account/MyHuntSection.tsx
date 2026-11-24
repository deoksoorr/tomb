"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { errorMessage } from "@/lib/api";
import { GEAR_SLOTS, gearById, SLOT_LABELS, STAT_KEYS, STAT_LABELS } from "@/lib/rpg/catalog";
import { cachedRpgView, myRpgView } from "@/lib/rpg/client";
import { starLabel } from "@/lib/rpg/endgame";
import { activeSets, eggKnown, enhOfId, SG_EGG, SG_SET_INFO, SG_SETS } from "@/lib/rpg/setGear";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { slotGrade, TOTAL_ROWS } from "../rpg/gear";
import rpg from "../rpg/rpg.module.css";
import styles from "./MyPanel.module.css";
import h from "./MyHunt.module.css";

// 11/20 [내 정보] 사냥 칸: 사냥 레벨·경험치, 능력치(STR 등 — 보기만), 전투 능력(장비창 왼쪽 판과 같은 값 — 서버 derived), 낀 장비·켜진 세트 효과, 야근 빌딩 최고 층.
// 사냥 창이 받아 둔 값(lib/rpg/client cachedRpgView)이 있으면 그대로, 없으면 열 때 GET /api/rpg 한 번.

const won = (n: number) => n.toLocaleString("ko-KR");

export default function MyHuntSection({ accountId, onGoHunt }: { accountId: string; onGoHunt?: () => void }) {
  const [view, setView] = useState<RpgView | null>(() => cachedRpgView(accountId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view) return;
    let alive = true;
    myRpgView(accountId)
      .then((v) => alive && setView(v))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={styles.section} aria-labelledby="my-hunt">
      <h3 id="my-hunt" className={styles.heading}>
        사냥
      </h3>
      {!view ? (
        <p className={styles.sub} role="status">
          {error ?? "불러오는 중…"}
        </p>
      ) : (
        <>
          <HuntStats view={view} />
          {/* 사냥 기록이 없어도 기본 캐릭터(Lv.1) 값은 그대로 보이고, 아래에 작게 입구 안내만 */}
          {view.character.runs === 0 && (
            <div className={h.first}>
              <p className={styles.sub}>아직 사냥터에 가 본 적이 없어요.</p>
              {onGoHunt && (
                <button type="button" className={cx(ui.button, ui.quiet, h.go)} onClick={onGoHunt}>
                  사냥터 입구로 가기
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function HuntStats({ view }: { view: RpgView }) {
  const c = view.character;
  const eg = view.endgame;
  // 레벨 50(끝판)이면 초월 경험치, 아니면 레벨 경험치 (사냥 창 위쪽 막대와 같다)
  const [exp, need] = eg ? [c.tExp, eg.tExpToNext] : [c.exp, view.expToNext];
  const { counts } = activeSets(c.equip);
  const sets = SG_SETS.filter((set) => counts[set] >= 2);
  const towerBest = eg?.tower.best ?? c.fBest;

  return (
    <div className={h.box}>
      <div className={h.top}>
        <p className={h.level}>
          Lv.<strong>{c.level}</strong>
          {eg && c.tLevel > 0 && <strong className={h.star}> {starLabel(c.tLevel)}</strong>}
        </p>
        <p className={h.exp}>
          {eg ? "초월 EXP" : "EXP"} {won(exp)} / {need ? won(need) : "MAX"}
        </p>
      </div>
      <div
        className={cx(rpg.expBar, eg && rpg.tBar)}
        role="meter"
        aria-label={eg ? "초월 EXP" : "EXP"}
        aria-valuenow={exp}
        aria-valuemin={0}
        aria-valuemax={need || 1}
      >
        <span style={{ width: `${need ? Math.min(100, (exp / need) * 100) : 100}%` }} />
      </div>

      {/* 능력치: 사냥 창 [능력치] 칸과 같은 표기 (찍은 값 + 장비 몫). 여기서는 보기만 — 찍기는 사냥 창에서 */}
      <div className={h.subhead}>
        <span>능력치</span>
        {c.statPoints > 0 && <span className={h.left}>남은 포인트 {c.statPoints}</span>}
      </div>
      <dl className={h.base} aria-label="능력치">
        {STAT_KEYS.map((k) => {
          const gear = view.derived.stats[k] - c.stats[k];
          return (
            <div key={k} title={STAT_LABELS[k].desc}>
              <dt>{STAT_LABELS[k].name}</dt>
              <dd>
                {c.stats[k]}
                {gear !== 0 && (
                  <span className={h.gearPart}>
                    {" "}
                    장비 {gear > 0 ? "+" : ""}
                    {gear}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className={h.subhead}>
        <span>전투 능력</span>
      </div>
      <dl className={h.stats} aria-label="전투 능력">
        {TOTAL_ROWS.map(([k, , f, name]) => (
          <div key={k}>
            <dt>{name}</dt>
            <dd>{f(view.derived[k])}</dd>
          </div>
        ))}
      </dl>

      {towerBest > 0 && (
        <dl className={h.records} aria-label="기록">
          <div>
            <dt>야근 빌딩 최고</dt>
            <dd>{towerBest}층</dd>
          </div>
        </dl>
      )}

      <dl className={h.gear} aria-label="낀 장비">
        {GEAR_SLOTS.map((slot) => {
          const id = c.equip[slot];
          const def = id ? gearById(id) : undefined;
          const e = enhOfId(id);
          const grade = slotGrade(id);
          return (
            <div key={slot}>
              <dt>{SLOT_LABELS[slot]}</dt>
              <dd style={grade ? ({ "--tone": grade.color } as CSSProperties) : undefined} data-empty={!def || undefined}>
                {def ? def.name : "비어 있음"}
                {def && e > 0 && <b className={h.plus}> +{e}</b>}
              </dd>
            </div>
          );
        })}
      </dl>

      {sets.length > 0 && (
        <ul className={h.sets} aria-label="켜진 세트 효과">
          {sets.map((set) => {
            const info = SG_SET_INFO[set];
            const n = counts[set];
            return (
              <li key={set} style={{ "--set": info.color } as CSSProperties}>
                <b>
                  {info.name} {n}개
                </b>
                <span>{info.two}</span>
                {n >= 4 && <span>{info.four}</span>}
                {n >= 5 && eggKnown(c.sgEgg, set) && <span>{SG_EGG[set].name}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
