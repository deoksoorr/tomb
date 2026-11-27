// 11/27 탭 id: 탭마다 하나 (sessionStorage — 새로고침해도 같고, 다른 탭은 다르다). 실시간 접속 주소 &tab=로 보내
// 운영 기록에서 「다른 탭에서 다시 접속」을 구분한다 (판단에는 쓰지 않는다). 탭 복제는 sessionStorage가 복사돼 같은 id일 수 있다.

const KEY = "tomb.tab";
let memo: string | null = null;

/** 이 탭의 id (4~12자 영숫자 — protocol TAB_ID_RE). 저장소를 못 쓰면 이 페이지 동안만 */
export function tabId(): string {
  if (memo) return memo;
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(KEY);
  } catch {
    // 저장소를 못 쓰면 새로 만든다
  }
  if (!id || !/^[A-Za-z0-9]{4,12}$/.test(id)) {
    id = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    try {
      sessionStorage.setItem(KEY, id);
    } catch {
      // 이 페이지 동안만
    }
  }
  memo = id;
  return id;
}
