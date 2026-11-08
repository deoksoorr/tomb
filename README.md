# 한때는...

> 수많은 시작이 여기 잠들어 있습니다.

끝내지 못한 사이드프로젝트들이 묻힌 공동묘지입니다.

- 방문자는 이름을 정하고 채널에 들어가, 같은 채널의 사람들과 걷고, 달리고, 앉습니다.
- 묘비를 살펴보고 헌화하거나 **"이건 살려주세요"** 를 누를 수 있습니다.
- 누구나 자기 프로젝트의 묘비를 세울 수 있습니다.

```
[브라우저] ──HTTP──▶ [Vercel: Next.js 16]   apps/web
   │                    ├─ 묘비 CRUD / 헌화 / 살려주세요 → Upstash Redis
   │                    ├─ 스크린샷 → Vercel Blob
   │                    └─ /api/join → 서명된 입장 토큰 (HMAC, 60초)
   └──WebSocket──▶ [Cloudflare Worker]      apps/realtime
                        ├─ Lobby DO (1개): 채널별 인원, 채널 목록
                        └─ Channel DO (채널마다 1개): 상한 강제, 위치 동기화, 좌석 점유
packages/protocol: 바이너리 메시지·토큰·맵 레이아웃 (양쪽 공유)
```

## 1. 로컬 실행 (외부 계정 불필요)

```bash
nvm use            # Node 24 (.nvmrc). Node 22 이상이면 된다
npm i
npm run dev        # web(:3000) + realtime(:8787) 동시 실행
```

- 처음에는 목업 묘비 30개가 메모리에 심어진다. 서버를 재시작하면 등록한 묘비는 사라진다.
- 3000 포트가 이미 쓰이고 있으면 `WEB_PORT=3456 npm run dev`로 실행한다. realtime의 허용 Origin도 같은 포트로 따라간다.
- 목업 묘비 수를 바꾸려면 `MOCK_GRAVES=500 npm run dev`로 실행한다(성능 확인용).

QA용 쿼리:

| 쿼리 | 효과 |
|---|---|
| `?debug=1` | 넷 HUD 표시(RTT, 수신 Hz, 접속자, FPS, KB/s) |
| `?time=dawn\|day\|dusk\|night\|0~23` | 시간대를 강제한다 |
| `?weather=clear\|cloudy\|fog\|rain\|snow` | 날씨를 강제한다 |
| `/?grave={id}` | 그 묘비 앞에 스폰하고 상세 모달을 연다(공유 링크) |

검사:

```bash
npm run typecheck && npm run lint && npm test
npm run build      # Next 프로덕션 빌드
```

## 2. 배포 순서

### Cloudflare (실시간 서버) — 먼저 배포해서 주소를 얻는다

1. **플랜을 정한다.** 운영에는 Workers Paid($5/월)를 권장한다. 무료 플랜으로 시작해도 되지만 아래 한도를 알고 시작한다.
   - **무료 플랜 한도(하루):**
     - Durable Objects 요청 10만 건. WebSocket 수신 20건이 요청 1건이므로 메시지 약 200만 건이다.
     - DO 실행 시간 13,000 GB·s.
     - Worker 요청 10만 건.
   - **얼마나 버티나:**
     - 움직이는 사람 1명은 1시간에 약 1,800 요청을 쓴다(10Hz).
     - 가만히 있는 사람은 생존 확인 핑(15초)만 보내서 1시간에 약 12 요청이다.
     - 움직이는 비율 30%로 잡으면 하루 약 180 접속·시간이다. 평균 동시접속 7~8명 수준이다.
   - **한도를 넘으면:**
     - 다음 날 KST 09:00(UTC 자정)까지 실시간 접속이 실패한다.
     - 그동안 게임은 "혼자 걷기" 모드로 계속 동작한다. 묘비 보기·세우기·헌화는 Vercel 쪽이라 영향이 없다.
     - 이런 일이 잦아지면 Workers Paid로 올린다. 코드 변경은 필요 없다.
2. `cd apps/realtime && npx wrangler login`
3. `npx wrangler deploy` → `https://tomb-realtime.<계정>.workers.dev` 주소가 나온다.
4. 시크릿을 넣는다.
   - `npx wrangler secret put JOIN_SECRET`: Vercel과 **같은 값**을 쓴다(`openssl rand -base64 32`).
   - `npx wrangler secret put ALLOWED_ORIGINS`: 웹 주소를 넣는다. 예) `https://example.com,https://www.example.com`
