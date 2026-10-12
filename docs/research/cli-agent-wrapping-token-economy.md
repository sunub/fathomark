# CLI 위에서 동작하는 에이전트 도구들의 토큰 절감 사례 조사

> 기록 (2026-10-05). Codex CLI 작성 경로([ADR 0010](../adr/0010-local-curation-codex-drafting.md))의 고정 토큰과 절감 수단 근거로 쓴다. 현재 방향은 [DIRECTION.md](../DIRECTION.md).

확인일: 2026-10-05. 코드는 수정하지 않았다. 근거는 공식 문서와 공식 저장소 소스뿐이며, 확인하지 못한 항목은 "확인 못함"으로 적었다. 이전 노트 [subscription-cli-providers.md](subscription-cli-providers.md)(약관, Cline 구 구현의 플래그)와 겹치는 내용은 반복하지 않는다. `[내 해석]`은 소스에서 직접 확인하지 않은 추론이다.

조사 기준 커밋 (모두 `https://github.com/<repo>/blob/<commit>/<path>#L<line>` 형태로 열린다):
cline/cline `39ff235`, ben-vargas/ai-sdk-provider-claude-code `c790fb6`(v4.3.3), ben-vargas/ai-sdk-provider-codex-cli `88eaa5c`(v2.3.0), zed-industries/claude-code-acp `a44c486`, zed-industries/codex-acp `296069e`, agentclientprotocol/codex-acp `ca1d971`, sst/opencode `907b3bc`, openai/codex `afb436d`, RAIT-09/obsidian-agent-client `3d069c9`, YishenTu/claudian `43424e3`. 줄 번호 앞의 경로는 해당 저장소 기준이다.

## 용어

- 💡 세션 재개(resume): CLI가 디스크에 저장한 이전 대화 기록을 불러와 이어서 진행하는 기능입니다. 앱이 이력을 다시 보내지 않아도 되지만, 모델 요청 자체는 매번 전체 이력을 담습니다.
- 💡 프롬프트 캐싱(prompt caching): 요청 앞부분(prefix)이 직전 요청과 완전히 같으면 그 부분을 재처리하지 않고 할인된 비용(캐시 읽기)으로 처리하는 서버 기능입니다.
- 💡 ACP(Agent Client Protocol): 편집기(클라이언트)가 코딩 에이전트를 자식 프로세스로 띄워 JSON-RPC로 대화하는 표준 프로토콜입니다.
- 💡 app-server: Codex를 장기 실행 프로세스로 띄우고 JSON-RPC로 스레드(대화)를 열고 이어가는 공식 인터페이스입니다.
- 💡 compaction(압축): 대화가 길어지면 오래된 부분을 요약이나 삭제로 줄여 컨텍스트를 확보하는 작업입니다.

## 요약

1. 조사한 어떤 도구도 "CLI 고정 오버헤드"를 직접 줄이는 기법을 쓰지 않았다. Cline은 CLI의 도구 정의를 아예 보내지 않고(`provider-tools`), 나머지는 CLI 기본값(사용자 설정 로드 포함)을 그대로 쓴다.
2. Cline은 호출마다 새 모델 객체를 만들어 세션을 재사용하지 않고, 전체 이력을 문자열 하나로 다시 보낸다 `[내 해석]`. 토큰 관리는 CLI가 아니라 앱 쪽 압축(90% 도달 시 요약)에 맡긴다.
3. 세션을 오래 유지하는 쪽(Zed ACP 어댑터, Claudian, app-server)은 프로세스를 장기 실행하고 CLI의 resume/compact에 위임한다.
4. 공식 문서가 제공하는 고정 오버헤드 절감 수단은 Claude에 풍부하다(`--tools ""`, `--system-prompt`, `--setting-sources`, `--strict-mcp-config`). 단 `--bare`는 구독 로그인을 쓰지 못해 Fathomark에 맞지 않는다. Codex는 `model_instructions_file`과 MCP/기능 끄기가 있고, 소스에는 `--ignore-user-config`도 있다(문서에는 없음).
5. 구독 한도에서 입력/캐시 토큰이 어떻게 세어지는지는 양쪽 모두 공식 설명을 찾지 못했다. 가장 유효한 다음 단계는 실측 A/B이다.

## 사례 비교표

