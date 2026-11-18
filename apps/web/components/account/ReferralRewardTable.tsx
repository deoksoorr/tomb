import { REF_DAY_MIN, REF_GRAND_MONTH_CAP, REF_GRAND_POINTS, REF_MONTH_CAP, REF_NEED_DAYS, REF_REWARD_POINTS } from "@/lib/referralRules";
import { stayText } from "@/lib/stayTime";
import ui from "../ui/ui.module.css";
import styles from "./MyPanel.module.css";

/**
 * 11/16 내 정보 포인트 칸 아래 「추천으로 받는 포인트」 표: 누가 자리 잡으면 누가 얼마를 받는지 (숫자는 lib/referralRules 그대로).
 * 두 단계까지만 (친구의 친구까지). 칭호·같은 기기 확인은 아래 추천 코드 칸에서 설명한다
 */
export default function ReferralRewardTable() {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  return (
    <section className={styles.section} aria-label="추천으로 받는 포인트">
      <h3 className={styles.heading}>추천으로 받는 포인트</h3>
      <table className={styles.refTable}>
        <thead>
          <tr>
            <th scope="col">누가 자리 잡으면</th>
            <th scope="col">받는 포인트</th>
            <th scope="col">한 달에</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>내 코드로 온 친구</td>
            <td>나 {fmt(REF_REWARD_POINTS)}P, 친구도 {fmt(REF_REWARD_POINTS)}P</td>
            <td>{REF_MONTH_CAP}명까지</td>
          </tr>
          <tr>
            <td>그 친구가 데려온 이웃</td>
            <td>나 {fmt(REF_GRAND_POINTS)}P</td>
            <td>{REF_GRAND_MONTH_CAP}번까지</td>
          </tr>
        </tbody>
      </table>
      <p className={ui.hint}>
        「자리 잡기」는 새로 온 사람이 하루 {stayText(REF_DAY_MIN)} 넘게 머문 날이 {REF_NEED_DAYS}일이 된 거예요. 이어진 날이 아니어도 돼요. 확인을 마치면 선물함으로 보내 드려요. 그 아래 단계는 받지 않아요.
      </p>
    </section>
  );
}
