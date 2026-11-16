"use client";

import { useEffect, useState } from "react";
import { request } from "./api";
import { deviceHeaders } from "./deviceMark";
import { normalizeRefCode, type RefCheckResponse, type ReferralView } from "./referralRules";
import { readItem, removeItem, writeItem } from "./storage";

// 추천 코드 화면 쪽: API 호출, 공유 링크(?ref=)로 받은 코드 기억하기, 입력 중 미리 확인

export const referralApi = {
  view: () => request<ReferralView>("/api/referral", { cache: "no-store" }),
  check: (code: string, init?: RequestInit) =>
    request<RefCheckResponse>(`/api/referral/check?code=${encodeURIComponent(code)}`, { cache: "no-store", ...init }),
  enter: async (code: string, via: "signup" | "later") =>
    request<ReferralView>("/api/referral", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await deviceHeaders()) },
      body: JSON.stringify({ code, via }),
    }),
};

/** 받은 추천 코드 (입력한 글자 그대로 + 기억한 시각). 새로 시작 단계를 오가도, 나중에 내 정보에서도 채워 준다 */
const REF_KEY = "tomb.ref";
const REF_KEEP_MS = 7 * 86_400_000;

/** 주소에 ?ref=가 있으면 기억해 둔다 (형식이 맞는 코드만) */
export function captureRefParam(): void {
  try {
    const code = normalizeRefCode(new URLSearchParams(window.location.search).get("ref"));
    if (code) saveStoredRef(code);
  } catch {
    // 주소를 못 읽으면 넘어간다
  }
}

export function readStoredRef(): string {
  try {
    const v: unknown = JSON.parse(readItem(REF_KEY) ?? "null");
    if (!v || typeof v !== "object") return "";
    const { text, at } = v as Record<string, unknown>;
    return typeof text === "string" && typeof at === "number" && Date.now() - at < REF_KEEP_MS ? text : "";
  } catch {
    return "";
  }
}

export function saveStoredRef(text: string): void {
  if (text.trim()) writeItem(REF_KEY, JSON.stringify({ text: text.slice(0, 20), at: Date.now() }));
  else removeItem(REF_KEY);
}

export const clearStoredRef = () => removeItem(REF_KEY);

const CHECK_DEBOUNCE_MS = 400;

/**
 * 입력 중 추천 코드 미리 확인 (디바운스·이전 요청 취소). 형식이 맞는 코드만 서버에 묻는다.
 * 결과: null = 아직 모름(비었거나 묻는 중), 그 밖은 서버 판정. 형식이 틀리면 묻지 않고 바로 이유를 준다
 */
export function useRefCheck(text: string): RefCheckResponse | null {
  const code = normalizeRefCode(text);
  const [result, setResult] = useState<{ code: string; r: RefCheckResponse } | null>(null);
  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      referralApi
        .check(code, { signal: ctrl.signal })
        .then((r) => setResult({ code, r }))
        .catch(() => {
          // 미리 확인 실패는 조용히 (정할 때 서버가 다시 본다)
        });
    }, CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [code]);
  if (!text.trim()) return null;
  // 6자를 다 치기 전에는 기다린다
  if (!code) return text.replace(/[\s-]/g, "").length >= 6 ? { ok: false, reason: "코드는 영문과 숫자 6자예요." } : null;
  return result?.code === code ? result.r : null;
}
