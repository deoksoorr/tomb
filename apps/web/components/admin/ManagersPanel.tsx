"use client";

import { useState, type FormEvent } from "react";
import type { AdminManagersResponse } from "@/app/api/admin/managers/route";
import type { AdminMemberRow } from "@/lib/adminMembers";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { MANAGER_TITLE } from "@/lib/titles";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { Empty } from "./PanelState";
import { opsAdminApi } from "./opsAdminApi";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const dateText = (ms: number) => new Date(ms).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" });

/**
 * 11/16 매니저 임명 탭: 닉네임으로 찾아 임명하고, 지금 매니저 목록에서 해제한다 (관리자 키 + 관리자 IP에서만 열린다).
 * 매니저 혜택은 전용 칭호와 채팅 「매니저」 딱지뿐 (운영자 권한은 없다)
 */
export default function ManagersPanel({ toast, onAuthLost }: Props) {
  const [version, setVersion] = useState(0);
  const loaded = usePanelData(() => opsAdminApi.managers(), [version], toast, onAuthLost);
  const [current, setCurrent] = useState<AdminManagersResponse | null>(null);
  const view = current ?? loaded;
  const [name, setName] = useState("");
  const [rows, setRows] = useState<AdminMemberRow[] | null>(null);
  const [pending, setPending] = useState(false);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  const set = async (accountId: string, on: boolean, who: string) => {
    if (!on && !window.confirm(`${who}님을 매니저에서 해제할까요? 칭호와 채팅 딱지가 바로 사라져요.`)) return;
    setPending(true);
    try {
      const r = await opsAdminApi.setManager(accountId, on);
      setCurrent(r);
      setVersion((v) => v + 1);
      toast(on ? `${who}님을 매니저로 임명했어요.` : `${who}님을 매니저에서 해제했어요.`);
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      // 회원 전체 목록에서 (포인트가 없는 새 계정도) 최근 접속 순으로
      setRows((await adminApi.members(name.trim(), null, true)).members.filter((m) => m.name));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  };

  const managers = view?.managers ?? [];
  const isMgr = new Set(managers.map((m) => m.accountId));
  return (
    <section className={styles.notices} aria-label="매니저 임명">
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>지금 매니저</strong>
          {view && (
            <span className={styles.meta}>
              {managers.length}명 (최대 {view.max}명)
            </span>
          )}
        </p>
        {view === null ? (
          <p className={ui.hint}>불러오는 중…</p>
        ) : managers.length === 0 ? (
          <p className={ui.hint}>아직 임명한 매니저가 없어요.</p>
        ) : (
          <ul className={styles.list}>
            {managers.map((m) => (
              <li key={m.accountId} className={styles.notice}>
                <div className={styles.noticeTitle}>
                  <strong>{m.name ?? "이름 없음"}</strong>
                  <span className={styles.meta}>
                    {m.setAt ? `${dateText(m.setAt)} 임명` : "임명 날짜 모름"} · {m.accountId}
                  </span>
                </div>
                <div className={styles.segmented}>
                  <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void set(m.accountId, false, m.name ?? m.accountId)} disabled={pending}>
                    해제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className={ui.hint}>
          매니저는 「{MANAGER_TITLE.name}」 칭호를 달 수 있고, 채팅 이름 옆에 「매니저」 딱지가 붙어요. 다른 혜택이나 관리자 권한은 없어요.
          접속 중이면 임명·해제가 그 자리에서 바로 반영돼요. 해제하면 달고 있던 칭호도 같이 빠져요.
        </p>
      </div>

      <form className={styles.pointsForm} onSubmit={(e) => void search(e)} aria-label="매니저로 임명할 계정 찾기">
        <span className={styles.statLabel}>닉네임으로 찾기</span>
        <input
          className={cx(ui.input, styles.pointsTarget)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="닉네임 일부"
          aria-label="닉네임"
          autoComplete="off"
        />
        <button type="submit" className={ui.button} disabled={pending || !name.trim()}>
          찾기
        </button>
      </form>

      {rows !== null &&
        (rows.length === 0 ? (
          <Empty>찾는 계정이 없어요.</Empty>
        ) : (
          <ul className={styles.list}>
            {rows.map((r) => {
              const on = isMgr.has(r.accountId);
              const who = r.name ?? r.accountId;
              return (
                <li key={r.accountId} className={styles.notice}>
                  <div className={styles.noticeTitle}>
                    <strong>{r.name ?? "이름 없음"}</strong>
                    <span className={styles.meta}>
                      {r.lastSeenAt ? `${dateText(r.lastSeenAt)} 마지막 접속` : "접속 기록 없음"} · {r.accountId}
                    </span>
                  </div>
                  <div className={styles.segmented}>
                    {on ? (
                      <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void set(r.accountId, false, who)} disabled={pending}>
                        매니저 해제
                      </button>
                    ) : (
                      <button type="button" className={ui.button} onClick={() => void set(r.accountId, true, who)} disabled={pending}>
                        매니저로 임명
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