5. (권장) 커스텀 도메인 `rt.{도메인}`을 연결한다. 도메인이 Cloudflare 존에 있어야 한다. `wrangler.toml`의 `routes` 주석을 풀고 다시 배포한다.
   - Cache API(`/lobby` 2초 엣지 캐시)는 workers.dev가 아닌 커스텀 도메인에서만 동작한다.

### Vercel (웹)

1. 프로젝트를 연결하고 **Root Directory를 `apps/web`** 로 지정한다. 모노레포 루트의 npm workspaces를 그대로 설치한다.
2. Storage → **Blob** 스토어를 **Public** 접근으로 만들어 프로젝트에 연결한다. 연결 방식은 둘 중 하나이고, 코드는 둘 다 받는다.
   - OIDC(현재 기본): `BLOB_STORE_ID`와 `BLOB_WEBHOOK_PUBLIC_KEY`가 주입되고, 인증 토큰은 런타임에 Vercel이 OIDC로 준다. 따로 할 일은 없다.
   - 읽기쓰기 토큰: `BLOB_READ_WRITE_TOKEN`이 주입된다. 있으면 이 토큰을 우선 쓴다.
   - 업로드는 두 방식 모두 presigned URL로 브라우저 → Blob에 직접 올라가고, 묘비 이미지는 이 스토어의 `graves/` 아래 주소만 허용한다.
3. Marketplace → **Upstash Redis**를 추가한다. `KV_REST_API_URL`과 `KV_REST_API_TOKEN`이 자동으로 주입된다.
4. 환경변수를 설정한다. 자세한 설명은 `apps/web/.env.example`에 있다.
   - `SESSION_SECRET`, `JOIN_SECRET`(Worker와 같은 값), `ADMIN_KEY`: 모두 32자 이상
   - `NEXT_PUBLIC_REALTIME_URL`: 예) `https://rt.example.com`
   - `ADMIN_ALLOWED_IPS`: 관리자 화면에 들어올 IP (8절). 비워 두면 운영에서는 아무도 못 들어온다.
5. 배포한 웹 주소를 Worker의 `ALLOWED_ORIGINS`에 넣었는지 다시 확인한다.

## 3. 용량 조정

`apps/realtime/wrangler.toml`의 `[vars]` 값을 바꾸고 `npm run deploy -w realtime`으로 재배포한다.

| 변수 | 기본값 | 의미 |
|---|---|---|
| `CHANNEL_CAPACITY` | 40 | 채널당 최대 인원 |
| `MAX_CHANNELS` | 10 | 최대 채널 수 → 전체 동시접속 상한 400명 |
| `AUTO_OPEN_THRESHOLD` | 0.8 | 열린 채널이 모두 이 비율 이상 차면 다음 채널을 연다 |
| `RECONNECT_GRACE_SEC` | 20 | 연결이 끊겨도 이 시간 동안 자리를 유지한다 |

부하 테스트를 다시 돌리는 방법:

```bash
npm run dev -w realtime                       # 로컬 서버
npm run loadtest -w realtime                  # 시나리오 1~3 (약 3분)
JOIN_SECRET=... npm run loadtest -w realtime -- --url wss://rt.example.com --origin https://example.com --channel 10
npm run loadtest -w realtime -- --scenario hold --duration 300   # 봇 39명 상주 → 브라우저로 FPS 측정
```

결과와 측정 방법은 [`LOADTEST.md`](LOADTEST.md)에 있다.

## 4. 비용 추정과 모니터링

평균 동시접속 30명이 하루 종일 머물고, 움직이는 시간 비율이 30%라고 가정한 추정이다.

| 항목 | 계산 | 월 비용 |
|---|---|---|
| 수신 메시지 | 30명 × 10Hz × 0.3 × 86,400초 × 30일 ≈ **2.3억 건** | – |
| DO 요청 환산 | WebSocket 수신 20건 = 요청 1건 → ≈ **1,170만 요청** (기본 포함 100만 초과분 × $0.15/백만) | ≈ **$1.6** |
| 송신 메시지 | 무료 (100ms 틱마다 델타 SNAPSHOT 1개) | $0 |
| DO 실행 시간 | 아무도 움직이지 않으면 틱이 멈추고 hibernate된다. 붐비는 채널 1~2개가 계속 깨어 있다고 보면 128MB × 상시 ≈ 33~66만 GB·s (기본 포함 40만 GB·s) | $0 ~ 약 $3 |
| Workers Paid 기본료 | | $5 |
| **합계** | | **$5 + 몇 달러** |