| 사례 | 실행 방식 | 프로세스 수명 | 세션/이력 | 고정 오버헤드 대응 | 토큰 관리 | 중단 |
|---|---|---|---|---|---|---|
| Cline claude-code (현) | Agent SDK 래퍼(서드파티 npm) | 호출당 새 query `[내 해석]` | 매 호출 전체 이력을 문자열로 재전송 | 도구 정의 미전송, CLI 설정은 로드(`user`,`project`) | 앱 압축(trigger 0.9) | AbortSignal 전달 |
| Cline codex-cli | `codex exec --experimental-json` | 호출당 spawn | 재개 없음(소스에 resume 없음) | 확인 못함 | 위와 동일 | SIGTERM |
| opencode | CLI 래핑 없음. ChatGPT OAuth 직접 호출 | 해당 없음 | 자체 세션 DB | 해당 없음 | 오래된 도구 출력 prune + 압축 | 확인 못함 |
| Zed claude-code-acp | Agent SDK `query()` | 세션당 장기 실행 | 스트리밍 입력, 재개 지원 | `claude_code` preset, 설정 3종 로드 | CLI 자체 압축 | `interrupt()` + 강제 종료 타이머 |
| Zed/ACP codex-acp | 구: codex-core 내장. 신: Codex App Server | 장기 실행 | 스레드 재개, `/compact` | 확인 못함 | `/compact` | `Op::Interrupt` |
| Vercel claude-code 제공자 | Agent SDK | 호출당 | 문자열 재전송 + 인스턴스에 sessionId가 있으면 resume | `settingSources` 기본 `[]` | 없음 | AbortSignal |
| Vercel codex-cli 제공자 | exec 또는 app-server | exec: 호출당 / app-server: 공유 프로세스 | app-server: 기본 임시 스레드, `threadId`로 이어가기 | `baseInstructions` 지정 가능 | 없음 | SIGTERM |
| obsidian-agent-client | ACP 에이전트 spawn | 장기 실행 | ACP `session/load` | 해당 없음 | 해당 없음 | `session/cancel` + 프로세스 그룹 SIGTERM |
| Claudian | Agent SDK + `codex app-server` | persistent 수명 옵션 | SDK resume | 확인 못함 | 확인 못함 | `interrupt()` + SIGTERM |

## 사례별 핵심

### 1. Cline (가장 자세히)

- 실제로 한 일(1): 도구 정의를 보내지 않는다. `provider-tools` 능력이 있으면 외부 도구 실행을 끈다: `sdk/packages/llms/src/providers/ai-sdk.ts:943-947, 2272-2282`. 이유는 CLI가 자체 도구를 실행하고 외부 도구를 연결할 수 없어서다: `sdk/packages/llms/src/providers/builtins.ts:1200-1231`.
- 실제로 한 일(2): 시스템 프롬프트는 CLI 플래그가 아니라 AI SDK `system`으로 넘기고(`ai-sdk.ts:2297-2333`), 제공자가 이를 이력과 함께 한 문자열(`Human:`/`Assistant:` 접두)로 합친다: `ai-sdk-provider-claude-code src/convert-to-claude-code-messages.ts:583-600`. `--system-prompt`는 `systemPrompt` 설정이 있을 때만 쓰이는데(`src/claude-code-language-model.ts:1952`), Cline은 설정하지 않는다(`community.ts:100-137`). 따라서 CLI 기본 프롬프트가 남는다.
- 실제로 한 일(3): 이력 중 도구 호출 입력은 1000자로 자른다: `convert-to-claude-code-messages.ts:39-60`.
- 세션: Cline은 매 요청 `provider.operations.language(id)`로 새 모델을 만들고(`community.ts:140-142`), resume용 sessionId는 모델 인스턴스에만 저장된다(`claude-code-language-model.ts:1267-1275`). 그래서 호출 간 재개는 일어나지 않는다 `[내 해석]`.
- 압축: 기본 전략 `agentic`(`core/src/extensions/context/compaction.ts:296`), 트리거 0.9, 최대 입력 기본 128k, 최근 20k 토큰 보존(`compaction-shared.ts:13,17,27`). 요약은 같은 제공자 설정으로 호출하므로(`agentic-compaction.ts:75`) CLI 제공자에서는 요약 한 번이 CLI 호출 한 번이다 `[내 해석]`. 한 요청 입력 추정에 직전 실제 입력 토큰을 하한으로 쓴다(`compaction.ts:315-325`).
- 표시/오류: 구독이면 비용 표시를 숨긴다(`builtins.ts:1222-1226`, `llms/src/providers/billing.ts:22-34`). 모델 요청 재시도 5회(`ai-sdk.ts:1088`). 사용량 한도 전용 분기는 확인 못함.
- 문서: Cline 문서는 "Image uploads and prompt caching are limited in this mode"라고 적는다: `docs/provider-config/anthropic.mdx:32-47`.
- Codex: `openai-codex-cli`는 `createCodexExec`(`community.ts:160`)로 호출당 `codex exec --experimental-json`을 띄운다(`ai-sdk-provider-codex-cli src/exec-language-model.ts:253,1095`). 별도로 `openai-codex`는 CLI 없이 ChatGPT OAuth를 직접 쓴다(`builtins.ts:1140-1152`).
- 이식 가능성: 도구 정의 미전송은 Fathomark에 그대로 이식 가능(어차피 도구 없는 글쓰기). 매 호출 이력 재전송과 압축 요약은 오히려 피해야 할 패턴이다.

