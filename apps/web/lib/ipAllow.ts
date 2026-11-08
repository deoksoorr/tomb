// 관리자 화면 IP 허용 목록. 순수 함수만 둔다 (proxy.ts와 테스트에서 같이 쓴다).
// 규칙: 쉼표로 구분한 IPv4/IPv6 주소 또는 CIDR. 예) "58.233.55.38, 10.0.0.0/8, 2001:db8::/32"

type Addr = { v: 4 | 6; n: bigint };

function parseV4(s: string): bigint | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = BigInt(0);
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = (n << BigInt(8)) | BigInt(Number(p));
  }
  return n;
}

function parseV6(s: string): bigint | null {
  let groups: string[];
  // 끝이 IPv4 표기면(::ffff:1.2.3.4) 16비트 두 묶음으로 바꾼다
  const v4Tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4Tail) {
    const v4 = parseV4(v4Tail[2]);
    if (v4 === null) return null;
    s = `${v4Tail[1]}${(v4 >> BigInt(16)).toString(16)}:${(v4 & BigInt(0xffff)).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  let n = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << BigInt(16)) | BigInt(parseInt(g, 16));
  }
  return n;
}

const MAPPED_V4_PREFIX = BigInt(0xffff) << BigInt(32);

/** IPv4/IPv6 주소. IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4로 본다. 대괄호·존 id(%eth0)는 떼어 낸다 */
export function parseIp(raw: string): Addr | null {
  const s = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = parseV4(s);
  if (v4 !== null) return { v: 4, n: v4 };
  const v6 = s.includes(":") ? parseV6(s) : null;
  if (v6 === null) return null;
  if (v6 >> BigInt(32) === BigInt(0xffff)) return { v: 4, n: v6 ^ MAPPED_V4_PREFIX };
  return { v: 6, n: v6 };
}

function matchesRule(ip: Addr, rule: string): boolean {
  const [addrPart, prefixPart, extra] = rule.split("/");
  const net = parseIp(addrPart);
  if (!net || net.v !== ip.v || extra !== undefined) return false;
  if (prefixPart !== undefined && !/^\d{1,3}$/.test(prefixPart)) return false;
  const bits = ip.v === 4 ? 32 : 128;
  const prefix = prefixPart === undefined ? bits : Number(prefixPart);
  if (prefix > bits) return false;
  const shift = BigInt(bits - prefix);
  return ip.n >> shift === net.n >> shift;
}

/** ip가 규칙 중 하나에 들면 true. 잘못된 규칙은 무시한다 */
export function ipMatches(ip: string, rules: readonly string[]): boolean {
  const addr = parseIp(ip);
  return !!addr && rules.some((r) => matchesRule(addr, r.trim()));
}

const LOCAL_ONLY = ["127.0.0.1", "::1"];

/**
 * 관리자 접근 허용 여부.
 * 목록이 있으면 그 목록만. 비어 있으면 운영은 전부 차단, 로컬 개발은 루프백(127.0.0.1, ::1)만 허용.
 */
export function isAdminIp(ip: string | null, allowList: string | undefined, isProd: boolean): boolean {
  const rules = allowList?.split(",").map((r) => r.trim()).filter(Boolean) ?? [];
  if (!ip) return false;
  if (rules.length) return ipMatches(ip, rules);
  return !isProd && ipMatches(ip, LOCAL_ONLY);
}
