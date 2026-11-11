import { requireAdmin } from "@/lib/admin";
import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import { getStore } from "@/lib/store";
import type { Grave } from "@/lib/types";

type Step = { step: string; ok: boolean; ms: number; error?: string };

/**
 * 운영 점검: 저장소에 임시 묘비를 실제로 쓰고·읽고·반응하고·지워 보며 단계별 성공 여부를 돌려준다.
 * 묘비 생성이 실패할 때 어느 단계(쓰기, 스크립트, 삭제)에서 막히는지 바로 보이게 한다.
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const store = getStore();
  const id = `hc${Date.now().toString(36)}`;
  const grave: Grave = {
    id,
    name: "상태 점검",
    epitaph: "점검용 임시 묘비",
    bornAt: "2026-01-01",
    diedAt: "2026-01-02",
    ageDays: 2,
    causes: ["other"],
    mourner: "관리자",
    createdAt: Date.now(),
    ownerTokenHash: "healthcheck",
    channel: 1,
  };
  const steps: Step[] = [];
  const run = async (step: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      await fn();
      steps.push({ step, ok: true, ms: Date.now() - t });
    } catch (e) {
      steps.push({ step, ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) });
    }
  };

  await run("put", () => store.put(grave));
  await run("get", async () => {
    if (!(await store.get(id))) throw new Error("방금 쓴 묘비를 읽지 못함");
  });
  await run("list", () => store.list(1));
  await run("flower", () => store.flower(id, "healthcheck"));
  await run("settings", () => store.settings(Date.now()));
  await run("remove", () => store.remove(id));

  return json({
    store: env.redis() ? "redis" : "memory",
    blob: { token: !!process.env.BLOB_READ_WRITE_TOKEN, storeId: !!process.env.BLOB_STORE_ID },
    ok: steps.every((s) => s.ok),
    steps,
  });
});