### 2. 다른 도구

- Roo Code: Claude Code provider는 3.42.0에서 제거됨(이전 노트 1-3절). 이번에 재확인한 것은 없다.
- opencode: `claude-agent-sdk`, `claude -p`, `codex exec` 참조가 소스에 없다(저장소 검색 0건). Codex는 `https://chatgpt.com/backend-api/codex/responses`를 OAuth로 직접 호출한다: `packages/opencode/src/plugin/openai/codex.ts:10-12`. 토큰 절감은 오래된 도구 출력을 지우는 prune(보호 40k, 최소 20k 이득일 때만): `src/session/compaction.ts:28-29, 273-`. 이식 가능성: CLI 위 기법이 아니라 이식 대상 아님.
- Zed claude-code-acp: 세션당 `Pushable` 입력으로 장기 실행 `query()`를 유지(`src/acp-agent.ts:9201, 9564`), `claude_code` preset(`9235`), `settingSources: ["user","project","local"]`(`9401`). 즉 오버헤드를 줄이는 쪽이 아니라 CLI 기능을 전부 쓰는 쪽이다. 취소는 `interrupt()` 후 일정 시간 내 응답 없으면 강제 종료(`365-373`). 이식 가능성: 중단 처리 패턴은 유용, 설정 로드는 반대 방향.
- Zed codex-acp(구): `codex-core`를 내장하고 `ThreadManager`로 롤아웃 재개(`src/codex_agent.rs:689`), `Op::Interrupt`(`src/thread.rs:3331`). 신 `agentclientprotocol/codex-acp`는 Codex App Server를 시작해 번역한다(README). 토큰 절감 장치는 `/compact` 명령 외에 확인 못함.
- Continue, Aider: GitHub 코드 검색에서 `claude-agent-sdk`, `codex exec`, `claude -p`가 0건이었다. 검색 한계가 있어 "없다"고 단정하지 않는다. 확인 못함.

### 3. Vercel AI SDK 커뮤니티 제공자와 공식 SDK/프로토콜

- claude-code 제공자: 호출마다 Agent SDK 쿼리를 실행. 이력은 문자열로 재전송하고, 같은 모델 인스턴스를 재사용할 때만 `resume`을 붙인다(`claude-code-language-model.ts:1267-1275`). `settingSources` 기본 `[]`로 사용자 설정을 로드하지 않는다(`1971-1979`). preset 사용 시 `excludeDynamicSections`로 캐시 공유 가능(`README.md:357`). 토큰 합계는 입력+캐시쓰기+캐시읽기로 계산(`795-813`).
- codex-cli 제공자: exec 방식은 호출당 spawn(`exec-language-model.ts:1095`), `-c` 오버라이드로 설정 전달(`253-300`). app-server 방식은 공유 프로세스이며 기본은 호출마다 임시 스레드, `threadId`를 넘기면 이어간다(`README.md:18, 95-142`). `baseInstructions`/`developerInstructions` 전달(`src/app-server/language-model.ts:303-305`).
- Claude Agent SDK: 스트리밍 입력 모드가 "long lived process" 권장 방식(`https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode`). 호스팅 문서는 세션당 장기 쿼리를 권장하고 `startup()`/`prewarm()`으로 서브프로세스를 미리 띄운다(`https://code.claude.com/docs/en/agent-sdk/hosting`, `.../typescript#startup`). SDK 기본 시스템 프롬프트는 최소형이고 `claude -p`는 Claude Code 프롬프트를 쓴다(`.../modifying-system-prompts`).
- Codex app-server: stdio JSON-RPC, `thread/start|resume|fork`, `turn/interrupt`, `thread/compact/start`, `thread/tokenUsage/updated`(`https://learn.chatgpt.com/docs/app-server.md`). 시작 파라미터에 `base_instructions`가 있다: `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:104`. Codex SDK는 `startThread`/`resumeThread`이며 `codex mcp-server`는 제거됨(`https://learn.chatgpt.com/docs/codex-sdk.md`).
- ACP: JSON-RPC, `session/new|load|prompt|cancel`, 에이전트는 클라이언트의 자식 프로세스(`https://agentclientprotocol.com/protocol/overview`). MCP는 도구 연결 규약이며 토큰 절감 수단으로는 이번에 확인한 바 없다. Claude는 MCP 도구 정의를 기본 지연 로드한다(`https://code.claude.com/docs/en/costs`, "Reduce MCP server overhead").
- 이식 가능성: 제공자 두 개는 참고 구현. 단 Agent SDK 사용은 약관 문제가 남는다(이전 노트 2-1). Codex app-server는 공식 인터페이스이나 구독 사용 허용 여부는 이전 노트 2-2에서 "모호".

