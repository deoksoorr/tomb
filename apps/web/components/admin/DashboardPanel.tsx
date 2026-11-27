"use client";

import { useState, type ReactNode } from "react";
import { CAMP_HOME_KIND_NAME, inAppLabel, type CampHomeKind, type LobbyInfo, type MaintState } from "@tomb/protocol";
import type { AdminDashboardResponse, CountRow } from "@/lib/adminDashboard";
import { onlineView } from "@/lib/adminOnlineView";
import { REF_LABELS } from "@/lib/analytics";
import type { AnalyticsRange } from "@/lib/analyticsReport";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { earnRule } from "@/lib/economy";
import { maintUntilLabel } from "@/lib/maintText";
import { MAP_CONCEPT_LABELS, MAP_CONCEPTS, type MapConcept } from "@/lib/mapConcept";
import type { CaseType } from "@/lib/store/reportBox";
import { cx } from "../ui/cx";
import { adminApi } from "./adminApi";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { BarChart, duration, fmt, metric, RankList } from "./charts";
import d from "./Dashboard.module.css";
import { logsAdminApi } from "./logsAdminApi";
import { fullTime } from "./memberFormat";
import { moderationApi } from "./moderationApi";
import { opsAdminApi } from "./opsAdminApi";
import OpShoutCard from "./OpShoutCard";
import ops from "./Ops.module.css";
import { ConnHealthCard } from "./OpsLogs";
import { Empty, Loading } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  lobby: LobbyInfo | "error" | null;
  graveCount: number;
  reportedCount: number;
  /** 처리 대기 신고 수 (메뉴 배지와 같은 값, 아직 모르면 null) */
  reportsOpen: number | null;
  /** 처리 안 한 문의 수 (메뉴 배지) */
  inquiriesNew: number | null;
  /** 오늘 새 오류 묶음 수 — 마지막 확인 뒤에 난 것 (메뉴 배지) */
  errorsToday: number | null;
  /** 새로고침 버튼마다 바뀐다 */
  version: number;
};

const RANGES: [AnalyticsRange, string][] = [
  ["hour", "24시간"],
  ["day", "30일"],
];
const TYPE_LABEL: Record<CaseType, string> = { grave: "묘비", guestbook: "방명록", user: "유저", megaphone: "확성기" };
const KIND_LABEL = { account: "계정 정지", ip: "IP 차단", both: "계정+IP" } as const;
const BAN_STATUS = { active: "진행 중", expired: "기간 끝남", lifted: "해제됨" } as const;
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** 오늘 획득에서 빼는 항목: 관리자 지급·선물·환불 (활동으로 번 포인트만) / 사용에서 빼는 항목: 관리자 회수 */
const EARN_EXCLUDED = new Set(["admin", "gift", "refund", "resell"]);
const SPEND_EXCLUDED = new Set(["admin"]);
const RECENT = 5;
const CAMP_KINDS: CampHomeKind[] = ["caravan", "pension", "rural"];
const CONCEPT_DESC: Record<MapConcept, string> = {
  default: "늦가을 마을이에요.",
  winter: "눈 덮인 바닥과 지붕, 얼어붙은 연못, 앙상한 나무와 입김이 나와요.",
  christmas: "겨울 위에 광장 트리와 전구 줄, 리스와 눈사람이 더해져요.",
};

const sumExcept = (r: Record<string, number>, skip: Set<string>) => Object.entries(r).reduce((n, [k, v]) => (skip.has(k) ? n : n + v), 0);

/**
 * 11/26 대시보드 개편: 지금(접속·점검·맵 컨셉) → 처리할 일 → 오늘 숫자 → 오늘 새로 본 것(접속 종료·가입 유입·분양 현황) → 추이 → 최근 신고·제재.
 * 지금·접속 종료·가입 유입·분양은 /api/admin/dashboard 한 번에 받는다. 열 때와 [새로고침] 때만 — 자동으로 다시 묻지 않는다
 */
