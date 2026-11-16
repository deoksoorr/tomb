import { CAMP_NPCS, type CampNpcId } from "@tomb/protocol";

// 11/15 캠핑장 NPC 말 걸기 (1차: 대사만). 매점·의뢰·별가루는 다음 차수. 요리는 정해지지 않아 약속하지 않는다 (먹거리는 바베큐장).
// 말투는 사람마다 — 관리인·알바·별지기·기타 캠퍼는 해요체, 계곡 할머니는 반말.

/** 처음 도착하면 관리인이 하는 안내 (첫 줄 인사 + 세 문장 안내) */
export const CAMP_WELCOME: readonly string[] = [
  "어서 와요. 다들 언젠가 온다고 했어요. 진짜 온 사람은 처음이네.",
  "텐트는 번호 붙은 데크에 쳐요. 곧 칠 수 있게 해 둘게요.",
  "배고프면 큰 타프 오른쪽 바베큐장에 가 봐요.",
  "오른쪽 위 전망대 망원경으로는 캠핑장이 한눈에 보여요.",
];

const LINES: Record<CampNpcId, readonly (readonly string[])[]> = {
  keeper: [
    ["다들 언젠가 온다고 했어요. 진짜 온 사람은 처음이네."],
    ["데크는 스물네 자리인데 아직 다 비어 있어요.", "텐트는 곧 칠 수 있어요."],
    ["정류장 시간표 봤어요? 다음 버스가 언젠가래요.", "그래도 부르면 와요. 신기하죠."],
  ],
  clerk: [
    ["중고로 올라온 장비가 반이에요."],
    ["매점은 곧 열어요. 지금은 진열만 하는 중이에요."],
    ["포장도 안 뜯은 버너가 세 개 들어왔어요.", "다들 언젠가 쓰려고 샀대요."],
  ],
  granny: [
    ["물고기는 서두르면 안 와."],
    ["앉아서 물소리나 들어. 그게 캠핑이야."],
    ["아침엔 물안개가 계곡을 따라 내려와.", "일찍 일어나면 한번 봐."],
  ],
  stargazer: [
    ["맑은 밤엔 은하수가 잘 보여요."],
    ["밤마다 여기 전망대에 나와 있어요.", "새벽 다섯 시쯤 들어가 자요."],
    ["별 이야기는 곧 더 들려줄게요."],
  ],
  guitarist: [
    ["한 곡 들을래요? 아는 노래는 세 곡뿐이에요."],
    ["불 앞에선 다 노래가 돼요."],
    ["열한 시까지만 쳐요.", "옆 데크에서 자는 사람이 생길지도 모르니까요."],
  ],
};

export function campNpcName(id: CampNpcId): string {
  return CAMP_NPCS.find((n) => n.id === id)?.name ?? "";
}

/** 말 걸 때마다 다음 묶음 (사람마다 차례로 돈다) */
export function campLines(id: CampNpcId, turn: number): readonly string[] {
  const set = LINES[id];
  return set[((turn % set.length) + set.length) % set.length];
}

/** 별지기는 밤(20시~5시), 기타 캠퍼는 밤 9~11시에만 나와 있다 (한국 시각) */
export function campNpcAround(id: CampNpcId, hour: number): boolean {
  if (id === "stargazer") return hour >= 20 || hour < 5;
  if (id === "guitarist") return hour >= 21 && hour < 23;
  return true;
}

/** 기타 캠퍼가 있는 밤 9~11시: 캠핑장 음악을 어쿠스틱으로 */
export function campBgmPlaylist(hour: number): "acoustic" | "ambient" {
  return hour >= 21 && hour < 23 ? "acoustic" : "ambient";
}
