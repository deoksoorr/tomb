import type { BanNotice } from "@/lib/ban";
import styles from "./BannedScreen.module.css";

const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** 47번 이용 제한 화면 (서버에서 그린다). 사유와 해제 예정일만 보여 주고 게임은 띄우지 않는다 */
export default function BannedScreen({ ban }: { ban: BanNotice }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="ban-title">
        <h1 id="ban-title" className={styles.title}>
          이용이 제한됐어요
        </h1>
        <dl className={styles.facts}>
          <dt>사유</dt>
          <dd>{ban.reason}</dd>
          <dt>제한 시작</dt>
          <dd>{KST.format(ban.startAt)}</dd>
          <dt>해제 예정일</dt>
          <dd>{ban.until === null ? "정해지지 않았어요 (영구)" : KST.format(ban.until)}</dd>
        </dl>
        <p className={styles.note}>
          {ban.ip ? "이 인터넷 연결(IP)에서는 다른 계정으로도 들어올 수 없어요. " : ""}
          {ban.until === null ? "" : "해제 예정일이 지나면 자동으로 다시 들어올 수 있어요. "}
          잘못된 제한이라고 생각되면 운영자에게 문의해 주세요.
        </p>
      </section>
    </main>
  );
}
