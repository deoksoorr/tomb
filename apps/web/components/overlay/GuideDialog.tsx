"use client";

import {
  COSMETIC_DURATION_MS,
  DECOR_DURATION_MS,
  DEFAULT_CHANNEL_CAPACITY,
  DEFAULT_MAX_CHANNELS,
  ITEMS,
  MAX_DECOR_PER_GRAVE,
} from "@tomb/protocol";
import { THEMES } from "@/game/bridge";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, EARN_RULES } from "@/lib/economy";
import { durationLabel, effectLabel, KIND_LABELS } from "../account/items";
import Dialog from "../ui/Dialog";
import styles from "./GuideDialog.module.css";

const CONTROLS: [string, string, string][] = [
  ["걷기", "WASD · 방향키", "왼쪽 아래 조이스틱"],
  ["달리기", "Shift 누른 채 걷기", "달리기 버튼"],
  ["앉기·일어서기", "X 또는 C", "앉기 버튼"],
  ["묘비 보기·말 걸기", "E 또는 Space", "상호작용 버튼"],
  ["확대·축소", "마우스 휠 · ＋/－", "＋/－ 버튼"],
  ["둘러보기", "오른쪽 버튼으로 끌기", "—"],
  ["시점 되돌리기", "내 캐릭터로 버튼", "내 캐릭터로 버튼"],
];

/** 숫자는 전부 정책·카탈로그에서 읽는다 (정책을 바꾸면 가이드도 바뀐다) */
export default function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="한때는... 안내" onClose={onClose} size="lg">
      <div className={styles.guide}>
        <section>
          <h3>조작</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">하는 일</th>
                <th scope="col">키보드·마우스</th>
                <th scope="col">터치</th>
              </tr>
            </thead>
            <tbody>
              {CONTROLS.map(([what, keys, touch]) => (
                <tr key={what}>
                  <th scope="row">{what}</th>
                  <td>{keys}</td>
                  <td>{touch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3>포인트</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">이렇게 하면</th>
                <th scope="col">포인트</th>
                <th scope="col">하루 최대</th>
              </tr>
            </thead>
            <tbody>
              {EARN_RULES.map((r) => (
                <tr key={r.source}>
                  <th scope="row">
                    {r.label}
                    <span className={styles.note}>{r.note}</span>
                  </th>
                  <td>+{r.points}</td>
                  <td>{r.dailyMax}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className={styles.points}>
            <li>하루에 모두 합쳐 {DAILY_EARN_CAP} 포인트까지 쌓여요. 날짜는 한국 시간 자정에 바뀌어요.</li>
            <li>지갑에는 {BALANCE_CAP.toLocaleString("ko-KR")} 포인트까지 담겨요.</li>
            <li>한도에 걸리면 알림 없이 조용히 쌓이지 않아요.</li>
            <li>한 곳(같은 IP)에서는 하루 {ATTEND_ACCOUNTS_PER_IP}개 계정까지만 출석 포인트를 받아요.</li>
          </ul>
        </section>

        <section>
          <h3>상점과 물건</h3>
          <p>묘지 안 상점의 주인장에게 말을 걸면(상호작용) 상점이 열려요.</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">물건</th>
                <th scope="col">가격</th>
                <th scope="col">효과</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.name}
                    <span className={styles.note}>{KIND_LABELS[item.kind]}</span>
                  </th>
                  <td>{item.price}</td>
                  <td>{effectLabel(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className={styles.points}>
            <li>모든 물건은 한 번 쓰면 사라져요.</li>
            <li>폭죽은 쏘는 순간 사라지고, 같은 채널 모두가 함께 봐요.</li>
            <li>
              캐릭터 꾸미기는 착용하는 순간 사라지고 {durationLabel(COSMETIC_DURATION_MS)} 동안 보여요. 같은 부위는 마지막에
              착용한 것으로 바뀌어요.
            </li>
            <li>
              묘비 꾸미기는 내 묘비에 놓는 순간 사라지고 {durationLabel(DECOR_DURATION_MS)} 동안 남아요. 묘비 하나에{" "}
              {MAX_DECOR_PER_GRAVE}개까지 놓을 수 있어요.
            </li>
          </ul>
        </section>

        <section>
          <h3>개인 코드</h3>
          <ul className={styles.points}>
            <li>내 정보 → 개인 코드에서 만들어요. 만들 때 한 번만 보여 주니 바로 적어 두세요.</li>
            <li>다른 기기의 입장 화면에서 &quot;개인 코드로 들어가기&quot;에 넣으면 포인트·가방·내 묘비가 그대로 따라와요.</li>
            <li>이 코드를 아는 사람은 누구나 내 계정에 들어올 수 있어요. 새어 나갔다면 다시 만드세요. 예전 코드는 바로 막혀요.</li>
          </ul>
        </section>

        <section>
          <h3>채널과 대기열</h3>
          <ul className={styles.points}>
            <li>
              채널마다 정원이 있어요(기본 {DEFAULT_CHANNEL_CAPACITY}명, 최대 {DEFAULT_MAX_CHANNELS}채널). 위쪽 채널 표시를
              누르면 다른 채널로 옮길 수 있어요.
            </li>
            <li>묘지 전체가 꽉 차면 대기열에 줄을 서요. 기다리는 동안에도 혼자 걷고 묘비를 볼 수 있고, 차례가 오면 자동으로 들어가요.</li>
          </ul>
        </section>

        <section>
          <h3>묘지 디자인</h3>
          <p>
            입장 화면이나 내 정보 → 묘지 디자인에서 고를 수 있어요 ({THEMES.map((t) => t.label).join(" · ")}). 내 화면에만
            적용돼요.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
