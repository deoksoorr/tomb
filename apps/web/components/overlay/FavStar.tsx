"use client";

import { showToast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import styles from "./FavStar.module.css";
import { FAV_MAX, toggleFavStored, useFavs, type FavKey } from "./sayFavorites";

/** 표현 창의 즐겨찾기 별 (Y 키 원형 목록에 들어간다). 최대 FAV_MAX개 */
export default function FavStar({ favKey, label, className }: { favKey: FavKey; label: string; className?: string }) {
  const on = useFavs().includes(favKey);
  return (
    <button
      type="button"
      className={cx(styles.star, on && styles.on, className)}
      aria-pressed={on}
      aria-label={`${label} 즐겨찾기 ${on ? "빼기" : "넣기"}`}
      title={on ? "즐겨찾기에서 빼기" : "즐겨찾기에 넣기 (Y 키로 펼쳐요)"}
      onClick={() => {
        if (!toggleFavStored(favKey)) showToast(`즐겨찾기는 ${FAV_MAX}개까지예요. 다른 별을 먼저 빼 주세요.`);
      }}
    >
      <span className={styles.shape} aria-hidden="true" />
    </button>
  );
}
