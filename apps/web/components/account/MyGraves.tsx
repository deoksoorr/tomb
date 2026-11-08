"use client";

import type { PublicGrave } from "@/lib/types";
import StyleArt from "../grave/StyleArt";
import ui from "../ui/ui.module.css";
import { myGraveEntries } from "./items";
import styles from "./MyGraves.module.css";

type Props = {
  /** 내 계정이 세운 묘비 id (me.graves) */
  ids: readonly string[];
  graves: readonly PublicGrave[];
  /** 그 묘비 앞으로 순간이동 */
  onGo: (graveId: string) => void;
  onBury: () => void;
};

/** 내 묘비 목록 (최근 순, 자리·헌화·살려주세요). HUD의 [내 묘비]와 내 정보가 같이 쓴다 */
export default function MyGraves({ ids, graves, onGo, onBury }: Props) {
  const entries = myGraveEntries(ids, graves);

  if (entries.length === 0) {
    return ids.length > 0 ? (
      <p className={styles.empty} role="status">
        묘비를 찾는 중…
      </p>
    ) : (
      <div className={styles.empty}>
        <p>아직 세운 묘비가 없어요.</p>
        <button type="button" className={ui.button} onClick={onBury}>
          묘비 세우기
        </button>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {entries.map(({ grave, plot }) => (
        <li key={grave.id}>
          <button
            type="button"
            className={styles.item}
            onClick={() => onGo(grave.id)}
            aria-label={`${grave.name} 앞으로 가기, ${plot}`}
          >
            <StyleArt style={grave.style} ageDays={grave.ageDays} scale={1.5} />
            <span className={styles.main}>
              <span className={styles.name}>{grave.name}</span>
              <span className={styles.meta}>{plot}</span>
            </span>
            <span className={styles.counts} aria-label={`헌화 ${grave.flowers}, 살려주세요 ${grave.revives}`}>
              🌼 {grave.flowers} · 🙏 {grave.revives}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
