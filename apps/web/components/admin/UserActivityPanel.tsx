"use client";

import { useState } from "react";
import { GONE_RULE, RETENTION_DAYS, RETENTION_WEEKS, TIER_LABEL, TIER_RULE_TEXT, TIER_WINDOW_DAYS, type ActivityTier } from "@/lib/activityRules";
import { stayText } from "@/lib/stayTime";
import type { ActivityUser, GoneUser, UserActivityReport } from "@/lib/userActivity";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { fullTime, joinDate, relativeTime } from "./memberFormat";
import { opsAdminApi } from "./opsAdminApi";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";
import UserStatsDialog from "./UserStatsDialog";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  version: number;
  /** 상세 창의 [회원 목록에서 찾기] — 회원 목록 탭에서 그 계정을 찾는다 */
  onFindMember: (accountId: string) => void;
};
/** 표에서 이름을 누르면 여는 상세 창 대상 */
type Target = { accountId: string; name: string | null };
type OnPick = (p: Target) => void;

type Sort = "days30" | "days7" | "stay" | "lifetime";
const SORTS: [Sort, string][] = [
  ["days30", "최근 30일 활동 순"],
  ["days7", "최근 7일 활동 순"],
  ["stay", "접속 시간 순"],
  ["lifetime", "모은 포인트 순"],
];
const SORT_FN: Record<Sort, (a: ActivityUser, b: ActivityUser) => number> = {
  days30: (a, b) => b.days30 - a.days30 || b.days7 - a.days7 || b.stayMinutes - a.stayMinutes,
  days7: (a, b) => b.days7 - a.days7 || b.days30 - a.days30 || b.stayMinutes - a.stayMinutes,
  stay: (a, b) => b.stayMinutes - a.stayMinutes || b.days30 - a.days30,
  lifetime: (a, b) => b.lifetimePoints - a.lifetimePoints || b.days30 - a.days30,
};
const SHOW = 100;
/** 등급 이름 뒤 조사 (VIP는, 단골은) */
const TIER_TOPIC: Record<ActivityTier, string> = { vip: "는", regular: "은" };

const num = (n: number) => n.toLocaleString("ko-KR");
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "—");
/** 20261116 → 11/16 */
const md = (day: string) => `${Number(day.slice(4, 6))}/${Number(day.slice(6, 8))}`;

/**
 * 유저 활동: 계정 기준 DAU·WAU·MAU·신규 → 일별·주별 리텐션 → VIP·단골 → 자주 오는 유저 → 마지막 접속 구간·떠난 단골 → 기록 전 활동 채우기.
 * 숫자는 서버가 5분마다 다시 센다 ([다시 세기]로 바로). 운영자 계정은 기본으로 빼고 센다
 */
export default function UserActivityPanel({ toast, onAuthLost, version, onFindMember }: Props) {
  const [staff, setStaff] = useState(false);
  const [fresh, setFresh] = useState(0);
  const load = usePanelLoad(() => opsAdminApi.activity(staff, fresh > 0), [version, staff, fresh], toast, onAuthLost);
  const r = load.data;
  const [pick, setPick] = useState<Target | null>(null);

  return (
    <section className={an.wrap} aria-label="유저 활동">
      <div className={styles.toolbar}>
        <label className={styles.meta}>
          <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} /> 운영자 계정도 세기
        </label>
        <button type="button" className={cx(ui.button, ui.small)} onClick={() => setFresh((n) => n + 1)}>
          다시 세기
        </button>
        {r && (
          <span className={cx(styles.meta, styles.toolbarEnd)}>
            {fullTime(r.at)}에 센 숫자예요. 회원 {num(r.accounts)}명{r.partial ? "을 다 훑지 못해 일부만 셌어요." : "을 셌어요."}
          </span>
        )}
      </div>
      {r ? <Report r={r} onFindMember={setPick} /> : <LoadState data={null} error={load.error} retry={load.retry} />}
      <SeedCard toast={toast} onAuthLost={onAuthLost} onDone={() => setFresh((n) => n + 1)} />
      {pick && (
        <UserStatsDialog
          key={pick.accountId}
          accountId={pick.accountId}
          name={pick.name}
          toast={toast}
          onAuthLost={onAuthLost}
          onClose={() => setPick(null)}
          onFindMember={(id) => {
            setPick(null);
            onFindMember(id);
          }}
        />
      )}
    </section>
  );
}

