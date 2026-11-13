"use client";

import { useEffect, useState } from "react";
import { checkName } from "@tomb/protocol";
import { api } from "../api";

/** 입력이 멈춘 뒤 이만큼 기다렸다가 서버에 묻는다 */
const NAME_CHECK_DEBOUNCE_MS = 400;

/**
 * 닉네임 입력 중 중복을 가볍게 미리 본다 (서버 GET /api/names, 디바운스·이전 요청 취소).
 * 다른 계정이 쓰는 이름이면 서버 문구("이미 있는 이름이에요."), 아니면 null. 규칙에 안 맞는 이름·skip(지금 내 이름)은 묻지 않는다.
 * 확인이 실패하면 조용히 null — 실제 저장 때 서버가 다시 판정한다
 */
export function useNameTaken(name: string, skip?: string | null): string | null {
  const check = checkName(name);
  const target = check.ok && check.name !== skip ? check.name : null;
  const [result, setResult] = useState<{ name: string; reason: string | null } | null>(null);

  useEffect(() => {
    if (!target) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .checkName(target, { signal: ctrl.signal })
        .then((r) => setResult({ name: target, reason: r.ok ? null : r.reason }))
        .catch(() => {
          // 미리 확인 실패는 조용히 (저장할 때 다시 본다)
        });
    }, NAME_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [target]);

  return target && result?.name === target ? result.reason : null;
}