### 4. 공식 문서의 절감 수단

Claude Code (`https://code.claude.com/docs/en/cli-reference`, 확인일 2026-10-05):
- `--system-prompt`는 기본 프롬프트 전체 교체, `--append-system-prompt`는 뒤에 추가. 교체하면 도구 안내와 안전 지침도 사라진다.
- `--tools ""`는 내장 도구 전부 비활성, `--disallowedTools "*"`는 모든 도구 제거, `--strict-mcp-config`, `--disable-slash-commands`, `--setting-sources user,project,local`로 로드 범위를 제한한다.
- `--bare`는 hooks, skills, MCP, auto memory, CLAUDE.md 자동 탐색을 건너뛴다. 그러나 "bare mode doesn't use your subscription login"이라 API 키가 필요하다(`https://code.claude.com/docs/en/headless`). 구독 사용 목적에는 부적합하다.
- 환경 변수/설정: `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`, `includeGitInstructions:false`(`.../agent-sdk/modifying-system-prompts`, "Turn off the context your agent replaces").
- 캐시: 앞부분이 정확히 같아야 적중하고, 구독은 플랜 한도 내에서 1시간 TTL(`https://code.claude.com/docs/en/prompt-caching`). 고정부와 가변부를 `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 줄로 나눌 수 있다(v2.1.275 이상, `cli-reference` 시스템 프롬프트 절). `--exclude-dynamic-system-prompt-sections`는 `--system-prompt` 사용 시 무시된다.
- 재개: `--resume`/`--continue`는 전체 대화를 다시 보내되 캐시가 살아 있으면 읽는다(`prompt-caching` "Resuming a session"). 첫 요청의 시스템 프롬프트가 기록돼 재개 시 재사용된다. `--no-session-persistence`는 재개 불가.
- 한도 계산: 비용 문서는 "Claude Code re-reads that history at the cached token rate, so a one-line question ... still draws usage for the whole conversation"이라고만 설명한다(`https://code.claude.com/docs/en/costs`, "Why usage climbs in a long session"). 캐시 토큰의 한도 가중치는 확인 못함.

Codex (`https://learn.chatgpt.com/docs/config-file/config-reference.md`, `.../developer-commands.md`):
- `model_instructions_file`은 내장 지침을 AGENTS.md 대신 교체, `developer_instructions`는 추가 지침, `project_doc_max_bytes`는 AGENTS.md 읽기 상한.
- `mcp_servers.<id>.enabled`/`enabled_tools`, `features.apps`/`multi_agent`/`memories`로 도구와 기능을 끈다. `tool_output_token_limit`, `model_auto_compact_token_limit`로 이력 크기를 관리.
- `codex exec resume`으로 비대화형 재개(`developer-commands.md`). 소스에는 `--ephemeral`(세션 파일 미저장), `--ignore-user-config`("auth still uses CODEX_HOME"), `--ignore-rules`가 있다: `codex-rs/exec/src/cli.rs:40-50`. 이 세 플래그를 문서에서는 찾지 못했다(확인 못함).
- 한도 계산: 토큰은 "prompt, files, chat history, tool results"를 포함하고, 크레딧 요율표에 캐시 입력 요율이 따로 있으며 "no separate cache-write charge"라고 한다. 같은 문서가 "Credit prices alone don't determine included subscription usage"라고 밝혀(`https://learn.chatgpt.com/docs/pricing.md`) 구독 한도의 캐시 가중치는 확인 못함. Codex의 프롬프트 캐싱 동작 설명도 확인 못함.

### 5. Obsidian 커뮤니티 플러그인

