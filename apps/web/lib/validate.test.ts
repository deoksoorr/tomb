import { afterEach, describe, expect, it, vi } from "vitest";
import { todayKst } from "./epitaph";
import { createGraveSchema, GraveInputSchema, JoinRequestSchema, quickLifespan, QuickGraveInputSchema } from "./validate";

const base = {
  name: "  동네 맛집 지도  ",
  epitaph: "향년 3일, 로그인 구현 중 별세",
  bornAt: "2024-01-01",
  diedAt: "2024-01-03",
  lastTask: "로그인 구현",
  causes: ["time", "time", "interest"],
  mourner: " 새벽코더 ",
};

const parse = (over: Record<string, unknown> = {}) => GraveInputSchema.safeParse({ ...base, ...over });
const message = (over: Record<string, unknown>) => parse(over).error?.issues[0]?.message;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GraveInputSchema", () => {
  it("정상 입력: 공백 정리, 사인 중복 제거, 향년은 서버가 계산", () => {
    const r = parse({ ageDays: 999 });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ name: "동네 맛집 지도", mourner: "새벽코더", causes: ["time", "interest"], ageDays: 3 });
  });

  it("선택 필드의 빈 값('' / null)은 없는 것으로 본다", () => {
    const r = parse({ lastTask: "", causeDetail: null, links: ["", " "], stack: [], imageUrl: "" });
    expect(r.success).toBe(true);
    for (const k of ["lastTask", "causeDetail", "links", "stack", "imageUrl"]) expect(r.data?.[k as "links"]).toBeUndefined();
  });

  it("프로젝트 이름: 필수, 40자(코드포인트 기준)까지, 줄바꿈은 공백으로", () => {
    expect(message({ name: "   " })).toBe("프로젝트 이름을 적어 주세요.");
    expect(parse({ name: "가".repeat(40) }).success).toBe(true);
    expect(parse({ name: "🪦".repeat(40) }).success).toBe(true);
    expect(message({ name: "가".repeat(41) })).toBe("프로젝트 이름은 40자까지 적을 수 있어요.");
    expect(parse({ name: "한 줄\n두 줄" }).data?.name).toBe("한 줄 두 줄");
  });

  it("묘비명: 필수, 30자까지", () => {
    expect(message({ epitaph: "" })).toBe("묘비명을 적어 주세요.");
    expect(parse({ epitaph: "가".repeat(30) }).success).toBe(true);
    expect(message({ epitaph: "가".repeat(31) })).toBe("묘비명은 30자까지 적을 수 있어요.");
  });

  it("날짜: 형식·실재 날짜·사망일 ≥ 탄생일·미래 불가(KST)", () => {
    expect(message({ bornAt: "2024-1-01" })).toBe("날짜는 YYYY-MM-DD 형식으로 적어 주세요.");
    expect(message({ diedAt: "2023-02-29" })).toBe("날짜는 YYYY-MM-DD 형식으로 적어 주세요.");
    expect(message({ bornAt: "2024-01-04" })).toBe("사망일은 탄생일보다 빠를 수 없어요.");
    expect(parse({ bornAt: "2024-01-03" }).data?.ageDays).toBe(1);

    const today = todayKst();
    const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
    expect(parse({ diedAt: today }).success).toBe(true);
    expect(message({ diedAt: tomorrow })).toBe("미래 날짜는 고를 수 없어요.");
  });

  it("마지막으로 하던 일 20자, 사인 상세 200자", () => {
    expect(parse({ lastTask: "가".repeat(20) }).success).toBe(true);
    expect(message({ lastTask: "가".repeat(21) })).toBe("마지막으로 하던 일은 20자까지 적을 수 있어요.");
    expect(parse({ causeDetail: "가\n".repeat(100) }).success).toBe(true);
    expect(message({ causeDetail: "가".repeat(201) })).toBe("사인 상세는 200자까지 적을 수 있어요.");
  });

  it("사인: 하나 이상, 정해진 태그만", () => {
    expect(message({ causes: [] })).toBe("사인을 하나 이상 골라 주세요.");
    expect(message({ causes: ["boredom"] })).toBe("알 수 없는 사인이에요.");
    expect(parse({ causes: undefined }).success).toBe(false);
  });

  it("링크: http(s)만, 3개까지", () => {
    expect(parse({ links: ["https://a.com", "http://b.com/x?y=1"] }).success).toBe(true);
    expect(message({ links: ["javascript:alert(1)"] })).toBe("링크는 http:// 또는 https:// 주소만 넣을 수 있어요.");
    expect(message({ links: ["ftp://a.com"] })).toBe("링크는 http:// 또는 https:// 주소만 넣을 수 있어요.");
    expect(message({ links: ["a.com"] })).toBe("링크는 http:// 또는 https:// 주소만 넣을 수 있어요.");
    expect(message({ links: ["https://a.com", "https://b.com", "https://c.com", "https://d.com"] })).toBe(
      "링크는 3개까지 넣을 수 있어요.",
    );
  });

  it("기술 스택: 5개까지, 태그당 20자, 중복 제거", () => {
    expect(parse({ stack: ["Go", "Go", " Rust "] }).data?.stack).toEqual(["Go", "Rust"]);
    expect(message({ stack: ["a", "b", "c", "d", "e", "f"] })).toBe("기술 스택은 5개까지 넣을 수 있어요.");
    expect(message({ stack: ["가".repeat(21)] })).toBe("기술 스택 태그는 20자까지 적을 수 있어요.");
  });

  it("이미지: 이 프로젝트 Blob 스토어의 graves/<업로더>/ 아래, 또는 (개발 중) 로컬 업로드 경로만", () => {
    const hash = "0123456789abcdef";
    const local = `/api/upload/local/graves/${hash}/abcdefABCDEF.webp`;
    const blob = `https://abc123xyz.public.blob.vercel-storage.com/graves/${hash}/shot-Ab12Cd.webp`;
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(parse({ imageUrl: local }).success).toBe(true);
    expect(parse({ imageUrl: blob }).success).toBe(false); // 스토어를 모르면 Blob 주소는 받지 않는다

    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_AbC123xyz_secretSecret");
    expect(parse({ imageUrl: blob }).success).toBe(true);
    for (const bad of [
      `https://otherstore.public.blob.vercel-storage.com/graves/${hash}/a.webp`,
      `https://abc123xyz.public.blob.vercel-storage.com.evil.com/graves/${hash}/a.webp`,
      `https://abc123xyz.public.blob.vercel-storage.com/avatars/${hash}/a.webp`,
      `https://abc123xyz.public.blob.vercel-storage.com/graves/a.webp`,
      `http://abc123xyz.public.blob.vercel-storage.com/graves/${hash}/a.webp`,
      "https://evil.com/a.webp",
      `/api/upload/local/graves/${hash}/../x.webp`,
      "/api/upload/local/abcdefABCDEF",
    ])
      expect(message({ imageUrl: bad }), bad).toBe("업로드한 이미지만 쓸 수 있어요.");

    vi.stubEnv("NODE_ENV", "production");
    expect(parse({ imageUrl: local }).success).toBe(false);
    expect(parse({ imageUrl: blob }).success).toBe(true);

    // OIDC 방식: 토큰 없이 BLOB_STORE_ID(`store_` 접두사, 대소문자 섞임)만 있어도 같은 호스트를 계산한다
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_AbC123xyz");
    expect(parse({ imageUrl: blob }).success).toBe(true);
    expect(parse({ imageUrl: blob.replace("abc123xyz", "other") }).success).toBe(false);
  });

  it("상주: 유저이름 규칙(2~12자, 허용 문자, 금칙어)", () => {
    expect(message({ mourner: "가" })).toBe("이름은 2~12자로 지어 주세요.");
    expect(message({ mourner: "관리자님" })).toBe("쓸 수 없는 단어가 들어 있어요.");
    expect(message({ mourner: "<script>" })).toBe("한글, 영문, 숫자, 공백, _ 만 쓸 수 있어요.");
    expect(message({ mourner: undefined })).toBeTruthy();
  });
});

