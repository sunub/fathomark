# LangChain / LangGraph / Deep Agents 적합성 검증

검증일 2026-10-05. 환경: Node v24.18, esbuild 0.28.2, scratchpad 설치 (`/private/tmp/claude-501/-Users-sunub-workspace-fathomark/41a79216-8247-47f3-9c63-5f226d9a2683/scratchpad/lc-spike`, 저장소 미수정).
근거는 설치된 패키지의 타입/소스와 실행 실험이며, 공식 웹 문서는 열람하지 않았다(해당 항목은 "확인 못함").

## 1. 패키지와 버전 (npm registry 실측)

| 패키지 | 최신 | engines.node | 직접 의존성 |
|---|---|---|---|
| langchain | 1.5.15 | >=20 | zod, langsmith, @langchain/langgraph, langgraph-checkpoint |
| @langchain/core | 1.2.14 | >=20 | zod, p-queue, mustache, langsmith, js-tiktoken, @cfworker/json-schema, @standard-schema/spec |
| @langchain/langgraph | 1.4.19 | >=18 | protocol, standard-schema, langgraph-sdk, langgraph-checkpoint |
| deepagents (JS) | 1.14.1 | 명시 없음 | zod ^4.3.6, yaml, fast-glob, micromatch (+ peer: langchain, core, langgraph, checkpoint, sdk, langsmith) |

- 전체 설치 트리 약 46개 패키지, node_modules 81MB.
- 💡 Electron 렌더러: Obsidian 데스크톱 앱의 화면 프로세스로, 브라우저 API에 Node 일부가 섞인 환경이다. 플러그인은 `platform: "browser"` + Node 내장 모듈 external로 번들한다.
- deepagents는 `exports`에 `browser` 조건과 `deepagents/browser` 진입점이 있고, README가 브라우저용으로 권장한다. Electron 실제 구동은 하지 않았다: **확인 못함**.
- 주의: 플러그인 package.json은 zod `^3.24`(설치 3.25.76), langchain 1.5.x는 zod `^3.25.76 || ^4` 허용이라 호환된다. deepagents는 zod ^4.3.6 요구 -> 도입 시 zod 4 승격 필요. 참고로 `plugin/node_modules`에 package.json에 없는 langchain 심볼릭 링크가 남아 있다(문서 외 관찰).

## 2. 번들 크기 실측 (minified, `--bundle --minify --platform=… --format=cjs`)

현재 플러그인 `main.js`는 306KB, 예산은 900KB(`plugin/build.mjs`). 아래 수치는 해당 진입점 **단독** 크기다(플러그인 코드와 중복 없음, React 등 별도).

