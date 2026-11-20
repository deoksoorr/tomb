export { OFFICE_SHOP_SUB, OFFICE_SHOP_TITLE } from "@/lib/office/catalog";

// 11/20 총무팀 문대리 창 문구 (짧은 해요체·회사원 말투 — 순수 함수라 테스트한다. 「라벨: 설명」 콜론 나열·「A · B · C」 나열 없이)

/** 창 위 인사 (문대리가 하는 말) */
export const OFFICE_HELLO = "필요한 비품 있으면 말만 해요. 결재는 제가 올려 둘게요.";

/** 아래 안내 줄 (알림이 없을 때) */
export const OFFICE_FOOT = "산 가구는 두 집이 같이 쓰는 가구 가방에 들어가요.";

/** 목록 불러오는 중 */
export const OFFICE_LOADING = "비품 창고를 여는 중이에요…";

/** 이름 뒤 목적격 조사 (마지막 글자 받침 — 한글이 아니면 「를」) */
function eulReul(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? "을" : "를";
}

/** 산 뒤 알림 */
export function officeBoughtText(name: string): string {
  return `비품 지급 완료! ${name}${eulReul(name)} 가구 가방에 넣었어요. 집에서 꾸미기를 열면 놓을 수 있어요.`;
}
