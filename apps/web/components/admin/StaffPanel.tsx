"use client";

import { useState, type FormEvent } from "react";
import type { AdminAccountRow as AccountRow } from "@/app/api/admin/accounts/search/route";
import type { AdminStaffResponse } from "@/app/api/admin/staff/route";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { Empty } from "./PanelState";
import { opsAdminApi } from "./opsAdminApi";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

/**
 * 31번 운영자 계정 탭: 계정 하나를 "운영자 계정"으로 지정·해제한다 (이 화면은 관리자 키 + 관리자 IP에서만 열린다).
 * 운영자 계정은 게임에서 저승사자 차림·"운영자" 배지, 포인트가 줄지 않음, 확성기 무료, 묘비 상세의 운영자 삭제(관리자 IP에서만)
 */
export default function StaffPanel({ toast, onAuthLost }: Props) {
  const [version, setVersion] = useState(0);
  const loaded = usePanelData(() => opsAdminApi.staff(), [version], toast, onAuthLost);
  const [current, setCurrent] = useState<AdminStaffResponse | null>(null);
  const view = current ?? loaded;
  const [name, setName] = useState("");
  const [direct, setDirect] = useState("");
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [pending, setPending] = useState(false);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  const assign = async (accountId: string | null) => {
    setPending(true);
    try {
      const r = await opsAdminApi.setStaff(accountId);
      setCurrent(r);
      setVersion((v) => v + 1);
      toast(accountId ? `운영자 계정으로 지정했어요: ${r.staff?.name ?? accountId}` : "운영자 계정을 해제했어요.");
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
      setRows((await adminApi.searchAccounts(name)).accounts);
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  };

  const staff = view?.staff ?? null;
  return (
    <section className={styles.notices} aria-label="운영자 계정">
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>지금 운영자 계정</strong>
        </p>
        {view === null ? (
          <p className={ui.hint}>불러오는 중…</p>
        ) : staff ? (
          <>
            <p className={styles.noticeBody}>
              <strong>{staff.name ?? "이름 없음"}</strong> <span className={styles.meta}>{staff.accountId}</span>
              <br />
              <span className={styles.meta}>{new Date(staff.setAt).toLocaleString("ko-KR")}에 지정</span>
            </p>
            <div className={styles.segmented}>
              <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void assign(null)} disabled={pending}>
                운영자 해제
              </button>
            </div>
          </>
        ) : (
          <p className={ui.hint}>아직 지정한 계정이 없어요.</p>
        )}
        <p className={ui.hint}>
          운영자 계정은 게임에서 저승사자 차림(검은 망토·낫·안개)과 「운영자」 배지로 모두에게 보이고, 포인트가 줄지 않고(늘 지갑 상한),
          확성기가 무료예요. 묘비 상세 창의 「삭제 (운영자)」는 관리자 IP에서 접속했을 때만 돼요. 차림은 그 계정이 다음에 입장·채널 이동·새로고침할 때부터
          보여요. 운영자는 한 명이라 새로 지정하면 이전 계정은 풀려요.
        </p>
      </div>

      <form className={styles.pointsForm} onSubmit={(e) => void search(e)} aria-label="운영자로 지정할 계정 찾기">
        <span className={styles.statLabel}>계정 찾기</span>
        <input
          className={cx(ui.input, styles.pointsTarget)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="닉네임 일부 (포인트를 모은 적 있는 계정)"
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
            {rows.map((r) => (
              <li key={r.accountId} className={styles.notice}>
                <div className={styles.noticeTitle}>
                  <strong>{r.name ?? "이름 없음"}</strong>
                  <span className={styles.meta}>
                    모은 포인트 {r.points.toLocaleString("ko-KR")} · {r.accountId}
                  </span>
                </div>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={ui.button}
                    onClick={() => void assign(r.accountId)}
                    disabled={pending || staff?.accountId === r.accountId}
                  >
                    {staff?.accountId === r.accountId ? "지금 운영자" : "운영자 계정으로 지정"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      <form
        className={styles.pointsForm}
        onSubmit={(e) => {
          e.preventDefault();
          void assign(direct.trim());
        }}
        aria-label="계정 id로 지정"
      >
        <span className={styles.statLabel}>계정 id로 지정</span>
        <input
          className={cx(ui.input, styles.pointsTarget)}
          value={direct}
          onChange={(e) => setDirect(e.target.value)}
          placeholder="계정 id (게임 안 내 정보에서 확인)"
          aria-label="계정 id"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={ui.button} disabled={pending || !/^[A-Za-z0-9_-]{1,64}$/.test(direct.trim())}>
          지정
        </button>
      </form>
    </section>
  );
}
