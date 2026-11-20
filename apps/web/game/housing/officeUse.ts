import type { SeasonFx } from "./seasonUse";

// 11/20 「총무팀 문대리」 사무실 가구 써 보기 (서서 E — interact.ts의 "season"과 같은 길: 잠깐 바뀌는 그림·소리·이모티콘·한마디).
// 연출만 하고 포인트·아이템은 주지 않는다. 같은 방 사람에게는 use 이벤트(a = 한마디 번호)로 같은 연출 (HouseScene.playSeason).
//  - 그림 변형 이름은 officeFurnitureArt (memo·sway·copy·glug·open·meet·water·six·stamp·less·press)
//  - 앉는 가구는 여기 없다: 바퀴 달린 사무 의자(앉기)·안마의자(앉아서 안마받기)·부장님 책상(뒤에서 손님 쪽 보고 앉아 결재하기) — interact.ts houseSpots
//  - 야근 스탠드는 석등처럼 켜기·끄기 (처음부터 켜짐, 값 1 = 꺼짐 — OFFICE_LIGHT_LABEL)

export const OFFICE_FX: Readonly<Record<string, SeasonFx>> = {
  partition: { v: "memo", ms: 4000, emote: "idea", sfx: "marker", lines: ["포스트잇 한 장 추가! 할 일이 또 늘었어요.", "「오늘은 칼퇴」라고 써 붙였어요.", "칸막이 안은 나만의 섬이에요."] },
  leaf_shade: { v: "sway", ms: 2400, emote: "zen", sfx: "rustle", lines: ["잎 그늘 아래서 한숨 돌려요.", "광합성 충전 중… 70%", "눈부심 차단 완료!"] },
  copier: { v: "copy", ms: 2500, emote: "excel", sfx: "vend", lines: ["위잉— 따끈한 복사본이 나왔어요.", "용지 걸림… 아니고 무사히 복사 완료!", "양면 복사 성공! 오늘은 운이 좋아요."] },
  water_cooler: { v: "glug", ms: 2200, emote: "drop", sfx: "pour", lines: ["꼴깍꼴깍, 시원해요.", "정수기 앞에서 들은 소문은… 비밀이에요.", "물 한 잔에 졸음이 달아나요."] },
  file_cabinet: { v: "open", ms: 3000, emote: "what", sfx: "creak", lines: ["3년 전 기획서를 찾았어요… 조용히 닫아요.", "서랍 속에 누가 숨겨 둔 사탕이!", "서류철이 빼곡해요."] },
  meeting_table: { v: "meet", ms: 5000, emote: "meeting", sfx: "page", lines: ["10분 회의 시작… 벌써 40분째예요.", "회의록은 누가 쓰나요?", "결론은 다음 회의에서 정해요."] },
  rubber_tree: { v: "water", ms: 3000, emote: "drop", sfx: "pour", lines: ["물을 줬어요. 잎이 반짝반짝.", "고무나무는 오늘도 잘 버텨요.", "새순이 빼꼼 올라왔어요!"] },
  quit_clock: { v: "six", ms: 3000, emote: "clockout", sfx: "bong", lines: ["땡! 6시 정각, 칼퇴예요!", "5시 59분… 1분이 제일 길어요.", "퇴근 시계는 늘 정확해요."] },
  approval_tray: { v: "stamp", ms: 2500, emote: "approve", sfx: "click", lines: ["쾅! 승인이에요.", "반려… 아니고 승인!", "결재 끝! 서류 탑이 한 칸 줄었어요."] },
  paper_pile: { v: "less", ms: 3000, emote: "sweat", sfx: "page", lines: ["한 장 처리했어요. 아흔아홉 장 남았어요.", "치워도 치워도 그대로예요…", "맨 아래 서류는 작년 거예요."] },
  leave_button: { v: "press", ms: 2000, emote: "clockout", sfx: "click", lines: ["딸깍! 퇴근하는 기분이에요.", "눌렀지만 아직 근무 중이에요.", "한 번 더 누르면 진짜 퇴근일까요?"] },
};

/** 서서 쓰는 사무실 가구 (interact USE_OF "season" — 그림 변형·한마디는 OFFICE_FX) */
export const OFFICE_STAND_IDS: readonly string[] = Object.keys(OFFICE_FX);

/** 불빛 사무실 가구의 E 안내 (켜져 있으면 끄기) */
export const OFFICE_LIGHT_LABEL: Readonly<Record<string, readonly [off: string, on: string]>> = {
  banker_lamp: ["스탠드 끄기 (퇴근 모드)", "스탠드 켜기 (야근 모드)"],
};
