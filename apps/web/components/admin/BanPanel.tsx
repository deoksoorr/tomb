"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { AdminBan, BanIpInfo, BanLookup } from "@/lib/banAdmin";
import type { BanKind } from "@/lib/store/bans";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./Admin.module.css";
import m from "./Moderation.module.css";
import { expelledText, moderationApi } from "./moderationApi";

// 47번 회원 탭: 지금 내보내기(강퇴) · 정지(계정 / IP / 둘 다) · 정지·차단 목록(기간 수정·조기 해제·처리 기록)

type Common = { toast: (message: string) => void; onAuthLost: () => void };
/** 정지 대상. 계정 없이 IP만 막을 때는 accountId가 없다. reportKey = 신고 탭에서 넘어온 신고 */
export type BanTarget = { accountId?: string; name?: string | null; reportKey?: string };

const KIND_LABEL: Record<BanKind, string> = { account: "계정 정지", ip: "IP 차단", both: "계정 정지 + IP 차단" };
const STATUS_LABEL = { active: "진행 중", expired: "기간 끝남", lifted: "해제됨" } as const;
const SHORTCUTS = [1, 3, 7, 30];
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const when = (at: number | null) => (at === null ? "영구" : KST.format(at));
const shortHash = (h: string | null) => (h ? `IP#${h.slice(0, 8)}` : "");

function useFail({ toast, onAuthLost }: Common) {
  return (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };
}

/** [지금 내보내기] — 정지 없이 접속만 끊는다 */
export function KickButton({ accountId, name, toast, onAuthLost }: Common & { accountId: string; name?: string | null }) {
  const [pending, setPending] = useState(false);
  const fail = useFail({ toast, onAuthLost });
  return (
    <button
      type="button"
      className={ui.button}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { expelled } = await moderationApi.kick(accountId);
          toast(`${name ?? "그 계정"}: ${expelledText(expelled)}`);
        } catch (e) {
          fail(e);
        } finally {
          setPending(false);
        }
      }}
    >
      지금 내보내기
    </button>
  );
}

function IpLine({ ip }: { ip: BanIpInfo }) {
  return (
    <span className={m.ipLine}>
      <code>{shortHash(ip.ipHash)}</code>
      {ip.lastAt !== null && <span className={styles.meta}> 최근 {KST.format(ip.lastAt)}</span>}
      <span className={cx(m.ipCount, ip.accounts > 1 && m.warn)}>
        이 IP로 최근 접속한 계정 {ip.accounts}명{ip.names.length ? ` (${ip.names.join(", ")}${ip.accounts > ip.names.length ? " …" : ""})` : ""}
      </span>
      {ip.operator && <span className={m.warn}> 운영자 IP — 차단 불가</span>}
    </span>
  );
}