export default function DashboardPanel({ toast, onAuthLost, lobby, graveCount, reportedCount, reportsOpen, inquiriesNew, errorsToday, version }: Props) {
  const [range, setRange] = useState<AnalyticsRange>("day");
  const [again, setAgain] = useState(0);
  const dashLoad = usePanelLoad(() => logsAdminApi.dashboard(), [version, again], toast, onAuthLost);
  const dash = dashLoad.data;
  const report = usePanelLoad(() => opsAdminApi.analytics(range), [version, range], toast, onAuthLost).data;
  const seriesReady = report?.range === range;
  const econ = usePanelLoad(() => adminApi.economy(1), [version], toast, onAuthLost).data;
  const reports = usePanelLoad(() => moderationApi.reports("open"), [version], toast, onAuthLost).data;
  const bans = usePanelLoad(() => moderationApi.bans(), [version], toast, onAuthLost).data;

  const today = econ ? (econ.days[0] ?? { earned: {}, spent: {} }) : null; // 최근 날짜 먼저 = 오늘
  // 출석 포인트로 계정 수를 거꾸로 센다 — 출석 포인트가 0점이면 셀 수 없어 비운다
  const attendPts = earnRule("attend").points;
  const attended = today && attendPts > 0 ? Math.round((today.earned.attend ?? 0) / attendPts) : null;
  const t = report?.today;
  const openCount = reportsOpen ?? reports?.openCount ?? null;
  const recentBans = bans ? [...bans.bans].sort((a, b) => b.startAt - a.startAt).slice(0, RECENT) : null;
  const refTotal = report ? (report.todayReferrers ?? []).reduce((n, r) => n + r.count, 0) : 0;
  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };
  /** 지금 칸이 아직이면 undefined, 못 읽었으면 null */
  const part = <K extends keyof AdminDashboardResponse>(k: K): AdminDashboardResponse[K] | undefined => (dash ? dash[k] : dashLoad.error ? null : undefined) as AdminDashboardResponse[K] | undefined;

  return (
    <section className={d.wrap} aria-label="대시보드">
      <h2 className={d.groupTitle}>지금</h2>
      <div className={d.nowGrid}>
        <OnlineCard lobby={lobby} online={part("online")} />
        <MaintCard state={part("maint")} toast={toast} fail={fail} onDone={() => setAgain((n) => n + 1)} />
        <ConceptCard concept={part("concept")} toast={toast} fail={fail} />
      </div>

      <div className={d.todo} aria-label="처리할 일">
        <TodoTile label="신고 대기" n={openCount} href="#reports" tone="alert" none="처리할 신고가 없어요" />
        <TodoTile label="새 문의" n={inquiriesNew} href="#inquiries" tone="warn" none="새 문의가 없어요" />
        <TodoTile label="오늘 새 오류" n={errorsToday} href="#errors" tone="warn" none="새 오류가 없어요" />
        <TodoTile label="신고된 묘비" n={reportedCount} href="#graves" tone="warn" none={`묘역 묘비 ${fmt(graveCount)}개`} />
      </div>

      <h2 className={d.groupTitle}>오늘</h2>
      <div className={d.stats} aria-label="오늘 숫자">
        <Mini label="방문자 (고유)" value={fmt(t?.visitors)} sub={t ? `방문 ${fmt(t.visits)}번` : undefined} />
        <Mini label="신규 가입" value={fmt(t?.signups)} />
        <Mini label="최고 동시 접속" value={fmt(t?.peak)} />
        <Mini label="평균 체류" value={t ? duration(t.avgStaySec) : "…"} />
        <Mini label="출석 보상 계정" value={attendPts > 0 ? fmt(attended) : "—"} />
        <Mini label="사냥 판" value={fmt(t?.hunts)} />
        <Mini label="묘비 작성" value={fmt(t?.graves)} />
        <Mini label="획득 포인트" value={fmt(today ? sumExcept(today.earned, EARN_EXCLUDED) : null)} sub="지급·선물·환불 제외" href="#economy" />
        <Mini label="사용 포인트" value={fmt(today ? sumExcept(today.spent, SPEND_EXCLUDED) : null)} sub="관리자 회수 제외" href="#economy" />
      </div>

      {/* 11/27 접속 종료는 한 줄 요약 (누르면 펼침) */}
      <ConnHealthCard h={part("conn")} />
      <div className={d.grid3}>
        <SignupCard s={part("signups")} />
        <HousingCard h={part("housing")} />
      </div>

      <h2 className={d.groupTitle}>추이 · 유입</h2>
      <div className={styles.dashGrid}>
        <div className={cx(an.section, d.section)}>
          <div className={an.sectionHead}>
            <h3 className={an.sectionTitle}>접속 · 방문 추이</h3>
            <div className={styles.segmented} role="group" aria-label="기간">
              {RANGES.map(([value, label]) => (
                <button key={value} type="button" className={ui.button} aria-pressed={range === value} onClick={() => setRange(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {report && seriesReady ? (
            <div className={an.charts}>
              <BarChart metric={metric("visitors")} series={report.series} />
              <BarChart metric={metric("peak")} series={report.series} />
            </div>
          ) : (
            <Loading />
          )}
        </div>
        <div className={cx(an.section, d.section)}>
          <div className={an.sectionHead}>
            <h3 className={an.sectionTitle}>오늘 방문 유입</h3>
            <a className={styles.cardLink} href="#analytics">
              유입 분석 →
            </a>
          </div>
          {report ? (
            <>
              <RankList title="어디서 왔나" total={refTotal} rows={(report.todayReferrers ?? []).map((r) => ({ key: REF_LABELS[r.cat], count: r.count }))} keepZero />
              <RankList title="리퍼러 도메인 상위 5" rows={report.todayDomains} limit={5} empty="오늘은 다른 사이트에서 온 방문이 아직 없어요." />
              <RankList title="앱에서 연 방문" rows={(report.todayApps ?? []).map((r) => ({ key: inAppLabel(r.key), count: r.count }))} limit={5} empty="오늘은 앱 안 브라우저로 연 방문이 아직 없어요." />
            </>
          ) : (
            <Loading />
          )}
        </div>
      </div>

      <div className={d.recent}>
        <RecentCard title="최근 신고 (처리 대기)" href="#reports" loading={!reports} empty={reports?.reports.length === 0 && "처리할 신고가 없어요."}>
          {reports?.reports.slice(0, RECENT).map((r) => (
            <li key={r.key} className={styles.recentItem}>
              <span className={styles.recentMain}>
                <span className={cx(styles.badge, styles.badgeWarn)}>{TYPE_LABEL[r.type]}</span> {r.name}
              </span>
              <time className={styles.recentWhen}>{KST.format(r.lastAt)}</time>
              <span className={styles.recentSub}>
                신고 {r.count}회 · 신고자 {r.reporters}명{r.reasonSummary ? ` · ${r.reasonSummary}` : ""}
              </span>
            </li>
          ))}
        </RecentCard>

        <RecentCard title="최근 제재" href="#bans" loading={!recentBans} empty={recentBans?.length === 0 && "정지·차단 기록이 없어요."}>
          {recentBans?.map((b) => (
            <li key={b.id} className={styles.recentItem}>
              <span className={styles.recentMain}>
                <span className={cx(styles.badge, b.status === "active" ? styles.badgeHidden : undefined)}>{BAN_STATUS[b.status]}</span>{" "}
                {b.accountName ?? b.accountId ?? (b.ipHash ? `IP#${b.ipHash.slice(0, 8)}` : "—")}
              </span>
              <time className={styles.recentWhen}>{KST.format(b.startAt)}</time>
              <span className={styles.recentSub}>
                {KIND_LABEL[b.kind]} · {b.until === null ? "영구" : `~${KST.format(b.until)}`} · {b.reason}
              </span>
            </li>
          ))}
        </RecentCard>
      </div>

      {/* 11/26 운영자 외치기: 모든 채널에 확성기 모양 알림 (기록에 남지 않는다). 11/27 대시보드 맨 아래로 */}
      <OpShoutCard toast={toast} fail={fail} />
    </section>
  );
}

/** 지금 접속: 전체 수 + 맵별(실내는 「맵 · 곳」) + 채널별 — 셋 다 같은 명단 한 번에서 센다 (로비는 정원만) */
function OnlineCard({ lobby, online }: { lobby: LobbyInfo | "error" | null; online: AdminDashboardResponse["online"] | undefined }) {
  const live = lobby && lobby !== "error" ? lobby : null;
  const view = onlineView(online, live);
  const total = view.total;
  const max = online ? Math.max(1, ...online.byMap.map((r) => r.n)) : 1;
  return (
    <div className={cx(styles.card, d.onlineCard)}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>지금 접속</h3>
        <a className={styles.cardLink} href="#online">
          지금 접속자 전체 →
        </a>
      </div>
      <div className={d.onlineBody}>
        <div className={d.bigNum}>
          <span className={cx(d.bigValue, total !== null && d.live)}>{total === null ? (online === undefined ? "…" : "?") : fmt(total)}</span>
          <span className={d.bigNote}>{view.cap !== null ? `전체 정원 ${fmt(view.cap)}` : lobby === "error" ? "실시간 서버에 연결할 수 없어요" : ""}</span>
        </div>
        <div className={d.onlineMaps}>
          {online === undefined ? (
            <Loading inline />
          ) : online === null ? (
            <p className={ui.hint}>맵별 인원을 읽지 못했어요.</p>
          ) : online.byMap.length === 0 ? (
            <p className={ui.hint}>지금 접속한 사람이 없어요.</p>
          ) : (
            <ul className={ops.bars} aria-label="맵별 인원">
              {online.byMap.slice(0, 6).map((r) => (
                <li key={r.label} className={ops.barItem}>
                  <span className={ops.barName}>{r.label}</span>
                  <span className={ops.barTrack}>
                    <span className={ops.barFill} style={{ width: `${Math.max(3, (r.n / max) * 100)}%`, display: "block" }} />
                  </span>
                  <span className={ops.barCount}>{fmt(r.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {view.channels.length > 0 && (
        <div className={styles.channels} aria-label="채널별 인원">
          {view.channels.map((c) => (
            <span key={c.id} className={styles.chip}>
              {c.id}채널 {c.cap === null ? `${c.n}명` : `${c.n}/${c.cap}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 점검 모드: 상태 + 바로 시작(점검 모드 화면과 같은 확인 한 번, 기본 문구)·끝. 문구·끝 시각은 점검 모드 화면에서 */
function MaintCard({
  state,
  toast,
  fail,
  onDone,
}: {
  state: MaintState | null | undefined;
  toast: (m: string) => void;
  fail: (e: unknown) => void;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState<MaintState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const cur = saved ?? state;
  const run = async (on: boolean) => {
    setPending(true);
    try {
      const r = await logsAdminApi.setMaintenance(on ? { on: true, msg: "", until: null } : { on: false });
      setSaved(r.state);
      setConfirming(false);
      toast(on ? `점검을 시작했어요. 접속 ${r.kicked ?? 0}명을 내보냈어요.` : "점검을 끝냈어요. 점검 화면이 30초 안에 다시 들어와요.");
      onDone();
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={cx(styles.card, cur?.on && d.maintOn)}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>점검 모드</h3>
        <a className={styles.cardLink} href="#maintenance">
          문구·끝 시각 →
        </a>
      </div>
      {cur === undefined ? (
        <Loading inline />
      ) : cur === null ? (
        <p className={ui.hint}>점검 상태를 읽지 못했어요.</p>
      ) : (
        <>
          <p className={d.stateLine}>
            <span className={cx(ops.tag, cur.on ? ops.tagBad : ops.tagOk)}>{cur.on ? "점검 중" : "평소 운영 중"}</span>
            <span className={d.stateSub}>{cur.on ? `${fullTime(cur.at)}부터${cur.until ? ` · ${maintUntilLabel(cur.until)}쯤 끝` : ""}` : "손님이 모두 들어올 수 있어요."}</span>
          </p>
          {cur.on ? (
            <div className={ops.row}>
              <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void run(false)} disabled={pending}>
                {pending ? "끝내는 중…" : "점검 끝"}
              </button>
            </div>
          ) : confirming ? (
            <div className={ops.confirmBox} role="alert">
              <p className={d.confirmText}>정말 점검을 시작할까요? 운영자를 빼고 지금 접속한 모든 사람이 끊기고, 사이트 전체가 점검 화면으로 바뀌어요.</p>
              <div className={ops.row}>
                <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void run(true)} disabled={pending}>
                  {pending ? "시작하는 중…" : "네, 점검 시작"}
                </button>
                <button type="button" className={ui.button} onClick={() => setConfirming(false)} disabled={pending}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className={ops.row}>
              <button type="button" className={cx(ui.button, ui.danger)} onClick={() => setConfirming(true)}>
                점검 시작
              </button>
              <span className={ops.muted}>기본 문구로 시작해요.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 마을 맵 컨셉: 지금 값 + 바꾸기 (확인 한 번 — 바뀌면 마을 전체 공지가 한 번 나간다) */
function ConceptCard({ concept, toast, fail }: { concept: MapConcept | null | undefined; toast: (m: string) => void; fail: (e: unknown) => void }) {
  const [saved, setSaved] = useState<MapConcept | null>(null);
  const [want, setWant] = useState<MapConcept | null>(null);
  const [pending, setPending] = useState(false);
  const cur = saved ?? concept;
  const apply = async (c: MapConcept) => {
    setPending(true);
    try {
      const r = await logsAdminApi.setMapConcept(c);
      setSaved(r.concept);
      setWant(null);
      toast(`마을을 ${MAP_CONCEPT_LABELS[r.concept]} 모습으로 바꿨어요.`);
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>마을 맵 컨셉</h3>
      </div>
      {cur === undefined ? (
        <Loading inline />
      ) : cur === null ? (
        <p className={ui.hint}>맵 컨셉을 읽지 못했어요.</p>
      ) : (
        <>
          <div className={cx(styles.segmented, d.conceptPick)} role="group" aria-label="컨셉 고르기">
            {MAP_CONCEPTS.map((c) => (
              <button key={c} type="button" className={ui.button} aria-pressed={c === cur} onClick={() => setWant(c === cur ? null : c)} disabled={pending}>
                {MAP_CONCEPT_LABELS[c]}
              </button>
            ))}
          </div>
          {want ? (
            <div className={ops.confirmBox} role="alert">
              <p className={d.confirmText}>
                마을을 {MAP_CONCEPT_LABELS[want]} 모습으로 바꿀까요? 길과 건물은 그대로이고 그림만 바뀌어요. 마을 전체 공지가 한 번 나가고, 접속한 화면도 바로 바뀌어요.
              </p>
              <div className={ops.row}>
                <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void apply(want)} disabled={pending}>
                  {pending ? "바꾸는 중…" : "바꾸기"}
                </button>
                <button type="button" className={ui.button} onClick={() => setWant(null)} disabled={pending}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className={ui.hint}>
              지금은 {MAP_CONCEPT_LABELS[cur]} 모습이에요. {CONCEPT_DESC[cur]}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SourceList({ title, rows }: { title: string; rows: CountRow[] }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className={d.srcCol}>
      <p className={d.srcTitle}>
        {title} <b>{fmt(total)}</b>
      </p>
      {rows.length === 0 ? (
        <p className={ui.hint}>아직 없어요.</p>
      ) : (
        <ul className={ops.bars}>
          {rows.slice(0, 5).map((r) => (
            <li key={r.label} className={ops.barItem}>
              <span className={ops.barName} title={r.label}>
                {r.label}
              </span>
              <span className={ops.barTrack}>
                <span className={ops.barFill} style={{ width: `${Math.max(3, (r.n / max) * 100)}%`, display: "block" }} />
              </span>
              <span className={ops.barCount}>{fmt(r.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 가입 유입: 오늘·7일 상위 5 */
function SignupCard({ s }: { s: AdminDashboardResponse["signups"] | undefined }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>가입 유입</h3>
        <a className={styles.cardLink} href="#analytics">
          유입 분석 →
        </a>
      </div>
      {s === undefined ? (
        <Loading inline />
      ) : s === null ? (
        <p className={ui.hint}>가입 유입을 읽지 못했어요.</p>
      ) : (
        <div className={d.srcGrid}>
          <SourceList title="오늘" rows={s.today} />
          <SourceList title="7일" rows={s.week} />
        </div>
      )}
    </div>
  );
}

/** 분양 현황: 채널마다 캠핑장 종류별 팔린 터·바닷가 오두막·마을 집 (11/27 번지 색인 크기 대신 집 기록으로 센다 — 낡은 색인 칸이 집으로 세이던 것) */
function HousingCard({ h }: { h: AdminDashboardResponse["housing"] | undefined }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>분양 현황</h3>
        <a className={styles.cardLink} href="#housing">
          하우징 →
        </a>
      </div>
      {h === undefined ? (
        <Loading inline />
      ) : h === null ? (
        <p className={ui.hint}>분양 현황을 읽지 못했어요.</p>
      ) : (
        <>
          <div className={d.campKinds} aria-label="캠핑장 분양 (모든 채널)">
            {CAMP_KINDS.map((k) => (
              <div key={k} className={d.campKind}>
                <span className={d.campValue}>{fmt(h.total.camp[k])}</span>
                <span className={d.campLabel}>
                  {CAMP_HOME_KIND_NAME[k]} <span className={d.faint}>/ 채널당 {h.cap.camp[k]}</span>
                </span>
              </div>
            ))}
            <div className={d.campKind}>
              <span className={d.campValue}>{fmt(h.total.sea)}</span>
              <span className={d.campLabel}>
                바닷가 <span className={d.faint}>/ 채널당 {h.cap.sea}</span>
              </span>
            </div>
            <div className={d.campKind}>
              <span className={d.campValue}>{fmt(h.total.village)}</span>
              <span className={d.campLabel}>마을 집</span>
            </div>
          </div>
          {h.rows.length === 0 ? (
            <Empty inline>아직 분양된 집이 없어요.</Empty>
          ) : (
            <div className={styles.tableWrap}>
              <table className={cx(styles.table, d.lotTable)} aria-label="채널별 분양">
                <thead>
                  <tr>
                    <th scope="col">채널</th>
                    {CAMP_KINDS.map((k) => (
                      <th key={k} scope="col" className={styles.num}>
                        {CAMP_HOME_KIND_NAME[k]}
                      </th>
                    ))}
                    <th scope="col" className={styles.num}>
                      바닷가
                    </th>
                    <th scope="col" className={styles.num}>
                      마을
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {h.rows.map((r) => (
                    <tr key={r.ch}>
                      <td>{r.ch}채널</td>
                      {CAMP_KINDS.map((k) => (
                        <td key={k} className={cx(styles.num, r.camp[k] >= h.cap.camp[k] && d.full)}>
                          {r.camp[k]}/{h.cap.camp[k]}
                        </td>
                      ))}
                      <td className={cx(styles.num, r.sea >= h.cap.sea && d.full)}>
                        {r.sea}/{h.cap.sea}
                      </td>
                      <td className={styles.num}>{r.village}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={cx(ui.hint, d.faint)}>하우징 목록과 같은 집 기록에서 센 수예요 (숨긴 집 포함).</p>
        </>
      )}
    </div>
  );
}

function TodoTile({ label, n, href, tone, none }: { label: string; n: number | null; href: string; tone: "alert" | "warn"; none: string }) {
  const on = (n ?? 0) > 0;
  return (
    <a className={cx(d.todoTile, on && (tone === "alert" ? d.todoAlert : d.todoWarn))} href={href}>
      <span className={d.todoValue}>{n === null ? "…" : fmt(n)}</span>
      <span className={d.todoLabel}>{label}</span>
      <span className={d.todoNote}>{on ? "눌러서 보기 →" : none}</span>
    </a>
  );
}

function Mini({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <span className={styles.miniValue}>{value}</span>
      <span className={styles.miniLabel}>{label}</span>
      {sub && <span className={d.miniSub}>{sub}</span>}
    </>
  );
  return href ? (
    <a className={cx(styles.miniStat, d.miniLink)} href={href}>
      {body}
    </a>
  ) : (
    <div className={styles.miniStat}>{body}</div>
  );
}

function RecentCard({ title, href, loading, empty, children }: { title: string; href: string; loading: boolean; empty?: string | false; children: ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <a className={styles.cardLink} href={href}>
          모두 보기 →
        </a>
      </div>
      {loading ? <Loading inline /> : empty ? <Empty inline>{empty}</Empty> : <ul className={styles.recentList}>{children}</ul>}
    </div>
  );
}
