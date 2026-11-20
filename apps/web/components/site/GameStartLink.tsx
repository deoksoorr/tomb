"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";

// 11/20 개발자 노트의 「게임 시작」: 게임(또는 첫 화면)에서 연 탭이면 이 탭을 닫고 원래 게임 탭으로 돌아간다.
// 그냥 "/"로 넘어가면 휴대폰에서 이 탭에 게임이 하나 더 열려 같은 계정이 두 번 들어가게 된다.
// 닫기가 막힌 브라우저(직접 주소로 온 탭 등)에서는 원래처럼 "/"로 간다.

/** 이 탭을 연 게임 탭 (같은 사이트일 때만). 없거나 닫혔으면 null */
function gameOpener(): Window | null {
  try {
    const o = window.opener as Window | null;
    if (!o || o.closed) return null;
    return o.location.origin === window.location.origin ? o : null;
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};

export default function GameStartLink({ className, children, backLabel }: { className?: string; children: ReactNode; backLabel: ReactNode }) {
  // 첫 그림은 서버와 같게 「게임 시작」, 그린 뒤에 게임 탭에서 열렸는지 본다
  const fromGame = useSyncExternalStore(noSubscribe, () => gameOpener() !== null, () => false);

  return (
    <Link
      className={className}
      href="/"
      prefetch={false}
      onClick={(e) => {
        const o = gameOpener();
        if (!o) return;
        e.preventDefault();
        o.focus();
        window.close();
        // 닫히지 않으면 (브라우저가 막음) 원래대로 이 탭에서 게임으로
        setTimeout(() => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 게임 화면은 새로 불러와야 한다
          if (!window.closed) window.location.href = "/";
        }, 300);
      }}
    >
      {fromGame ? backLabel : children}
    </Link>
  );
}
