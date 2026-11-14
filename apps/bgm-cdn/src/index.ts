// 배경음악 배달: R2 버킷의 mp3 를 그대로 내준다. 이어 받기(Range)·캐시·CORS(WebAudio 연결용, 공개 파일이라 *)만 처리한다.
// 곡 파일 이름은 곡마다 달라 한 번 올리면 바뀌지 않으므로 1년 캐시(immutable).

interface Env {
  BGM: R2Bucket;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("허용되지 않은 요청", { status: 405, headers: CORS });
    const key = decodeURIComponent(new URL(req.url).pathname.slice(1));
    // 곡 파일만 (목록 보기·다른 경로 없음)
    if (!/^[a-z0-9-]+\/[a-z0-9._-]+\.mp3$/.test(key)) return new Response("없는 곡", { status: 404, headers: CORS });

    const range = req.headers.get("range");
    // 이어 받기가 아닌 통째 요청은 Cloudflare 캐시에서 먼저 찾는다 (R2 읽기 횟수 절약)
    const cache = caches.default;
    if (!range && req.method === "GET") {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    const obj = await env.BGM.get(key, range ? { range: req.headers } : undefined);
    if (!obj) return new Response("없는 곡", { status: 404, headers: CORS });

    const headers = new Headers(CORS);
    obj.writeHttpMetadata(headers);
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Accept-Ranges", "bytes");
    headers.set("ETag", obj.httpEtag);
    const body = req.method === "HEAD" ? null : (obj as R2ObjectBody).body;
    if (range && obj.range && "offset" in obj.range) {
      const offset = obj.range.offset ?? 0;
      const length = obj.range.length ?? obj.size - offset;
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
      headers.set("Content-Length", String(length));
      return new Response(body, { status: 206, headers });
    }
    headers.set("Content-Length", String(obj.size));
    const res = new Response(body, { status: 200, headers });
    if (req.method === "GET") ctx.waitUntil(cache.put(req, res.clone()));
    return res;
  },
};
