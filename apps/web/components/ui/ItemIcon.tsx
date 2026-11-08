import { itemById } from "@tomb/protocol";
import { itemIcon, itemIconBase } from "@/game/sprites/itemIcons";
import styles from "./ItemIcon.module.css";

/**
 * 아이템 픽셀 아이콘 (가방·상점·가이드·폭죽 버튼 공용). 그림은 게임과 같은 itemIcon(canvas dataURL)이다.
 * scale은 예전 8칸 그림 기준 배율이라, 화면에 차지하는 크기(8 × scale px)를 그대로 지키고
 * 원본(16칸, 묘비 디자인권은 32칸)을 그 크기 이상으로 그린 뒤 픽셀이 번지지 않게 줄여 맞춘다.
 * 대화상자·HUD 안에서만 쓰여 서버에서 렌더링되지 않는다.
 */
export default function ItemIcon({ itemId, scale = 3 }: { itemId: string; scale?: number }) {
  const item = itemById(itemId);
  if (!item || typeof document === "undefined") return null;
  const box = 8 * scale;
  const k = Math.max(1, Math.ceil(box / itemIconBase(itemId)));
  return (
    // eslint-disable-next-line @next/next/no-img-element -- canvas로 만든 dataURL이라 next/image 최적화 대상이 아니다
    <img className={styles.icon} src={itemIcon(itemId, k)} width={box} height={box} alt={item.name} />
  );
}