| 진입점 | platform=node | platform=browser (build.mjs와 동일, builtins external) |
|---|---|---|
| (a) @langchain/core (messages, tools, runnables, BaseChatModel) | 975KB | 974KB |
| (a') core의 messages 두 개만 import | - | 298KB |
| (b) langchain `createAgent` | 1370KB | 1369KB |
| (c) langgraph StateGraph+interrupt+MemorySaver | 1305KB | 1304KB |
| (d) deepagents `createDeepAgent` | 1854KB | 1800KB (`deepagents/browser`도 1800KB) |

- 구성(browser, KB): (a) zod 502, core 233, langsmith 202. (b) zod 506, core 382, langsmith 205, langgraph 170. (d) zod 507, core 382, langsmith 239, langgraph 176, langgraph-sdk 110, deepagents 104.
- tree-shaking은 부분적이다. messages만 가져와도 298KB(langsmith 202KB가 따라옴). zod는 v3/v4 양쪽이 번들되어 500KB 안팎이 고정 비용이다(zod 단독 import는 442KB).
- 어느 진입점이든 단독으로 현재 예산 900KB 대비 core만 +670KB, createAgent는 +1.06MB(총 약 1.4MB로 예산 초과), deepagents는 +1.5MB다. 예산 상향 또는 지연 로딩이 필요하다.
- Node 전용 모듈: browser 번들에서 (a)(b)(c)는 external로 남는 Node 모듈이 없었고, (d)는 `node:fs/promises`, `node:path`, `path`, `util`, `ws`가 남는다. `ws`(웹소켓)는 langgraph-sdk 경유. platform=node 번들은 `child_process`, `os`, `fs`까지 끌려온다(LocalShellBackend, FilesystemBackend). 네이티브 애드온은 없었다. Obsidian(Electron)에서 `node:` 접두 require가 통과하는지는 **확인 못함**(build.mjs의 builtins 목록은 `node:` 접두 없는 이름이라 확인 필요).

## 3. LangGraph 적합성 (소스 + 실행 확인)

- 💡 StateGraph: 상태(채널) 스키마와 노드, 엣지로 흐름을 정의하는 LangGraph의 그래프 빌더.
- 상태는 `Annotation.Root({...})`(또는 `StateSchema`+zod)로 정의. `addNode`, `addEdge`, `addConditionalEdges(from, (state)=>다음노드|END)`로 고정 단계 + 분기(검증 실패 시 초안으로 되돌림)가 표현된다. 실행 확인함.
- 함정: 노드 이름이 상태 키와 같으면 컴파일 시 에러(`draft`가 키이자 노드면 불가). 단계 이름과 상태 키를 분리해야 한다.
- 💡 interrupt/Command: 노드 안에서 `interrupt(값)`을 호출하면 실행이 멈추고 그 값이 호출자에게 노출되며, `new Command({resume: 값})`으로 같은 thread_id에서 이어간다. 실험: 승인 노드에서 정지 -> `getState().tasks[0].interrupts`에 미리보기 값 확인 -> resume 후 `approved:true`로 종료. 사용자 승인 단계에 그대로 맞는다. 단 interrupt는 checkpointer가 있어야 동작한다.
- 💡 checkpointer: 각 단계 후 상태 스냅샷을 저장하는 저장소. `MemorySaver` 제공. 커스텀은 `BaseCheckpointSaver`의 `getTuple, list, put, putWrites, deleteThread`(실제 prototype에서 확인)를 구현하면 되므로 Obsidian `saveData`에 연결 가능해 보인다. 직접 구현·직렬화 테스트는 **하지 않음**.
- 스트리밍 모드(실행 확인): `values, updates, tasks, checkpoints, debug`가 수신됨. `messages`, `custom`은 해당 이벤트(LLM 토큰, 노드 내 writer)가 없어 이 실험에선 안 나옴. 모드 존재는 소스 기준.
- 취소: `invoke/stream`의 `signal` 옵션과 노드 `config.signal`로 전달됨. 실험에서 50ms 후 abort 시 노드가 던진 reason(`user-cancel`)으로 reject 됨. 노드가 signal을 직접 처리해야 하므로 ModelProvider.stream에 signal을 넘기는 제품 규칙과 맞다.

## 4. 커스텀 모델 연결

- 제품 `ModelProvider` -> LangChain: `BaseChatModel` 서브클래스에서 `_llmType`, `_generate`, 스트리밍용 `_streamResponseChunks`를 구현하고 내부에서 `provider.stream(request, signal)`을 호출하는 어댑터가 가능하다. `_generate` 호출과 콜백(`handleChatModelStart/End`) 실행을 실험으로 확인. `ModelEvent`와 `AIMessageChunk` 변환은 직접 해야 한다. LangChain 타입은 이 어댑터 파일 안에만 두면 경계가 유지된다.
- 도구 호출: `bindTools()`를 구현하고(여기서는 도구 스키마를 보관해 `ModelRequest.tools`로 넘기면 됨) `AIMessage.tool_calls`로 돌려주면 `createAgent`가 동작한다(fake 모델로 실행 확인).
- `withStructuredOutput(zod)`: core 1.2.14 소스상 `bindTools`가 없으면 즉시 throw(`Chat model must implement ".bindTools()"`), 기본 구현은 `functionCalling` 방식만 지원하고 `jsonMode`는 throw 한다(실행 확인). 즉 **도구 호출 미지원 모델에서는 기본 withStructuredOutput이 쓸 수 없다**. 우회: JSON을 프롬프트로 요청하고 우리 쪽에서 `zod.safeParse`로 검증하는 경로를 제품 코드로 두거나, 서브클래스가 `withStructuredOutput`을 오버라이드. 단 `ModelInfo.supportsTools`는 "프롬프트 JSON 에뮬레이션 미지원" 규칙이므로 정책 충돌 소지가 있다.

## 5. Deep Agents 적합성

- 기본 도구(1.14.1, fake 모델로 `createDeepAgent` 실행해 확인): `ls, read_file, write_file, edit_file, delete, glob, grep, task`(+ 내가 넘긴 도구). **`write_todos`는 README에는 포함으로 적혀 있으나 이 버전 기본 목록에는 없었고**, 소스상 Codex 계열 harness profile의 extraMiddleware에서만 추가된다.
- 끄기/교체: `tools` 옵션은 내장 도구를 제거하지 못한다(타입 주석 명시). `FilesystemMiddleware`, `SubAgentMiddleware`는 `REQUIRED_MIDDLEWARE_NAMES`라 제외 불가. 내장 도구 일부 제거는 harness profile `excludedTools`로 가능하지만(`read_file`은 항상 유지됨), 모델 객체 인스턴스에서의 프로필 해석은 **확인 못함**. 기본 `general-purpose` 서브에이전트는 프로필에서 비활성화 가능(`generalPurposeSubagent.enabled=false`).
- 💡 backend: 가상 파일시스템 구현체. 기본은 메모리 `StateBackend`(실제 디스크 미사용, 상태에 저장), 그 외 `StoreBackend`, `CompositeBackend`, Node 전용 `FilesystemBackend`, `LocalShellBackend`. `BackendProtocol`(`ls, read, readRaw, grep, glob, write, edit` 등)을 구현하면 Vault 읽기 전용 backend를 직접 만들 수 있다. 직접 구현은 하지 않음.
- 읽기 전용 강제: `permissions: [{operations:["write"], paths:["/**"], mode:"deny"}]`(첫 일치 규칙, 일치 없으면 허용이 기본)로 쓰기를 거부할 수 있다. 다만 write_file/edit_file/delete 도구가 모델에게 계속 노출되므로 정책은 "도구 목록 제거"가 아니라 "호출 시 거부"다. 제품 규칙(Vault 쓰기는 승인 후)에는 backend가 쓰기를 구현하지 않는 쪽이 더 안전하다.
- 서브에이전트: `task` 도구로 위임하며 README는 격리된 컨텍스트 창을 명시, 소스상 부모는 서브에이전트의 최종 메시지 요약만 받는다. 이 격리가 검색 탐색의 컨텍스트 오염을 막는 장점이다.
- 프롬프트 크기(추정, 글자수/4): 내장 도구 설명 합계 약 4.5K자(도구 9개, 약 1.1K 토큰). `BASE_AGENT_PROMPT` 1,658자(약 400 토큰), `TASK_SYSTEM_PROMPT` 2,140자(약 540 토큰). 모델 객체를 직접 넘긴 실험에서는 시스템 프롬프트에 내가 준 문자열만 있었고 기본 프롬프트가 붙는지는 모델/프로필에 따라 다르다(**확인 못함**). 대략 1~2.5K 토큰 선행 비용이다.
- 고정 단계 전체 위임 vs 검색 한 단계: ADR 0007은 순서를 하네스가 소유하는 고정 단계를 결정했고, Deep Agents는 모델이 계획·도구 순서를 정하는 열린 루프라 이 결정과 충돌한다. 반대로 "어떤 노트가 경험을 담고 있는가"는 키워드 검색이 의견 글에 끌리는 열린 탐색이므로 읽기 전용 `search_vault`/`read_note`를 가진 격리된 서브에이전트가 가치가 있다. 다만 번들 +1.5MB와 zod 4 승격, 가상 파일시스템·`task` 같은 불필요한 표면이 크므로 검색 단계에는 `createAgent`(도구 2개, 호출 상한)로 시작하는 편이 비용 대비 낫다. 이는 설계 판단이며 품질 비교 실험은 하지 않았다.

## 6. observability (LangSmith 없이)

- 환경변수 `LANGSMITH_TRACING` 미설정이 기본이고 실험은 네트워크 없이 동작했다(트레이스 전송 실제 차단 여부 패킷 확인은 안 함).
- 콜백 핸들러를 `invoke(..., {callbacks:[h]})`로 넘기면 `handleChatModelStart/End`, `handleToolStart/End`, `handleChainStart`가 수신된다(createAgent 실행 확인). `streamEvents({version:"v2"})`도 `on_chat_model_*`, `on_tool_*`, `on_chain_*`를 낸다. 이를 제품 `RunEvent`로 매핑하는 변환기는 하네스 내부에 두면 된다.
- HITL: `humanInTheLoopMiddleware({interruptOn:{search_vault:true}})`가 `__interrupt__` 값을 반환함을 확인(승인 대상 도구 단위 정지).

## 7. 제안

| 라이브러리 | 쓰기 타당한 곳 | 쓰지 말 곳 / 근거 |
|---|---|---|
| @langchain/core | `BaseChatModel` 어댑터, 메시지·콜백 타입(어댑터 파일 한정) | UI·Obsidian 어댑터로 노출 금지. 최소 약 300KB~1MB 비용 |
| LangGraph | 공고->검색->근거->초안->검증->미리보기->승인의 고정 단계 그래프, 승인 `interrupt`, 검증 실패 조건 엣지, 취소 signal, 커스텀 checkpointer(saveData) | 모델이 순서를 고르는 곳. 번들 +1.0MB, 노드/상태 키 이름 충돌 주의 |
| langchain `createAgent` | 근거 선택 전 "열린 검색" 한 단계(읽기 전용 도구 2개, 반복 상한). `humanInTheLoopMiddleware`는 쓰기 도구에만 | 초안 작성·근거 검증 단계(구조화 출력 필요, 도구 호출 미지원 모델 시 `withStructuredOutput` 불가) |
| Deep Agents | 현재는 도입 비추천. 검색 단계가 `createAgent`로 부족하다고 측정될 때만 서브에이전트(`task`) 격리용으로 재검토 | 전체 워크플로 위임(ADR 0007과 충돌), 가상 FS/todo/쓰기 도구 표면, +1.5MB, zod 4 강제 |

- 우선 순서: (1) 번들 예산 결정이 먼저(어떤 조합이든 900KB 초과, `langsmith`가 약 200KB 고정 비용), (2) 그래프 + 커스텀 모델 어댑터를 얇게 시험, (3) 구조화 출력은 제품 쪽 zod 검증 경로를 유지.
- 이번 검증에서 하지 않은 것: Electron 실구동, 실제 provider 연결, 공식 웹 문서 열람, 커스텀 backend/checkpointer 구현.
