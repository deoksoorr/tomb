import { isStaff } from "../staff";

// 테스트 서버 슈퍼 계정 (스킬 트리를 전부 찍어 보는 검수용).
// 운영이 아닌 배포(Vercel 미리보기·개발, 로컬 개발·테스트)에서, 운영자(staff)로 지정된 계정만:
//  - 스킬 포인트: 모든 스킬을 최대 랭크까지 찍을 만큼 (ALL_SKILLS_POINTS)
//  - 사냥 레벨: 최대 레벨로 취급 (능력치 계산·사냥터 잠금·판 기록) — 저장된 레벨·EXP는 그대로
//  - 스킬·능력치 초기화: 비용은 보통 계정과 같고(지갑이 늘 채워진다), 횟수만 세지 않는다
// 운영 서버(VERCEL_ENV=production)에서는 절대 켜지지 않는다. VERCEL_ENV가 없는데 NODE_ENV=production인 빌드(다른 곳에 올린 운영)도 끈다.

type EnvLike = Partial<Record<"VERCEL_ENV" | "NODE_ENV", string | undefined>>;

/** 운영이 아닌 서버인가 (슈퍼 계정을 켜도 되는 곳) */
export function testServerEnv(e: EnvLike = process.env): boolean {
  const v = e.VERCEL_ENV?.trim();
  if (v === "production") return false;
  if (v === "preview" || v === "development") return true;
  if (v) return false;
  return e.NODE_ENV !== "production";
}

/** 이 계정이 지금 슈퍼 계정인가 (테스트 서버 + 운영자 계정) */
export async function isSuperHunter(acct: string, e: EnvLike = process.env): Promise<boolean> {
  if (!testServerEnv(e)) return false;
  return isStaff(acct);
}
