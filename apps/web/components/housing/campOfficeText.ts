import { campRoom, YARD_SEATS } from "@/game/camp/campSaleApi";
import type { SaleKind } from "@/lib/housing/catalog";
import { CAMP_HOME_KIND_NAME, CARAVAN_GRADE_NAME, type CampHomeKind, type CampLot, type CampYard } from "@tomb/protocol";

// 11/26 분양 사무소 창의 캠핑장 문구 (OfficeDialog zone "camp" — 분양 NPC 셋의 인사·터 소개·앞마당 안내. 그림 없이 시험한다)

export const HOST: Record<CampHomeKind, { name: string; where: string; hello: string }> = {
  caravan: { name: "언젠가 씨", where: "관리소", hello: "카라반 자리는 열두 곳이에요. 폭포 앞 자리가 제일 인기가 많아요. 앞마당을 넓히면 카라반도 커지고 방도 넓어져요." },
  pension: { name: "소슬댁", where: "소슬 펜션", hello: "솔바람채랑 달빛채, 두 채가 있어요. 앞마당을 꾸밀수록 집도 방도 커져요." },
  rural: { name: "순이 할머니", where: "촌캉스", hello: "감나무집이랑 싸리울집이 있어요. 마당에 평상이랑 아궁이가 있어서 쉬어 가기 좋아요." },
};

/** 집마다 개성 (목록 둘째 줄) */
export const FLAVOR: Record<number, string> = { 13: "스파·테라스형", 14: "바비큐·화로·해먹형", 15: "싸리 울타리·장독대", 16: "돌담·감나무 마당" };

/** 앞마당 단계를 올리면 생기는 것 (카라반은 모두 같다) */
const YARD_ADDS: Record<number, { 2: string; 3: string }> = {
  0: { 2: "옆 확장 칸·차양·바퀴 2쌍·접이식 탁자", 3: "확장 칸 2개·긴 차양·줄전구·피크닉 탁자" },
  13: { 2: "2단 데크·통유리 난간·파라솔·그네 의자", 3: "온수 스파·선베드·줄조명" },
  14: { 2: "2단 데크·파라솔·바비큐 스테이션", 3: "화로대·해먹·줄조명" },
  15: { 2: "울타리 내어 치기·장독대·소반", 3: "울타리 끝까지·원두막·4인 소반·곁채" },
  16: { 2: "돌담 내어 쌓기·장독대·밥상", 3: "돌담 끝까지·정자·4인 밥상·곁채" },
};

/** 앞마당 다음 단계로 바뀌는 것 한 줄 */
export function yardChangeLine(l: CampLot, from: CampYard): string {
  const to = (from + 1) as 2 | 3;
  const adds = (YARD_ADDS[l.kind === "caravan" ? 0 : l.lot] ?? YARD_ADDS[0])[to];
  // 11/26 카라반 앞마당 2 · 4 · 6자리 (2단계 탁자 · 3단계 피크닉 탁자) · 펜션·촌캉스 4 · 6 · 8
  const n = (y: CampYard) => (l.kind === "caravan" ? y * 2 : YARD_SEATS[y]);
  const seats = `앉을 자리 ${n(from)} → ${n(to)}`;
  const a = campRoom(l.kind, from);
  const b = campRoom(l.kind, to);
  return `${seats} · 방 ${a.w}×${a.h} → ${b.w}×${b.h} · ${adds}`;
}

/** 집 종류별 처음 방·딸린 가구 안내 */
export function kindIntro(kind: CampHomeKind): string {
  const [a, b, c] = [campRoom(kind, 1), campRoom(kind, 2), campRoom(kind, 3)];
  const fx = kind === "caravan" ? "침대·식탁·간이 부엌·화장실" : kind === "pension" ? "TV·소파·주방·침대" : "자개장·이불장·밥상";
  return `방 ${a.w}×${a.h}칸, 가구 ${a.maxItems}개로 시작해요. 앞마당을 올리면 방도 ${b.w}×${b.h} → ${c.w}×${c.h}칸(가구 ${b.maxItems} → ${c.maxItems}개)으로 커져요. ${fx}가 딸려 있어요.`;
}


/**
 * 11/26 분양 창 터 카드 아래 줄 (포구 오두막 터 크기 카드의 「분양받은 뒤 더 큰 터로 넓힐 수 있어요 (넓은 터 +13,500P)」 자리):
 * 「분양받은 뒤 앞마당으로 넓힐 수 있어요 (+13,500P · +22,500P)」 — 이 사람 기준 값(다주택자면 다주택자 가격)
 */
export function yardHint(yard: { 2: number; 3: number }): string {
  const f = (n: number) => n.toLocaleString("ko-KR");
  return `분양받은 뒤 앞마당으로 넓힐 수 있어요 (+${f(yard[2])}P · +${f(yard[3])}P)`;
}

