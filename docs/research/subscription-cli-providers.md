# 구독 계정 CLI를 provider로 쓰는 방식 조사 (Claude Code / Codex)

> 기록 (2026-10-05). 이후 Codex CLI가 작성 경로로 제안됐다([ADR 0010](../adr/0010-local-curation-codex-drafting.md)). 이 문서의 약관 판단("모호")은 아직 유효하며, 공개 배포 전에 확인해야 한다([DIRECTION.md](../DIRECTION.md)).

확인일: 2026-10-05. 코드는 수정하지 않았고, 아래 내용은 모두 1차 출처(공식 문서, 공식 저장소 소스, 약관 원문)만 근거로 한다. 확인하지 못한 항목은 "확인 못함"으로 표시했다.

관련 결정: [ADR 0007](../adr/0007-grounded-career-writing-with-hosted-models.md)은 호스팅 provider를 "사용자의 API 키 + 명시적 동의"로 전제한다. 이 노트는 그 전제에 "이미 로그인한 구독 CLI를 자식 프로세스로 실행"이라는 선택지를 추가할 수 있는지 판단하기 위한 것이다.

## 용어

- 💡 자식 프로세스(child process): 한 프로그램(여기서는 Obsidian 플러그인)이 다른 프로그램(`claude`, `codex`)을 직접 실행하고 입출력을 주고받는 방식입니다.
- 💡 `claude -p` (print 모드): Claude Code를 대화형 화면 없이 한 번 실행하고 결과만 출력한 뒤 종료하는 비대화형 모드입니다.
- 💡 `codex exec`: OpenAI Codex CLI의 비대화형 실행 명령으로, 스크립트나 CI에서 사람 입력 없이 끝나도록 설계된 모드입니다.
- 💡 OAuth 토큰: 비밀번호 대신 "이 앱이 내 계정으로 이 범위까지 접근해도 된다"는 허가를 담은 로그인용 증표입니다. 구독 계정의 사용 권한이 이 토큰에 묶여 있습니다.
- 💡 stream-json / JSONL: 이벤트를 한 줄에 JSON 하나씩 연속으로 내보내는 출력 형식입니다. 실시간 파싱에 쓰입니다.
- 💡 Agent SDK: Claude Code의 에이전트 루프(모델 호출, 도구 실행, 권한 관리)를 Python/TypeScript 라이브러리로 쓸 수 있게 한 Anthropic의 패키지입니다.
- 💡 샌드박스(sandbox): 모델이 만든 셸 명령이 건드릴 수 있는 파일과 네트워크 범위를 제한하는 격리 장치입니다.
- 💡 provider: Fathomark에서 모델 호출을 담당하는 교체 가능한 어댑터(호스팅 API, 로컬 모델 등)입니다.

## 1. Cline과 Roo Code의 구현

조사 기준: Cline `main` 커밋 `39ff2359f7e08231281539696e48a166ce49270c` (2026-10-03), Cline 태그 `v3.39.2` (릴리스 2025-12-02), Roo Code `main` 커밋 `b867ec9145750d0ae1ff7f02d35406e9bf2a0b16` (2026-05-15), OpenAI Codex `main` 커밋 `afb436df8b70bb5bc57b86d9a3e829968988cd21` (2026-10-04).

### 1-1. Cline의 구현이 두 세대로 나뉜다

Cline은 Claude Code 연동 방식을 바꿨다. 직접 `claude`를 실행하던 구현(v3.x)이 현재 `main`에서는 서드파티 npm 패키지를 통한 Agent SDK 방식으로 대체되었다.

| 구분 | 구 구현 (태그 v3.39.2) | 현 구현 (`main`, 2026-10-03) |
|---|---|---|
| 실행 방식 | `execa`로 `claude` 바이너리를 직접 실행 | `ai-sdk-provider-claude-code` 패키지가 Agent SDK 경유로 실행 |
| 도구 | Claude Code 내장 도구를 전부 끔 | Claude Code 내장 도구를 켠 채로 둠 |
| 파일 | `src/integrations/claude-code/run.ts` | `sdk/packages/llms/src/providers/vendors/community.ts` |

#### 구 구현: 직접 실행 (v3.39.2)

출처: `https://github.com/cline/cline/blob/v3.39.2/src/integrations/claude-code/run.ts`, `.../src/core/api/providers/claude-code.ts`