describe("JoinRequestSchema", () => {
  const join = { channel: "auto", name: "새벽코더", color: "#9fc5a8" };

  it("auto 또는 1~99 정수 채널", () => {
    expect(JoinRequestSchema.safeParse(join).success).toBe(true);
    expect(JoinRequestSchema.safeParse({ ...join, channel: 7 }).data?.channel).toBe(7);
    for (const channel of [0, 100, 1.5, "1", null])
      expect(JoinRequestSchema.safeParse({ ...join, channel }).success, String(channel)).toBe(false);
  });

  it("이름 규칙과 아바타 색 프리셋을 지킨다", () => {
    expect(JoinRequestSchema.safeParse({ ...join, name: "  새벽   코더 " }).data?.name).toBe("새벽 코더");
    expect(JoinRequestSchema.safeParse({ ...join, name: "fuck" }).success).toBe(false);
    expect(JoinRequestSchema.safeParse({ ...join, color: "#000000" }).error?.issues[0]?.message).toBe(
      "고를 수 있는 색이 아니에요.",
    );
  });
});

describe("간단 묘비 입력", () => {
  it("얼마나 살았나요 → 날짜 (사망일 = KST 오늘, 향년 = 고른 날수, 달·윤년 경계 포함)", () => {
    expect(quickLifespan("day", "2026-11-08")).toEqual({ bornAt: "2026-11-08", diedAt: "2026-11-08", ageDays: 1 });
    expect(quickLifespan("week", "2026-03-03")).toEqual({ bornAt: "2026-02-25", diedAt: "2026-03-03", ageDays: 7 });
    expect(quickLifespan("month", "2024-03-01")).toEqual({ bornAt: "2024-02-01", diedAt: "2024-03-01", ageDays: 30 });
    expect(quickLifespan("year", "2026-01-01")).toEqual({ bornAt: "2025-01-02", diedAt: "2026-01-01", ageDays: 365 });
    for (const lived of ["season", "half", "years"] as const) {
      const r = quickLifespan(lived, "2026-11-08");
      expect(GraveInputSchema.safeParse({ ...base, ...r }).data?.ageDays).toBe(r.ageDays);
    }
  });

  it("기본값: 묘비명 `향년 {N}일, 조용히 별세`, 사인 기타, 선택 필드 없음", () => {
    const r = QuickGraveInputSchema.parse({ name: " 할 일 앱 ", lived: "week", mourner: "새벽코더" });
    expect(r).toMatchObject({ name: "할 일 앱", epitaph: "향년 7일, 조용히 별세", causes: ["other"], ageDays: 7, diedAt: todayKst() });
    expect(r.links).toBeUndefined();
    expect(QuickGraveInputSchema.parse({ name: "a", lived: "day", cause: "time", epitaph: "짧았다", mourner: "새벽코더" })).toMatchObject({
      epitaph: "짧았다",
      causes: ["time"],
    });
  });

  it("lived가 있으면 간단 입력, 없으면 전체 입력으로 검증한다", () => {
    expect(createGraveSchema({ lived: "day" })).toBe(QuickGraveInputSchema);
    expect(createGraveSchema({ name: "x" })).toBe(GraveInputSchema);
    expect(createGraveSchema(null)).toBe(GraveInputSchema);
  });
});