/** 받침에 맞는 「이·가」 */
const josa = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? "이" : "가";
};

/** 11/26 분양 창마다 파는 집 이름 (마을 분양 사무소 · 포구 부동산 · 캠핑장 NPC 셋) */
const saleName = (kind: SaleKind): string => (kind === "village" ? "마을 집" : kind === "sea" ? "오두막" : CAMP_HOME_KIND_NAME[kind]);

/** 11/26 그 채널에 그 종류 터가 다 찼을 때 — 모든 분양 창이 같은 말 (이름 칸·분양 단추는 숨긴다) */
export const soldOutLine = (kind: SaleKind, ch: number): string =>
  `지금 ${ch}채널에는 남은 ${saleName(kind)}${josa(saleName(kind))} 없어요. 다른 채널에서 찾아보세요.`;

/**
 * 11/26 그 종류 터가 남은 채널 (목록에 보이고 만석이 아닌 채널 중, 지금 채널과 다 찬 채널을 뺀다).
 * null = 아직 모른다(안 보여 준다), 빈 배열 = 다른 채널에도 없다
 */
export function openSaleChannels(visible: readonly number[] | null, full: readonly number[] | null, current: number): number[] | null {
  if (!visible || !full) return null;
  const f = new Set(full);
  return visible.filter((c) => c !== current && !f.has(c)).sort((a, b) => a - b);
}
/** 「남은 펜션이 있는 채널: 1채널 · 4채널」 · 없으면 「다른 채널에도 남은 펜션이 없어요.」 */
export const openChannelsLine = (kind: SaleKind, chs: readonly number[]): string =>
  chs.length
    ? `남은 ${saleName(kind)}${josa(saleName(kind))} 있는 채널: ${chs.map((c) => `${c}채널`).join(" · ")}`
    : `다른 채널에도 남은 ${saleName(kind)}${josa(saleName(kind))} 없어요.`;

/** 분양 창 제목 (그 NPC가 파는 종류 하나 — 「언젠가 씨 · 카라반 분양」) */
export const campOfficeTitle = (kind: CampHomeKind): string => `${HOST[kind].name} · ${CAMP_HOME_KIND_NAME[kind]} 분양`;

/** 터 카드의 자리 이름 (카라반 = 폭포 앞·강가·숲 쪽, 펜션·촌캉스 = 집 개성) */
export const campLotTag = (l: CampLot): string => (l.kind === "caravan" ? (l.grade ? CARAVAN_GRADE_NAME[l.grade] : "") : (FLAVOR[l.lot] ?? ""));

/** 캠핑장 분양 창이 파는 종류: 말을 건 NPC의 종류(camp) → 카라반. 11/26 빈 터 E는 창을 열지 않는다 (분양은 NPC에게서만) */
export function campKindOf(intent: { camp?: CampHomeKind } | null): CampHomeKind {
  return intent?.camp ?? "caravan";
}

/** 11/26 캠핑장에서 캠핑장 집 없이 [분양 사무소]를 눌렀을 때 (마을 사무소 대신 이 안내) */
export const CAMP_SALE_GUIDE = "캠핑장 집은 언젠가 씨(카라반)·소슬댁(펜션)·순이 할머니(촌캉스)에게 말을 걸어 분양받아요.";

// ── 11/27 「전용 가구」 탭 (CampExclusiveShop) ──

/** 탭 이름 */
export const CAMP_SHOP_TAB = "전용 가구";
/** 탭 위 NPC 인사 (분양 인사 대신) */
export const CAMP_SHOP_HELLO: Record<CampHomeKind, string> = {
  caravan: "카라반에 딱 맞는 캠핑 살림만 골라 왔어요. 카라반에만 놓을 수 있어요.",
  pension: "펜션에서 쓰던 가구를 조금 내놨어요. 펜션에만 놓을 수 있어요.",
  rural: "옛날 살림을 곱게 닦아 내놨어요. 촌캉스에만 놓을 수 있어요.",
};
/** 아래 안내 (알림이 없을 때) */
export const CAMP_SHOP_FOOT: Record<CampHomeKind, string> = {
  caravan: "산 물건은 가방에 들어가요. 카라반 꾸미기에서 놓아 보세요.",
  pension: "산 물건은 가방에 들어가요. 펜션 꾸미기에서 놓아 보세요.",
  rural: "산 물건은 가방에 들어가요. 촌캉스 꾸미기에서 놓아 보세요.",
};
export const CAMP_SHOP_LOADING = "물건을 꺼내 오는 중…";
/** 사고 난 뒤 한 줄 */
export const campShopBoughtText = (name: string) => `${name}, 가방에 넣었어요.`;