- **호출 플래그** (`run.ts:194-208`): `--system-prompt <text>`(또는 `--system-prompt-file <path>`), `--verbose`, `--output-format stream-json`, `--disallowedTools <목록>`, `--max-turns 1`, `--model <id>`, `-p`. 대화 이력은 프롬프트 인자가 아니라 stdin에 `JSON.stringify(messages)`로 쓰고 닫는다 (`run.ts:237-238`).
- **도구 비활성화** (`run.ts:160-179`): `--disallowedTools`에 `Task,Bash,Glob,Grep,LS,exit_plan_mode,Read,Edit,MultiEdit,Write,NotebookRead,NotebookEdit,WebFetch,TodoRead,TodoWrite,WebSearch`를 넘긴다. 주석 원문: "We want the model to use our custom tool format instead of built-in tools. Disabling built-in tools prevents tool-only responses and ensures text output." 이 목록은 당시 도구 이름 고정 목록이라, 새 도구가 생기면 구멍이 된다(내 해석). 공식 문서는 `--tools ""`로 전체 비활성화를 안내한다(아래 3절).
- **시스템 프롬프트** (`run.ts:30-42`): 인자로 넘기되 65536자를 넘거나 Windows이면 임시 파일에 쓰고 `--system-prompt-file`을 쓴다. `E2BIG`/`ENAMETOOLONG` 오류는 별도 메시지로 번역한다 (`run.ts:117-135`).
- **출력 파싱** (`run.ts:46-84, 243-273`): stdout을 줄 단위로 읽어 `JSON.parse`. 한 줄이 잘려 파싱에 실패하면 `partialData`에 모았다가 다음 줄과 이어 붙여 재시도한다. 어시스턴트 메시지(`type: "assistant"`)에서 text/thinking/tool_use를 꺼내고, `type: "result"`에서 비용을 읽는다 (`providers/claude-code.ts:51-149`). `system/init`의 `apiKeySource !== "none"`이면 유료 사용으로 보고, 아니면 구독 사용으로 간주해 비용을 0으로 표시한다 (`claude-code.ts:61-65, 144-146`; 주석에 "Based on my tests"라고 되어 있어 공식 보장은 아님).
- **오류·한도 처리**:
  - 종료 코드가 0이 아니면 `Claude Code process exited with code N` + stderr를 던진다 (`run.ts:92-98`).
  - 실행 파일이 없으면(`ENOENT`) 설치/경로 안내 오류 (`run.ts:109-115`). `--system-prompt-file`을 모르는 구버전이면 업데이트 안내 (`run.ts:102-106`).
  - 어시스턴트 텍스트가 `API Error`로 시작하면 뒤의 JSON을 파싱해 오류로 던지고, `Invalid model name`이면 "구독 플랜이 허용하는 모델이 다르다"는 힌트를 붙인다 (`claude-code.ts:70-93`).
  - 재시도: `@withRetry({ maxRetries: 4, baseDelay: 2000, maxDelay: 15000 })` (`claude-code.ts:22-26`). 타임아웃 10분, 버퍼 20MB (`run.ts:181-183`).
  - 구독 사용량 한도 초과(rate limit)를 구분하는 분기는 이 두 파일에서 찾지 못했다.
- **작업 디렉터리** (`run.ts:44, 227-235`): `getCwd()`(Cline이 열어 둔 워크스페이스)를 `cwd`로 지정.
- **환경 변수** (`run.ts:213-225`): `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 기본 32000, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_NON_ESSENTIAL_MODEL_CALLS=1`, `MAX_THINKING_TOKENS`를 설정하고 **`ANTHROPIC_API_KEY`를 환경에서 삭제**한다. 주석: "We don't want to consume the user's ANTHROPIC_API_KEY, and will allow Claude Code to resolve auth by itself". 이유는 3절의 인증 우선순위 참고: `-p`에서는 키가 있으면 항상 키가 쓰여 구독이 아니라 종량 과금이 된다.
- **경로 설정** (`run.ts:192`, `claude-code.ts:10`): 사용자가 설정한 `claudeCodePath`, 비어 있으면 PATH의 `claude`.

#### 현 구현: Agent SDK 래퍼 (`main`)

출처: `sdk/packages/llms/src/providers/vendors/community.ts`, `sdk/packages/llms/src/providers/builtins.ts`, `sdk/packages/core/src/services/llms/handler-factory.ts` (모두 `https://github.com/cline/cline` 저장소 경로).

