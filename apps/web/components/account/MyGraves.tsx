"use client";

import StyleArt from "../grave/StyleArt";
import ui from "../ui/ui.module.css";
import type { MyGraveEntry } from "./items";
import styles from "./MyGraves.module.css";

type Props = {
  entries: MyGraveEntry[];
  /** 아직 찾는 중인 묘비 수 */
  pending: number;
  /** 그 묘비 앞으로 (다른 채널이면 채널을 옮긴 뒤) */
  onGo: (entry: MyGraveEntry) => void;
  onBury: () => void;
};

/** 내 묘비 목록 (최근 순, 자리 또는 채널·헌화·살려주세요). HUD의 [내 묘비]와 가방(묘비에 놓기)이 같이 쓴다 */
export default function MyGraves({ entries, pending, onGo, onBury }: Props) {
  if (entries.length === 0) {
    return pending > 0 ? (
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
      {entries.map((entry) => {
        const { grave, plot, here } = entry;
        const where = here ? plot : `${grave.channel}채널`;
        return (
          <li key={grave.id}>
            <button
              type="button"
              className={styles.item}
              onClick={() => onGo(entry)}
              aria-label={`${grave.name} 앞으로 가기, ${where}`}
            >
              <StyleArt style={grave.style} ageDays={grave.ageDays} scale={1} />
              <span className={styles.main}>
                <span className={styles.name}>{grave.name}</span>
                <span className={styles.meta} data-elsewhere={!here}>
                  {where}
                  {!here && " · 누르면 채널을 옮겨요"}
                </span>
              </span>
              <span className={styles.counts} aria-label={`헌화 ${grave.flowers}, 살려주세요 ${grave.revives}`}>
                🌼 {grave.flowers} · 🙏 {grave.revives}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