- Vercel은 Pro 구독에 포함된다. 함수 호출은 묘비 목록(CDN 30초 캐시), 반응, 입장 토큰 정도다.
- Upstash는 반응 1회에 명령 1~2개를 쓰고, 목록 조회는 파이프라인 1회(명령 3개)다.

**어디서 볼까**
- **Cloudflare 대시보드** → Workers & Pages → `tomb-realtime`
  - Metrics: 요청 수, 오류
  - Durable Objects: 요청, 실행 시간(GB·s), 활성 인스턴스
- **Vercel** → Usage(함수 호출, Blob 저장·전송량), Observability(API 오류율)
- **Upstash 콘솔** → 일일 명령 수, 저장 용량

## 5. BGM 넣는 법

- `apps/web/public/bgm/{orgel,lofi,rain}/*.mp3`(128kbps)에 파일을 넣고, `apps/web/public/bgm/tracks.json`에 등록한다. 외부 핫링크는 쓰지 않는다.
- 음원은 **Pixabay Content License** 트랙을 1순위로 쓴다.
- 저작자 표시는 CC-BY 계열만 플레이어 ⓘ에 나온다. `CREDITS.md`에도 기록한다.
- 지금 들어 있는 5곡은 `scripts/gen-bgm.mjs`로 코드 합성한 자체 제작 플레이스홀더(CC0)다. 실제 음원으로 바꾸면 지워도 된다.

```json
{
  "playlists": [
    {
      "id": "orgel",
      "title": "오르골",
      "tracks": [
        { "file": "/bgm/orgel/track.mp3", "title": "곡명", "artist": "작곡가", "sourceUrl": "https://pixabay.com/...", "license": "Pixabay Content License", "durationSec": 142 }
      ]
    }
  ]
}
```

## 6. 실시간 서버를 Vercel이 아닌 Durable Objects에 둔 이유

1. **인스턴스 문제:** Vercel Functions의 WebSocket은 연결마다 개별 함수 인스턴스에 고정된다.
   - 같은 채널 사람들이 서로 다른 인스턴스에 붙으므로, 위치를 주고받으려면 외부 pub/sub을 한 번 더 거쳐야 한다. 그만큼 지연과 비용이 늘어난다.
   - 함수 실행 시간 상한 때문에 연결이 주기적으로 끊긴다.
2. **상한 강제:** Durable Object는 이름 하나당 전 세계에 인스턴스가 정확히 하나다. 채널의 모든 연결이 한 곳에 모이므로 "최대 40명"을 경쟁 조건 없이 강제할 수 있다.
3. **비용:** Hibernation API를 쓰면 유휴 연결에 요금이 거의 들지 않는다. 수신 메시지는 20건이 요청 1건으로 계산되고, 송신은 무료다.
4. **지연:** 채널 DO를 `locationHint: "apac"`로 만들어 한국 사용자와 가까운 지역에 둔다.

## 7. 추가 기능 (명세 이후 요청)

- **한국 시간대 하늘:** KST 기준 새벽 / 낮 / 해질녘 / 밤에 따라 월드와 입장 화면의 톤이 1시간에 걸쳐 부드럽게 바뀐다.
- **랜덤 날씨:** 맑음 / 흐림 / 안개 / 비 / 눈. KST 2시간 단위 시드로 정해서, 같은 순간에는 모든 방문자가 같은 날씨를 본다. 서버는 필요 없다. 눈은 12~2월에만 온다.
  - 위 두 기능의 로직은 `apps/web/lib/ambience.ts`에 있다.
- **시점 조작:**
  - 마우스 휠로 확대·축소(1.5~5배)한다.
  - 우클릭 드래그로 둘러본다.
  - 이동하거나 "내 캐릭터로" 버튼을 누르면 캐릭터로 돌아온다.
  - 모바일은 두 손가락으로 핀치 줌과 팬을 한다.

