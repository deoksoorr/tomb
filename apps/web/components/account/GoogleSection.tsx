"use client";

import { useEffect, useState } from "react";
import { api, ApiRequestError, errorMessage } from "@/lib/api";
import type { GoogleStatusResponse, Me } from "@/lib/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import google from "../entry/Google.module.css";
import styles from "./MyPanel.module.css";

/**
 * 내 정보의 구글 계정 칸: 연결하면 다음부터 입구 [구글로 시작하기]로 바로 들어온다. 구글 하나 ↔ 계정 하나.
 * 구글 설정이 없는 서버(상태 404)면 칸을 그리지 않는다. 연결은 구글 동의 화면에 다녀오는 페이지 이동이다
 */
export default function GoogleSection({ me }: { me: Me }) {
  // undefined = 불러오는 중, null = 그리지 않음 (꺼짐·실패)
  const [status, setStatus] = useState<GoogleStatusResponse | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .googleStatus()
      .then(setStatus)
      .catch((e: unknown) => {
        if (!(e instanceof ApiRequestError) || e.status !== 404) console.warn("[google] 연결 상태를 못 불러왔어요", e);
        setStatus(null);
      });
  }, []);

  async function unlink() {
    setPending(true);
    setMessage(null);
    try {
      setStatus(await api.googleUnlink());
      setConfirming(false);
      setMessage("구글 연결을 끊었어요.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (status === null) return null;

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>구글 계정</h3>
      {status === undefined ? (
        <p className={styles.sub}>불러오는 중…</p>
      ) : status.linked ? (
        <>
          <div className={styles.nameRow}>
            <span className={styles.nameNow}>연결됨</span>
            {!confirming && (
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming(true)}>
                연결 끊기
              </button>
            )}
          </div>
          <p className={ui.hint}>입구의 [구글로 시작하기]로 이 계정에 바로 들어올 수 있어요.</p>
          {confirming && (
            <div className={styles.confirm} role="alertdialog" aria-label="구글 연결 끊기 확인">
              <p>끊으면 구글로는 들어올 수 없어요. 개인 코드를 꼭 적어 두세요.</p>
              {!me.hasCode && <p className={styles.warning}>아직 개인 코드가 없어요. 끊기 전에 위 [개인 코드 만들기]로 먼저 만들어 두세요.</p>}
              <div className={styles.confirmButtons}>
                <button type="button" className={cx(ui.button, ui.danger)} onClick={unlink} disabled={pending} autoFocus>
                  {pending ? "끊는 중…" : "연결 끊기"}
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming(false)}>
                  그만두기
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className={ui.hint}>
            연결하면 다음부터 이 구글 계정으로 바로 들어올 수 있어요. 구글 하나는 계정 하나에만 연결돼요. 개인 코드는 그대로 쓸 수
            있어요.
          </p>
          <a href="/api/auth/google/start?mode=link" className={cx(ui.button, ui.primary, google.link)}>
            <span className={google.mark} aria-hidden="true">
              G
            </span>
            구글 계정 연결
          </a>
          <p className={ui.hint}>구글에서는 고유 번호만 받아 알아볼 수 없게 바꿔 저장해요. 이메일·이름·사진은 받지 않아요.</p>
        </>
      )}
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