- `claude-code` provider는 선택적 peer dependency인 `ai-sdk-provider-claude-code`를 동적 import한다 (`community.ts:82-99`, `sdk/packages/llms/package.json:45,85`). 이 패키지 자체의 소스는 Cline 저장소가 아니므로 **내부 호출 플래그는 확인 못함**.
- 실행 파일: 번들된 `@anthropic-ai/claude-agent-sdk-<platform>` 바이너리를 찾고, 없으면 PATH의 `claude` (`community.ts:53-80`).
- 설정 (`community.ts:100-137`): `cwd`는 워크스페이스 루트(`handler-factory.ts:79-88`), `settingSources`는 `["user","project"]`, `permissionMode`는 `"acceptEdits"`. 주석: 대화형 권한 프롬프트가 연결되어 있지 않아 사전 승인되지 않은 것은 전부 거부된다.
- 도구: 구 구현과 반대로 CLI의 내장 도구를 그대로 두며, `capabilities: ["reasoning", "provider-tools", "local-auth"]`로 "CLI가 자체 도구(Read/Write/Bash...)를 실행하고 외부 AI SDK 도구를 연결할 수 없다"고 명시한다 (`builtins.ts:1200-1231`, 주석).
- 인증: `local-auth`는 "스폰된 CLI가 자기 자격증명 저장소(Pro/Max 구독 로그인)로 인증하므로 API 키를 읽지 않는다"는 뜻이다. 비용 표시는 구독이면 숨긴다 (`builtins.ts` 같은 항목 주석, `billing.test.ts:20-21`).
- 문서: Cline 문서는 "Install and authenticate Claude CLI", "Uses your Claude subscription limits instead of API token billing", "Responses may not stream token-by-token"라고 안내한다 (`docs/provider-config/anthropic.mdx:32-47`).

### 1-2. Cline의 Codex 연동 (두 갈래)

- `openai-codex-cli`: 로컬 `codex` CLI를 쓰는 provider. `localCliCommand: "codex"`로 설치 여부를 확인하고, 내부는 `ai-sdk-provider-codex-cli`(`createCodexExec`)를 쓴다 (`builtins.ts:1154-1172`, `community.ts:143-164`). 패키지 내부 플래그는 **확인 못함**.
- `openai-codex`: CLI를 거치지 않고 Cline이 직접 ChatGPT OAuth를 수행한다. 인증 엔드포인트 `https://auth.openai.com/oauth/authorize`, 토큰 엔드포인트 `.../oauth/token`, 콜백 `http://localhost:1455/auth/callback`, 요청 대상 `https://chatgpt.com/backend-api/codex` (`sdk/packages/core/src/auth/codex.ts:23-34`, `builtins.ts:1140-1152`). 즉 "OAuth 토큰을 직접 사용"하는 쪽이다. 이 경로가 OpenAI 정책상 허용되는지는 2절에서 다룬다.

### 1-3. Roo Code

- 변경 이력상 Claude Code provider는 3.42.0(2026-01-22)에서 "Removed deprecated Claude Code provider (PR #10883)"로 제거되었다 (`CHANGELOG.md:258-263`). 제거 이유는 변경 이력에 적혀 있지 않아 **확인 못함**. `main`에는 `src/integrations/claude-code/run.ts`가 없다(raw URL 404).
- 제거 전에는 3.38.3에 "Stop frequent Claude Code sign-ins by hardening OAuth refresh token handling" 항목이 있다 (`CHANGELOG.md:413-416`). 이 문구만으로 Roo의 구현이 OAuth 토큰을 직접 다뤘는지는 단정할 수 없고, 제거된 소스를 보지 않았으므로 **확인 못함**.
- Roo는 OpenAI Codex provider(ChatGPT 구독)를 유지하며 사용량 UI를 추가했다 (`CHANGELOG.md:263` 위 항목, "Added UI to track your ChatGPT usage limits in the OpenAI Codex provider").

## 2. 약관과 정책

### 2-1. Anthropic

**(a) Claude Code 법적/컴플라이언스 문서** — `https://code.claude.com/docs/en/legal-and-compliance` (2026-10-05 확인, 페이지에 개정일 표기는 없음)

> "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."

> "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow."

> "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in their products?* above."

> "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."

> "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."

같은 페이지의 "Can customers offer Claude Code in their products?" 절: "The Claude Code binary must not be modified. ... customers may not remove, disable, or restrict any authentication method built into it" 그리고 "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential." 단, 이 절은 제품에 Claude Code를 "사전 설치하거나 실행"하는 경우 Commercial Terms 동의가 필요하다고 시작한다.

**(b) Agent SDK 개요** — `https://code.claude.com/docs/en/agent-sdk/overview` (2026-10-05 확인)

> "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."

**(c) Consumer Terms of Service** — `https://www.anthropic.com/legal/consumer-terms` (시행일 Effective October 8, 2025, 2026-10-05 확인). 이 환경에서는 서버가 한국어 번역본만 돌려주어 영어 원문을 직접 확인하지 못했다. 한국어본의 해당 금지 조항은 다음과 같다.

