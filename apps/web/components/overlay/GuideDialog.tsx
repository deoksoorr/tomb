"use client";

import type { ReactNode } from "react";
import { CHAT_MAX, DEFAULT_CHANNEL_CAPACITY, NAME_MAX, NAME_MIN } from "@tomb/protocol";
import { DAY_RESET_TEXT } from "@/lib/gameDay";
import { EARN_RULES } from "@/lib/economy";
import { NAME_CHANGE_COOLDOWN_DAYS, NAME_CHANGE_PRICE } from "@/lib/types";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import Link from "next/link";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { InquiryButton } from "../notice/InquiryDialog";
import { OddsLink } from "../odds/OddsLayer";
import styles from "./GuideDialog.module.css";

// 11/24 ⓘ 안내 창은 처음 온 사람이 바로 필요한 것만 (조작·화면·포인트·막히기 쉬운 규칙·문의).
// 장소·탈것·사냥·낚시·꾸미기·집 같은 자세한 설명은 각 창과 게임 가이드(/guide)에 있다.

const won = (n: number) => n.toLocaleString("ko-KR");

/** 표 한 장: 첫 칸은 행 제목. 좁은 화면에서는 줄마다 카드처럼 쌓인다 (data-label이 칸 이름) */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([first, ...rest], i) => (
          <tr key={i}>
            <th scope="row">{first}</th>
            {rest.map((cell, j) => (
              <td key={j} data-label={head[j + 1]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 조작과 화면 위치 (자주 쓰는 것만) */
const CONTROLS: ReactNode[][] = [
  ["걷기", "WASD 또는 방향키", "화면 왼쪽을 누르고 끌기"],
  ["달리기", "Shift 누른 채 걷기", "달리기 버튼"],
  ["점프", "Space", "점프 버튼"],
  ["앉기·일어서기", "X 또는 C", "앉기 버튼"],
  ["말 걸기·타기·문 드나들기", "E", "상호작용 버튼"],
  ["메뉴", "왼쪽 아래 [메뉴]와 바로 가기 줄", "왼쪽 위 [메뉴]"],
  ["지도", "M 또는 오른쪽 위 [지도]", "오른쪽 위 [지도]"],
  ["채팅", "Enter로 열고 보내기, 채팅창은 왼쪽 아래", "[채팅] 버튼"],
  ["표현 (이모티콘·몸짓)", "T", "점프 왼쪽 [표현]"],
  ["가방", "I", "메뉴의 가방"],
  ["확대·축소", "마우스 휠 또는 ＋/－", "두 손가락 또는 ＋/－"],
  ["친구 신청·신고", "캐릭터를 누르고 [친구 신청]·[신고하기]", "캐릭터를 누르고 [친구 신청]·[신고하기]"],
];

/** 포인트를 버는 주된 방법 (economy EARN_RULES에서 이름만) */
const MAIN_EARN = ["presence", "stayBonus", "hunt", "fish", "todo", "firstSteps"] as const;
/** 하루 횟수 제한이 있는 것 (economy dailyMax) */
const CAPPED = EARN_RULES.filter((r) => r.dailyMax !== null && r.dailyMax > 0);

type Props = { onClose: () => void; onReplayTutorial: () => void };

export default function GuideDialog({ onClose, onReplayTutorial }: Props) {
  const touch = useMediaQuery("(pointer: coarse)");
  const earn = MAIN_EARN.map((s) => EARN_RULES.find((r) => r.source === s)).filter((r) => !!r);
  return (
    <Dialog title="At one time... 안내" onClose={onClose}>
      <div className={styles.guide}>
        {/* 11/18 무작위 보상 확률은 따로 한 창에 (사냥 드롭·상자·강화·낚시·소원 분수 등) */}
        <p className={styles.lead}>
          드롭, 상자, 강화처럼 무작위로 정해지는 것들의 확률은 <OddsLink section="top" label="확률 안내" before={onClose} />에서 볼 수 있어요.
        </p>
        <section>
          <h3>조작과 화면</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={CONTROLS} />
        </section>

        <section>
          <h3>포인트</h3>
          <Table head={["이렇게 하면", "내용"]} rows={earn.map((r) => [r.label, r.note])} />
          <ul className={styles.points}>
            <li>놀아서 버는 포인트는 하루 한도가 없어요.</li>
          </ul>
        </section>

        <section>
          <h3>알아 둘 규칙</h3>
          <Table
            head={["규칙", "내용"]}
            rows={[
              ...CAPPED.map((r) => [r.label, `${r.note}. 하루 최대 ${r.dailyMax}P예요.`]),
              ["하루 기준", `한국 시간 ${DAY_RESET_TEXT}에 하루 횟수가 다시 세져요.`],
              ["채팅", `${CHAT_MAX}자까지 써요. 욕설은 ***로 가려지고, 너무 빨리 치면 잠시 막혀요.`],
              ["닉네임", `${NAME_MIN}~${NAME_MAX}자이고, 다른 사람과 같은 이름은 쓸 수 없어요. 처음 바꿀 때는 무료, 그 뒤로는 ${won(NAME_CHANGE_PRICE)}P이고 ${NAME_CHANGE_COOLDOWN_DAYS}일에 한 번 바꿀 수 있어요.`],
              ["개인 코드", "내 정보의 개인 코드를 꼭 적어 두세요. 다른 기기에서는 입장 화면의 [코드로 시작]으로 들어와요. 코드가 새면 내 정보에서 [새 코드 발급]을 눌러요."],
              ["채널", `채널마다 ${DEFAULT_CHANNEL_CAPACITY}명까지예요. 꽉 차면 줄을 서고, 차례가 오면 저절로 들어가요.`],
              ["다 놀았으면", "내 정보의 [접속 종료]로 자리를 비워 주세요."],
            ]}
          />
        </section>

        <section>
          <h3>더 알아보기</h3>
          <ul className={styles.points}>
            <li>사냥 조작과 스킬은 사냥터의 [사냥 안내서]에 있어요.</li>
            <li>
              장소, 탈것, 낚시, 꾸미기, 집은{" "}
              <Link href="/guide" target="_blank">
                게임 가이드
              </Link>
              에서 자세히 볼 수 있어요.
            </li>
            <li>{touch ? "오른쪽 위 [지도]" : "M이나 오른쪽 위 [지도]"}로 지도를 펴면 장소마다 표시가 있어요.</li>
          </ul>
        </section>

        <section className={styles.inquiry}>
          <h3>처음 왔을 때 안내</h3>
          <p>처음 들어왔을 때 본 1분짜리 마을 안내를 다시 볼 수 있어요.</p>
          <button type="button" className={ui.button} onClick={onReplayTutorial}>
            첫 방문 안내 다시 보기
          </button>
        </section>

        <section className={styles.inquiry}>
          <h3>문의</h3>
          <p>버그나 제안, 계정 문제는 여기로 알려 주세요.</p>
          <InquiryButton />
          <p>
            <Link href="/privacy" target="_blank">
              개인정보처리방침
            </Link>
            {" · "}
            <Link href="/terms" target="_blank">
              이용약관
            </Link>
            {" · "}
            <Link href="/faq" target="_blank">
              자주 묻는 질문
            </Link>
          </p>
        </section>
      </div>
    </Dialog>
  );
}
