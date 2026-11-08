"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";

export type Toast = { id: number; message: string };

const TOAST_MS = 3_500;
const MAX_TOASTS = 3;

type Push = (message: string, ms: number) => void;
const pushers = new Set<Push>();

/** UI 쪽 알림. 게임이 보내는 toast 이벤트와 같은 자리에 뜬다 */
export function showToast(message: string, ms = TOAST_MS): void {
  pushers.forEach((push) => push(message, ms));
}

export function useToasts(): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let nextId = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const push: Push = (message, ms) => {
      const id = ++nextId;
      setToasts((prev) => [...prev.filter((t) => t.message !== message), { id, message }].slice(-MAX_TOASTS));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ms);
      timers.add(timer);
    };
    pushers.add(push);
    const off = bridge.on("toast", ({ message }) => push(message, TOAST_MS));
    return () => {
      pushers.delete(push);
      off();
      timers.forEach(clearTimeout);
    };
  }, []);
  return toasts;
}
