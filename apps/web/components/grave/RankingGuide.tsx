import { LIKE_WEIGHT, TIER_SCORE_NOTE } from "@/lib/housing/catalog";
import { DYE_SPECIAL_BONUS, LOOK_SCORE_DIVISOR } from "@/lib/lookScore";
import { STAY_TICK_MINUTES } from "@/lib/stayTime";
import { InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";

/** 랭킹 창 아래: 탭마다 순위를 어떻게 매기는지와 올리는 방법 */
export default function RankingGuide() {
  return (
    <InfoGrid spaced>
      <InfoCard title="이렇게 순위를 매겨요" icon="list">
        <TipList
          tips={[
            <>
              <b>포인트</b>는 지금까지 모은 포인트 합계예요. 써도 줄지 않아요. [이번 주]는 이번 주에 모은 만큼만 세요.
            </>,
            <>
              <b>사냥</b>은 처치한 몬스터 수로 매겨요. 이번 주와 전체 기간으로 볼 수 있어요.
            </>,
            <>
              <b>사냥 레벨</b>은 사냥 캐릭터 레벨이 높은 순이에요. 레벨이 같으면 초월 레벨, 그다음엔 경험치가 많은 순이에요.
            </>,
            <>
              <b>야근 빌딩</b>은 가장 높이 오른 층 순서예요. 같은 층이면 먼저 오른 사람이 앞이에요.
            </>,
            <>
              <b>낚시</b>는 직접 낚은 가장 큰 물고기로 매겨요. 자동 낚시로 낚은 것은 들어가지 않아요.
            </>,
            <>
              <b>꾸미기</b>는 지금 입은 코디, 펫, 프리미엄 외형으로 매겨요. 영구 소장 값 {LOOK_SCORE_DIVISOR}P마다 1점이고, 특수 염색은 부위마다 +{DYE_SPECIAL_BONUS}점이에요. 펫은 값을 올리기 전 분양가로 쳐요. 기간이 끝난 코디는 바로 빠져요.
            </>,
            <>
              <b>집 꾸미기</b>는 전체 기간 꾸밈 점수로 매겨요. 안팎에 놓은 물건 점수에 좋아요 × {LIKE_WEIGHT}과 터 크기 점수({TIER_SCORE_NOTE})를 더해요.
            </>,
            <>
              <b>접속 시간</b>은 지금까지 마을에 머문 시간을 모두 더한 값이에요. {STAY_TICK_MINUTES}분 머물 때마다 늘어요.
            </>,
          ]}
        />
      </InfoCard>
      <InfoCard title="순위를 올리려면" icon="spark">
        <TipList
          tips={[
            "오래 머물러 머무르기 포인트와 접속 시간 보너스를 모아요. 오늘 미션과 황금 고블린도 포인트를 넉넉히 줘요.",
            "사냥터, 망원경, 채집, 낚시로 한도 없이 포인트를 모을 수 있어요.",
            "집에 물건을 놓아 꾸밀수록, 이웃에게 좋아요를 받을수록 꾸밈 점수가 올라요.",
            "코디를 부위마다 입을수록 꾸미기 점수가 올라요. 내 점수는 가방 [지금 모습]이나 내 정보에서 볼 수 있어요.",
            "목록 밖에 있어도 내 순위는 맨 아래에 따로 보여요.",
          ]}
        />
      </InfoCard>
    </InfoGrid>
  );
}
