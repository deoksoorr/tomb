"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { HUNT_DROP_ROLLS, KILLS_PER_DROP_ROLL } from "@/lib/rpg/rewards";
import { TOWER_BOSS_EVERY } from "@/lib/rpg/tower";
import Dialog from "../ui/Dialog";
import { cx } from "../ui/cx";
import {
  chestRows,
  cosDaysRows,
  cosTierRows,
  DIFF_NAMES,
  dyeRows,
  enhanceFailBonus,
  enhanceRows,
  inheritRows,
  forageFacts,
  goblinFacts,
  gradeRows,
  gullRows,
  HUNT_POTION_SHARE,
  huntRows,
  legendOption,
  lotteryAny,
  lotteryRows,
  pct,
  perkRows,
  pieceRows,
  potionRows,
  rarityRows,
  setShare,
  starsPotionRow,
  STARS_POTION_PERF,
  wishBonus,
  wishRows,
  xmasFallback,
  xmasRows,
} from "./oddsData";
import type { OddsSection } from "./oddsStore";
import styles from "./OddsDialog.module.css";

// 11/18 확률 안내: 무작위로 정해지는 보상의 확률을 한곳에. 숫자는 oddsData가 규칙 상수에서 읽는다

const SECTIONS: { id: Exclude<OddsSection, "top">; label: string }[] = [
  { id: "hunt", label: "사냥터" },
  { id: "tower", label: "야근 빌딩 상자" },
  { id: "enhance", label: "강화" },
  { id: "stars", label: "별자리 잇기" },
  { id: "forage", label: "낚시와 채집" },
  { id: "gull", label: "갈매기 과자" },
  { id: "wish", label: "소원 분수" },
  { id: "goblin", label: "황금 고블린" },
  { id: "xmas", label: "선물상자" },
  { id: "lottery", label: "행운권" },
  { id: "dye", label: "염색권" },
];

const sectionId = (id: string) => `odds-${id}`;

/** "12.5%" → 0.125 (막대 그리기용, 퍼센트가 아니면 null) */
function pctValue(text: string): number | null {
  const m = /^([\d.,]+)%$/.exec(text.trim());
  return m ? Number(m[1].replace(/,/g, "")) / 100 : null;
}