> "귀하가 Anthropic API 키를 통해 당사 서비스에 접속하거나 당사가 이를 명시적으로 허용하는 경우를 제외하고 봇(bot), 스크립트(script) 또는 기타 방식을 통해 자동화된 또는 비인간적인 방식을 통해 당사 서비스에 접속"하는 행위 금지.

계정 정보 공유 금지 조항도 같은 약관에 있다("귀하의 계정 로그인 정보, Anthropic API 키 또는 계정 자격증명을 타인과 공유하거나 귀하의 계정을 타인에게 제공할 수 없습니다", 보조 조회 결과 기준이며 원문 대조는 하지 못함). 영어 원문 대조는 **확인 못함**.

**(d) 구분: 로컬 CLI 실행 vs OAuth 토큰 직접 사용**

| 경우 | 문서상 위치 | 판단 |
|---|---|---|
| 사용자가 직접 설치·로그인한 **수정하지 않은** `claude`를 Fathomark가 `claude -p`로 실행. Fathomark는 토큰을 읽지 않음 | (a)의 "end user signing in to the unmodified Claude Code binary with their own Claude subscription"과 가장 가깝지만, 그 문장은 "플랫폼이 Claude Code를 호스팅하는 경우"를 문맥으로 든다 | **모호**. 금지 문장은 "third-party developers ... route requests through ... plan credentials on behalf of their users"인데, 사용자의 로컬 CLI를 앱이 대신 호출하는 것이 이에 해당하는지 문서가 직접 답하지 않는다 |
| Agent SDK를 앱에 넣어 구독 로그인으로 사용 | (b) | **금지로 읽힘**: "Unless previously approved ... including agents built on the Claude Agent SDK" |
| `~/.claude/.credentials.json`, macOS Keychain, `claude setup-token` 출력의 `CLAUDE_CODE_OAUTH_TOKEN` 등 OAuth 토큰을 앱이 읽거나 보관하거나 직접 API 호출에 사용 | (a)의 "developers may not collect, store, or intermediate Claude.ai credentials or session tokens" | **금지로 읽힘** |
| 자동화 접근 일반 | (c)의 bot/script 조항 | 예외가 "당사가 이를 명시적으로 허용하는 경우"인데, 헤드리스 문서가 `claude -p`를 스크립트·CI용으로 안내하므로 `-p` 자체는 허용된 사용으로 볼 여지가 있다. 그러나 이 연결을 명시한 문장은 찾지 못했다 (**모호**) |

참고: `claude setup-token`은 "a one-year OAuth token ... authenticates with your Claude subscription"을 발급하는 공식 기능이고 CI/스크립트용이라고 안내된다 (`https://code.claude.com/docs/en/authentication`, "Generate a long-lived token"). 그러나 이 기능의 존재가 제3자 앱의 사용 허가를 뜻한다는 문장은 없다.

Cline 현 구현은 Agent SDK 래퍼를 쓰므로(1-1) (b)의 문구와 충돌 소지가 있다. Anthropic이 Cline에 "previously approved"를 했는지는 **확인 못함**. 따라서 "Cline이 한다"는 사실은 허용 근거가 되지 못한다.

### 2-2. OpenAI

**(a) Codex 인증 문서** — `https://learn.chatgpt.com/docs/auth` (구 `developers.openai.com/codex/auth`가 308 리다이렉트, 2026-10-05 확인). 요약 조회 결과 기준:

- "Sign in with ChatGPT for subscription access" 또는 "Sign in with an API key for usage-based access."
- "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs. Don't expose Codex execution in untrusted or public environments."
- auth.json은 "Treat ... like a password: it contains access tokens. Don't commit it, paste it into tickets, or share it in chat."

**(b) 비대화형 모드 문서** — `https://learn.chatgpt.com/docs/non-interactive-mode` (2026-10-05, 원본 마크다운 확인)

> "`codex exec` reuses saved CLI authentication by default. In CI, it's common to provide credentials explicitly"

> "API keys are the right default for automation because they are simpler to provision and rotate. Use this path only if you specifically need to run as your Codex account."

> "Do not use this workflow for public or open-source repositories."

마지막 문장은 CI에서 `auth.json`을 러너에 옮기는 "ChatGPT-managed auth in CI/CD" 절에 한정된 경고다. 개인 PC에서 로그인된 `codex exec`를 도구가 호출하는 경우를 직접 규정한 문장은 찾지 못했다.

**(c) Sign in with ChatGPT, 오픈소스/로컬 앱용 공식 경로** — `https://developers.openai.com/siwc/token-sharing-open-source` (2026-10-05, 원본 마크다운 확인)

