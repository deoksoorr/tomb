"use client";

import { useState } from "react";
import { monsterIdleCanvas } from "@/game/rpg/monsterArt";
import { dexRarityOf, dexRewardLabel, RARITY_LABEL, type Rarity } from "@/lib/forage/catalog";
import { MOB_DEX_IDS, MOB_GROUPS, MOB_MARKS, MOB_ROLE_LABEL, mobMarks, mobRole, mobWhere, mobZoneName } from "@/lib/forage/mobDex";
import type { DexEntry } from "@/lib/forage/types";
import { DIFFS, MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { cx } from "../ui/cx";
import { FactGrid, InfoCard } from "../ui/InfoBlocks";
import fs from "./forage.module.css";
import s from "./MonsterDex.module.css";

// 도감의 「몬스터」 칸 (11/16): 사냥터·야근 빌딩에서 처음 쓰러뜨린 몬스터가 등록된다 (서버가 받아들인 판의 처치 수만 — lib/rpg/service recordMobKills).
// 묶음은 처음 나오는 사냥터·야근 빌딩 테마마다 (고른 칸의 정보는 그 묶음 바로 아래). 등록 전은 검은 실루엣과 「???」, 사는 곳 힌트만 보인다.
// 등록하면 게임 속 모습(가만히 프레임)·이름·설명·쓰러뜨린 수·처음 쓰러뜨린 날·처치 표시(100·1,000·10,000마리).
// 내 도감·이웃 도감 구경이 같은 칸을 쓴다 (dex만 다르다).

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const ymd = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d);
const num = (n: number) => n.toLocaleString("ko-KR");
/** 칸 구석의 짧은 처치 표시 (100 · 1천 · 1만) */
const markShort = (m: number) => (m >= 10_000 ? `${m / 10_000}만` : m >= 1_000 ? `${m / 1_000}천` : String(m));
const NO = new Map(MOB_DEX_IDS.map((id, i) => [id, i + 1]));
const killsOf = (dex: Record<string, DexEntry>, id: string) => dex[id]?.n ?? 0;

/** 몬스터 가만히 그림 (캔버스 → dataURL, 처음 한 번만). 등록 전이면 칸 CSS가 검은 실루엣으로 바꾼다 */
const urls = new Map<MonsterId, string>();
function MobPic({ id, size }: { id: MonsterId; size: number }) {
  let url = urls.get(id) ?? "";
  if (!url && typeof document !== "undefined") {
    url = monsterIdleCanvas(id).toDataURL("image/png");
    urls.set(id, url);
  }
  // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트
  return url ? <img src={url} width={size} height={size} alt="" aria-hidden="true" className={s.pic} /> : <span style={{ width: size, height: size }} />;
}

