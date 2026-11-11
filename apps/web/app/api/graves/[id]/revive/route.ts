import { handler, HttpError } from "@/lib/http";

/**
 * "살려주세요"는 49번에서 없어졌다 (묘비에서 할 수 있는 건 헌화뿐). 저장된 수는 보관만 한다.
 * 옛 화면이 부르면 아무것도 바꾸지 않고 410으로 안내한다
 */
export const POST = handler<{ id: string }>(async () => {
  throw new HttpError(410, "GONE", "살려주세요는 이제 없어요. 대신 꽃을 놓아 주세요.");
});