> "ChatGPT plan usage is an optional capability within Sign in with ChatGPT. In addition to identity scopes, your open-source app can request permission to use the user's ChatGPT plan for eligible Responses API requests. This does not grant access to their ChatGPT conversations or other account context."

> "These docs explain ChatGPT plan usage for open-source and locally hosted apps. If you're interested in offering it in a paid or remotely hosted app, complete the interest form"

이 문서는 서드파티 로컬/오픈소스 앱이 OAuth로 사용자의 ChatGPT 플랜을 쓰는 공식 흐름(브라우저 로그인, PKCE, `ext_agent_host_id`, 토큰 저장·갱신)을 정의한다. 제약은 `https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations`에 있다: `store: false`와 `stream: true` 필수, `max_output_tokens`·`temperature` 등 여러 필드 미지원, 이미지 생성·파일 검색 등 호스팅 도구 미지원. 페이지 이름에 "Preview"가 있어 현재 미리보기 단계로 보인다.

**(d) OpenAI 이용약관(Terms of Use)** — `https://openai.com/policies/terms-of-use/`는 이 환경에서 HTTP 403이라 **원문 확인 못함**. 자동화·계정 공유 조항은 인용하지 못했다.

**(e) 구분**

| 경우 | 판단 |
|---|---|
| 사용자가 로그인해 둔 `codex`를 `codex exec`로 실행 (토큰은 Codex가 관리, Fathomark는 읽지 않음) | `codex exec`가 "saved CLI authentication"을 재사용하는 것은 공식 동작이다. 제3자 앱이 이를 호출하는 것을 허용/금지한다는 명시 문장은 찾지 못했다 (**모호**, 약관 원문 미확인) |
| 앱이 Codex의 OAuth 클라이언트로 직접 토큰을 받아 `chatgpt.com/backend-api/codex`를 호출 (Cline `openai-codex` 방식) | 공식 SIWC 문서의 엔드포인트는 `https://api.openai.com/v1`(Responses API)이다(preview-limitations). Cline이 쓰는 `chatgpt.com/backend-api/codex`와 Codex 공개 `client_id`를 공식 문서가 제3자에게 허용했다는 근거는 찾지 못했다 (**확인 못함**) |
| SIWC 공식 흐름으로 앱이 직접 ChatGPT 플랜 사용 권한을 받음 | **공식 허용**(오픈소스/로컬 앱 대상). 앱이 오픈소스여야 하는지의 정확한 자격 요건은 위 두 인용문 이상은 확인 못함 |

## 3. 비대화형 모드의 공식 플래그

### 3-1. `claude -p`

출처: `https://code.claude.com/docs/en/cli-reference`, `https://code.claude.com/docs/en/headless`, `https://code.claude.com/docs/en/authentication`, `https://code.claude.com/docs/en/agent-sdk/typescript` (2026-10-05).

