import { REF_DAY_MIN, REF_GRAND_MONTH_CAP, REF_MONTH_CAP, REF_NEED_DAYS, REF_LANTERN_ONCE, refGrandText, refRewardText } from "@/lib/referralRules";
import { stayText } from "@/lib/stayTime";
import ui from "../ui/ui.module.css";
import styles from "./MyPanel.module.css";

/**
 * 11/16 내 정보 포인트 칸 아래 「추천으로 받는 선물」 표: 누가 자리 잡으면 누가 무엇을 받는지 (11/19 포인트 대신 아이템 — lib/referralRules 그대로).
 * 두 단계까지만 (친구의 친구까지). 칭호·같은 기기 확인은 아래 추천 코드 칸에서 설명한다
 */
export default function ReferralRewardTable() {
  return (
    <section className={styles.section} aria-label="추천으로 받는 선물">
      <h3 className={styles.heading}>추천으로 받는 선물</h3>
      <table className={styles.refTable}>
        <thead>
          <tr>
            <th scope="col">누가 자리 잡으면</th>
            <th scope="col">받는 선물</th>
            <th scope="col">한 달에</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>내 코드로 온 친구</td>
            <td>나와 친구 모두 {refRewardText()}</td>
            <td>{REF_MONTH_CAP}명까지</td>
          </tr>
          <tr>
            <td>그 친구가 데려온 이웃</td>
            <td>나 {refGrandText()}</td>
            <td>{REF_GRAND_MONTH_CAP}번까지</td>
          </tr>
        </tbody>
      </table>
      <p className={ui.hint}>
        「자리 잡기」는 새로 온 사람이 하루 {stayText(REF_DAY_MIN)} 넘게 머문 날이 {REF_NEED_DAYS}일이 된 거예요. 이어진 날이 아니어도 돼요. 확인을 마치면 꾸미기와 폭죽은 선물함으로, 물약과 서류는 사냥 가방으로 보내 드려요. {REF_LANTERN_ONCE} 그 아래 단계는 받지 않아요.
      </p>
    </section>
  );
}
