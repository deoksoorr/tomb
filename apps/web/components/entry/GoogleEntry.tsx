"use client";

import { useState } from "react";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import entry from "./EntryScreen.module.css";
import styles from "./Google.module.css";

// 구글로 시작하기 (입구 화면): 단추, 연결된 계정이 없을 때의 경고·선택, 새로 만든 뒤 개인 코드 안내

/** 입구 [구글로 시작하기]. 구글 동의 화면으로 갔다가 돌아온다 (연결된 계정이면 그 계정, 없으면 새로 만들기 확인) */
export function GoogleStartButton() {
  return (
    <a href="/api/auth/google/start?mode=login" className={cx(ui.button, entry.big, styles.link)}>
      <span>
        <span className={styles.mark} aria-hidden="true">
          G
        </span>
        구글로 시작하기
      </span>
      <span className={entry.bigSub}>연결된 계정으로 들어가거나 새로 만들어요</span>
    </a>
  );
}

/** 구글은 확인됐지만 연결된 계정이 없다 → 새로 만들기 전에 반드시 묻는다 (기존 계정과 합쳐지지 않으니) */
export function GoogleNewStep({ onCode, onCreate, onBack }: { onCode: () => void; onCreate: () => void; onBack: () => void }) {
  return (
    <div className={entry.form} role="alertdialog" aria-labelledby="google-new-title" aria-describedby="google-new-warn">
      <button type="button" className={entry.back} onClick={onBack}>
        ← 처음으로
      </button>
      <h2 id="google-new-title" className={styles.title}>
        이 구글 계정에 연결된 계정이 없어요
      </h2>
      <div id="google-new-warn" className={styles.warn}>
        <strong>이미 코드로 만든 계정이 있나요?</strong>
        <p>여기서 새로 만들면 기존 계정과 합쳐지지 않아요.</p>
        <p>
          기존 계정이 있다면 [코드로 시작]으로 들어간 뒤, 오른쪽 위 포인트 단추(내 정보)에서 구글을 연결해 주세요.
        </p>
      </div>
      <div className={styles.choices}>
        <button type="button" className={cx(ui.button, styles.choice)} onClick={onCode} autoFocus>
          기존 계정이 있어요 — 코드로 들어가기
          <span className={entry.bigSub}>들어간 뒤 내 정보에서 구글을 연결해요</span>
        </button>
        <button type="button" className={cx(ui.button, ui.primary, styles.choice)} onClick={onCreate}>
          처음이에요 — 새로 만들기
          <span className={entry.bigSub}>이름과 모습을 정하면 이 구글 계정이 연결돼요</span>
        </button>
      </div>
    </div>
  );
}

/** 구글로 새로 만든 결과: 연결됨 + (새로 만든) 개인 코드를 한 번 보여 주고 적어 두게 한다 */
export type GoogleDone = { code: string | null; error: string | null };

export function GoogleDoneStep({ done, onEnter }: { done: GoogleDone; onEnter: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("복사했어요. 안전한 곳에 적어 두세요.");
    } catch {
      setMessage("복사가 안 되면 직접 적어 두세요.");
    }
  }

  return (
    <div className={entry.form}>
      <h2 className={styles.title}>{done.error ? "구글 연결은 하지 못했어요" : "구글 계정을 연결했어요"}</h2>
      {done.error && (
        <p className={ui.error} role="alert">
          {done.error} 들어간 뒤 내 정보에서 다시 연결할 수 있어요.
        </p>
      )}
      {done.code && (
        <div className={styles.warn} role="note">
          <strong>개인 코드를 꼭 적어 두세요</strong>
          <p>구글 계정에 문제가 생기거나 연결을 끊어도 이 코드로 들어올 수 있어요. 비밀번호처럼 다뤄 주세요.</p>
          <output className={styles.code} aria-label="개인 코드">
            {done.code}
          </output>
          <div className={styles.row}>
            <button type="button" className={ui.button} onClick={() => copy(done.code!)}>
              복사
            </button>
          </div>
          <p className={ui.hint}>{message ?? "이 기기에서는 내 정보 → 개인 코드에서 다시 볼 수 있어요."}</p>
        </div>
      )}
      <button type="button" className={cx(ui.button, ui.primary, entry.enter)} onClick={onEnter} autoFocus={!done.code}>
        {done.code ? "적어 뒀어요 — 입장하기" : "입장하기"}
      </button>
    </div>
  );
}