| 목적 | 플래그 / 동작 (문서 원문 기준) |
|---|---|
| 도구 끄기 | `--tools ""`: "Use `""` to disable all". MCP 도구에는 영향이 없어 `--disallowedTools "mcp__*"`를 함께 써야 한다. `--disallowedTools "*"`는 "removes every tool". |
| 출력 형식 | `--output-format text|json|stream-json`. `json`은 `result`, `session_id`, 메타데이터를 담는다. `stream-json`은 `--verbose`와 함께 쓰고, 부분 토큰은 `--include-partial-messages`. 마지막 줄은 `result` 메시지(최종 텍스트, 비용, 세션 메타데이터). |
| 구조화 출력 | `--output-format json --json-schema '<schema>'`, 결과는 `structured_output` 필드. |
| 시스템 프롬프트 | `--system-prompt`(전체 교체), `--system-prompt-file`(파일로 교체), `--append-system-prompt[-file]`(기본 프롬프트 뒤에 추가). "Replacing drops all of the default prompt, including tool guidance and safety instructions". |
| 권한 | `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions`. `dontAsk`는 "denies every call that would otherwise prompt"로 잠금형 CI용. `--permission-prompts none`은 사람이 없을 때 프롬프트를 거부(v2.1.259 이상). |
| 상한 | `--max-turns`(초과 시 오류 종료), `--max-budget-usd`, `--no-session-persistence`("sessions are not saved to disk", print 모드 전용). |
| 컨텍스트 격리 | `--safe-mode`: CLAUDE.md, 스킬, 플러그인, 훅, MCP 서버 등을 불러오지 않는다. "Authentication, model selection, built-in tools, and permissions work normally". `--setting-sources`, `--strict-mcp-config`, `--disable-slash-commands`도 있다. `--restricted`는 명령 실행 도구와 WebFetch를 제거하고 파일 도구를 작업 디렉터리로 제한한다(v2.1.248 이상). |
| `--bare` 주의 | 헤드리스 문서가 스크립트용으로 권장하지만 "In bare mode, Claude Code never reads OAuth credentials or the system keychain"이다. 즉 **`--bare`는 구독 로그인으로는 동작하지 않고** `ANTHROPIC_API_KEY`가 필요하다. 구독 CLI 용도에는 쓸 수 없다. `CLAUDE_CODE_OAUTH_TOKEN`도 bare에서는 읽지 않는다. |
| 작업 디렉터리 | 전용 `--cwd` 플래그는 확인하지 못했다. 프로세스의 cwd가 기준이며 `--add-dir`로 추가 디렉터리를 연다. |
| 입력 | 인자 프롬프트 + stdin 파이프 가능. stdin은 10MB 상한("Piped stdin is capped at 10MB") 초과 시 비정상 종료. |
| 인증 우선순위 | 클라우드 변수, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, ... 마지막이 `/login` 구독. 비대화형(`-p`)에서는 "the key is always used when present". 구독을 쓰려면 환경에서 `ANTHROPIC_API_KEY`를 지워야 한다 (Cline이 지우는 이유와 일치). `claude auth status`는 로그인 시 종료 코드 0, 아니면 1. |
| 종료 코드 | 성공 0, 실패 0이 아닌 값. SIGTERM 중단은 143. 잘못된 플래그는 실행 전에 stderr로 보고하고, 실행 중 실패(예: 인증 누락)는 stdout에 결과로 출력한다. 비영 종료 코드 값별 의미 표는 확인 못함. |
| 오류 형식 | `result` 메시지의 `subtype`: `success`, `error_max_turns`, `error_during_execution`, `error_max_budget_usd`, `error_max_structured_output_retries`와 `is_error`, `api_error_status`. 시작 실패는 `error_during_execution`에 `startup_failure_reason`(Agent SDK v0.3.274 이상). 재시도는 `system/api_retry` 이벤트. 구독 한도 소진은 `rate_limit_event`(`status: rejected`, `errorCode: "credits_required"`), 문구는 `You've hit your session limit` / `You've hit your weekly limit` (`https://code.claude.com/docs/en/errors`). |

### 3-2. `codex exec`

출처: `https://learn.chatgpt.com/docs/non-interactive-mode`, 소스 `https://github.com/openai/codex` 커밋 `afb436d`의 `codex-rs/exec/src/cli.rs`, `codex-rs/utils/cli/src/shared_options.rs`, `codex-rs/exec/src/lib.rs`. 공식 플래그 표(`developer-commands`의 `execOptions`)는 렌더링되는 컴포넌트라 마크다운 원본에 없어, 플래그는 소스의 clap 정의로 확인했다.

| 목적 | 플래그 / 동작 |
|---|---|
| 도구 끄기 | 전용 "도구 전부 끄기" 플래그는 문서와 소스에서 확인하지 못했다. 대신 기본이 읽기 전용 샌드박스: "By default, `codex exec` runs in a read-only sandbox" (문서 53행). |
| JSON 출력 | `--json`: stdout이 JSONL 스트림. 이벤트 `thread.started`, `turn.started`, `turn.completed`(usage 포함), `turn.failed`, `item.*`, `error` (문서 74행). `-o/--output-last-message <FILE>`: 마지막 메시지를 파일에 쓰고 stdout에도 출력. `--output-schema <FILE>`: 최종 응답의 JSON Schema (`cli.rs:53, 64-77`). |
| 기본 출력 | 진행 상황은 stderr, 최종 메시지만 stdout (문서 27행). |
| 샌드박스/권한 | `--sandbox/-s`(`read-only`, `workspace-write`, `danger-full-access`), `--dangerously-bypass-approvals-and-sandbox`(별칭 `--yolo`), `--full-auto`는 deprecated (문서 55-60행, `shared_options.rs:40-59`). |
| 시스템 프롬프트 | 전용 `--system-prompt` 플래그는 확인하지 못했다. 설정 키 `model_instructions_file`이 있고 `-c model_instructions_file=...`로 CLI 적용되는 테스트가 있다 (`codex-rs/core/tests/suite/cli_stream.rs:292-296`, 스키마 `codex-rs/core/config.schema.json:1285`). 이 키의 공식 사용자 문서는 확인 못함. |
| 작업 디렉터리 | `--cd/-C <DIR>` (`shared_options.rs:66-68`). Git 저장소 밖이면 `--skip-git-repo-check` 필요 (문서 184-186행, `lib.rs:1008-1014`). |
| 격리 | `--ephemeral`(세션 파일 미저장), `--ignore-user-config`(`$CODEX_HOME/config.toml` 미로드, "auth still uses `CODEX_HOME`"), `--ignore-rules`, `--model/-m`, `-c key=value` (`cli.rs:37-51`, `shared_options.rs:21-23`). |
| 입력 | 인자 프롬프트 또는 stdin. `codex exec -`는 stdin 전체가 프롬프트, 인자와 stdin을 같이 주면 stdin이 `<stdin>` 블록으로 추가 (`cli.rs:79-84`, 문서 39행, 323-387행). |
| 인증 | 저장된 CLI 로그인을 기본 재사용. `CODEX_API_KEY`는 `codex exec` 호출에 한해 인라인으로 지정 (문서 129-150행). `codex login status`는 자격증명이 있으면 종료 코드 0 (`developer-commands.md:240`). |
| 종료 코드 | 소스상 오류 시 `std::process::exit(1)` (`lib.rs:1393-1396`, 프롬프트 누락·스키마 오류 등도 1). 문서는 종료 코드 표를 제공하지 않는다(**확인 못함**). 실패는 JSONL의 `turn.failed`/`error` 이벤트로 나온다. |

