"use client";

import type { ReactNode } from "react";
import {
  COSMETIC_DURATION_MS,
  DECOR_DURATION_MS,
  DEFAULT_CHANNEL_CAPACITY,
  DEFAULT_MAX_CHANNELS,
  GRAVE_STYLES,
  GRAVEYARD_CAPACITY,
  isShopListed,
  ITEMS,
  MAX_DECOR_PER_GRAVE,
  MEGAPHONE_TTL_MS,
  PERMANENT_MULTIPLIER,
  permanentPrice,
  ZOO_PETS,
} from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, EARN_RULES } from "@/lib/economy";
import { DYE_TIME_MS } from "@/lib/dye/palette";
import { PLOT_TIERS, plotCost } from "@/lib/housing/catalog";
import { POTIONS } from "@/lib/rpg/catalog";
import { STAY_BONUS_DAILY_MAX } from "@/lib/stayBonus";
import { DEFAULT_PASS_DAYS, PRESENCE_INTERVAL_MS, SHRINE_KEEP_DAYS } from "@/lib/types";
import { durationLabel, effectLabel, KIND_LABELS } from "../account/items";
import Link from "next/link";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import ItemIcon from "../ui/ItemIcon";
import { InquiryButton } from "../notice/InquiryDialog";
import styles from "./GuideDialog.module.css";

const won = (n: number) => n.toLocaleString("ko-KR");
const petPrices = ZOO_PETS.map((p) => p.price);

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

const CONTROLS: ReactNode[][] = [
  ["걷기", "WASD · 방향키", "왼쪽 아래 조이스틱"],
  ["달리기", "Shift 누른 채 걷기", "달리기 버튼"],
  ["점프", "Space", "점프 버튼"],
  ["앉기·일어서기", "X 또는 C", "앉기 버튼"],
  ["말 걸기·타기·살펴보기", "E", "상호작용 버튼"],
  ["메뉴", "왼쪽 아래 [메뉴]", "왼쪽 위 [메뉴]"],
  ["가방·사냥·도감·집·소식", "왼쪽 아래 바로 가기 줄", "[메뉴] 안에"],
  ["표현 창 (말풍선·이모티콘)", "T", "점프 왼쪽 [표현]"],
  ["채팅 (60자, 말풍선 + 왼쪽 아래 채팅창, 같은 채널에 보이고 늦게 와도 최근 5분은 보임, 서버에 5분만 머물고 사라짐, 너무 빨리 치면 잠깐 막혀요, 다른 사람 글이 오면 작은 알림음 — 음악 창에서 끌 수 있어요)", "Enter → 쓰고 Enter (Esc 해제)", "[채팅] 버튼"],
  ["즐겨찾기 표현 (원형)", "Y → 누르거나 1~8", "[표현] 길게 누르기"],
  ["손 흔들기·환호", "1 · 2", "메뉴 → 감정 표현"],
  ["이모티콘 바로 보내기", "3~9", "[표현] 창에서"],
  ["벤치 상태", "앉아서 T", "앉아서 [표현]"],
  ["가방", "I", "메뉴 → 가방"],
  ["펫 타기·내리기", "R", "타기 버튼"],
  ["확대·축소", "마우스 휠 · ＋/－", "두 손가락 · ＋/－"],
  ["둘러보기", "오른쪽 버튼으로 끌기", "두 손가락으로 끌기"],
  ["시점 되돌리기", "[내 캐릭터로]", "[내 캐릭터로]"],
  ["확성기 기록", "왼쪽 위 (음악 아래)", "조이스틱 위"],
  ["친구 (최대 50명, 신청·위치·옆으로 가기·집 놀러 가기, 접속 알림은 친구 창에서 끄기)", "캐릭터 누르기 → [친구 신청] · 오른쪽 위 친구 버튼", "캐릭터 누르기 → [친구 신청] · 메뉴 → 친구"],
];

