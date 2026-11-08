"use client";

import {
  COSMETIC_DURATION_MS,
  DECOR_DURATION_MS,
  DEFAULT_CHANNEL_CAPACITY,
  DEFAULT_MAX_CHANNELS,
  GRAVE_STYLES,
  ITEMS,
  MAX_DECOR_PER_GRAVE,
} from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, EARN_RULES } from "@/lib/economy";
import { PRESENCE_INTERVAL_MS, SHRINE_KEEP_DAYS } from "@/lib/types";
import { durationLabel, effectLabel, KIND_LABELS } from "../account/items";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import { InquiryButton } from "../notice/InquiryDialog";
import styles from "./GuideDialog.module.css";

const CONTROLS: [string, string, string][] = [
  ["걷기", "WASD · 방향키", "왼쪽 아래 조이스틱"],
  ["달리기", "Shift 누른 채 걷기", "달리기 버튼"],
  ["점프 (묘비를 넘어가요)", "Space", "점프 버튼"],
  ["앉기·일어서기", "X 또는 C (벤치·의자 근처면 그 자리에)", "앉기 버튼 (근처에 자리가 있으면 빛나요)"],
  ["묘비 보기·말 걸기", "E", "상호작용 버튼"],
  ["나무에 매달리기·그네·종 치기·잠수", "가까이 가서 E (화면 안내를 따라)", "상호작용 버튼"],
  ["수영·잠수", "물에 들어가면 헤엄쳐요 (잠수도 돼요)", "조이스틱으로 물에"],
  ["감정 표현", "1 손 흔들기 · 2 환호", "메뉴 → 감정 표현"],
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
            <li>
              묘지에 머무르기만 해도 {PRESENCE_INTERVAL_MS / 60_000}분마다 포인트가 쌓여요(다른 창을 보고 있어도 괜찮아요).
            </li>
            <li>랭킹의 &quot;포인트&quot; 탭은 지금까지 모은 포인트(써도 줄지 않아요) 순이에요.</li>
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
                    <span className={styles.itemName}>
                      <ItemIcon itemId={item.id} size={32} />
                      <span>
                        {item.name}
                        <span className={styles.note}>{KIND_LABELS[item.kind]}</span>
                      </span>
                    </span>
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
            <li>묘비 디자인권은 그 디자인으로 묘비를 세우거나 바꾸는 순간 사라져요.</li>
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
            <li>다 둘러봤으면 내 정보 → 접속 종료로 자리를 비워 주세요. 기다리던 다음 사람이 바로 들어와요.</li>
          </ul>
        </section>

        <section>
          <h3>묘비 디자인</h3>
          <ul className={styles.points}>
            <li>
              묘비를 세울 때 디자인을 골라요. 무료:{" "}
              {GRAVE_STYLES.filter((s) => s.free)
                .map((s) => s.name)
                .join(" · ")}
              .
            </li>
            <li>
              나머지는 상점의 디자인권이 있어야 해요(
              {ITEMS.filter((i) => i.kind === "graveStyle")
                .map((i) => `${i.name} ${i.price}P`)
                .join(" · ")}
              ). 묘비를 세우거나 내 묘비의 디자인을 바꿀 때 1개 써요.
            </li>
            <li>세운 뒤에도 내 묘비 상세의 &quot;디자인 바꾸기&quot;로 바꿀 수 있어요.</li>
          </ul>
        </section>

        <section>
          <h3>내 묘비로 가기</h3>
          <p>
            [내 묘비] 버튼(데스크톱은 왼쪽 아래, 터치 화면은 오른쪽 위 메뉴 안)을 누르면 내가 세운 묘비 목록(자리·헌화·살려주세요 수)이 나오고, 고르면 그
            앞으로 바로 가요. 하나뿐이면 누르자마자 가요. 지도에도 내 묘비가 표시돼요.
          </p>
        </section>
        <section>
          <h3>묘지 안의 장소</h3>
          <ul className={styles.points}>
            <li>사냥터: 혼자 또는 함께 싸우고 미니게임을 하며 포인트를 모아요.</li>
            <li>분양 사무소: 나만의 집을 꾸미고 다른 사람의 집에 좋아요를 눌러요.</li>
            <li>
              성황당: 이장한 내 묘비가 {SHRINE_KEEP_DAYS}일 동안 머무는 곳이에요. 그 안에 다시 모실 수 있어요(내 정보에서도
              열 수 있어요).
            </li>
            <li>자세한 건 각 장소에서 안내해요.</li>
          </ul>
        </section>

        <section className={styles.inquiry}>
          <h3>문의</h3>
          <p>버그·제안·계정 문제는 여기로 알려 주세요.</p>
          <InquiryButton />
        </section>
      </div>
    </Dialog>
  );
}
