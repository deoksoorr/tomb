"use client";

import { useShakeEnabled } from "@/lib/shakePref";
import s from "./rpg.module.css";

/** 사냥터·미니게임 화면 흔들림 켜기·끄기 (사냥터 고르는 화면). 이 기기에만 기억한다 */
export default function ShakeToggle() {
  const [on, set] = useShakeEnabled();
  return (
    <label className={s.shakeToggle}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      화면 흔들림 효과
    </label>
  );
}