- obsidian-agent-client: ACP 에이전트를 `spawn`, `cwd`는 설정된 작업 디렉터리, `detached`로 프로세스 그룹을 만들어 `process.kill(-pid,"SIGTERM")`로 트리 종료(Windows는 `taskkill /T`): `src/acp/acp-client.ts:253-260, 636-662`. 중단은 `session/cancel` 알림(`614-628`). PATH는 Windows에서 레지스트리 PATH를 보강하고 Node 경로를 추가(`172-192`), 그 외는 `$SHELL -l -c`로 로그인 셸 환경을 얻는다: `src/utils/platform.ts:290-311`. 빈 API 키는 주입하지 않는다(`acp-client.ts:196-200`). 토큰 절감 장치는 확인 못함.
- Claudian: Agent SDK의 `spawnClaudeCodeProcess`를 자체 구현해 `cwd`, 보강 PATH(`src/core/process/env.ts:266`)로 spawn하고, Electron의 AbortSignal 불일치 때문에 `signal`을 spawn에 직접 넘기지 않고 abort 시 `SIGTERM`을 수동으로 보낸다: `src/providers/claude/runtime/customSpawn.ts:40-55`. persistent 수명 옵션(`execution/ClaudeExecutionSession.ts:176`), 중단은 `query.interrupt()`(`ClaudeExecutionStrategies.ts:170,201,348`). Codex는 `codex app-server --listen stdio://`(`providers/codex/runtime/CodexLaunchSpecBuilder.ts:19`). 이식 가능성: spawn, PATH, 중단 처리는 Fathomark에 직접 참고 가능(특히 Electron AbortSignal 문제).

## Fathomark 적용 후보 (우선순위)

| 순위 | 기법 | 근거 | 위험/전제 |
|---|---|---|---|
| 1 | 실측 A/B부터 한다. Codex `--ephemeral --ignore-user-config` 등으로 입력 토큰 변화를 측정(사용자 실측: 27k에서 빈 CODEX_HOME 18k) | 소스 `exec/src/cli.rs:40-50` | `--ignore-user-config`가 `CODEX_HOME` 교체와 같은 효과인지는 미검증 |
| 2 | 도구와 설정 끄기. Claude: `--tools ""`, `--setting-sources`, `--strict-mcp-config`, `--disable-slash-commands`. Codex: MCP/기능 끄기, `model_instructions_file`. 작업 디렉터리는 빈 임시 폴더 `[내 해석]` | 공식 문서(4절) | `--system-prompt` 교체는 안전 지침 상실, 글쓰기 품질 검증 필요 |
| 3 | 고정 지침을 앞, 노트 근거를 뒤로 두어 접두 일치를 유지. Claude는 경계 마커 활용 | `prompt-caching`, `cli-reference` | 구독 한도에서 캐시 이점이 있는지 미확인 |
| 4 | 이력 재전송 대신 요청별 근거만 담은 단발 호출. 다회 대화에만 resume 사용 | Cline의 전체 재전송이 반면교사, Claude/Codex 재개 문서 | resume은 디스크에 대화 기록이 남음(`--ephemeral`/`--no-session-persistence`와 양립 불가) |
| 5 | 사용량 표시는 토큰으로(비용 숨김). 결과의 usage(Claude result, Codex `turn.completed`, app-server `tokenUsage`)를 파싱 | Cline `builtins.ts:1222-1226` | Codex exec JSON의 정확한 필드명은 미확인 |
| 6 | 중단/프로세스: 인자 배열 spawn, 프로세스 그룹 종료, abort 시 SIGTERM 수동 처리, 로그인 셸 PATH | obsidian-agent-client, Claudian | Windows 별도 처리 |
| 7 | 장기 실행(Codex app-server, Agent SDK 스트리밍 입력). 시작 지연 절감이 목적이며 토큰 절감은 아님 | 공식 문서 | 구독 사용 정책 모호, 복잡도 증가 |

LLM 요약을 위한 별도 CLI 호출(Cline식 agentic 압축)은 호출 자체가 오버헤드를 한 번 더 지불하므로 Fathomark에서는 비권장이다 `[내 해석]`.

## 아직 모르는 점

- 구독 한도에서 입력 토큰, 캐시 읽기/쓰기 토큰의 가중치(Claude, Codex 모두 공식 설명 확인 못함).
- Codex의 남은 약 18k 토큰의 구성(기본 지침, 도구 정의, 기타)과 `model_instructions_file`, `--ignore-user-config`가 줄이는 양.
- 서로 다른 `codex exec`/`claude -p` 호출 사이에서 동일 접두가 실제로 캐시되는지.
- Cline이 구독 사용량 한도 오류를 별도 처리하는지, Agent SDK 내부의 abort 처리(닫힌 소스라 확인 못함).
- Roo Code, Continue, Aider에서 CLI 구독을 래핑하는 코드 존재 여부(Roo는 제거 사실만 확인, 나머지 검색 0건).
- OpenAI 이용약관 원문(403으로 접근 막힘, 이전 노트 2-2 참고).
