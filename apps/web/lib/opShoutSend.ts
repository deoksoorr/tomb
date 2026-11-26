import { nanoid } from "nanoid";
import { sayAll } from "./ban";
import { HttpError } from "./http";
import { checkMegaphoneText } from "./megaphone";
import { OP_SHOUT_GAP_MS, OP_SHOUT_NAME, OP_SHOUT_PREFIX, type OpShoutResponse } from "./opShout";
import { getMegaphone } from "./store";

// 11/26 운영자 외치기 보내기 (서버). 관리자 화면(/api/admin/shout)과 게임 운영자 계정(/api/staff/shout)이 같이 쓴다.
// 확성기 기록(getMegaphone().push)·채팅 기록·신고·계정 기록·분석 어디에도 넣지 않는다. 남는 것은 간격 표시(확성기 도배 제한과 같은 키 모양, 5초 뒤 사라짐)뿐

/** 간격 표시 키 (계정 id에 쓰지 않는 글자 ~로 시작 — 계정 확성기 간격과 겹치지 않는다) */
export const OP_SHOUT_COOL_KEY = "~opshout";

/** 글 검사(확성기와 같은 60자·링크·금칙어·반복 — 「운영자」「관리자」 같은 운영 낱말만 허용) → 5초 간격 → 사람이 있는 모든 채널에 지금 띄운다 */
export async function sendOpShout(raw: unknown, now = Date.now()): Promise<OpShoutResponse> {
  const checked = checkMegaphoneText(raw, { staffWords: true });
  if (!checked.ok) throw new HttpError(400, "INVALID_INPUT", checked.reason.replace("확성기는", "운영자 외치기는"));
  const store = getMegaphone();
  const wait = await store.cooldown(OP_SHOUT_COOL_KEY, OP_SHOUT_GAP_MS, now);
  if (wait > 0) throw new HttpError(429, "RATE_LIMITED", `${Math.ceil(wait / 1000)}초 뒤에 다시 외칠 수 있어요.`);
  const sent = await sayAll({ id: `${OP_SHOUT_PREFIX}${nanoid(10)}`, name: OP_SHOUT_NAME, text: checked.text, at: now });
  if (sent === null) {
    // 못 보냈으면 간격을 풀어 바로 다시 보낼 수 있게
    await store.releaseCooldown(OP_SHOUT_COOL_KEY);
    throw new HttpError(502, "REALTIME_UNREACHABLE", "실시간 서버에 닿지 못했어요. 잠시 뒤에 다시 외쳐 주세요.");
  }
  return { sent, text: checked.text };
}
