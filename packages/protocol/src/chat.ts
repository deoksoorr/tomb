// 말풍선 자유 채팅 (클라이언트·실시간 서버 공용).
// - 쓴 글은 머리 위 말풍선 + 채팅창에 뜬다. 서버는 같은 채널·방에 중계하고, 늦게 온 사람을 위해 방별 최근 1분(최대 50줄)만
//   메모리에 들고 있다가 버린다 (디스크·스토리지에는 저장하지 않는다)
// - 서버가 가려서(maskChat) 내보낸다. 클라이언트도 같은 함수로 내 화면 미리보기를 가린다
// - 도배 제한: 토큰 버킷 (최대 CHAT_BURST개 저장, CHAT_REFILL_MS마다 1개 충전 — 짧은 대답 몇 번은 연달아 쳐도 된다)

/** 한 번에 보낼 수 있는 글자 수 (코드 포인트 기준) */
export const CHAT_MAX = 60;
/** 말풍선이 떠 있는 시간 */
export const CHAT_SHOW_MS = 5_000;
/** 토큰 버킷: 모아 둘 수 있는 최대 개수 */
export const CHAT_BURST = 3;
/** 토큰 버킷: 1개 충전 간격 */
export const CHAT_REFILL_MS = 1_000;
/** 서버가 방별로 들고 있는 최근 채팅 시간 (이보다 오래된 줄은 꺼낼 때 버린다) */
export const CHAT_RECENT_MS = 300_000;
/** 서버가 방별로 들고 있는 최근 채팅 최대 줄 수 */
export const CHAT_RECENT_MAX = 150;

/** 방에 들어올 때 받는 최근 채팅 한 줄 (S2C chatLog). at = 서버 시각 ms, mine = 내가 쓴 줄 */
/** staff = 운영자(대장)가 쓴 줄 → 채팅창 이름 금색 */
export type ChatLogLine = { id: string; at: number; name: string; text: string; mine?: true; staff?: true };

/** 가린 자리 */
export const CHAT_MASK = "***";

// ── 정리·검증 ──

// 제로폭·방향 제어 문자 (보이지 않는 글자로 거르기를 피하지 못하게 지운다)
const INVISIBLE_RE = new RegExp("[\\u00ad\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]", "g");
// 줄바꿈·탭 등 제어문자 → 공백
const CONTROL_RE = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]", "g");

/** 보낼 글 정리: NFC, 보이지 않는 글자 제거, 공백 한 칸, 앞뒤 공백 제거. 비었거나 CHAT_MAX를 넘으면 null */
export function normalizeChat(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > CHAT_MAX * 4) return null;
  const s = raw.normalize("NFC").replace(INVISIBLE_RE, "").replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return [...s].length <= CHAT_MAX ? s : null;
}

// ── 도배 제한 (토큰 버킷) ──

export type ChatBucket = { tokens: number; at: number };

export const newChatBucket = (): ChatBucket => ({ tokens: CHAT_BURST, at: -Infinity });

