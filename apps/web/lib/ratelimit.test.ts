import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./ratelimit";

const req = (ip: string) => new NextRequest("http://localhost/api/graves", { headers: { "x-forwarded-for": ip } });

describe("rateLimit operator exemption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks a normal IP after the daily grave limit", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("grave", req("203.0.113.7"), `v${i}`);
    await expect(rateLimit("grave", req("203.0.113.7"), "v9")).rejects.toMatchObject({ status: 429 });
  });

  it("never limits an IP listed in ADMIN_ALLOWED_IPS", async () => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", "198.51.100.4");
    for (let i = 0; i < 10; i++) await rateLimit("grave", req("198.51.100.4"), "same-visitor");
  });

  it("does not exempt anyone when ADMIN_ALLOWED_IPS is unset (local)", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("grave", req("127.0.0.1"), `l${i}`);
    await expect(rateLimit("grave", req("127.0.0.1"), "l9")).rejects.toMatchObject({ status: 429 });
  });
});
