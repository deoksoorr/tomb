"use client";

import { useState } from "react";
import { CONN_ABNORMAL, CONN_WHY_LABEL, type ConnWhy } from "@tomb/protocol";
import type { AdminLogRow } from "@/lib/adminLogs";
import type { ConnHealth } from "@/lib/opsLog";
import type { ConnLogEntry, HuntLogEntry } from "@/lib/store/opsLog";
import { moveText, type MoveLogEntry } from "@/lib/moveLog";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { fmt } from "./charts";
import { logsAdminApi } from "./logsAdminApi";
import { fullTime, relativeTime } from "./memberFormat";
import ops from "./Ops.module.css";
import { Empty, Loading, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

// 11/26 관리자 「접속 기록」·「사냥터 기록」 (유저 활동 메뉴 아래쪽 · 유저 상세 창) + 대시보드 「24시간 접속 종료」 카드

type Common = { toast: (message: string) => void; onAuthLost: () => void };
type List = "conn" | "hunt";

const DEVICE: Record<string, string> = { pc: "PC", phone: "폰", tablet: "패드" };
/** "phone·카카오톡" → "폰 · 카카오톡" */
export function deviceText(dev: string | undefined): string {
  if (!dev) return "";
  const [kind, app] = dev.split("·");
  return [DEVICE[kind] ?? kind, app].filter(Boolean).join(" · ");
}

const HUNT_LABEL: Record<HuntLogEntry["k"], string> = {
  start: "입장",
  leave: "나감",
  drop: "튕김",
  die: "쓰러짐",
  reward: "보상 지급",
  reject: "서버 판정 거절",
};

function connKind(e: ConnLogEntry | MoveLogEntry): { text: string; tone?: string } {
  // 11/27 자리 옮김 (버튼·집·맵·채널·자동 낚시 멈춤 — lib/moveLog)
  if (e.k === "mv") return { text: e.m === "houseNo" ? "못 들어감" : e.m === "fishStop" ? "낚시 멈춤" : "자리 옮김", tone: e.m === "houseNo" ? ops.tagWarn : ops.tagInfo };
  if (e.k === "in") return { text: "들어옴", tone: ops.tagOk };
  if (e.k === "err") return { text: "오류", tone: ops.tagBad };
  const why = (e.why ?? "drop") as ConnWhy;
  return { text: `나감 · ${CONN_WHY_LABEL[why] ?? why}`, tone: CONN_ABNORMAL.includes(why) ? ops.tagWarn : undefined };
}

function huntKind(e: HuntLogEntry): { text: string; tone?: string } {
  const tone = e.k === "reject" ? ops.tagBad : e.k === "drop" || e.k === "die" ? ops.tagWarn : e.k === "reward" ? ops.tagOk : e.k === "start" ? ops.tagInfo : undefined;
  return { text: HUNT_LABEL[e.k] ?? e.k, tone };
}

function huntDetail(e: HuntLogEntry & { where?: string }): string {
  const parts: string[] = [];
  if (e.where) parts.push(e.where);
  if (e.k === "reward" || e.k === "die" || e.k === "leave") {
    if (e.floors) parts.push(`${e.floors}층`);
    parts.push(`EXP ${fmt(e.exp ?? 0)} · ${fmt(e.pts ?? 0)}P${e.drops ? ` · 드롭 ${e.drops}` : ""}`);
    if (e.sec) parts.push(`${Math.floor(e.sec / 60)}분 ${e.sec % 60}초`);
  }
  if (e.k === "reject") parts.push(`${e.code ?? ""} ${e.msg ?? ""}`.trim());
  if (e.k === "drop" && e.msg) parts.push(e.msg);
  return parts.join(" · ");
}

function connDetail(e: ConnLogEntry | MoveLogEntry): string {
  if (e.k === "mv") return moveText(e);
  if (e.k === "err") return e.msg ?? "";
  return [e.ch ? `${e.ch}채널` : "", deviceText(e.dev)].filter(Boolean).join(" · ");
}

/** 기록 표 (전체 목록이면 이름 칸, 한 계정이면 빼고) */
function LogTable({ list, rows, now, onPick, showName }: { list: List; rows: AdminLogRow[]; now: number; onPick?: (id: string) => void; showName: boolean }) {
  if (!rows.length) return <Empty inline>{list === "conn" ? "아직 접속 기록이 없어요." : "아직 사냥터 기록이 없어요."}</Empty>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={list === "conn" ? "접속 기록" : "사냥터 기록"}>
        <thead>
          <tr>
            <th scope="col">시각</th>
            {showName && <th scope="col">이름</th>}
            <th scope="col">종류</th>
            <th scope="col">내용</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const k = list === "conn" ? connKind(r as ConnLogEntry | MoveLogEntry) : huntKind(r as HuntLogEntry);
            const detail = list === "conn" ? connDetail(r as ConnLogEntry | MoveLogEntry) : huntDetail(r as HuntLogEntry & { where?: string });
            return (
              <tr key={`${r.at}-${r.a}-${i}`}>
                <td className={styles.nowrap} title={fullTime(r.at)}>
                  {relativeTime(r.at, now)}
                  <span className={ops.sub}>{fullTime(r.at)}</span>
                </td>
                {showName && (
                  <td>
                    {onPick ? (
                      <button type="button" className={ops.nameButton} onClick={() => onPick(r.a)}>
                        {r.name ?? "이름 없음"}
                      </button>
                    ) : (
                      (r.name ?? "이름 없음")
                    )}
                  </td>
                )}
                <td>
                  <span className={cx(ops.tag, k.tone)}>{k.text}</span>
                </td>
                <td className={ops.detail}>{detail || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 유저 활동 메뉴 아래: 전체 최근 500줄 (이름을 누르면 그 계정 50줄만) */
export function OpsLogSection({ toast, onAuthLost, version }: Common & { version: number }) {
  const [list, setList] = useState<List>("conn");
  const [account, setAccount] = useState<string | null>(null);
  const load = usePanelLoad(() => logsAdminApi.logs(list, account ?? undefined), [version, list, account], toast, onAuthLost);
  const r = load.data && load.data.list === list ? load.data : null;
  return (
    <div className={an.section}>
      <div className={an.sectionHead}>
        <h2 className={an.sectionTitle}>{list === "conn" ? "접속 기록" : "사냥터 기록"}</h2>
        <div className={styles.segmented} role="group" aria-label="기록 종류">
          <button type="button" className={ui.button} aria-pressed={list === "conn"} onClick={() => setList("conn")}>
            접속 기록
          </button>
          <button type="button" className={ui.button} aria-pressed={list === "hunt"} onClick={() => setList("hunt")}>
            사냥터 기록
          </button>
        </div>
      </div>
      <div className={ops.toolbar}>
        {account ? (
          <>
            <span className={ops.tag}>
              {r?.account?.name ?? "이름 없음"} · 유입 {r?.account?.signup ?? "…"}
            </span>
            <button type="button" className={cx(ui.button, ui.small)} onClick={() => setAccount(null)}>
              전체 보기
            </button>
          </>
        ) : (
          <span className={ops.muted}>이름을 누르면 그 계정 기록만 봐요.</span>
        )}
        <span className={ops.toolbarEnd}>
          {list === "conn" ? "들어옴·나감(종료 종류·기기)·화면 오류 · 회원 상세에는 자리 옮김(누른 버튼·집·맵·채널·자동 낚시 멈춤)도" : "입장·나감·튕김·쓰러짐·보상 지급·서버 판정 거절"} · 계정당 50줄, 전체 500줄 · IP는 남기지 않아요
        </span>
      </div>
      {r ? <LogTable list={list} rows={r.rows} now={r.at} onPick={account ? undefined : setAccount} showName={!account} /> : <LoadState data={null} error={load.error} retry={load.retry} inline />}
    </div>
  );
}

/** 유저 상세 창: 그 계정의 가입 유입 + 접속 기록·사냥터 기록 50줄 */
export function AccountLogs({ accountId, toast, onAuthLost }: Common & { accountId: string }) {
  const [list, setList] = useState<List>("conn");
  const load = usePanelLoad(() => logsAdminApi.logs(list, accountId), [list, accountId], toast, onAuthLost);
  const r = load.data && load.data.list === list ? load.data : null;
  return (
    <div>
      <div className={ops.toolbar}>
        <span className={ops.tag}>가입 유입 · {r?.account?.signup ?? "…"}</span>
        {/* 11/27 최근 접속 유입: 오늘·어제 입장한 탭의 유입 (그보다 오래되면 「기록 없음」) */}
        <span className={ops.tag} title={r?.account?.sessionAt ? fullTime(r.account.sessionAt) : undefined}>
          최근 접속 유입 · {r ? (r.account?.session ?? "기록 없음 (최근 2일)") : "…"}
        </span>
        <div className={styles.segmented} role="group" aria-label="기록 종류">
          <button type="button" className={ui.button} aria-pressed={list === "conn"} onClick={() => setList("conn")}>
            접속 기록
          </button>
          <button type="button" className={ui.button} aria-pressed={list === "hunt"} onClick={() => setList("hunt")}>
            사냥터 기록
          </button>
        </div>
      </div>
      {r ? <LogTable list={list} rows={r.rows} now={r.at} showName={false} /> : <LoadState data={null} error={load.error} retry={load.retry} inline />}
    </div>
  );
}

const CONN_OPEN_KEY = "tomb.admin.connOpen";

/**
 * 대시보드: 최근 24시간 접속 종료 (비정상 종료 비율). 11/26 값은 대시보드 한 번에(/api/admin/dashboard) 받아 넘긴다 — undefined = 불러오는 중, null = 못 읽음.
 * 11/27 운영: 평소엔 한 줄 요약만, 누르면 펼친다 (펼침 여부는 이 기기에 기억 — 기록·수집은 그대로)
 */
export function ConnHealthCard({ h }: { h: ConnHealth | null | undefined }) {
  // 관리 화면은 로그인 확인 뒤(브라우저에서만) 그려져 첫 값을 바로 읽어도 서버 그림과 어긋나지 않는다
  const [open, setOpen] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(CONN_OPEN_KEY) === "1";
    } catch {
      return false; // 저장소를 못 쓰면 접힌 채로
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(CONN_OPEN_KEY, o ? "0" : "1");
      } catch {
        /* 기억만 못 한다 */
      }
      return !o;
    });
  };
  const pct = h && h.ratio !== null ? `${Math.round(h.ratio * 1000) / 10}%` : "—";
  const warn = !!h && h.ratio !== null && h.ratio >= 0.2;
  const top = h ? (Object.entries(h.byWhy) as [ConnWhy, number][]).sort((a, b) => b[1] - a[1]) : [];
  return (
    <div className={cx(styles.card, ops.foldCard)}>
      <button type="button" className={ops.foldHead} onClick={toggle} aria-expanded={open}>
        <span className={styles.cardTitle}>24시간 접속 종료</span>
        <span className={ops.foldSummary}>
          {h === undefined ? (
            "불러오는 중…"
          ) : h === null ? (
            "읽지 못했어요"
          ) : (
            <>
              나감 <b>{fmt(h.outs)}</b>건 · 비정상 <b className={warn ? ops.foldWarn : undefined}>{pct}</b> · 들어옴 <b>{fmt(h.ins)}</b>
            </>
          )}
        </span>
        <span className={ops.foldToggle} aria-hidden="true">
          {open ? "접기 ▴" : "자세히 ▾"}
        </span>
      </button>
      {open &&
        (h === undefined ? (
          <Loading inline />
        ) : h === null ? (
          <p className={ui.hint}>접속 기록을 읽지 못했어요.</p>
        ) : (
          <div className={ops.foldBody}>
            <div className={ops.kpis}>
              <div className={cx(ops.kpi, warn && ops.kpiWarn)}>
                <span className={ops.kpiLabel}>비정상 종료 비율</span>
                <span className={ops.kpiValue}>{pct}</span>
                <span className={ops.kpiNote}>연결 끊김·응답 없음·오류 {fmt(h.abnormal)} / 나감 {fmt(h.outs)}</span>
              </div>
              <div className={ops.kpi}>
                <span className={ops.kpiLabel}>들어옴</span>
                <span className={ops.kpiValue}>{fmt(h.ins)}</span>
                <span className={ops.kpiNote}>채널 이동·재접속은 빼고</span>
              </div>
            </div>
            <div className={ops.foldSide}>
              {top.length > 0 ? (
                <ul className={ops.bars} aria-label="나감 종류">
                {top.map(([w, n]) => (
                  <li key={w} className={ops.barItem}>
                    <span className={ops.barName}>{CONN_WHY_LABEL[w]}</span>
                    <span className={ops.barTrack}>
                      <span className={ops.barFill} style={{ width: `${Math.max(3, (n / Math.max(1, h.outs)) * 100)}%`, display: "block" }} />
                    </span>
                    <span className={ops.barCount}>{fmt(n)}</span>
                  </li>
                ))}
                </ul>
              ) : (
                <p className={ui.hint}>아직 나간 기록이 없어요.</p>
              )}
              <a className={styles.cardLink} href="#activity">
                접속 기록 →
              </a>
            </div>
          </div>
        ))}
    </div>
  );
}

