"use client";

import { useId, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { CODE_RE, normalizeCode } from "@/lib/economy";
import { meStore } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./CodeStart.module.css";

type Props = { onLogin: (me: Me) => void; onBack: () => void };

/** 코드로 시작: 다른 기기에서 만든 개인 코드로 그 계정에 들어온다 (닉네임은 계정에 저장된 그대로) */
export default function CodeStart({ onLogin, onBack }: Props) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      onLogin(me);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form className={styles.box} onSubmit={login} noValidate>
      <button type="button" className={styles.back} onClick={onBack}>
        ← 처음으로
      </button>
      <label htmlFor={id} className={ui.label}>
        개인 코드
      </label>
      <input
        id={id}
        className={cx(ui.input, styles.input)}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="XXXX-XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="go"
        aria-invalid={error !== null}
        aria-describedby={`${id}-msg`}
        autoFocus
      />
      <p id={`${id}-msg`} className={error ? ui.error : ui.hint}>
        {error ?? "내 정보 → 개인 코드에서 만든 코드예요. 포인트·가방·내 묘비가 그대로 따라와요."}
      </p>
      <button type="submit" className={cx(ui.button, ui.primary, styles.submit)} disabled={pending || !code.trim()}>
        {pending ? "확인 중…" : "코드 확인"}
      </button>
    </form>
  );
}
