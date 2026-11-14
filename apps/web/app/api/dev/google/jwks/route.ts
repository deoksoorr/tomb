import { handler, json } from "@/lib/http";
import { assertMock, mockJwks } from "@/lib/googleMock";

/** 개발 전용 모의 구글: 공개키 (운영 404) */
export const GET = handler(async () => {
  assertMock();
  return json(mockJwks());
});