const SRC_DAYS: [number, string][] = [
  [1, "오늘"],
  [7, "7일"],
  [30, "30일"],
];

/** 유입 분석: 유입별 가입 수 (11/26 배포 뒤 가입부터) */
export function SignupSourcesCard({ toast, onAuthLost, version }: Common & { version: number }) {
  const [days, setDays] = useState(30);
  const load = usePanelLoad(() => logsAdminApi.signupSources(days), [version, days], toast, onAuthLost);
  const r = load.data && load.data.days === days ? load.data : null;
  const max = r ? Math.max(1, ...r.rows.map((x) => x.n)) : 1;
  return (
    <div className={an.section}>
      <div className={an.sectionHead}>
        <h2 className={an.sectionTitle}>유입별 가입 수</h2>
        <div className={styles.segmented} role="group" aria-label="기간">
          {SRC_DAYS.map(([d, label]) => (
            <button key={d} type="button" className={ui.button} aria-pressed={days === d} onClick={() => setDays(d)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!r ? (
        <LoadState data={null} error={load.error} retry={load.retry} inline />
      ) : r.rows.length === 0 ? (
        <Empty inline>아직 유입 기록이 있는 가입이 없어요.</Empty>
      ) : (
        <ul className={ops.bars} aria-label="유입별 가입 수">
          {r.rows.map((x) => (
            <li key={x.label} className={ops.barItem}>
              <span className={ops.barName} title={x.label}>
                {x.label}
              </span>
              <span className={ops.barTrack}>
                <span className={ops.barFill} style={{ width: `${Math.max(3, (x.n / max) * 100)}%`, display: "block" }} />
              </span>
              <span className={ops.barCount}>
                {fmt(x.n)} · {Math.round((x.n / r.total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className={ui.hint}>
        처음 방문한 곳(리퍼러 주소의 도메인만·utm)을 가입할 때 계정에 남겨요. 전체 주소·검색어는 남기지 않아요. 카카오톡·인스타그램 앱 안에서 열면 리퍼러가 비어 「카카오톡 앱」처럼 앱 이름만 보여요.
      </p>
    </div>
  );
}