/** 한 번 보내도 되면 토큰을 하나 쓰고 true. 모자라면 false (버킷은 충전만 반영) */
export function takeChatToken(b: ChatBucket, now: number): boolean {
  if (Number.isFinite(b.at)) b.tokens = Math.min(CHAT_BURST, b.tokens + Math.max(0, now - b.at) / CHAT_REFILL_MS);
  else b.tokens = CHAT_BURST;
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// ── 욕설·비하어 가리기 ──

/**
 * 한글 음절로 쓴 낱말 (자모로 풀어 비교한다 → "ㅆㅣㅂㅏㄹ"처럼 풀어 쓴 것도 걸린다).
 * 흔한 낱말 속에 들어 있는 것(새끼 고양이·보지 마·자지 마·시바견 등)은 일부러 뺐다
 */
const SYLLABLE_WORDS = [
  "시발", "씨발", "씨빨", "시빨", "씨바", "씨팔", "시팔", "씌발", "쓰발", "쉬발", "슈발", "씨벌", "시벌", "씨부랄", "ㅅ발", "ㅆ발",
  "병신", "븅신", "빙신", "병싄", "좆", "좇같", "존나", "졸라", "존내", "좃나", "지랄", "ㅈ랄",
  "개새", "개색", "개섀", "개세끼", "개쉐", "개씹", "개년", "새끼야", "씹새", "씹년", "씹놈", "씹할", "씹창", "썅년", "쌍년", "쌍놈",
  "니미", "느금", "느개비", "니애미", "니애비", "엠창", "엄창", "미친놈", "미친년", "미친새", "엿먹", "엿같",
  "섹스", "창녀", "걸레년", "한남충", "김치녀", "된장녀", "맘충", "틀딱", "급식충", "짱깨", "쪽바리", "깜둥이", "니거",
  "fuck", "fck", "fuk", "shit", "bitch", "cunt", "nigger", "nigga", "pussy", "asshole", "sex",
];
/** 자음만으로 쓴 줄임말 (낱자 자모끼리만 비교한다 → "갓반"·"옷발" 같은 음절 속 자모에는 걸리지 않는다) */
const JAMO_WORDS = ["ㅅㅂ", "ㅆㅂ", "ㅂㅅ", "ㅄ", "ㅈㄹ", "ㅈㄴ", "ㅁㅊ", "ㅅㄲ", "ㄱㅅㄲ", "ㅗㅗ"];
/** 숫자를 섞은 변형 (숫자를 글자로 두고 비교한다) */
const DIGIT_WORDS = ["시8", "씨8", "ㅅ8", "ㅆ8", "18놈", "18년", "18새", "개18"];

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

const isSyllable = (c: number) => c >= 0xac00 && c <= 0xd7a3;
const isJamo = (c: number) => c >= 0x3131 && c <= 0x318e;
const isLatin = (ch: string) => /^[a-z]$/i.test(ch);
const isDigit = (ch: string) => ch >= "0" && ch <= "9";

/** 한 글자 → 자모 목록 (한글 음절만 풀고 나머지는 그대로) */
function jamoOf(ch: string): string[] {
  const c = ch.charCodeAt(0);
  if (!isSyllable(c)) return [ch.toLowerCase()];
  const i = c - 0xac00;
  const out = [CHO[Math.floor(i / 588)], JUNG[Math.floor((i % 588) / 28)]];
  const jong = JONG[i % 28];
  if (jong) out.push(jong);
  return out;
}

const wordJamo = (w: string) => [...w].flatMap(jamoOf).join("");
const SYLLABLE_PATTERNS = SYLLABLE_WORDS.map(wordJamo);
const DIGIT_PATTERNS = DIGIT_WORDS.map(wordJamo);

/** 비교용 한 칸: 자모(또는 영문·숫자) 하나와 원문 위치, 그 글자의 첫·끝 칸인지 */
type Cell = { j: string; i: number; first: boolean; last: boolean };
type Mode = "syllable" | "jamo" | "digit" | "one";

/**
 * 공백으로 나눈 조각 중 한 글자짜리가 이어지면("시 발", "ㅅ ㅂ") 붙여서 본다.
 * 두 글자 이상 조각 사이의 공백은 경계로 남긴다 ("다시 발표"가 걸리지 않게)
 */
function cellsOf(text: string, mode: Mode): Cell[][] {
  const chars: { ch: string; i: number }[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    chars.push({ ch, i });
    i += ch.length;
  }
  // 공백 기준 조각
  const tokens: { ch: string; i: number }[][] = [];
  let cur: { ch: string; i: number }[] = [];
  for (const c of chars) {
    if (/\s/.test(c.ch)) {
      if (cur.length) tokens.push(cur);
      cur = [];
    } else cur.push(c);
  }
  if (cur.length) tokens.push(cur);
  // 한 글자(기호 빼고) 조각끼리는 이어 붙인다
  const letters = (t: { ch: string }[]) => t.filter((c) => isSyllable(c.ch.charCodeAt(0)) || isJamo(c.ch.charCodeAt(0)) || isLatin(c.ch) || isDigit(c.ch)).length;
  const groups: { ch: string; i: number }[][] = [];
  let prevSingle = false;
  for (const t of tokens) {
    const single = letters(t) <= 1;
    if (single && prevSingle && groups.length) groups[groups.length - 1].push(...t);
    else groups.push([...t]);
    prevSingle = single;
  }

  const out: Cell[][] = [];
  for (const g of groups) {
    let run: Cell[] = [];
    const flush = () => {
      if (run.length) out.push(run);
      run = [];
    };
    for (const { ch, i } of g) {
      const c = ch.charCodeAt(0);
      if (isSyllable(c)) {
        if (mode === "jamo") {
          flush(); // 음절은 자음 줄임말의 경계
          continue;
        }
        const js = jamoOf(ch);
        js.forEach((j, k) => run.push({ j, i, first: k === 0, last: k === js.length - 1 }));
      } else if (isJamo(c)) {
        run.push({ j: ch, i, first: true, last: true });
      } else if (isLatin(ch)) {
        if (mode === "jamo") {
          flush();
          continue;
        }
        run.push({ j: ch.toLowerCase(), i, first: true, last: true });
      } else if (isDigit(ch)) {
        // 숫자: digit 모드는 글자로, one 모드는 1 → ㅣ, 나머지는 끼워 넣은 기호처럼 건너뛴다
        if (mode === "digit") run.push({ j: ch, i, first: true, last: true });
        else if (mode === "one" && ch === "1") run.push({ j: "ㅣ", i, first: true, last: true });
      }
      // 그 밖의 기호(. - _ * ♡ 등)는 건너뛴다 ("시.발", "f*u*c*k")
    }
    flush();
  }
  return out;
}

/** 원문에서 가릴 [시작, 끝) 구간들 */
function profanitySpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const scan = (mode: Mode, patterns: readonly string[]) => {
    for (const run of cellsOf(text, mode)) {
      const s = run.map((c) => c.j).join("");
      for (const p of patterns) {
        let from = 0;
        for (;;) {
          const k = s.indexOf(p, from);
          if (k < 0) break;
          from = k + 1;
          const a = run[k];
          const b = run[k + p.length - 1];
          // 글자 경계에서 시작·끝나야 한다 ("옷발"의 받침 ㅅ, "시바라"의 첫소리 ㄹ로는 걸리지 않게)
          if (!a.first || !b.last) continue;
          // 숫자로 시작·끝나는 변형은 앞뒤가 숫자면 다른 수다 ("2018년", "시80")
          if (mode === "digit" && ((isDigit(p[0]) && isDigit(run[k - 1]?.j ?? "")) || (isDigit(p[p.length - 1]) && isDigit(run[k + p.length]?.j ?? "")))) continue;
          const end = b.i + String.fromCodePoint(text.codePointAt(b.i)!).length;
          spans.push([a.i, end]);
        }
      }
    }
  };
  scan("syllable", SYLLABLE_PATTERNS);
  scan("one", SYLLABLE_PATTERNS);
  scan("jamo", JAMO_WORDS);
  scan("digit", DIGIT_PATTERNS);
  return spans;
}