const PLACES: ReactNode[][] = [
  ["모닥불", "모닥불 광장", "곁에 앉아 불멍 · 같이 쉬기"],
  ["소원 분수", "광장 입구", "동전 던지기 (하루 3번)"],
  ["귀신의집", "광장 입구, 소원 분수 옆", "혼자 공포 미로 · 기록만 남아요"],
  ["유령 잡화점", "상점 주인장에게 E", "꾸미기·폭죽·확성기·염색권"],
  ["동물원", "서쪽 다리 건너 바로", `사육사에게 펫 분양 (${won(Math.min(...petPrices))}~${won(Math.max(...petPrices))}P)`],
  ["낚시터", "호수 북동쪽, 나루터 옆 데크", "낚시 의자 앞에서 E"],
  ["수집가", "숲 빈터", "약초·광석·발굴품·곤충 팔기"],
  ["사냥터", "메뉴 → 사냥터", "혼자·함께 사냥 · 미니게임"],
  ["분양 사무소", "메뉴 → 집·분양 마을", "내 집 분양·꾸미기·좋아요"],
  ["성황당", "옛 묘역 동문 옆", "묘역을 떠난 묘비 모시기"],
  ["황금 고블린", "가끔 마을 어딘가", "가장 먼저 잡으면 보너스"],
  ["마을 주민", "길·광장·벤치 곳곳", "다가가서 말 걸기 (E · 상호작용)"],
];

const RIDES: ReactNode[][] = [
  ["관람차", "맨 아래 칸에서 E (칸당 2명)", "한 바퀴(약 50초) 뒤 저절로"],
  ["열기구", "언덕 출발장에서 E (4명)", "마을 위를 돌아 약 2분"],
  ["도중에 내리기", "X 두 번 (E·Space도)", "앉기 버튼 두 번"],
  ["시점 바꾸기", "V · [시점 변경하기]", "[시점 변경하기]"],
  ["조각배", "나루터에서 E (2인승)", "물가 가까이에서 E로 내려요"],
  ["타는 펫", "R (데리고 있을 때)", "앉기·낚시·물에선 저절로 내려요"],
];

const HUNT_KEYS: ReactNode[][] = [
  ["공격", "Space · J", "공격 버튼"],
  ["스킬", "1~6", "스킬 버튼"],
  ["물약", "Q · E · R", "물약 버튼"],
];

const FORAGE: ReactNode[][] = [
  ["낚시", "의자 앞 E → 입질에 누르고 꾹 감기", "물고기가 당기면 잠깐 놓아요 · 아주 드물게 꾸미기가 걸려요"],
  ["자동 낚시", "낚시 중 [자동 낚시 켜기]", "다른 탭에 있어도 접속해 있는 동안 천천히 낚아요 · 하루 75마리 · 움직이면 꺼져요 · 최대어 순위엔 오르지 않아요(크기는 도감에 기록돼요)"],
  ["팔기", "물고기는 어부 영감, 채집물은 수집가", "희귀할수록 비싸요"],
  ["도감", "왼쪽 아래 [도감] · 메뉴 → 도감", "25·50·75·100% 보상"],
];

const DYE: ReactNode[][] = [
  ["판 옮기기", "WASD·방향키 · 끌기 (Shift 빠르게)", "끌기"],
  ["확대·축소", "휠 · ＋/－", "두 손가락"],
  ["색 고르기", "가운데 조준점 아래 색", "가운데 조준점 아래 색"],
  ["확정", "[이 색으로 염색] · 엔터", "[이 색으로 염색]"],
];

/** 숫자는 전부 정책·카탈로그에서 읽는다 (정책을 바꾸면 가이드도 바뀐다) */
type Props = { onClose: () => void; onReplayTutorial: () => void };

