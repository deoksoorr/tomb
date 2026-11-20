export { MUNGNYANG_SHOP_SUB, MUNGNYANG_SHOP_TITLE } from "@/lib/mungnyang/catalog";

// 11/19 분양사 보리 창 문구 (짧은 해요체 — 순수 함수라 테스트한다. 「라벨: 설명」 콜론 나열·「A · B · C」 나열 없이)

export const MUNGNYANG_TABS = [
  { id: "pet", label: "펫" },
  { id: "furn", label: "집 가구" },
] as const;
export type MungnyangTab = (typeof MUNGNYANG_TABS)[number]["id"];

/** 창 위 인사 (보리가 하는 말) */
export function mungnyangHello(tab: MungnyangTab): string {
  return tab === "pet" ? "한번 데려가면 평생 가족이에요. 데리고 다니는 건 한 마리씩이에요." : "우리 아이들 닮은 가구예요. 사면 가구 가방으로 보내 드려요.";
}

/** 미리보기 방향 이름 (돌려 보기) */
export type PetView = "right" | "front" | "left" | "back";
export function viewName(v: PetView): string {
  return v === "front" ? "앞모습" : v === "back" ? "뒷모습" : "옆모습";
}

/** 펫 상태 한 줄 (내 정보로 본다). forever = 영구, where = 데리고 다니는 중이면 worn */
export function petStateText(o: { forever: boolean; where: "worn" | "home" } | null, ticket: number): string {
  if (o?.forever) return o.where === "worn" ? "가족이에요. 지금 같이 걷고 있어요." : "가족이에요. 집에서 쉬고 있어요.";
  if (o) return o.where === "worn" ? "기간제로 데리고 다니는 중이에요." : "기간제로 집에 있어요.";
  if (ticket > 0) return `가방에 기간제 이용권이 ${ticket}개 있어요.`;
  return "아직 가족이 아니에요.";
}

/** 가구 가방에 가진 개수 */
export const haveText = (n: number) => `가방에 ${n}개 있어요.`;

/** 이름 뒤 목적격 조사 (마지막 글자 받침 — 한글이 아니면 「를」) */
function eulReul(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? "을" : "를";
}

/** 산 뒤 알림 (탈 수 있는 펫이면 타는 법을 덧붙인다 — coarse = 손가락 화면이라 [타기] 버튼) */
export function boughtText(name: string, tab: MungnyangTab, ride = false, coarse = false): string {
  if (tab === "furn") return `${name}${eulReul(name)} 가구 가방에 넣었어요. 집에서 꾸미기를 열면 놓을 수 있어요.`;
  const how = ride ? (coarse ? " [타기] 버튼을 누르면 올라탈 수 있어요." : " R 키를 누르면 올라탈 수 있어요.") : "";
  return `${name}, 우리 가족이 됐어요! 지금부터 같이 다녀요.${how}`;
}

/** 아래 안내 줄 (알림이 없을 때) */
export function footHint(tab: MungnyangTab): string {
  return tab === "pet" ? "가방의 펫 칸에서도 데리고 다닐 아이를 바꿀 수 있어요." : "산 가구는 두 집이 같이 쓰는 가구 가방에 들어가요.";
}
