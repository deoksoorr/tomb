"use client";

import { useState } from "react";
import { CHAMP_AURA_OFF, champBadgeText, isChampBits } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { applyStyle } from "./actions";
import styles from "./BagDialog.module.css";

/**
 * 코디 창의 "전용 오라 보이기"(1위 오라) (기본 켜짐). 지금 주간 랭킹 1위(지난주 1위 자격)인 사람에게만 보인다 — 자격이 끝나면 줄이 사라지고,
 * 설정은 남아 다음에 1위가 되면 그대로 쓴다. 끄면 배지는 그대로, 발밑·몸 뒤 1위 오라만 내 화면·다른 사람 화면에서 숨는다
 */
export default function ChampAuraToggle() {
  const { me } = useMe();
  const [pending, setPending] = useState(false);
  const bits = me?.champ;
  // 31번 운영자는 1위가 아니어도 "운영자 오라 보이기" (같은 끔 설정 — 운영자 오라가 1위 오라보다 우선)
  const staff = me?.staff === true;
  if (!isChampBits(bits) && !staff) return null;
  const on = !((bits ?? 0) & CHAMP_AURA_OFF);
  const what = staff ? "운영자 오라" : "전용 오라";
  const toggle = async () => {
    setPending(true);
    try {
      applyStyle(await api.champAura(!on));
      showToast(on ? `${what}를 숨겼어요.${isChampBits(bits) ? " 배지는 그대로 보여요." : ""}` : `${what}를 다시 켰어요.`);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <label className={styles.champAura}>
      <input type="checkbox" checked={on} disabled={pending} onChange={() => void toggle()} />
      <span>
        {what} 보이기 <span className={styles.champAuraNote}>({staff ? "운영자" : champBadgeText(bits)} · 다른 사람 화면에도)</span>
      </span>
    </label>
  );
}
