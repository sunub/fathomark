# SIWC SDK 스파이크 (2026-10-05)

범위: 문서·소스 조사와 scratchpad 번들 측정. Electron/Obsidian 실구동과 실제 로그인은 하지 않았다. 저장소 코드는 수정하지 않았다.
출처 약칭: [D]=https://developers.openai.com/siwc/ 하위 `.md` 원문, [R]=https://github.com/openai/sign-in-with-chatgpt-devkit (커밋 f723814, 2026-09-29), [C]=https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt

## 1. 패키지, 라이선스, 설치
- **npm에 공개되어 있지 않다.** `npm view @siwc/local`, `@siwc/react` 모두 404 (레지스트리 직접 조회, 2026-10-05). README: "Both packages are local workspaces in this repository" [R/README.md]. `packages/local/package.json`은 `"private": true`, 버전 `0.1.0`.
- 설치는 저장소를 clone해 `npm ci && npm run build` 하는 방식뿐이다. 소스 복사 또는 워크스페이스 참조가 필요하다.
- 의존성: 직접 2개(`jose ^6.1.0`, `proper-lockfile ^4.1.2`), 전이 3개(graceful-fs, retry, signal-exit) 포함 총 5개 [R/packages/local/package.json, 설치 후 `npm ls`]. `engines.node >=22` [같은 파일]. Electron 지원 버전은 SDK에 명시 없음(예제 앱은 Electron ^42, Node 22.12+ [R/examples/paste-perfect/package.json, README]).
- **라이선스는 MIT/Apache가 아니다.** "Sign-in with ChatGPT DevKit Noncommercial License v1.0": 사용·배포는 "solely for Noncommercial Purposes"이고, 배포 시 라이선스 사본 첨부와 변경 표시를 요구하며, 수정본은 같은 라이선스로 배포해야 한다 [R/LICENSE]. "Noncommercial Purpose"는 "personal learning, experimentation, or development without an intended or reasonably anticipated commercial application"이고 사업자·고용주·클라이언트 관련 개발·배포는 제외한다. 무료·오픈소스 Fathomark가 이 정의에 들어가는지, MIT 플러그인에 번들해 배포해도 되는지는 **확인 못함**(법률 판단 필요, 문서에 해석 없음).
- 💡 SIWC: "Sign in with ChatGPT". OAuth로 사용자의 ChatGPT 요금제를 API 호출에 쓰게 하는 OpenAI 기능.
- 💡 OAuth 동적 등록: 개발자가 클라이언트 ID를 미리 받지 않고, 첫 로그인 때 `client_id=dynamic_agent_client`로 사용자 계정에 클라이언트를 등록하는 방식.
- 최소 사용 예 [C]: `createChatGPT({appName, appId, sendHostId:true})` → `await chatgpt.signIn()` → `listModels()` → `streamResponse({model, input, instructions})`. 실제 소스는 `redirectPort`(필수)와 `credentialEncryption`(필수)도 요구한다 [R/packages/local/src/types.ts `ChatGPTConfig`]. 쿡북 예제는 이를 생략했으므로 쿡북만으로는 동작 코드가 안 된다.

## 2. Preview 제한 (원문 [D/token-sharing-open-source/preview-limitations.md])
- 요청 형식: "Set `store: false` and `stream: true`", `input`은 배열, "explicit `{type: "message", role: "system"}` items are rejected" (지시문은 `instructions` 또는 developer 메시지).
- 미지원 필드: `max_output_tokens`, `temperature`, `top_p`, `metadata`, `prompt`, `truncation`, `user` 등. 미지원 도구: 이미지 생성, file search, Code Interpreter, hosted MCP, `tool_search`. 오디오/비디오 입력, Files API 미지원.
- 한도: Plus는 "five-hour usage limit is shared across all apps", Pro는 "does not apply" [D/profiles-and-sessions.md]. 사용자는 앱별 주간 한도 10~100%를 설정할 수 있다(같은 문서). 구체적 수치는 문서에 없음.
- 모델: 허용 모델 고정 목록은 문서에 없고 계정별 `GET /v1/models`로 조회한다 [D/models-and-inference.md]. 예제 슬러그는 `gpt-6.1-sol`. 어떤 모델이 무료/Plus에 열리는지는 **확인 못함**(문서에 없음, 로그인 필요).
- 클라이언트 ID: 오픈소스 흐름은 "without a client secret or partner API key", 별도 신청 없이 동적 등록 [D/sign-in.md, llms-full]. 상업 파트너용 `request-client-id`는 waitlist이며 오픈소스와 무관하다 [D/request-client-id.md].
- 오픈소스/사용자 수: "ChatGPT plan usage is available to all open-source partners" [D/llms-full.txt]. 유료·원격 호스팅 앱은 interest form 필요 [D/token-sharing-open-source.md]. 사용자 수 상한은 문서에 없음. 약관 링크: preview-limitations 페이지에 약관 링크 없음. LICENSE는 "Separate terms govern those assets and services"라고만 하며 어느 약관인지는 **확인 못함**.
- 로그인 가능 대상: Plus·Pro [D/llms-full.txt 표]. 동의가 없으면 `chatgpt.tokens.use.direct` 스코프가 빠져 `sharing:false`가 된다 [D/errors-and-recovery.md].

