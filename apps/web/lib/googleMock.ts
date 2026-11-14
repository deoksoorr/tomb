import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { env } from "./env";
import { HttpError } from "./http";
import { MOCK_ISSUER } from "./googleAuth";

// 로컬 개발 전용 모의 구글 (GOOGLE_MOCK=1, 운영 빌드에서는 404). 진짜 구글과 같은 순서로 동의 → 인가 코드 → 토큰 → 공개키를 흉내 낸다.
// 키·인가 코드는 이 프로세스 메모리에만 있다. 모의 구글의 고유 번호는 진짜 구글과 다른 이름표로 해시된다(lib/googleAuth.ts subHash).

export const MOCK_KID = "mock-key-1";
const CODE_TTL_MS = 5 * 60_000;

type MockCode = { sub: string; nonce: string; challenge: string; clientId: string; redirectUri: string; exp: number };
type MockState = { privateKey: KeyObject; publicJwk: Record<string, unknown>; codes: Map<string, MockCode> };
const g = globalThis as typeof globalThis & { __tombGoogleMock?: MockState };

export function assertMock(): void {
  if (!env.googleMock()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
}

function state(): MockState {
  if (g.__tombGoogleMock) return g.__tombGoogleMock;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  return (g.__tombGoogleMock = { privateKey, publicJwk: { ...jwk, kid: MOCK_KID, alg: "RS256", use: "sig" }, codes: new Map() });
}

export const mockJwks = () => ({ keys: [state().publicJwk] });

/** RS256 JWT 서명 (시험에서도 쓴다) */
export function signJwt(privateKey: KeyObject, kid: string, payload: Record<string, unknown>): string {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url")}`;
}

/** 동의함 → 인가 코드 */
export function issueMockCode(c: Omit<MockCode, "exp">, now = Date.now()): string {
  const code = randomBytes(24).toString("base64url");
  state().codes.set(code, { ...c, exp: now + CODE_TTL_MS });
  return code;
}

/** 인가 코드 → id_token. 코드는 한 번만, PKCE·클라이언트·돌아올 주소가 모두 맞아야 한다 */
export function redeemMockCode(
  p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string },
  expected: { clientId: string; clientSecret: string },
  now = Date.now(),
): string | null {
  const s = state();
  const c = s.codes.get(p.code);
  s.codes.delete(p.code);
  if (!c || c.exp < now) return null;
  if (p.clientId !== expected.clientId || p.clientSecret !== expected.clientSecret || p.clientId !== c.clientId) return null;
  if (p.redirectUri !== c.redirectUri) return null;
  if (createHash("sha256").update(p.verifier).digest("base64url") !== c.challenge) return null;
  const iat = Math.floor(now / 1000);
  return signJwt(s.privateKey, MOCK_KID, { iss: MOCK_ISSUER, aud: c.clientId, azp: c.clientId, sub: c.sub, nonce: c.nonce, iat, exp: iat + 3600 });
}