/** 사는 곳 힌트 (세 곳까지, 더 있으면 「외 N곳」) */
function whereText(id: MonsterId): string {
  const names = mobWhere(id).map(mobZoneName);
  if (!names.length) return "어딘가에 숨어 있어요";
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}곳` : names.join(", ");
}

export default function MonsterDex({ dex }: { dex: Record<string, DexEntry> }) {
  const [sel, setSel] = useState<MonsterId | null>(null);
  // 칸이 많아 고른 몬스터 정보는 그 묶음 바로 아래에, 안내는 맨 위에 늘 (칸을 눌러도 위치가 밀리지 않게)
  return (
    <>
      <MobGuide dex={dex} />
      {MOB_GROUPS.map((g) => {
        const got = g.ids.filter((id) => killsOf(dex, id) > 0).length;
        return (
          <section key={g.zone} className={s.group} aria-label={g.name}>
            <h4 className={s.groupHead}>
              <span>{g.name}</span>
              {!g.tower && <span className={s.diff}>{DIFFS[g.difficulty].name}</span>}
              <span className={s.count} data-full={got === g.ids.length}>
                {got}/{g.ids.length}
              </span>
            </h4>
            <div className={fs.grid}>
              {g.ids.map((id) => {
                const n = killsOf(dex, id);
                const known = n > 0;
                const role = mobRole(id);
                const top = mobMarks(n).reached.at(-1);
                const rarity = dexRarityOf(id) ?? 1;
                return (
                  <button
                    key={id}
                    type="button"
                    className={cx(fs.cell, s.cell)}
                    data-known={known}
                    data-role={role}
                    aria-pressed={sel === id}
                    aria-label={known ? `${MONSTERS[id].name}${role === "boss" ? " (우두머리)" : ""}` : `${NO.get(id)}번 · 아직 못 쓰러뜨림`}
                    onClick={() => setSel(id)}
                  >
                    <span className={fs.num}>{NO.get(id)}</span>
                    <MobPic id={id} size={32} />
                    {role === "boss" && (
                      <span className={s.boss} aria-hidden="true">
                        ♛
                      </span>
                    )}
                    {top && (
                      <span className={s.mark} aria-hidden="true">
                        {markShort(top)}
                      </span>
                    )}
                    <span className={fs.rare} aria-hidden="true">
                      {rarity >= 3 ? "★".repeat(rarity - 2) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {sel && g.ids.includes(sel) && <MobDetail id={sel} entry={dex[sel]} />}
          </section>
        );
      })}
    </>
  );
}

function MobDetail({ id, entry }: { id: MonsterId; entry: DexEntry | undefined }) {
  const m = MONSTERS[id];
  const role = mobRole(id);
  const rarity = (dexRarityOf(id) ?? 1) as Rarity;
  const known = (entry?.n ?? 0) > 0;
  const marks = mobMarks(entry?.n ?? 0);
  return (
    <div className={cx(fs.detail, s.detail, !known && fs.unknown)} role="status">
      <MobPic id={id} size={48} />
      <div>
        <h4>{known ? m.name : "??? (아직 못 쓰러뜨렸어요)"}</h4>
        <span className={fs.stars} aria-label={RARITY_LABEL[rarity]}>
          {stars(rarity)} {role !== "normal" ? MOB_ROLE_LABEL[role] : RARITY_LABEL[rarity]}
        </span>
        {known && <p style={{ margin: "4px 0 0" }}>{m.desc}</p>}
        <dl>
          <dt>사는 곳</dt>
          <dd>{whereText(id)}</dd>
          <dt>처음 등록 보상</dt>
          <dd>{dexRewardLabel(id)}</dd>
          {known && entry ? (
            <>
              <dt>쓰러뜨린 수</dt>
              <dd>{num(entry.n)}마리</dd>
              <dt>처음</dt>
              <dd>{ymd(entry.first)}</dd>
              <dt>처치 표시</dt>
              <dd>
                <span className={s.marks}>
                  {MOB_MARKS.map((mk) => (
                    <span key={mk} className={s.markTag} data-on={marks.reached.includes(mk)}>
                      {num(mk)}마리
                    </span>
                  ))}
                </span>
                {marks.next !== null && (
                  <span className={s.next}>
                    다음 표시까지 {num(marks.next - entry.n)}마리 남았어요
                  </span>
                )}
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

/** 맨 위 안내: 사냥터·야근 빌딩·우두머리별 모은 수와 등록 방법 */
function MobGuide({ dex }: { dex: Record<string, DexEntry> }) {
  const count = (ids: readonly MonsterId[]) => ({ got: ids.filter((id) => killsOf(dex, id) > 0).length, all: ids.length });
  const rows = [
    { label: "사냥터", ...count(MOB_GROUPS.filter((g) => !g.tower).flatMap((g) => g.ids)) },
    { label: "야근 빌딩", ...count(MOB_GROUPS.filter((g) => g.tower).flatMap((g) => g.ids)) },
    { label: "우두머리", ...count(MOB_DEX_IDS.filter((id) => mobRole(id) === "boss")) },
  ];
  const kills = MOB_DEX_IDS.reduce((n, id) => n + killsOf(dex, id), 0);
  return (
    <InfoCard title="몬스터 모으는 법" icon="book" aside="칸을 누르면 그 몬스터 정보가 보여요" className={s.guide}>
      <FactGrid facts={rows.map((r) => ({ label: r.label, value: `${r.got}/${r.all}`, tone: r.got === r.all ? ("good" as const) : undefined }))} />
      <p className={s.hint}>
        사냥터나 야근 빌딩에서 처음 쓰러뜨리면 등록돼요. 결과가 인정된 판만 세고, 도감이 생긴 뒤에 쓰러뜨린 것부터 쌓여요.
        {kills > 0 ? ` 지금까지 ${num(kills)}마리를 쓰러뜨렸어요.` : ""}
      </p>
    </InfoCard>
  );
}