function Report({ r, onFindMember }: { r: UserActivityReport; onFindMember: OnPick }) {
  const s = r.summary;
  return (
    <>
      <p className={ui.hint}>
        {r.since
          ? `활동 기록은 ${md(r.since)}부터 있어요. 그 전 날짜 칸은 「—」로 비워 둬요. 마을에 들어오거나 그날 첫 머무르기 기록이 쌓이면 그날 활동한 것으로 쳐요.`
          : "아직 활동 기록이 없어요. 유저가 마을에 들어오면 그날부터 쌓여요. 아래 [채우기]로 최근 3일을 먼저 채울 수 있어요."}
      </p>

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>오늘 현황</h2>
          <span className={an.sub}>계정 기준이에요. 하루는 새벽 5시에 바뀌어요.</span>
        </div>
        <div className={an.kpis}>
          <Kpi label="오늘 활동 (DAU)" value={num(s.dau)} note={`어제 ${num(s.dauYesterday)}명`} />
          <Kpi label="최근 7일 (WAU)" value={num(s.wau)} />
          <Kpi label="최근 30일 (MAU)" value={num(s.mau)} />
          <Kpi label="고착도" value={s.stickiness === null ? "—" : pct(s.avgDau7, s.mau)} note={`7일 평균 DAU ${Math.round(s.avgDau7 * 10) / 10}명을 MAU로 나눠요`} />
          <Kpi label="오늘 새로 온 계정" value={num(s.new1)} note={`7일 ${num(s.new7)}명, 30일 ${num(s.new30)}명`} />
        </div>
      </div>

      <DailyRetention r={r} />
      <WeeklyRetention r={r} />

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>VIP와 단골</h2>
          <span className={an.sub}>
            VIP {num(r.tiers.filter((u) => u.tier === "vip").length)}명, 단골 {num(r.tiers.filter((u) => u.tier === "regular").length)}명
          </span>
        </div>
        <ul className={ui.hint}>
          {(Object.keys(TIER_RULE_TEXT) as ActivityTier[]).map((t) => (
            <li key={t}>
              <b>{TIER_LABEL[t]}</b>
              {TIER_TOPIC[t]} {TIER_RULE_TEXT[t]}
            </li>
          ))}
        </ul>
        <UserTable rows={r.tiers.slice(0, SHOW)} now={r.at} onFindMember={onFindMember} empty="아직 VIP나 단골이 없어요." />
      </div>

      <Frequent r={r} onFindMember={onFindMember} />

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>마지막 접속</h2>
          <span className={an.sub}>휴면은 마지막 접속에서 90일이 넘었거나 닉네임을 다시 정해야 하는 계정이에요.</span>
        </div>
        <div className={an.kpis}>
          {r.buckets.map((b) => (
            <Kpi key={b.id} label={b.label} value={num(b.count)} note={pct(b.count, r.accounts)} />
          ))}
        </div>
      </div>

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>떠난 단골</h2>
          <span className={an.sub}>
            {GONE_RULE.minDays}~{GONE_RULE.maxDays}일 동안 안 왔고, 마지막 접속까지 {TIER_WINDOW_DAYS}일 동안 단골 기준을 넘었던 계정이에요.
          </span>
        </div>
        <UserTable rows={r.gone.slice(0, SHOW)} now={r.at} onFindMember={onFindMember} gone empty="떠난 단골이 없어요." />
      </div>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={an.kpi}>
      <span className={an.kpiLabel}>{label}</span>
      <span className={an.kpiValue}>{value}</span>
      {note && <span className={an.kpiNote}>{note}</span>}
    </div>
  );
}

/** 비율 칸 (셀 수 없으면 —, 마우스를 올리면 명 수) */
function Rate({ n, of }: { n: number | null; of: number }) {
  if (n === null || !of) return <td className={styles.num}>—</td>;
  return (
    <td className={styles.num} title={`${num(of)}명 중 ${num(n)}명`}>
      {pct(n, of)}
    </td>
  );
}