## 4. Fathomark 적용 판단

### 결론

**조건부로 채택 가능하나 "기본값"으로는 권하지 않는다.** 기술적으로는 두 CLI 모두 도구를 끈 단발 호출이 가능해서 Fathomark의 고정 단계 워크플로(ADR 0007)에 맞다. 걸림돌은 기술이 아니라 정책의 모호함이다.

1. **Claude Code 구독 경로는 약관상 회색 지대다.** 금지 문구(제3자의 "route requests through ... plan credentials on behalf of their users", Agent SDK 앱의 구독 로그인)와 허용 문구(최종 사용자가 수정하지 않은 바이너리에 자기 구독으로 로그인)가 동시에 있고, "앱이 사용자의 로컬 CLI를 대신 호출"하는 경우를 직접 다루는 문장은 없다. Cline이 하고 있다는 사실은 허락의 증거가 아니다. 확정이 필요하면 Anthropic에 서면으로 문의해야 한다(`legal-and-compliance` 페이지 자체가 문의 경로를 안내).
2. **Codex는 상대적으로 낫다.** 공식 SIWC(오픈소스/로컬 앱용 ChatGPT 플랜 OAuth)가 존재하고, `codex exec`가 로그인된 CLI 인증을 재사용하는 것은 공식 동작이다. 다만 OpenAI 이용약관 원문은 확인하지 못했다.
3. **데이터 외부 전송은 구독이어도 동일하다.** Vault 내용이 Anthropic/OpenAI로 나가므로 ADR 0007의 "무엇이 전송되는지 보여 주는 명시적 동의"가 그대로 필요하다. 구독 CLI는 API 키가 없어도 같은 동의 화면이 필요하다.

### 조건 (채택 시 반드시)

- **토큰을 절대 만지지 않는다.** `~/.claude/.credentials.json`, Keychain, `CLAUDE_CODE_OAUTH_TOKEN`, `~/.codex/auth.json`을 읽거나 복사하거나 저장하지 않는다. 인증은 CLI에만 맡긴다.
- **수정하지 않은 공식 바이너리만 실행하고**, 사용자가 직접 설치·로그인한 것만 쓴다. Fathomark가 설치·로그인을 대행하거나 자격증명을 입력받지 않는다.
- **Agent SDK 패키지를 번들하지 않는다.** 로컬 `claude` 실행 파일을 PATH 또는 사용자가 지정한 경로로만 실행한다.
- **사용자 한 명, 사용자 기기, 사용자 조작에서 시작된 요청만** 보낸다. 백그라운드 대량 호출, 계정 공유, 호스팅 중계는 하지 않는다("ordinary, individual usage").
- **설정 화면에 "Anthropic/OpenAI 정책에 따라 변경될 수 있고 계정 제재 가능성은 사용자 책임"이라는 고지**를 둔다. 이용 불가 시 API 키 provider나 로컬 provider로 되돌아가는 경로를 유지한다.
- 브랜딩: 제품 이름에 "Claude Code"를 쓰지 않는다 (Agent SDK 개요의 Branding guidelines는 SDK 사용자 대상이지만, legal 문서도 이름 사용을 제한한다). "Claude Code를 실행한다"는 평문 설명은 허용된다.

### 위험

