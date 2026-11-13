"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminMemberRow, AdminMembersResponse } from "@/lib/adminMembers";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import { BanDialog, KickButton, type BanTarget } from "./BanPanel";
import { fullTime, joinDate, relativeTime, STATUS_LABEL } from "./memberFormat";
import styles from "./Admin.module.css";
import mm from "./Members.module.css";
import m from "./Moderation.module.css";
import { Empty, Loading } from "./PanelState";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  /** 47번 신고 탭의 "정지로 이동": 이 대상으로 정지 창을 바로 연다 (열고 나면 onBanPresetUsed) */
  banPreset?: BanTarget | null;
  onBanPresetUsed?: () => void;
};

type Issued = { accountId: string; name: string | null; code: string };

/**
 * 회원 제재: 회원 전체 목록(최근 접속 순 50명씩, 이름 검색) — 줄마다 [코드 재발급]·[지금 내보내기]·[정지].
 * 정지·차단 목록과 IP로 바로 차단은 '정지·차단 기록', 재발급 기록은 '코드 재발급 기록' 메뉴에 있다.
 * 포인트 지급은 '선물' 메뉴에서 한다 (여기서는 뺐다).
 */
export default function MembersPanel({ toast, onAuthLost, banPreset, onBanPresetUsed }: Props) {
  // 신고 탭에서 넘어오면 이 탭이 새로 열리므로 처음 값으로 정지 창을 연다
  const [banTarget, setBanTarget] = useState<BanTarget | null>(() => banPreset ?? null);
  useEffect(() => {
    if (banPreset) onBanPresetUsed?.();
  }, [banPreset, onBanPresetUsed]);

  const [query, setQuery] = useState("");
  /** 지금 목록의 검색어 (입력 중인 값과 따로) */
  const [q, setQ] = useState("");
  /** 페이지마다 그 페이지를 부른 커서 (첫 페이지 = null) */
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [data, setData] = useState<AdminMembersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<AdminMemberRow | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    },
    [onAuthLost, toast],
  );

  const load = useCallback(
    async (search: string, cursor: string | null, fresh = false) => {
      setLoading(true);
      try {
        const r = await adminApi.members(search, cursor, fresh);
        setData(r);
        setNow(Date.now());
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fail],
  );

  // 처음 열 때 첫 페이지
  useEffect(() => {
    let alive = true;
    adminApi.members("", null).then(
      (r) => {
        if (!alive) return;
        setData(r);
        setNow(Date.now());
      },
      (e: unknown) => alive && fail(e),
    );
    return () => {
      alive = false;
    };
  }, [fail]);

  const page = cursors.length - 1;
  const search = async (e: FormEvent) => {
    e.preventDefault();
    const s = query.trim();
    if (await load(s, null)) {
      setQ(s);
      setCursors([null]);
    }
  };
  const next = async () => {
    if (!data?.next) return;
    const c = data.next;
    if (await load(q, c)) setCursors((cs) => [...cs, c]);
  };
  const prev = async () => {
    if (page === 0) return;
    const before = cursors.slice(0, -1);
    if (await load(q, before[before.length - 1])) setCursors(before);
  };
  const refresh = () => void load(q, cursors[page], true);

  const reissue = async (row: AdminMemberRow) => {
    setReissuing(true);
    try {
      setIssued(await adminApi.reissueCode(row.accountId));
      setConfirm(null);
    } catch (e) {
      setConfirm(null);
      fail(e);
    } finally {
      setReissuing(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast("새 코드를 복사했어요.");
    } catch {
      toast("복사하지 못했어요. 코드를 직접 골라 복사해 주세요.");
    }
  };

  const members = data?.members ?? [];

  return (
    <section className={styles.notices} aria-label="회원 제재">
      <div className={mm.head}>
        <form className={mm.search} onSubmit={(e) => void search(e)} role="search" aria-label="회원 찾기">
          <input
            className={ui.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 일부 또는 계정 id (비우면 전체)"
            aria-label="이름 또는 계정 id"
            autoComplete="off"
            maxLength={64}
          />
          <button type="submit" className={ui.button} disabled={loading}>
            찾기
          </button>
        </form>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={refresh} disabled={loading}>
          목록 새로 훑기
        </button>
      </div>

      <p className={styles.meta} aria-live="polite">
        {data
          ? `${q ? `"${q}" 검색 결과 ` : "전체 회원 "}${data.total.toLocaleString("ko-KR")}명 · 최근 접속 순 · ${page + 1}페이지` +
            ` · ${relativeTime(data.scannedAt, now)} 기준${data.partial ? " · 회원이 너무 많아 일부만 훑었어요" : ""}`
          : "불러오는 중…"}
      </p>

      {!data ? (
        <Loading />
      ) : members.length === 0 ? (
        <Empty>{q ? "찾는 회원이 없어요." : "아직 회원이 없어요."}</Empty>
      ) : (
        <div className={styles.tableWrap}>
          <table className={cx(styles.table, styles.stackTable)} aria-label="회원 목록" aria-busy={loading}>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">가입일</th>
                <th scope="col">마지막 접속</th>
                <th scope="col" className={styles.num}>
                  포인트
                </th>
                <th scope="col">상태</th>
                <th scope="col" className={styles.num}>
                  사냥 레벨
                </th>
                <th scope="col" className={styles.num}>
                  제재
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((r) => (
                <tr key={r.accountId}>
                  <td className={mm.nameCell}>
                    {r.name ?? "이름 없음"}
                    <span className={mm.id}>{r.accountId}</span>
                  </td>
                  <td className={styles.nowrap} data-label="가입일" title={fullTime(r.createdAt)}>
                    {joinDate(r.createdAt)}
                  </td>
                  <td className={styles.nowrap} data-label="마지막 접속" title={fullTime(r.lastSeenAt)}>
                    {relativeTime(r.lastSeenAt, now)}
                  </td>
                  <td className={styles.num} data-label="포인트">
                    {r.points.toLocaleString("ko-KR")}
                  </td>
                  <td data-label="상태">
                    <span
                      className={cx(mm.status, mm[r.status])}
                      title={r.status === "banned" ? (r.banUntil ? `해제 ${fullTime(r.banUntil)}` : "영구 정지") : undefined}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className={styles.num} data-label="사냥 레벨">
                    {r.huntLevel ? `Lv.${r.huntLevel}` : "—"}
                  </td>
                  <td>
                    <div className={mm.actions}>
                      <button
                        type="button"
                        className={cx(ui.button, ui.small)}
                        onClick={() => setConfirm(r)}
                        disabled={r.status === "staff"}
                        title={r.status === "staff" ? "운영자 계정은 실수 방지로 재발급할 수 없어요 ('운영자 지정' 메뉴에서 지정을 풀면 돼요)" : undefined}
                      >
                        코드 재발급
                      </button>
                      <KickButton accountId={r.accountId} name={r.name} toast={toast} onAuthLost={onAuthLost} small />
                      <button type="button" className={cx(ui.button, ui.danger, ui.small)} onClick={() => setBanTarget({ accountId: r.accountId, name: r.name })}>
                        정지
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (page > 0 || data.next) && (
        <nav className={mm.pager} aria-label="회원 목록 페이지">
          <button type="button" className={ui.button} onClick={() => void prev()} disabled={loading || page === 0}>
            ← 이전 50명
          </button>
          <span className={styles.meta}>{page + 1}페이지</span>
          <button type="button" className={ui.button} onClick={() => void next()} disabled={loading || !data.next}>
            다음 50명 →
          </button>
        </nav>
      )}

      {banTarget && (
        <BanDialog
          target={banTarget}
          toast={toast}
          onAuthLost={onAuthLost}
          onClose={() => setBanTarget(null)}
          onDone={() => {
            setBanTarget(null);
            void load(q, cursors[page]);
          }}
        />
      )}

      {confirm && (
        <Dialog title="접속 코드 재발급" kind="confirm" onClose={() => setConfirm(null)} closable={!reissuing}>
          <div className={mm.dialogBody}>
            <p>
              <strong>{confirm.name ?? "이름 없음"}</strong> <span className={styles.meta}>({confirm.accountId})</span>에게 새 접속 코드를 만들어요.
            </p>
            <p className={m.warn}>이 회원의 옛 코드는 더 이상 쓸 수 없어요.</p>
            <p className={styles.meta}>새 코드는 다음 창에서 딱 한 번만 보여요. 본인 확인을 마친 뒤에만 재발급해 주세요.</p>
            <div className={mm.dialogButtons}>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirm(null)} disabled={reissuing}>
                그만두기
              </button>
              <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void reissue(confirm)} disabled={reissuing}>
                새 코드 발급
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {issued && (
        <Dialog title="새 접속 코드" kind="confirm" onClose={() => setIssued(null)} backdropClose={false}>
          <div className={mm.dialogBody}>
            <p>
              <strong>{issued.name ?? "이름 없음"}</strong> 회원의 새 코드예요.
            </p>
            <code className={mm.code} aria-label="새 접속 코드">
              {issued.code}
            </code>
            <p className={m.warn}>이 창을 닫으면 다시 볼 수 없어요. 지금 복사해 회원에게 전해 주세요.</p>
            <div className={mm.dialogButtons}>
              <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void copy(issued.code)}>
                복사
              </button>
              <button type="button" className={ui.button} onClick={() => setIssued(null)}>
                닫기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
