"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import PixelIcon from "../ui/PixelIcon";
import styles from "./FriendNotice.module.css";

// 친구 안내 띠: 화면 정중앙에 큼직하게 (접속·퇴장 알림, 친구 옆으로 이동 중·완료, 못 가는 이유 …).
// 한 번에 하나씩 NOTICE_MS 동안 보이고, 여러 개면 차례로. 일반 토스트(아래 가운데)와는 따로다.
// 게임(월드 씬)은 bridge "friend:notice"로 같은 띠를 띄운다. 집·사냥터 안에서도 보이게 월드 HUD 밖에 그린다.

export const NOTICE_MS = 2_500;
/** 쌓아 둘 최대 개수 (넘치면 오래된 것부터 버린다) */
const QUEUE_MAX = 6;

const queue: string[] = [];
const listeners = new Set<() => void>();

/** 친구 안내 띠 띄우기 (같은 문구가 이미 줄에 있으면 다시 넣지 않는다) */
export function showFriendNotice(message: string): void {
  if (!message || queue.includes(message)) return;
  queue.push(message);
  if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX);
  listeners.forEach((fn) => fn());
}

export default function FriendNotice() {
  const [current, setCurrent] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    let id = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const next = () => {
      if (timer) return;
      const text = queue.shift();
      if (!text) return setCurrent(null);
      setCurrent({ id: ++id, text });
      timer = setTimeout(() => {
        timer = null;
        next();
      }, NOTICE_MS);
    };
    listeners.add(next);
    const off = bridge.on("friend:notice", ({ message }) => showFriendNotice(message));
    next();
    return () => {
      listeners.delete(next);
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!current) return null;
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div key={current.id} className={styles.band}>
        <span className={styles.heart} aria-hidden="true">
          <PixelIcon name="heart" size={21} />
        </span>
        <span className={styles.text}>{current.text}</span>
      </div>
    </div>
  );
}