- 약관 해석이 바뀌거나 집행이 시작되면 기능이 갑자기 막히거나 사용자 계정에 불이익이 갈 수 있다 ("may do so without prior notice").
- 구독 한도(5시간·주간) 소진 시 호출이 실패한다. 근거 있는 글쓰기는 입력이 길어 한도를 빨리 쓸 수 있다.
- `--bare`가 구독과 호환되지 않아 사용자의 `~/.claude` 설정, 훅, CLAUDE.md가 기본적으로 적용된다. `--safe-mode`나 `--setting-sources`로 격리하지 않으면 사용자 훅이 실행되거나 출력이 달라질 수 있다.
- CLI 플래그와 출력 스키마가 빠르게 바뀐다(문서에 v2.1.x 요구 조건이 수시로 붙음). 버전 감지와 `system/init`의 `capabilities` 확인이 필요하다.
- Windows에서는 긴 시스템 프롬프트를 인자로 넘길 수 없다(Cline이 겪은 `ENAMETOOLONG`). Fathomark는 desktop-only라 Windows 포함 가능성이 있으므로 파일 방식이 필수다.

### 권장 호출 형태 (공식 플래그 기준, 이 환경에서 실행 검증은 하지 않음)

Claude Code (도구 없음, 단발, 구독 로그인 유지):

```text
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN claude -p \
  --tools "" --disallowedTools "mcp__*" \
  --safe-mode --no-session-persistence \
  --system-prompt-file <임시파일> \
  --output-format json --model <alias> \
  < prompt.txt      # 프롬프트는 stdin, cwd는 Vault 밖 빈 임시 디렉터리
```

- `--bare`는 쓰지 않는다(구독 인증을 읽지 않음). `ANTHROPIC_API_KEY`는 반드시 제거한다(`-p`에서는 키가 있으면 항상 키가 쓰여 종량 과금이 된다).
- 증거 인용이 필요하면 `--json-schema`로 구조화 출력을 받는다. 출력은 `result`와 `is_error`, `subtype`을 검사하고, 종료 코드 0이 아니거나 `is_error`가 true이면 실패로 처리한다. `rate_limit_event`와 "hit your ... limit" 문구는 "한도 소진" 사용자 메시지로 변환한다.
- 스트리밍이 필요하면 `--output-format stream-json --verbose --include-partial-messages`로 바꾸되, 줄 단위 파싱과 잘린 줄 합치기는 Cline 구현을 참고한다(구 구현 `run.ts:243-273`).
- 위 플래그 조합(`--tools ""`와 `--safe-mode`의 동시 사용, 구독 로그인에서의 동작)은 실제로 돌려 보지 않았다. 채택 전에 사용자 환경에서 `claude --version` 확인과 스모크 테스트가 필요하다.

Codex (읽기 전용, 단발):

```text
env -u OPENAI_API_KEY -u CODEX_API_KEY codex exec \
  --sandbox read-only --ephemeral --ignore-user-config --ignore-rules \
  --skip-git-repo-check -C <빈 임시 디렉터리> \
  --json --output-schema schema.json - < prompt.txt
```

- 도구를 끄는 공식 플래그가 없으므로 읽기 전용 샌드박스와 빈 작업 디렉터리로 위험을 줄이고, `item.*` 중 `agent_message`만 사용한다. 이벤트 `turn.failed`/`error`와 종료 코드 1을 실패로 취급한다.
- 시스템 프롬프트 지정은 문서화된 방법이 없어(`model_instructions_file`은 소스·테스트에서만 확인), 지시문은 프롬프트 본문에 넣는 편이 안전하다.

### 권장 순서

1. 기존 API 키 provider를 기본으로 두고, 구독 CLI provider는 "실험적" 옵션으로 별도 표기한다.
2. OpenAI는 구독 CLI 호출보다 SIWC 공식 흐름 도입 가능성을 먼저 검토한다(앱이 오픈소스여야 하는지, 미리보기 제약이 수용 가능한지 확인 필요).
3. Anthropic은 위 모호성 때문에 Fathomark가 정식 지원 전에 Anthropic에 해석을 문의한다.

## 확인하지 못한 항목

- OpenAI 이용약관(Terms of Use) 원문 (HTTP 403).
- Anthropic Consumer Terms의 영어 원문 (한국어 번역본만 수신).
- `ai-sdk-provider-claude-code`, `ai-sdk-provider-codex-cli` 패키지 내부의 실제 CLI 플래그 (Cline 저장소 밖).
- Roo Code가 제거한 Claude Code provider의 소스와 제거 사유.
- Anthropic이 Cline 등에 부여한 예외("previously approved") 존재 여부.
- `claude -p`의 비영 종료 코드별 의미, `codex exec`의 종료 코드 표.
- Codex에서 도구를 완전히 끄는 플래그, 시스템 프롬프트 플래그의 공식 문서.
