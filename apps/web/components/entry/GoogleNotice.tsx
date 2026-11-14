"use client";

import { useEffect, useState } from "react";
import type { GoogleResult } from "@/lib/googleResult";
import styles from "./Google.module.css";

/** 구글에서 돌아온 결과 안내. login·new는 입구 화면이 단계로 이어 가므로 알림을 띄우지 않는다 */
const MESSAGES: Partial<Record<GoogleResult, { text: string; tone: "ok" | "warn" }>> = {
  linked: { text: "구글 계정을 연결했어요. 다음부터 입구의 [구글로 시작하기]로 바로 들어올 수 있어요.", tone: "ok" },
  same: { text: "이미 이 구글 계정이 연결돼 있어요.", tone: "ok" },
  taken: { text: "이 구글 계정은 이미 다른 계정에 연결돼 있어요. 그 계정에서 먼저 연결을 끊어 주세요.", tone: "warn" },
  other: { text: "이 계정에는 이미 다른 구글 계정이 연결돼 있어요. 먼저 연결을 끊어 주세요.", tone: "warn" },
  banned: { text: "이용이 제한된 계정이라 들어갈 수 없어요.", tone: "warn" },
  nosession: { text: "이 기기의 계정을 찾지 못했어요. 마을에 들어간 뒤 내 정보에서 다시 연결해 주세요.", tone: "warn" },
  cancel: { text: "구글 로그인을 취소했어요.", tone: "warn" },
  error: { text: "구글 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.", tone: "warn" },
};

export default function GoogleNotice({ result }: { result: GoogleResult }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // 주소의 ?google= 를 지운다 (새로고침·공유해도 다시 뜨지 않게)
    const url = new URL(window.location.href);
    if (!url.searchParams.has("google")) return;
    url.searchParams.delete("google");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  const msg = MESSAGES[result];
  if (!msg || !open) return null;
  return (
    <div className={styles.notice} data-tone={msg.tone} role="status">
      <p>{msg.text}</p>
      <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="알림 닫기">
        ×
      </button>
    </div>
  );
}
