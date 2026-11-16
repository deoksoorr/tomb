"use client";

import { useId, useState } from "react";
import { captureRefParam, readStoredRef, saveStoredRef, useRefCheck } from "@/lib/referralClient";
import ui from "../ui/ui.module.css";

/**
 * 새로 시작 ① 이름 단계의 추천인 코드 (선택). 공유 링크(?ref=)로 왔으면 미리 채운다.
 * 입력한 값은 이 기기에 기억해 두고, 채널 단계에서 계정을 만든 뒤 서버에 보낸다 (EntryScreen ChannelStep)
 */
export default function ReferralField() {
  const [text, setText] = useState(() => {
    captureRefParam();
    return readStoredRef();
  });
  const id = useId();
  const check = useRefCheck(text);
  const message = check === null ? null : check.ok ? (check.name ? `${check.name}님의 코드예요.` : "쓸 수 있는 코드예요.") : check.reason;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        추천인 코드 (선택)
      </label>
      <input
        id={id}
        className={ui.input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          saveStoredRef(e.target.value);
        }}
        placeholder="친구에게 받은 코드"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        aria-invalid={check?.ok === false}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={check?.ok === false ? ui.error : ui.hint} role="status">
        {message ?? "없으면 비워 두세요. 나중에 내 정보에서 3일 안에 넣을 수도 있어요."}
      </p>
    </div>
  );
}
