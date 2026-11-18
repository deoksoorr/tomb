import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./ratelimit";

const req = (ip: string) => new NextRequest("http://localhost/api/graves", { headers: { "x-forwarded-for": ip } });

describe("rateLimit operator exemption", () => {
  afterEach(() => vi.unstubAllEnvs());

  // 11/18 한 IP에 여럿(회사 팀)이 있어도 계정마다 따로 센다 — 같은 방문자만 하루 한도에 걸린다
  it("blocks a visitor after the daily grave limit, but not others on the same IP", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("grave", req("203.0.113.7"), "v0");
    await expect(rateLimit("grave", req("203.0.113.7"), "v0")).rejects.toMatchObject({ status: 429 });
    for (let i = 1; i < 30; i++) await rateLimit("grave", req("203.0.113.7"), `v${i}`);
  });

  it("never limits an IP listed in ADMIN_ALLOWED_IPS", async () => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", "198.51.100.4");
    for (let i = 0; i < 10; i++) await rateLimit("grave", req("198.51.100.4"), "same-visitor");
  });

  it("does not exempt anyone when ADMIN_ALLOWED_IPS is unset (local)", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("grave", req("127.0.0.1"), "l0");
    await expect(rateLimit("grave", req("127.0.0.1"), "l0")).rejects.toMatchObject({ status: 429 });
  });
});