function DailyRetention({ r }: { r: UserActivityReport }) {
  const t = r.cohortTotal;
  return (
    <div className={an.section}>
      <div className={an.sectionHead}>
        <h2 className={an.sectionTitle}>일별 리텐션</h2>
        <span className={an.sub}>그날 가입한 계정 중 정확히 며칠 뒤에 다시 들어온 비율이에요. 끝난 날만 세요.</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="일별 리텐션">
          <thead>
            <tr>
              <th scope="col">가입일</th>
              <th scope="col" className={styles.num}>
                가입
              </th>
              {RETENTION_DAYS.map((k) => (
                <th key={k} scope="col" className={styles.num}>
                  D{k}
                </th>
              ))}
              <th scope="col" className={styles.num}>
                7일 안에 다시 옴
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">전체</th>
              <td className={styles.num}>{num(r.cohorts.reduce((n, c) => n + c.size, 0))}</td>
              {RETENTION_DAYS.map((k, i) => (
                <Rate key={k} n={t.size[i] ? t.returned[i] : null} of={t.size[i]} />
              ))}
              <Rate n={t.within7.size ? t.within7.returned : null} of={t.within7.size} />
            </tr>
            {r.cohorts.map((c) => (
              <tr key={c.day}>
                <td className={styles.nowrap}>{md(c.day)}</td>
                <td className={styles.num}>{num(c.size)}</td>
                {c.returned.map((n, i) => (
                  <Rate key={RETENTION_DAYS[i]} n={n} of={c.size} />
                ))}
                <Rate n={c.within7} of={c.size} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeeklyRetention({ r }: { r: UserActivityReport }) {
  return (
    <div className={an.section}>
      <div className={an.sectionHead}>
        <h2 className={an.sectionTitle}>주별 리텐션</h2>
        <span className={an.sub}>그 주에 가입한 계정 중 몇 주 뒤 그 주에 한 번이라도 들어온 비율이에요. 주는 월요일 새벽 5시에 시작해요.</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="주별 리텐션">
          <thead>
            <tr>
              <th scope="col">가입한 주</th>
              <th scope="col" className={styles.num}>
                가입
              </th>
              {RETENTION_WEEKS.map((k) => (
                <th key={k} scope="col" className={styles.num}>
                  W{k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.weekly.map((w) => (
              <tr key={w.week}>
                <td className={styles.nowrap}>{md(w.week)}주</td>
                <td className={styles.num}>{num(w.size)}</td>
                {w.returned.map((n, i) => (
                  <Rate key={RETENTION_WEEKS[i]} n={n} of={w.size} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Frequent({ r, onFindMember }: { r: UserActivityReport; onFindMember: OnPick }) {
  const [sort, setSort] = useState<Sort>("days30");
  const rows = [...r.frequent].sort(SORT_FN[sort]).slice(0, SHOW);
  return (
    <div className={an.section}>
      <div className={an.sectionHead}>
        <h2 className={an.sectionTitle}>자주 오는 유저</h2>
        <div className={styles.segmented} role="group" aria-label="정렬">
          {SORTS.map(([id, label]) => (
            <button key={id} type="button" className={ui.button} aria-pressed={sort === id} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className={an.sub}>최근 30일 안에 한 번이라도 온 계정 중 위에서 {SHOW}명이에요.</p>
      <UserTable rows={rows} now={r.at} onFindMember={onFindMember} empty="최근 30일 안에 온 계정이 아직 없어요." />
    </div>
  );
}

/** now = 보고서를 센 시각 (마지막 접속을 그 시각 기준으로) */
function UserTable({
  rows,
  now,
  onFindMember,
  gone,
  empty,
}: {
  rows: (ActivityUser | GoneUser)[];
  now: number;
  onFindMember: OnPick;
  gone?: boolean;
  empty: string;
}) {
  if (!rows.length) return <Empty inline>{empty}</Empty>;
  return (
    <div className={styles.tableWrap}>
      <table className={cx(styles.table, styles.stackTable)}>
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">등급</th>
            {gone ? (
              <>
                <th scope="col" className={styles.num}>
                  안 온 지
                </th>
                <th scope="col" className={styles.num}>
                  떠나기 전 30일
                </th>
              </>
            ) : (
              <>
                <th scope="col" className={styles.num}>
                  7일
                </th>
                <th scope="col" className={styles.num}>
                  30일
                </th>
              </>
            )}
            <th scope="col" className={styles.num}>
              활동한 날
            </th>
            <th scope="col" className={styles.num}>
              접속 시간
            </th>
            <th scope="col">마지막 접속</th>
            <th scope="col">가입일</th>
            <th scope="col" className={styles.num}>
              포인트
            </th>
            <th scope="col" className={styles.num}>
              모은 포인트
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const g = gone ? (u as GoneUser) : null;
            const tier = g ? g.tierBefore : u.tier;
            return (
              <tr key={u.accountId}>
                <td>
                  <button
                    type="button"
                    className={cx(ui.button, ui.quiet, ui.small)}
                    onClick={() => onFindMember({ accountId: u.accountId, name: u.name })}
                    title={`지금까지의 수치를 봐요 (${u.accountId})`}
                  >
                    {u.name ?? "이름 없음"}
                  </button>
                </td>
                <td data-label="등급">{tier ? TIER_LABEL[tier] : "—"}</td>
                {g ? (
                  <>
                    <td className={styles.num} data-label="안 온 지">
                      {g.awayDays}일
                    </td>
                    <td className={styles.num} data-label="떠나기 전 30일">
                      {g.daysBefore}일
                    </td>
                  </>
                ) : (
                  <>
                    <td className={styles.num} data-label="7일">
                      {u.days7}일
                    </td>
                    <td className={styles.num} data-label="30일">
                      {u.days30}일
                    </td>
                  </>
                )}
                <td className={styles.num} data-label="활동한 날">
                  {num(u.totalDays)}일
                </td>
                <td className={cx(styles.num, styles.nowrap)} data-label="접속 시간">
                  {u.stayMinutes ? stayText(u.stayMinutes) : "—"}
                </td>
                <td className={styles.nowrap} data-label="마지막 접속" title={fullTime(u.lastSeenAt)}>
                  {relativeTime(u.lastSeenAt, now)}
                </td>
                <td className={styles.nowrap} data-label="가입일" title={fullTime(u.createdAt)}>
                  {joinDate(u.createdAt)}
                </td>
                <td className={styles.num} data-label="포인트">
                  {num(u.points)}
                </td>
                <td className={styles.num} data-label="모은 포인트">
                  {num(u.lifetimePoints)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 기록 전 활동 채우기 (커서가 "0"으로 돌아올 때까지 200개씩, 여러 번 눌러도 두 번 세지 않는다) */
function SeedCard({ toast, onAuthLost, onDone }: { toast: (message: string) => void; onAuthLost: () => void; onDone: () => void }) {
  const [state, setState] = useState<{ recorded: number; rounds: number; done: boolean } | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    let cursor = "0";
    let total = { recorded: 0, rounds: 0, done: false };
    setState(total);
    try {
      do {
        const res = await opsAdminApi.seedActivity(cursor);
        cursor = res.next;
        total = { recorded: total.recorded + res.recorded, rounds: total.rounds + 1, done: res.next === "0" };
        setState(total);
      } while (cursor !== "0" && total.rounds < 500);
      toast(`활동 기록을 채웠어요. 새로 남긴 날은 ${num(total.recorded)}개예요.`);
      onDone();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>기록 전 활동 채우기</h2>
        <button type="button" className={ui.button} onClick={() => void run()} disabled={running}>
          {running ? "채우는 중…" : "채우기"}
        </button>
      </div>
      <p className={ui.hint}>
        계정을 200개씩 훑어 남은 최근 3일치 머무르기 기록과 그 안의 가입일, 마지막 접속일을 활동한 날로 남겨요. 그날 이미 있으면 세지 않으니 여러 번 눌러도 괜찮아요. 3일보다
        이전 활동은 남은 기록이 없어 채울 수 없어요.
      </p>
      {state && (
        <p className={styles.meta} aria-live="polite">
          {state.rounds}번 훑어 {num(state.recorded)}개를 남겼어요.
          {state.done ? " 끝까지 훑었어요." : running ? " 계속 훑는 중이에요." : " 중간에 멈췄어요."}
        </p>
      )}
    </div>
  );
}
