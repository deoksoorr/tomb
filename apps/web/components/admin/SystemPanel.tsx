"use client";

import { useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { opsAdminApi, type AdminHealthReport } from "./opsAdminApi";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const STEP_LABEL: Record<string, string> = {
  put: "묘비 쓰기",
  get: "방금 쓴 묘비 읽기",
  list: "채널 목록 읽기",
  flower: "헌화 반영",
  settings: "설정 읽기",
  remove: "임시 묘비 지우기",
};

/**
 * 운영 점검: ① 저장소 점검(임시 묘비를 실제로 쓰고·읽고·지워 어느 단계에서 막히는지) ② 닉네임 색인 채우기(옛 계정 이름을 색인에 넣기).
 * 둘 다 누를 때만 돈다 (화면을 연다고 저절로 돌지 않는다)
 */
export default function SystemPanel({ toast, onAuthLost }: Props) {
  const [health, setHealth] = useState<AdminHealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [reindex, setReindex] = useState<{ indexed: number; dup: number; rounds: number; done: boolean } | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  const check = async () => {
    setChecking(true);
    try {
      setHealth(await opsAdminApi.health());
    } catch (e) {
      fail(e);
    } finally {
      setChecking(false);
    }
  };

  const runReindex = async () => {
    setReindexing(true);
    let cursor = "0";
    let total = { indexed: 0, dup: 0, rounds: 0, done: false };
    setReindex(total);
    try {
      // 커서가 "0"으로 돌아올 때까지 200개씩 (한 번에 다 하면 요청 시간이 길어진다)
      do {
        const r = await opsAdminApi.reindexNames(cursor);
        cursor = r.next;
        total = { indexed: total.indexed + r.indexed, dup: total.dup + r.dup, rounds: total.rounds + 1, done: r.next === "0" };
        setReindex(total);
      } while (cursor !== "0" && total.rounds < 500);
      toast(`닉네임 색인을 채웠어요. 새로 ${total.indexed}개, 겹친 이름 ${total.dup}개.`);
    } catch (e) {
      fail(e);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <section className={styles.notices} aria-label="운영 점검">
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>저장소 점검</h2>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void check()} disabled={checking}>
            {checking ? "점검 중…" : "점검 실행"}
          </button>
        </div>
        <p className={ui.hint}>
          저장소에 「상태 점검」 임시 묘비를 실제로 쓰고·읽고·헌화하고·지워 봐요. 묘비 작성이 실패할 때 어느 단계에서 막히는지 바로 보여요. 임시 묘비는 점검 끝에
          지워져요.
        </p>
        {health && (
          <>
            <div className={styles.channels}>
              <span className={cx(styles.badge, health.ok ? styles.badgeOpen : styles.badgeHidden)}>{health.ok ? "모두 정상" : "실패한 단계 있음"}</span>
              <span className={styles.chip}>저장소 {health.store === "redis" ? "Redis" : "메모리 (개발용)"}</span>
              <span className={styles.chip}>
                사진 저장소 {health.blob.token || health.blob.storeId ? "연결됨" : "없음 (개발용 로컬 업로드)"}
              </span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="점검 단계">
                <thead>
                  <tr>
                    <th scope="col">단계</th>
                    <th scope="col">결과</th>
                    <th scope="col" className={styles.num}>
                      걸린 시간
                    </th>
                    <th scope="col">오류</th>
                  </tr>
                </thead>
                <tbody>
                  {health.steps.map((s) => (
                    <tr key={s.step}>
                      <td>{STEP_LABEL[s.step] ?? s.step}</td>
                      <td className={s.ok ? styles.checkOk : styles.checkFail}>{s.ok ? "성공" : "실패"}</td>
                      <td className={styles.num}>{s.ms.toLocaleString("ko-KR")}ms</td>
                      <td>{s.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>닉네임 색인 채우기</h2>
          <button type="button" className={ui.button} onClick={() => void runReindex()} disabled={reindexing}>
            {reindexing ? "채우는 중…" : "색인 채우기"}
          </button>
        </div>
        <p className={ui.hint}>
          계정을 200개씩 훑어 이름 색인(이름 → 계정)에 빠진 옛 계정 이름을 채워요. 이미 다른 계정이 쓰는 이름은 바꾸지 않고 「겹침」 표시만 해요. 안 해도 각 계정이
          다음 입장 때 저절로 채워지니, 회원 검색에 옛 계정이 안 나올 때만 쓰면 돼요.
        </p>
        {reindex && (
          <p className={styles.meta} aria-live="polite">
            {reindex.rounds}번 훑음 · 새로 채운 이름 {reindex.indexed.toLocaleString("ko-KR")}개 · 겹친 이름 {reindex.dup.toLocaleString("ko-KR")}개
            {reindex.done ? " · 끝까지 훑었어요" : reindexing ? " · 계속 훑는 중" : " · 중간에 멈췄어요"}
          </p>
        )}
      </div>
    </section>
  );
}
