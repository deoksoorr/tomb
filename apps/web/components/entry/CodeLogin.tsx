"use client";

import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { CODE_RE, normalizeCode } from "@/lib/economy";
import { meStore } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./CodeLogin.module.css";

/** 다른 기기에서 만든 개인 코드로 같은 계정에 들어온다. 입장 폼 안에 있으므로 <form>을 쓰지 않는다 */
export default function CodeLogin({ onLogin }: { onLogin: (me: Me) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function login() {
    const normalized = normalizeCode(code);
    if (!CODE_RE.test(normalized)) {
      setError("코드는 XXXX-XXXX-XXXX 모양이에요.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      // 처음 오는 기기라도 세션 쿠키부터 받아 두고 계정을 바꾼다
      await api.startSession();
      const { me } = await api.loginWithCode(normalized);
      meStore.set(me);
      setOpen(false);
      setCode("");
      onLogin(me);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={styles.toggle} onClick={() => setOpen(true)} aria-expanded={false}>
        개인 코드로 들어가기
      </button>
    );
  }

  return (
    <div className={styles.box}>
      <label htmlFor={id} className={ui.label}>
        개인 코드
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={cx(ui.input, styles.input)}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void login();
          }}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={`${id}-msg`}
          autoFocus
        />
        <button type="button" className={ui.button} onClick={login} disabled={pending || !code.trim()}>
          {pending ? "확인 중…" : "들어가기"}
        </button>
      </div>
      <p id={`${id}-msg`} className={error ? ui.error : ui.hint}>
        {error ?? "내 정보에서 만든 코드를 넣으면 포인트·가방·내 묘비가 따라와요."}
      </p>
      <button type="button" className={styles.toggle} onClick={() => setOpen(false)}>
        닫기
      </button>
    </div>
  );
}