## 3. 토큰·자격증명 저장
- SDK는 암호화 제공자를 **필수**로 요구하고 평문 폴백이 없다 [R/docs/security.md]. 예제는 Electron 메인 프로세스의 `safeStorage`를 쓴다. "Other local runtimes must provide their own OS-backed implementation." 인터페이스는 `{id, isAvailable, encrypt, decrypt}` [R/types.ts].
- 경로: `storageDir`(절대 경로)로 설정 가능, 기본값은 `~/.config/<appId>` [R/src/index.ts 70~72행]. `chatgpt-host.json`(비암호화 호스트 ID)과 암호화 연결 상태를 저장한다.
- 개발자 규칙: 토큰은 "browser storage, source control, logs, analytics, support transcripts" 밖에 둔다. 파일은 원자적 쓰기에 `0600` [D/profiles-and-sessions.md, sign-in.md]. 복호화된 자격증명과 제공자는 렌더러에 두지 말 것 [R/docs/security.md]. Vault 같은 동기화 폴더에 두면 안 된다는 **명문 규정은 없다**. 다만 "protected local" 저장 요구로 보아 Vault 밖(`storageDir`를 홈/앱 데이터로 지정)이 맞다는 것은 내 해석이다.
- 수명: 액세스 토큰 1시간, 리프레시 토큰 30일(갱신 시 연장) [D/token-reference.md]. 로그아웃 시 리프레시 토큰 폐기(revoke)를 시도한다.

## 4. 렌더러 실행 가능성
- SDK가 쓰는 Node API(소스 grep): `node:http`(127.0.0.1 콜백 서버), `node:child_process`(기본 브라우저 열기: macOS `open`, Windows `rundll32`, 그 외 `xdg-open`), `node:fs/promises`, `node:crypto`, `node:os`, `node:path`, `node:async_hooks`, `node:timers/promises`, 전역 `fetch`, `AbortSignal.any` [R/src/oauth.ts, storage.ts, index.ts].
- **`electron` import는 SDK에 없다.** `app`, `safeStorage`, `shell`은 SDK가 아니라 예제 앱이 주입한다. `openBrowser` 콜백으로 대체 가능하다.
- 메인 프로세스 의존은 SDK 자체가 아니라 `credentialEncryption` 구현에서 생긴다. 예제의 `safeStorage`는 메인 전용이다. 렌더러에서 쓸 대체 OS 키 저장소(Obsidian/Electron 제공 여부)는 **확인 못함**.
- 문서의 "main process" 권고는 보안 경계(렌더러에 토큰 노출 금지) 때문이다 [C, R/docs/security.md]. 예제 렌더러는 "context isolation and sandboxing enabled, with Node integration disabled"인데 Obsidian 렌더러는 Node 통합이 켜져 있어 이 전제와 다르다. 이 점은 보안상 위험 요인이다.
- 렌더러 `fetch`는 CORS 적용 대상일 수 있다. `auth.openai.com`·`api.openai.com` 응답이 허용하는지 **확인 못함**(Obsidian 실구동 불가). `AbortSignal.any`는 Obsidian 내장 Chromium 버전에 따라 없을 수 있음, 확인 못함.
- 번들 측정(scratchpad `b/`, 저장소 build.mjs와 같은 옵션: cjs, platform browser, es2021, minify, external=obsidian+electron+builtin-modules, SDK를 tsc로 빌드한 dist 사용):

