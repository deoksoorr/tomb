"use client";

import { itemById } from "@tomb/protocol";
import { request } from "@/lib/api";
import { URGENT_DEF } from "@/lib/forage/quests/urgent";
import type { AdminUrgentResult, AdminUrgentResultsResponse } from "@/lib/forage/quests/urgentTypes";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { fullTime } from "./memberFormat";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const load = () => request<AdminUrgentResultsResponse>("/api/admin/urgent", { cache: "no-store" });
const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 11/22 「긴급 의뢰 결과」: 최근 끝난 긴급 의뢰(최대 20개)마다 시각·종류·최종 %·낸 사람(수·순위·보상)·행운의 배달부.
 * 기록은 의뢰가 끝날 때 한 번 남긴다 (lib/forage/quests/urgentService recordUrgentResult). 받음 칸은 받기 기록이 남은 동안(끝나고 약 4일)만
 */
export default function UrgentResultsPanel({ toast, onAuthLost }: Props) {
  const state = usePanelLoad(load, [], toast, onAuthLost);
  const list = state.data?.results ?? null;
  return (
    <section className={styles.notices} aria-label="긴급 의뢰 결과">
      <p className={ui.hint}>
        100%를 넘긴 판은 많이 낸 1·2·3등이 도장 5·3·2개를 더 받고 1등은 「긴급 배달왕」 칭호를 받아요. 150%면 1등에게 무작위 꾸미기가 더 가요. 도장 칸은 단계 도장과 순위 보너스를 합친 수예요 (주머니 속 도장은 열 때라 빠져 있어요).
      </p>
      <LoadState {...state} />
      {list && list.length === 0 && <Empty>아직 끝난 긴급 의뢰 기록이 없어요.</Empty>}
      {list?.map((r) => <ResultCard key={r.id} r={r} />)}
    </section>
  );
}

function ResultCard({ r }: { r: AdminUrgentResult }) {
  const d = URGENT_DEF[r.kind];
  const lucky = r.lucky ? r.claimed[r.lucky.acct] : undefined;
  return (
    <article className={styles.notice} aria-label={`${fullTime(r.start)} 긴급 의뢰 결과`}>
      <p className={styles.noticeTitle}>
        <strong>
          {fullTime(r.start)} · {d.label} {fmt(r.goal)}
          {d.unit} · {r.pct}%
        </strong>
        {r.early && <span className={ui.tag}>150% 일찍 끝남</span>}
        {!/^\d{8}-\d$/.test(r.id) && <span className={ui.tag}>시험</span>}
      </p>
      <p className={ui.hint}>
        {fullTime(r.end)} 끝 · 모은 수 {fmt(r.n)}/{fmt(r.goal)} · 낸 사람 {fmt(r.count)}명
        {r.count > r.rows.length && ` (앞 ${r.rows.length}명만 보여요)`} · 의뢰 id <code>{r.id}</code>
      </p>
      <p className={ui.hint}>
        행운의 배달부:{" "}
        {r.lucky ? (
          <>
            {r.lucky.name} <code>{r.lucky.acct}</code> {lucky ? `받음${lucky.cos ? ` (${itemById(lucky.cos.id)?.name ?? lucky.cos.id} ${lucky.cos.days}일)` : ""}` : "아직 안 받음"}
          </>
        ) : r.stage >= 100 ? (
          "뽑을 사람이 없었어요"
        ) : (
          "100%를 못 넘겨 없어요"
        )}
        {r.last && (
          <>
            {" "}
            · 아슬아슬 마감: {r.last.name} <code>{r.last.acct}</code>
          </>
        )}
      </p>
      {r.rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="낸 사람과 보상">
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">이름</th>
                <th scope="col">계정 id</th>
                <th scope="col" className={styles.num}>
                  낸 수
                </th>
                <th scope="col" className={styles.num}>
                  도장
                </th>
                <th scope="col">그 밖의 보상</th>
                <th scope="col">받음</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => {
                const c = r.claimed[row.acct];
                const extra = [
                  row.box && "뒷주머니",
                  row.king && (row.kingCos ? "배달왕 칭호·꾸미기" : "배달왕 칭호"),
                  row.lucky && "행운의 배달부",
                  row.last && "아슬아슬 마감",
                ].filter(Boolean);
                return (
                  <tr key={row.acct}>
                    <td className={styles.nowrap}>{r.stage >= 100 && row.rank <= 3 ? <strong>{row.rank}등</strong> : `${row.rank}`}</td>
                    <td className={styles.nowrap}>{row.name}</td>
                    <td>
                      <code className={styles.meta}>{row.acct}</code>
                    </td>
                    <td className={styles.num}>{fmt(row.n)}</td>
                    <td className={styles.num}>{row.stamps}</td>
                    <td>{extra.length ? extra.join(", ") : "-"}</td>
                    <td className={styles.nowrap}>
                      {c ? (
                        <>
                          {fullTime(c.at)}
                          {c.cos && ` · ${itemById(c.cos.id)?.name ?? c.cos.id} ${c.cos.days}일`}
                        </>
                      ) : row.stamps > 0 || extra.length ? (
                        "아직"
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
