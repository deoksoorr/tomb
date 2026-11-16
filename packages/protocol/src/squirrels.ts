// 11/16 이스터에그 「다람쥐를 뿌려라」: 채팅에 이 말을 치면 그 채널(마을·캠핑장·바닷가·실내) 모두의 화면에 하늘에서 다람쥐가 와다다 쏟아진다.
// - 판정·쿨다운은 실시간 서버(채널 DO 메모리)가 한다. 말풍선 채팅이 정상으로 중계된 뒤에만 본다 (토큰 버킷·실내에서 버린 줄·귓속말은 안 된다)
// - 서버는 S2C { t: "squirrels" }를 채널 전체에 보내고, 클라이언트는 화면 연출만 한다 (game/fx/SquirrelRain)

/** 공백을 지운 문구 */
export const SQUIRREL_RAIN_PHRASE = "다람쥐를뿌려라";
/** 채널마다 한 번 쏟아진 뒤 다시 쏟아질 수 있을 때까지 */
export const SQUIRREL_RAIN_COOLDOWN_MS = 10 * 60_000;
/** 화면 연출 길이 (클라이언트) */
export const SQUIRREL_RAIN_MS = 5_200;
/** 다람쥐를 뿌린 뒤 띄우는 안내 */
export const SQUIRREL_RAIN_NOTICE = "원하시는대로 다람쥐를 뿌렸어요!";

// 지울 것: 공백·보이지 않는 글자
const GAP_RE = new RegExp("[\\s\\u00ad\\u200b-\\u200f\\u2060-\\u206f\\ufeff]+", "g");
// 문구 뒤에 붙어도 되는 것: 문장부호·기호·이모지·한글 낱자(ㅋㅋ·ㅎㅎ·ㅠㅠ)·이모지 꾸밈 글자
const FILLER_RE = new RegExp("^[\\p{P}\\p{S}\\p{Extended_Pictographic}\\u3131-\\u318e\\ufe0f\\u200d\\u20e3]*", "u");
// 문장을 끝내는 부호: 이것 뒤로는 다른 말이 이어져도 된다 ("다람쥐를 뿌려라! 가즈아")
const STOP_RE = new RegExp("[!?.~…！？。～]");

/**
 * 채팅 한 줄이 「다람쥐를 뿌려라」 주문인지 (공백 무시, 앞에는 무엇이 와도 된다).
 * 문구 바로 뒤는 끝이거나 문장부호·이모지·ㅋㅋ 같은 것만 오거나, 문장을 끝내는 부호(!·.·?·~) 다음이어야 한다
 * → "다람쥐를 뿌려라고 하면"처럼 말을 옮기는 것은 아니다. 명령("/w …")처럼 /로 시작하는 줄도 아니다
 */
export function isSquirrelRainChat(text: unknown): boolean {
  if (typeof text !== "string" || text.length > 1_000) return false;
  const s = text.normalize("NFC").replace(GAP_RE, "");
  if (s.startsWith("/")) return false;
  for (let i = s.indexOf(SQUIRREL_RAIN_PHRASE); i >= 0; i = s.indexOf(SQUIRREL_RAIN_PHRASE, i + 1)) {
    const rest = s.slice(i + SQUIRREL_RAIN_PHRASE.length);
    const fill = FILLER_RE.exec(rest)?.[0] ?? "";
    if (fill.length === rest.length || STOP_RE.test(fill)) return true;
  }
  return false;
}

/** 채널 쿨다운: last = 마지막으로 쏟아진 시각 (없으면 -Infinity) */
export function squirrelRainReady(last: number, now: number): boolean {
  return now - last >= SQUIRREL_RAIN_COOLDOWN_MS;
}