export default function GuideDialog({ onClose, onReplayTutorial }: Props) {
  const freeStyles = GRAVE_STYLES.filter((s) => s.free)
    .map((s) => s.name)
    .join(" · ");
  return (
    <Dialog title="한때는... 안내" onClose={onClose}>
      <div className={styles.guide}>
        <section>
          <h3>조작</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={CONTROLS} />
        </section>

        <section>
          <h3>마을 둘러보기</h3>
          <Table head={["곳", "어디", "하는 일"]} rows={PLACES} />
          <ul className={styles.points}>
            <li>귀신의집은 깜짝 놀라는 장면·큰 소리가 있어요. 포인트 보상은 없어요.</li>
            <li>지도에 장소마다 표시가 있어요. 자세한 건 각 장소에서 안내해요.</li>
          </ul>
        </section>

        <section>
          <h3>탈것</h3>
          <Table head={["탈것", "타기", "비고"]} rows={RIDES} />
          <ul className={styles.points}>
            <li>시점 변경: 옆에서 보는 장면 ↔ 마을 위를 떠다니는 보기 (마지막 선택을 기억해요).</li>
            <li>펫은 한 번에 한 마리만 데리고 다녀요. 타는 펫은 동물원에서 분양받아요.</li>
          </ul>
        </section>

        <section>
          <h3>포인트</h3>
          <Table
            head={["이렇게 하면", "포인트", "하루 최대"]}
            rows={EARN_RULES.map((r) => [
              <>
                {r.label}
                <span className={styles.note}>{r.note}</span>
              </>,
              r.points ? `+${r.points}` : "설명대로",
              r.dailyMax,
            ])}
          />
          <Table
            head={["규칙", "내용"]}
            rows={[
              ["하루 한도", `모두 합쳐 ${won(DAILY_EARN_CAP)}P · 한국 시간 자정에 새로`],
              ["접속 시간 보너스", `하루 한도와 별개 · 하루 최대 ${STAY_BONUS_DAILY_MAX}P`],
              ["머무르기", `${PRESENCE_INTERVAL_MS / 60_000}분마다 (다른 창을 봐도 OK)`],
              ["지갑", `${won(BALANCE_CAP)}P까지 담겨요`],
              ["출석", `같은 IP는 하루 ${ATTEND_ACCOUNTS_PER_IP}계정까지`],
              ["한도에 걸리면", "알림 없이 조용히 안 쌓여요"],
              ["랭킹", "포인트(이번 주·전체, 써도 안 줄어요)·사냥·사냥 레벨·꾸미기(지금 입은 코디 점수)·집·헌화"],
            ]}
          />
        </section>

        <section>
          <h3>사냥</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={HUNT_KEYS} />
          <p className={styles.lead}>몬스터 공격에 상태 이상(독·화상·출혈·둔화·빙결·혼란·침묵)이 걸릴 수 있어요. 물약으로 풀어요.</p>
          <Table head={["물약", "효과"]} rows={POTIONS.map((p) => [p.key ? `${p.name} (${p.key})` : p.name, p.desc])} />
        </section>

        <section>
          <h3>낚시·채집·도감</h3>
          <Table head={["하는 일", "방법", "비고"]} rows={FORAGE} />
        </section>

        <section>
          <h3>꾸미기와 물건</h3>
          <Table
            head={["종류", "얻는 곳", "쓰면"]}
            rows={[
              [KIND_LABELS.cosmetic, "유령 잡화점", `착용하면 ${durationLabel(COSMETIC_DURATION_MS)} · 영구 소장도 가능 (이용권 값의 ${PERMANENT_MULTIPLIER}배)`],
              ["펫", "동물원 사육사", "영구 · 한 마리씩 데리고 다녀요"],
              [KIND_LABELS.firework, "유령 잡화점", "쏘면 사라지고 채널 모두가 봐요"],
              [KIND_LABELS.megaphone, "유령 잡화점", `외치면 사라져요 · 기록은 ${durationLabel(MEGAPHONE_TTL_MS)} 뒤 사라져요`],
              [KIND_LABELS.dye, "잡화점 염색·외형 탭", "한 번 염색하면 사라져요"],
              [KIND_LABELS.graveStyle, "유령 잡화점", "세우거나 바꿀 때 1개"],
              [KIND_LABELS.decor, "가방 → 내 묘비에", `${durationLabel(DECOR_DURATION_MS)} 유지 · 묘비당 ${MAX_DECOR_PER_GRAVE}개`],
            ]}
          />
          <ul className={styles.points}>
            <li>캐릭터 꾸미기는 같은 부위면 마지막에 착용한 것으로 바뀌어요.</li>
          </ul>
          <details className={styles.more}>
            <summary>잡화점 물건 전체 보기</summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">물건</th>
                  <th scope="col">가격</th>
                  <th scope="col">효과</th>
                </tr>
              </thead>
              <tbody>
                {ITEMS.filter(isShopListed).map((item) => (
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
                    <td data-label="가격">
                      {won(item.price)}
                      {/* 꾸미기는 영구 소장 값도 (카탈로그에서 계산 — 배율이 바뀌면 같이 바뀐다) */}
                      {permanentPrice(item.id) !== null && <span className={styles.note}>영구 {won(permanentPrice(item.id)!)}</span>}
                    </td>
                    <td data-label="효과">{effectLabel(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section>
          <h3>염색</h3>
          <Table head={["하는 일", "컴퓨터", "휴대폰"]} rows={DYE} />
          <Table
            head={["알아 둘 것", "내용"]}
            rows={[
              ["시작", `부위 고르기 → ${DYE_TIME_MS / 1000}초 안에 색 찾기`],
              ["판", "끝없이 이어져요 · 특수 색은 드물게 숨어 있어요"],
              ["창 닫기", "바깥을 눌러도 안 닫혀요 · 직접 닫으면 포기"],
              ["이어서 하기", "도중에 나가도 시간 안이면 가방·잡화점에서"],
              ["시간이 끝나면", "지금 색과 새 색 중에서 골라요"],
            ]}
          />
        </section>

        <section>
          <h3>집</h3>
          <Table
            head={["터", "처음 분양가", "가구"]}
            rows={PLOT_TIERS.map((t) => [t.name, `${won(plotCost(t.id))}P`, `${t.maxItems}개까지`])}
          />
          <Table
            head={["하는 일", "방법"]}
            rows={[
              ["분양", "분양 사무소에서 터 크기·번지 고르기"],
              ["넓히기", "작은 터 → 넓은 터 → 대저택 업그레이드"],
              ["꾸미기", "가구·외관 사서 놓기"],
              ["놀러 가기", "다른 집 구경 · 좋아요 · 방명록"],
            ]}
          />
        </section>

        <section>
          <h3>묘역과 묘비</h3>
          <Table
            head={["하는 일", "방법"]}
            rows={[
              ["묘비 쓰기", "메뉴 → 묘비 쓰기 (한 사람에 하나)"],
              ["헌화", "묘비마다 하루 한 번 · 둘 다 포인트"],
              ["내 묘비 가기", "메뉴 → 내 묘비 가기 (움직이면 멈춰요)"],
              ["성불", `세운 뒤 ${DEFAULT_PASS_DAYS}일 (운영 상황에 따라 바뀔 수 있어요)`],
              ["성불한 이야기들", "메뉴에서 · 최신 순·검색·헌화 수"],
              ["디자인", `무료 ${freeStyles} · 나머지는 디자인권`],
              ["성황당", `이장한 묘비를 ${SHRINE_KEEP_DAYS}일 모셔요 · 그 안에 다시 모시기`],
            ]}
          />
          <ul className={styles.points}>
            <li>
              묘역은 두 곳(언덕 아래 옛 묘역, 다리 건너 묘역)이고 채널마다 {GRAVEYARD_CAPACITY}개까지예요. 자리가 모자라면 오래된 묘비부터 조금
              일찍 성불해요.
            </li>
            <li>다시 모신 묘비는 성불 기간을 그때부터 다시 세요. 디자인은 내 묘비 상세에서도 바꿀 수 있어요.</li>
          </ul>
        </section>

        <section>
          <h3>계정과 채널</h3>
          <Table
            head={["항목", "내용"]}
            rows={[
              ["개인 코드", "내 정보 → 개인 코드 · 만들 때 한 번만 보여요"],
              ["다른 기기", "입장 화면 → 개인 코드로 들어가기"],
              ["코드가 새면", "다시 만들기 (예전 코드는 바로 막혀요)"],
              ["채널", `정원 ${DEFAULT_CHANNEL_CAPACITY}명 · 최대 ${DEFAULT_MAX_CHANNELS}채널 · 위 채널 표시로 옮기기`],
              ["대기열", "꽉 차면 줄 서기 · 차례가 오면 자동 입장"],
              ["다 놀았으면", "내 정보 → 접속 종료로 자리 비우기"],
            ]}
          />
        </section>

        <section className={styles.inquiry}>
          <h3>처음 왔을 때 안내</h3>
          <p>걷기·앉기부터 모닥불·사냥터·집·묘역 소개까지 1분 남짓한 안내를 다시 볼 수 있어요.</p>
          <button type="button" className={ui.button} onClick={onReplayTutorial}>
            첫 방문 안내 다시 보기
          </button>
        </section>

        <section className={styles.inquiry}>
          <h3>문의</h3>
          <p>버그·제안·계정 문제는 여기로 알려 주세요.</p>
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