/** 정지 걸기 창 */
export function BanDialog({ target, onClose, onDone, ...common }: Common & { target: BanTarget; onClose: () => void; onDone: () => void }) {
  const fail = useFail(common);
  const hasAccount = !!target.accountId;
  const [lookup, setLookup] = useState<BanLookup | null>(null);
  const [kind, setKind] = useState<BanKind>(hasAccount ? "account" : "ip");
  /** 계정의 최근 IP 해시 중 고른 것 / "manual" = 직접 입력 */
  const [ipPick, setIpPick] = useState<string>("manual");
  const [ipText, setIpText] = useState("");
  const [ipPreview, setIpPreview] = useState<BanIpInfo | null>(null);
  const [days, setDays] = useState("3");
  const [forever, setForever] = useState(false);
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target.accountId) return;
    let alive = true;
    moderationApi.lookup({ accountId: target.accountId }).then(
      (l) => {
        if (!alive) return;
        setLookup(l);
        const first = l.account?.ips.find((i) => !i.operator);
        if (first) setIpPick(first.ipHash);
      },
      (e: unknown) => alive && fail(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.accountId]);

  const acct = lookup?.account ?? null;
  const wantsIp = kind !== "account";
  const pickedIp = ipPick === "manual" ? ipPreview : (acct?.ips.find((i) => i.ipHash === ipPick) ?? null);
  const nDays = Number(days);
  const daysOk = forever || (Number.isInteger(nDays) && nDays >= 1 && nDays <= 3650);
  const ipOk = !wantsIp || (ipPick === "manual" ? ipText.trim() !== "" && !ipPreview?.operator : !!pickedIp && !pickedIp.operator);
  const valid = daysOk && ipOk && reason.trim() !== "" && memo.trim() !== "" && (kind === "ip" || hasAccount);

  const previewIp = async () => {
    setError(null);
    try {
      setIpPreview((await moderationApi.lookup({ ip: ipText.trim() })).ip);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status !== 401) setError(e.message);
      else fail(e);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await moderationApi.createBan({
        kind,
        ...(hasAccount ? { accountId: target.accountId } : {}),
        ...(wantsIp ? (ipPick === "manual" ? { ip: ipText.trim() } : { ipHash: ipPick }) : {}),
        days: forever ? null : nDays,
        reason: reason.trim(),
        memo: memo.trim(),
        ...(target.reportKey ? { reportKey: target.reportKey } : {}),
      });
      common.toast(`${KIND_LABEL[r.ban.kind]} 완료. ${expelledText(r.expelled)}`);
      onDone();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) common.onAuthLost();
      else setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog title={hasAccount ? `정지 — ${target.name ?? acct?.name ?? target.accountId}` : "IP 차단"} onClose={onClose} closable={!pending}>
      <form className={m.form} onSubmit={(e) => void submit(e)}>
        {hasAccount && (
          <p className={styles.meta}>
            계정 {target.accountId}
            {acct?.active && <span className={m.warn}> · 지금 정지 중 (해제 {when(acct.active.until)}) — 새로 걸면 바뀌어요</span>}
          </p>
        )}

        <fieldset className={m.group}>
          <legend className={ui.label}>종류</legend>
          {(hasAccount ? (["account", "ip", "both"] as BanKind[]) : (["ip"] as BanKind[])).map((k) => (
            <label key={k} className={m.radio}>
              <input type="radio" name="ban-kind" checked={kind === k} onChange={() => setKind(k)} />
              {KIND_LABEL[k]}
            </label>
          ))}
        </fieldset>

        {wantsIp && (
          <fieldset className={m.group}>
            <legend className={ui.label}>차단할 IP (해시로만 저장해요)</legend>
            {acct?.ips.map((ip) => (
              <label key={ip.ipHash} className={m.radio}>
                <input type="radio" name="ban-ip" disabled={ip.operator} checked={ipPick === ip.ipHash} onChange={() => setIpPick(ip.ipHash)} />
                <IpLine ip={ip} />
              </label>
            ))}
            {hasAccount && acct && !acct.ips.length && <p className={ui.hint}>이 계정은 최근 30일 접속 IP 기록이 없어요.</p>}
            <label className={m.radio}>
              <input type="radio" name="ban-ip" checked={ipPick === "manual"} onChange={() => setIpPick("manual")} />
              IP 직접 입력
            </label>
            {ipPick === "manual" && (
              <div className={m.inline}>
                <input
                  className={ui.input}
                  value={ipText}
                  onChange={(e) => {
                    setIpText(e.target.value);
                    setIpPreview(null);
                  }}
                  placeholder="예: 203.0.113.7"
                  aria-label="IP 주소"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className={ui.button} onClick={() => void previewIp()} disabled={!ipText.trim()}>
                  계정 수 확인
                </button>
              </div>
            )}
            {ipPick === "manual" && ipPreview && <IpLine ip={ipPreview} />}
            <p className={ui.hint}>학교·회사·모바일 통신사처럼 여러 사람이 같은 IP를 쓰면 다른 사람도 막힐 수 있어요.</p>
          </fieldset>
        )}

        <fieldset className={m.group}>
          <legend className={ui.label}>기간 (기간이 지나면 자동 해제)</legend>
          <div className={m.inline}>
            <input
              className={cx(ui.input, m.days)}
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={days}
              disabled={forever}
              onChange={(e) => setDays(e.target.value)}
              aria-label="정지 일수"
            />
            <span>일</span>
            {SHORTCUTS.map((d) => (
              <button
                key={d}
                type="button"
                className={ui.button}
                aria-pressed={!forever && nDays === d}
                onClick={() => {
                  setForever(false);
                  setDays(String(d));
                }}
              >
                {d}일
              </button>
            ))}
            <label className={m.radio}>
              <input type="checkbox" checked={forever} onChange={(e) => setForever(e.target.checked)} />
              영구
            </label>
          </div>
        </fieldset>

        <label className={ui.field}>
          <span className={ui.label}>사용자에게 보일 사유 (필수)</span>
          <input className={ui.input} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="예: 다른 이용자에게 욕설을 반복했어요" />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>관리자 메모 (필수, 사용자에게 안 보여요)</span>
          <textarea className={cx(ui.input, m.memo)} value={memo} maxLength={500} rows={3} onChange={(e) => setMemo(e.target.value)} placeholder="신고 내용·증거·판단 근거" />
        </label>

        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={cx(ui.button, ui.danger)} disabled={pending || !valid}>
            {KIND_LABEL[kind]} 걸기
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={onClose} disabled={pending}>
            그만두기
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** 정지·차단 목록 (진행 중 먼저). 진행 중이면 기간 수정·조기 해제, 처리 기록은 펼쳐 본다 */
export function BanList({ version, onChanged, ...common }: Common & { version: number; onChanged: () => void }) {
  const fail = useFail(common);
  const [bans, setBans] = useState<AdminBan[] | null>(null);
  const [show, setShow] = useState<"active" | "all">("active");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; days: string; forever: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    moderationApi.bans().then(
      (r) => alive && setBans(r.bans),
      (e: unknown) => alive && fail(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setPending(true);
    try {
      await fn();
      common.toast(done);
      setEditing(null);
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };

  const shown = (bans ?? []).filter((b) => show === "all" || b.status === "active");
  const activeCount = (bans ?? []).filter((b) => b.status === "active").length;

  return (
    <section className={m.section} aria-label="정지·차단 목록">
      <div className={styles.noticesHead}>
        <span className={styles.statLabel}>정지·차단 목록</span>
        <div className={styles.segmented} role="group" aria-label="보기">
          <button type="button" className={ui.button} aria-pressed={show === "active"} onClick={() => setShow("active")}>
            진행 중 {activeCount}
          </button>
          <button type="button" className={ui.button} aria-pressed={show === "all"} onClick={() => setShow("all")}>
            전체 기록 {bans?.length ?? 0}
          </button>
        </div>
      </div>
      {bans === null ? (
        <p className={styles.empty}>불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>{show === "active" ? "지금 걸린 정지·차단이 없어요." : "정지·차단 기록이 없어요."}</p>
      ) : (
        <div className={m.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>대상</th>
                <th>종류</th>
                <th>사유 / 메모</th>
                <th>시작</th>
                <th>해제일</th>
                <th>처리자</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className={b.status !== "active" ? m.ended : undefined}>
                  <td>
                    {b.accountId && <strong>{b.accountName ?? b.accountId}</strong>}
                    {b.ipHash && (
                      <div className={styles.meta}>
                        {shortHash(b.ipHash)} · {b.ipSource === "manual" ? "직접 입력" : "계정 최근 IP"} · 차단 때 {b.ipAccounts}명
                      </div>
                    )}
                  </td>
                  <td>{KIND_LABEL[b.kind]}</td>
                  <td className={m.reasonCell}>
                    <div>{b.reason}</div>
                    <div className={styles.meta}>메모: {b.memo}</div>
                    <button type="button" className={cx(ui.button, ui.quiet, m.small)} onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}>
                      처리 기록 {b.history.length}
                    </button>
                    {open === b.id && (
                      <ol className={m.history}>
                        {b.history.map((h, i) => (
                          <li key={i}>
                            <time>{KST.format(h.at)}</time> {h.by} — {h.note}
                          </li>
                        ))}
                      </ol>
                    )}
                  </td>
                  <td>{KST.format(b.startAt)}</td>
                  <td>{b.liftedAt !== null ? `${KST.format(b.liftedAt)} 해제` : when(b.until)}</td>
                  <td>{b.by}</td>
                  <td>
                    {STATUS_LABEL[b.status]}
                    {b.status === "active" &&
                      (editing?.id === b.id ? (
                        <div className={m.editBox}>
                          <div className={m.inline}>
                            <input
                              className={cx(ui.input, m.days)}
                              type="number"
                              min={1}
                              max={3650}
                              value={editing.days}
                              disabled={editing.forever}
                              onChange={(e) => setEditing({ ...editing, days: e.target.value })}
                              aria-label="지금부터 일수"
                            />
                            <span>일</span>
                            <label className={m.radio}>
                              <input type="checkbox" checked={editing.forever} onChange={(e) => setEditing({ ...editing, forever: e.target.checked })} />
                              영구
                            </label>
                          </div>
                          <div className={m.inline}>
                            <button
                              type="button"
                              className={ui.button}
                              disabled={pending || (!editing.forever && !(Number(editing.days) >= 1))}
                              onClick={() =>
                                void run(
                                  () => moderationApi.editBan(b.id, { action: "edit", days: editing.forever ? null : Number(editing.days) }),
                                  "기간을 바꿨어요.",
                                )
                              }
                            >
                              지금부터로 저장
                            </button>
                            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setEditing(null)}>
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={m.inline}>
                          <button type="button" className={cx(ui.button, m.small)} disabled={pending} onClick={() => setEditing({ id: b.id, days: "7", forever: false })}>
                            기간 수정
                          </button>
                          <button
                            type="button"
                            className={cx(ui.button, ui.danger, m.small)}
                            disabled={pending}
                            onClick={() => void run(() => moderationApi.editBan(b.id, { action: "lift" }), "조기 해제했어요.")}
                          >
                            조기 해제
                          </button>
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
