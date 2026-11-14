// 구글 로그인 콜백이 첫 화면으로 돌려보내며 붙이는 결과 (/?google=…). 서버(lib/googleAuth.ts)와 입구 화면이 같이 쓴다

/** 콜백이 첫 화면으로 돌려보내며 붙이는 결과. 첫 화면(app/page.tsx)은 이 목록에 있는 값만 받는다 */
export const GOOGLE_RESULTS = [
  "login", // 연결된 계정으로 들어옴
  "new", // 연결된 계정이 없음 → 새로 만들기 확인
  "linked", // 계정 정보에서 연결함
  "same", // 이미 이 계정에 연결돼 있음
  "taken", // 다른 계정에 이미 연결된 구글
  "other", // 이 계정에 이미 다른 구글이 연결돼 있음
  "banned", // 이용이 제한된 계정
  "nosession", // 연결하려는데 이 기기 계정이 없음
  "cancel", // 구글 화면에서 취소
  "error", // 그 밖의 실패 (만료·위조·구글 오류)
] as const;
export type GoogleResult = (typeof GOOGLE_RESULTS)[number];
export const isGoogleResult = (v: unknown): v is GoogleResult => typeof v === "string" && (GOOGLE_RESULTS as readonly string[]).includes(v);