## 8. 관리자 화면과 API

`/admin`에서 묘비 숨김·복구·삭제, 신고 내역 확인, 일괄 처리, 채널 현황 확인을 한다. 두 겹으로 막는다.

1. **IP 제한** (`apps/web/proxy.ts`): `/admin`과 `/api/admin/*`는 `ADMIN_ALLOWED_IPS`에 든 IP에서만 열린다.
   - 쉼표로 구분한 IPv4/IPv6 주소나 CIDR. 예) `58.233.55.38` 또는 `58.233.55.38, 10.0.0.0/8, 2001:db8::/32`
   - 목록에 없으면 사이트의 일반 404를 보여 준다(관리자 화면이 있다는 것도 숨긴다).
   - 운영에서 비어 있으면 전부 막는다. 로컬에서 비어 있으면 `127.0.0.1`·`::1`만 허용한다.
   - **IP가 바뀌면** Vercel 환경변수를 고친 뒤 재배포한다.
   - IP는 Vercel이 덮어쓰는 `x-forwarded-for` 첫 값을 믿는다. Vercel 밖에 직접 띄우면 이 헤더를 프록시가 덮어쓰도록 해야 한다.
2. **관리자 키**: `/admin`에서 `ADMIN_KEY`를 한 번 입력하면 12시간짜리 httpOnly 쿠키(SameSite=Strict)를 받는다. API는 헤더 `x-admin-key: <ADMIN_KEY>`(또는 `Authorization: Bearer`)로도 부를 수 있다. 틀린 키는 IP당 분당 10회까지만 받는다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST / DELETE | `/api/admin/session` | 로그인 `{"key"}` / 로그아웃 |
| GET | `/api/admin/graves` | 숨김 포함 전체 목록 + 묘비별 신고 수·최근 신고 기록(사유·시각, 최대 50개) |
| POST | `/api/admin/graves/{id}` | `{"action": "hide" \| "unhide" \| "delete" \| "resetReports"}` |
| POST | `/api/admin/graves/bulk` | `{"ids": [...최대 100개], "action": ...}` → `{"done": [...], "notFound": [...]}` |
| GET | `/api/admin/channels` | 채널 인원(로비) |
| GET | `/api/admin/health` | 저장소 점검: 임시 묘비를 쓰기 → 읽기 → 목록 → 헌화 → 살려주세요 → 삭제까지 해 보고 단계별 성공 여부·소요 시간을 돌려준다 |

- **운영자 IP는 방문자 레이트리밋에서 빠진다.**
  - 대상은 `ADMIN_ALLOWED_IPS`에 명시된 IP다.
  - 묘비 세우기 하루 3개 같은 한도 없이 반복해서 테스트할 수 있다.
  - 관리자 키 실패 제한은 그대로 적용된다.

- 신고는 IP 단위로 센다. 서로 다른 IP 5곳이 신고하면 자동으로 숨긴다. 사유는 스팸·광고 / 욕설·혐오 / 개인정보 노출 / 기타.
- `unhide`는 신고 수를 0으로 되돌린다(기록은 남는다). `resetReports`는 신고 수와 기록을 비운다(숨김 상태는 그대로).

## 9. 알려진 한계

- **로그인이 없다.** "1인 1회" 판정은 서명된 쿠키 기준이다. 쿠키를 지우면 다시 할 수 있다.
  - 레이트리밋과 신고 집계는 IP 해시로도 걸어서 남용을 줄였다.
- **ownerToken을 잃어버리면 묘비를 수정할 수 없다.** ownerToken은 묘비를 등록한 브라우저의 localStorage에만 있다.
- **위치 판정은 클라이언트가 한다.** 서버는 맵 범위, 최대 속도, 순간이동 쿨다운, 좌석 거리만 검증한다.
- **헌화·살려주세요의 다른 채널 반영:** 실시간으로 맞추지 않는다. 다음 목록 갱신(30초) 때 맞춰진다.
- **iOS Safari 스크린샷:** 캔버스 WebP 인코딩을 지원하지 않아 WASM 인코더(`@jsquash/webp`)로 변환한다. 첫 변환은 조금 느리다.
- **묘비가 1,000개를 넘을 때:** 목록 페이지 분할이 필요하다(`lib/store`에 TODO).
