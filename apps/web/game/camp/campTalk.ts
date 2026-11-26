import { CAMP_NPCS, type CampNpcId } from "@tomb/protocol";
import type { MapConcept } from "@/lib/mapConcept";

// 11/15 캠핑장 NPC 말 걸기 (1차: 대사만). 매점·의뢰·별가루는 다음 차수. 요리는 정해지지 않아 약속하지 않는다 (먹거리는 바베큐장).
// 말투는 사람마다 — 관리인·알바·기타 캠퍼·소슬댁은 해요체, 계곡 할머니·순이 할머니는 반말.
// 11/26 폭포 계곡 개편: 카라반은 언젠가 씨, 펜션은 소슬댁, 촌캉스는 순이 할머니가 분양해요 (분양 창은 집 화면 담당).

/** 처음 도착하면 관리인이 하는 안내 (첫 줄 인사 + 세 문장 안내) */
export const CAMP_WELCOME: readonly string[] = [
  "어서 와요. 다들 언젠가 온다고 했어요. 진짜 온 사람은 처음이네.",
  "위쪽으로 쭉 가면 아스라 폭포랑 달그늘 소가 나와요. 폭포 다리에 앉아 보면 좋아요.",
  "낚시는 계곡 둑, 소 옆 바위, 오른쪽 윤슬 낚시터에서 해요. 나룻배도 있어요.",
  "카라반 자리는 저한테, 펜션은 소슬댁, 촌캉스는 순이 할머니한테 물어보면 돼요.",
];

const LINES: Record<CampNpcId, readonly (readonly string[])[]> = {
  keeper: [
    ["다들 언젠가 온다고 했어요. 진짜 온 사람은 처음이네."],
    ["카라반 자리는 열두 곳이에요.", "폭포 앞이 제일 인기라 값도 제일 높아요."],
    ["정류장 시간표 봤어요? 다음 버스가 언젠가래요.", "그래도 부르면 와요. 신기하죠."],
  ],
  clerk: [
    ["중고로 올라온 장비가 반이에요."],
    ["자판기는 폭포 쪽 소 옆으로 옮겼어요.", "물소리 들으면서 마시라고요."],
    ["포장도 안 뜯은 버너가 세 개 들어왔어요.", "다들 언젠가 쓰려고 샀대요."],
  ],
  granny: [
    ["물고기는 서두르면 안 와."],
    ["앉아서 물소리나 들어. 그게 캠핑이야."],
    ["달그늘 소엔 거기서만 사는 놈이 있어.", "가끔 물속에서 반짝여."],
  ],
  guitarist: [
    ["한 곡 들을래요? 아는 노래는 세 곡뿐이에요."],
    ["불 앞에선 다 노래가 돼요."],
    ["열한 시까지만 쳐요.", "카라반에서 자는 사람이 생길지도 모르니까요."],
  ],
  sosul: [
    ["소슬 펜션에 어서 와요. 솔바람채랑 달빛채, 두 채예요."],
    ["펜션은 처음엔 작게 지어 두고, 앞마당을 꾸밀수록 방도 커져요.", "3단계면 집도 한층 높아져요."],
    ["정원 화로대는 누구나 써도 돼요.", "밤에 불멍 하기 좋아요."],
  ],
  suni: [
    ["어여 와. 촌캉스 하러 왔구먼."],
    ["감나무집이랑 싸리울집, 둘 다 마당이 넓어.", "평상에 앉아 밥 먹으면 꿀맛이여."],
    ["아궁이에 불 때면 구들이 뜨끈해져.", "겨울엔 그게 최고여."],
  ],
};

/** 11/17 겨울·크리스마스판 계절 한마디 (판이 켜져 있으면 말 걸 때 맨 먼저, 그 뒤로 원래 묶음과 같이 돈다) */
const SEASON_LINES: Record<CampNpcId, Record<"winter" | "christmas", readonly string[]>> = {
  keeper: { winter: ["오늘은 손이 꽁꽁 얼었어요.", "장작 넉넉히 쌓아 뒀으니 걱정 마요."], christmas: ["메리 크리스마스! 언젠가 온다던 산타도 올까요?"] },
  clerk: { winter: ["핫팩 들어왔어요. 아직 진열 중이에요."], christmas: ["메리 크리스마스! 앞치마에 호랑가시 달았어요."] },
  granny: { winter: ["계곡물이 살짝 얼었어.", "얼음 밑에서도 물고기는 기다려."], christmas: ["메리 크리스마스. 따뜻하게 입고 다녀."] },
  guitarist: { winter: ["손이 시려서 코드가 자꾸 미끄러져요."], christmas: ["메리 크리스마스! 캐럴 한 곡 칠게요."] },
  sosul: { winter: ["펜션 스파에 김이 모락모락 나요.", "추우면 잠깐 몸 녹이고 가요."], christmas: ["메리 크리스마스! 정원 트리에 전구 달았어요."] },
  suni: { winter: ["눈 오는 날은 아궁이 앞이 제일이여."], christmas: ["메리 크리스마스여. 감 하나 먹고 가."] },
};

export function campNpcName(id: CampNpcId): string {
  return CAMP_NPCS.find((n) => n.id === id)?.name ?? "";
}

/** 말 걸 때마다 다음 묶음 (사람마다 차례로 돈다). 겨울·크리스마스판이면 계절 한마디 묶음이 맨 앞에 끼어든다 */
export function campLines(id: CampNpcId, turn: number, concept: MapConcept = "default"): readonly string[] {
  const set = concept === "default" ? LINES[id] : [SEASON_LINES[id][concept], ...LINES[id]];
  return set[((turn % set.length) + set.length) % set.length];
}

/** 기타 캠퍼는 밤 9~11시에만 나와 있다 (한국 시각) */
export function campNpcAround(id: CampNpcId, hour: number): boolean {
  if (id === "guitarist") return hour >= 21 && hour < 23;
  return true;
}

/** 기타 캠퍼가 있는 밤 9~11시: 캠핑장 음악을 어쿠스틱으로 */
export function campBgmPlaylist(hour: number): "acoustic" | "ambient" {
  return hour >= 21 && hour < 23 ? "acoustic" : "ambient";
}