/** 표 한 장. bar = 그 칸에 비율 막대를 같이 (합이 100%인 표) */
function OddsTable({ head, rows, bar }: { head: string[]; rows: ReactNode[][]; bar?: number }) {
  return (
    <div className={styles.scroll}>
      <table className={cx(styles.table, head.length > 3 && styles.wide)}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest], i) => (
            <tr key={i}>
              <th scope="row">{first}</th>
              {rest.map((cell, j) => {
                const v = bar === j + 1 && typeof cell === "string" ? pctValue(cell) : null;
                return (
                  <td key={j}>
                    {cell}
                    {v !== null && (
                      <span className={styles.bar} aria-hidden="true">
                        <span style={{ width: `${Math.max(2, Math.min(100, v * 100))}%` }} />
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={sectionId(id)} className={styles.section} aria-labelledby={`${sectionId(id)}-h`}>
      <h3 id={`${sectionId(id)}-h`}>{title}</h3>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </section>
  );
}

export default function OddsDialog({ section, onClose }: { section: OddsSection; onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);

  // 연 곳의 칸으로 바로 (전체 안내로 열면 맨 위)
  useEffect(() => {
    if (section === "top") return;
    const el = body.current?.querySelector<HTMLElement>(`#${sectionId(section)}`);
    el?.scrollIntoView({ block: "start" });
  }, [section]);

  const jump = (id: string) => body.current?.querySelector<HTMLElement>(`#${sectionId(id)}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  const f = forageFacts();
  const g = goblinFacts();
  const w = wishBonus();
  const legend = legendOption();
  const cos = cosTierRows();

  return (
    <Dialog title="확률 안내" onClose={onClose}>
      <div ref={body} className={styles.odds}>
        <p className={styles.intro}>무작위로 정해지는 것들의 확률이에요. 게임 규칙에서 바로 읽어 와서, 규칙이 바뀌면 여기 숫자도 같이 바뀌어요.</p>
        <nav className={styles.nav} aria-label="확률 안내 차례">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={cx(styles.chip, s.id === section && styles.chipOn)} onClick={() => jump(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <Section
          id="hunt"
          title="사냥터"
          lead={`${KILLS_PER_DROP_ROLL}마리 잡을 때마다 한 번, 한 판에 ${HUNT_DROP_ROLLS}번까지 굴려요. 나오면 ${pct(HUNT_POTION_SHARE)}는 물약, 나머지는 장비예요.`}
        >
          <OddsTable head={["", ...DIFF_NAMES]} rows={huntRows()} />
          <p className={styles.note}>장비는 그 난이도 레벨 범위에서 골라요. 싼 장비일수록 잘 나오고, 사냥터마다 잘 나오는 장비는 3배 더 잘 나와요.</p>
          <OddsTable head={["물약 종류", "비율"]} rows={potionRows()} bar={1} />
        </Section>

        <Section id="tower" title="야근 빌딩 우두머리 상자" lead={`${TOWER_BOSS_EVERY}층마다 우두머리를 깨면 상자 하나를 열어요.`}>
          <OddsTable head={["나오는 것", "확률"]} rows={chestRows()} />
          <h4 className={styles.sub}>세트 장비</h4>
          <OddsTable head={["상자 층", "직급"]} rows={gradeRows()} />
          <OddsTable head={["부위", "비율"]} rows={pieceRows()} bar={1} />
          <p className={styles.note}>
            세트 네 가지는 {setShare()}씩 같아요. {legend.grade}은 {legend.chance} 확률로 전설 옵션이 하나 더 붙어요.
          </p>
          <h4 className={styles.sub}>꾸미기</h4>
          <OddsTable head={cos.head} rows={cos.rows} />
          <OddsTable head={["기간", "비율"]} rows={cosDaysRows()} bar={1} />
          <p className={styles.note}>전설 꾸미기는 30일 대신 7일이에요.</p>
        </Section>

        <Section id="enhance" title="강화" lead={`실패할 때마다 다음 성공 확률이 ${enhanceFailBonus()}씩 올라요. 성공하면 처음 확률로 돌아가요.`}>
          <OddsTable head={["목표", "성공", "실패하면", "포인트"]} rows={enhanceRows()} />
          <h4 className={styles.sub}>강화 승계</h4>
          <p className={styles.lead}>
            같은 부위의 더 높은 직급 세트 장비로만 옮겨요. 받은 뒤 기본 능력치가 재료보다 떨어지지 않는 가장 낮은 단계로 옮겨져서, 직급 차이가 클수록 단계는 많이 줄어요.
            재료 장비는 사라져요. 상점 장비는 사원급보다 아래 직급으로 쳐요.
          </p>
          <OddsTable head={inheritRows().head} rows={inheritRows().rows} />
          <p className={styles.note}>비용은 받는 단계까지 한 번에 성공했을 때의 포인트를 더한 값이고, 결재 서류는 받는 단계 수만큼 들어요.</p>
        </Section>

        <Section id="stars" title="별자리 잇기" lead={`성적이 ${pct(STARS_POTION_PERF)}를 넘으면 물약을 한 번 굴려요. 물약 종류는 사냥터와 같아요.`}>
          <OddsTable head={["", ...DIFF_NAMES]} rows={[starsPotionRow()]} />
        </Section>

        <Section id="forage" title="낚시와 채집" lead="그 자리, 그 시간, 그 날씨에 나오는 것끼리 무게대로 나눠요. 다섯 등급이 한 종씩 있는 자리라면 아래 비율이에요.">
          <OddsTable head={["등급", "무게", "비율"]} rows={rarityRows()} bar={2} />
          <ul className={styles.facts}>
            <li>
              자동 낚시는 {f.autoEvery}마다 찌를 올려 {f.autoCatch} 확률로 한 마리가 걸려요. 하루 한도는 없어요.
            </li>
            <li>
              직접 낚시하면 {f.sunken}, 자동 낚시는 걸린 한 마리마다 {f.sunkenAuto} 확률로 물고기 대신 물에 빠진 꾸미기가 걸려요.
            </li>
            <li>바닷가 만조 앞뒤 30분쯤은 {f.highTide} 확률로 크기를 한 번 더 굴려 큰 쪽을 가져요.</li>
            <li>채집은 {f.gatherDouble} 확률로 같은 것이 2개 나와요. 갯벌 파기는 늘 1개예요.</li>
            <li>긴급 의뢰 축제 동안은 희귀 이상이 {f.festBoost} 더 잘 나와요.</li>
          </ul>
          <OddsTable head={["칭호 등급", "큰 물고기 확률", "희귀 채집 확률"]} rows={perkRows("fish").map((r, i) => [...r, perkRows("forage")[i][1]])} />
          <p className={styles.note}>낚시 칭호는 그 확률로 크기를 한 번 더 굴려요. 채집 칭호는 그 확률로 희귀 이상에서만 골라요.</p>
        </Section>

        <Section id="gull" title="갈매기 과자" lead="과자를 던질 때마다 굴려요.">
          <OddsTable head={["과자", "떨어지는 깃털"]} rows={gullRows()} />
        </Section>

        <Section id="wish" title="소원 분수">
          <OddsTable head={["운세", "확률"]} rows={wishRows()} bar={1} />
          <ul className={styles.facts}>
            <li>{w.jackpot}는 대박이라 던진 동전의 두 배에 5P를 더 돌려받아요.</li>
            <li>{w.sparkle}는 반짝이라 던진 동전에 1~5P를 더 돌려받아요.</li>
            <li>나머지 {w.none}는 돌아오지 않아요.</li>
          </ul>
        </Section>

        <Section id="goblin" title="황금 고블린">
          <ul className={styles.facts}>
            <li>사람이 있는 채널마다 {g.gap}에 한 번쯤 나타나서 {g.life} 머물러요.</li>
            <li>
              보상은 {g.normal} 확률로 {g.points} 사이에서 고르게(10P 단위), {g.jackpotChance} 확률로 대박 {g.jackpot}이에요. 평균 {g.avg}예요.
            </li>
            <li>가장 먼저 잡은 한 사람만 받아요.</li>
          </ul>
        </Section>

        <Section id="xmas" title="크리스마스 선물상자" lead="처음 열 때 확률이에요. 이미 가진 것은 빼고 남은 것끼리 같은 비율로 나눠요.">
          <OddsTable head={["꾸미기", "확률"]} rows={xmasRows()} bar={1} />
          <p className={styles.note}>모두 가지고 있으면 대신 {xmasFallback()}를 받아요.</p>
        </Section>

        <Section id="lottery" title="행운권" lead="한 사람이 한 주에 한 장 사요. 산 사람 중에서 1등, 2등, 3등을 한 명씩 뽑고, 한 사람은 한 번만 당첨돼요.">
          <OddsTable head={["등수", "모인 포인트 중"]} rows={lotteryRows()} bar={1} />
          <p className={styles.note}>
            산 사람이 100명이면 1등은 {pct(1 / 100)}, 어느 등수든 당첨될 확률은 {pct(lotteryAny(100))}예요.
          </p>
        </Section>

        <Section id="dye" title="무작위 염색권" lead="판 한 장 넓이마다 특수 색 무리가 숨어 있을 확률이에요. 60초 동안 판을 옮기며 찾을 수 있어요.">
          <OddsTable head={["염색권", "특수 색 무리", "나오는 특수 색"]} rows={dyeRows()} />
        </Section>
      </div>
    </Dialog>
  );
}