| 항목 | 값 |
|---|---|
| SDK 번들 증가분(minified) | 79.8 KB (SDK 39.6, jose 17.9, graceful-fs 10.6, proper-lockfile 4.9, retry 3.4, signal-exit 2.3) |
| 남는 `require` | node:child_process, node:http, node:fs, node:fs/promises, node:crypto, node:os, node:path, node:async_hooks, node:timers/promises, fs, path, assert, constants, events, stream, util |
| electron, net 등 | 번들에 없음 (net은 안 씀) |

  현재 예산 900 KB 대비 약 9%.

## 5. streamResponse 계약 [R/types.ts, responses.ts]
- 옵션: `{model, input: string | {role: user|assistant|developer, content: string}[], instructions?, signal?, onDelta?}`. 반환은 `{text}`뿐이다.
- **구조화 출력 불가(SDK 경유)**: 요청 본문은 `model, input, instructions, store, stream`만 보낸다. `text.format`/JSON schema 필드를 전달할 수 없다. 문서도 구조화 출력을 언급하지 않는다. 직접 HTTP로 Responses를 호출할 때의 지원 여부는 **확인 못함**(로그인 필요).
- 도구 호출 없이 호출 가능: 도구 필드가 없으며 텍스트 전용이다.
- usage: SDK는 토큰 수를 반환하지 않는다(`response.completed` 이벤트를 완료 신호로만 씀). 이벤트에 usage가 오는지 문서 언급 없음, **확인 못함**.
- 취소: `signal` 지원, 중단 시 `ChatGPTError("cancelled")`. 요청 타임아웃 180초 [R/responses.ts, errors.ts].
- 한도 오류: `ChatGPTError.code === "subscription_sharing_usage_limit_exceeded"`(HTTP 429, `retryable:false`)로 구분 가능. `subscription_sharing_usage_unavailable`(503, 재시도 가능)도 있다 [R/errors.ts 43~44행, D/errors-and-recovery.md]. 스트림 시작 후 `response.failed`로도 올 수 있다. 사전 거부 본문은 `{"detail":...}` 형태로 "stable machine-readable code"가 아니다. 그 밖에 `subscription_sharing_user_not_eligible`(403) 등.

## 6. 고정 입력 오버헤드
- 문서상 SIWC 직접 경로는 공개 Responses API `POST /v1/responses`를 호출하고 "do not point it at ChatGPT's backend-api"라고 한다 [D/models-and-inference.md]. SDK는 사용자가 준 `instructions`와 `input`만 보낸다(소스 확인). 따라서 SDK 클라이언트가 지시문을 덧붙이지는 않는다. 서버 쪽이 지시문을 추가하는지, 입력 토큰이 우리 프롬프트와 일치하는지는 문서에 근거가 없고 **확인 못함**(usage를 받아야 측정 가능, 로그인 필요). Codex app-server 경로는 별개이며 Codex 에이전트 동작이 붙는다 [D/preview-limitations.md].

## 판단: 조건부
- 기술적으로 SDK는 `electron`에 의존하지 않고 약 80 KB로 번들되어 렌더러 번들 자체는 가능해 보인다. 다만 암호화 제공자를 렌더러에서 구현해야 하고, CORS와 `AbortSignal.any` 지원은 실구동 없이 확인하지 못했다.
- 막힐 수 있는 지점은 기술이 아니라 **라이선스**다. npm 미공개, 비상업 라이선스, 변경 표시·동일 라이선스 요구가 MIT 플러그인 배포와 맞는지 법률 확인이 먼저다. 대안은 문서에 공개된 OAuth 흐름(PKCE, 127.0.0.1 콜백, 토큰 엔드포인트)을 SDK 없이 직접 구현하는 것이다(문서가 흐름 전체를 공개). 이 경우 라이선스 문제가 없어지는지는 확인 못함.
- 구조화 출력(S6)과 usage 측정은 SDK로는 안 되므로 직접 HTTP 호출이 필요하다. 미확인: 렌더러 CORS, 구조화 출력 허용 여부, usage 이벤트, 허용 모델, 서버 측 오버헤드(로그인 필요).
