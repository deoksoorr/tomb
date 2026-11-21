import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env";

// 11/20 로컬 개발 전용: 로컬 운영자(devStaffSeed DEV_STAFF_ID)의 사냥 캐릭터(능력치 배분·장비·단축키 등)를 파일에 남겨
// 로컬 서버를 다시 켜도 그대로 (사용자 「스탯 찍기 귀찮다, 재시작하면 초기화된다」). 운영·Redis·테스트에서는 아무것도 하지 않는다.
// 파일: apps/web/.local-dev/devstaff-rpg.json (git 제외)

const ID = "devstaff-local-moon01";
const DIR = join(process.cwd(), ".local-dev");
const FILE = join(DIR, "devstaff-rpg.json");

const on = () => !env.isProd() && !env.redis() && !process.env.VITEST;

/** 메모리 사냥 저장소가 캐릭터를 쓸 때마다 부른다 (로컬 운영자만 파일로) */
export function devRpgSave(acct: string, state: unknown): void {
  if (acct !== ID || !on()) return;
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(state));
  } catch {
    // 로컬 편의 기능이라 실패해도 그냥 넘어간다
  }
}

/** 저장해 둔 로컬 운영자 캐릭터 (없으면 null) */
export function devRpgLoad<T>(): T | null {
  if (!on()) return null;
  try {
    return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as T) : null;
  } catch {
    return null;
  }
}