// ── 주소·전화번호 ──

const TLDS = "com|net|org|kr|co|io|me|gg|xyz|app|dev|ly|to|tv|link|shop|site|info|biz|cc|jp|cn|us|kakao";
/** http, www, 그리고 도메인 모양 (naver.com, open.kakao.com/o/abc) */
const URL_RES = [
  /(?:https?:\/\/|www\.)\S*/gi,
  new RegExp(`[a-z0-9가-힣-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?![a-z0-9])(?:\\/\\S*)?`, "gi"),
  // 띄어 쓰거나 쉼표로 피한 것 ("naver . com", "naver,com") — 흔한 끝말만
  /[a-z0-9-]+\s*[.,。]\s*(?:com|net|org|kr)(?![a-z0-9])(?:\/\S*)?/gi,
  // 한글로 쓴 끝말 ("네이버 닷컴")
  /\S*\s*(?:닷컴|닷넷|닷케이알|쩜컴|점컴)/g,
];
/** 숫자 9개 이상이 띄어쓰기·-·. 로 이어진 것 (전화번호 모양) */
const PHONE_RE = /\+?\d(?:[\s.\-)(]*\d){8,}/g;

function patternSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const re of [...URL_RES, PHONE_RE]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

/** 욕설·비하어(흔한 변형 포함)·주소·전화번호 모양을 CHAT_MASK로 가린다. 가릴 게 없으면 그대로 */
export function maskChat(text: string): string {
  const spans = [...profanitySpans(text), ...patternSpans(text)].sort((a, b) => a[0] - b[0]);
  if (spans.length === 0) return text;
  // 겹치거나 맞닿은 구간은 하나로
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  let out = "";
  let at = 0;
  for (const [a, b] of merged) {
    out += text.slice(at, a) + CHAT_MASK;
    at = b;
  }
  return out + text.slice(at);
}
