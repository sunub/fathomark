# Plugin Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 노트와 승인된 읽기 도구를 사용하는 실제 로컬 모델 대화를 예산·권한·취소 경계 안에서 실행한다.

**Architecture:** 모델 전송, 요청 조립, 도구 구현은 기존 디렉터리에 유지한다. LangChain의 모델/도구 반복은 `harness/` 안에만 두고 Fathomark가 매 호출 전 검증하고 결과를 제품 이벤트로 변환한다.

**Tech Stack:** TypeScript, existing Zod/Vitest, Fetch, Obsidian Vault API; G1 통과 후 `langchain`/`@langchain/core`.

**Spec:** `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/TECH_STACK.md`, `docs/MODEL_SELECTION.md`, `docs/adr/0004-protect-vault-only-terms-from-research-egress.md`, [상위 실행 계획](2026-09-27-fathomark-completion.md).

## Global Constraints

- 상위 계획의 Global Constraints와 잠정 실행 기본값을 모두 적용한다.
- 도구별 5회/전체 12회/모델 8라운드, 인자 수정 기회 최대 1회. 시간은 전체 120000ms/모델 60000ms/도구 10000ms다.
- `PROPOSED_LIMITS` = modelContext 16000, requestView 8000, outputReserve 1400, safetyMargin 256. accepted로 이름을 바꾸지 않는다.
- 제공자 URI는 HTTP(S) 루프백만, Wikipedia는 고정 HTTPS endpoint만. redirect는 거부한다.
- UI로 LangChain 타입을 내보내지 않는다. 제품 코드에 `any`를 추가하지 않는다.
- Commit은 상위 계획의 리더 직렬 커밋 절차를 사용한다. 아래 명령은 저장소 루트에서 실행한다.

## Review Focus

1. UTF-8 다중 바이트/emoji가 네트워크 chunk 경계에서 나뉘어도 손실이 없다 → P3.
2. 재열기/중복 제출/취소 직후 새 요청이 과거 실행 결과를 받지 않는다 → P1.
3. 한국어·JSON escape·도구 결과·문체 예시가 합쳐져도 최종 요청 크기를 검사한다 → P2/P5.
4. 악성 도구 이름/인자/동일 call ID 반복/종료 없는 스트림은 유한 시간에 끝난다 → P3/P5.
5. 노트에서만 나온 비밀 이름과 URL은 Wikipedia 요청에 들어가지 않는다 → P6.

---

## 파일 지도와 공유 계약

| 파일 | 책임 |
|---|---|
| Modify `providers/types.ts`, `harness/events.ts`, `context/packet.ts` | 제품 인터페이스; 아래 P0에서 먼저 고정 |
| Create `harness/session.ts` | 현재 실행 스냅샷과 최대 10개 완료 대화, 뷰 밖의 메모리 |
| Create `context/request.ts`, `context/token-budget.ts`, `context/tokenizer-profiles.ts` | 필수/선택 문맥 구성, 검증된 모델별 요청 상한 |
| Create `providers/ollama.ts`, `providers/ndjson.ts` | HTTP와 분할 스트림 해석; 도구 실행은 하지 않음 |
| Create `tools/vault-tools.ts`, `tools/vault-search.ts` | 제한된 노트 조회와 어휘 기반 검색 |
| Create `tools/wikipedia.ts`, `tools/research-topic.ts` | 고정 공개 주제와 Wikipedia 참조만 취급 |
| Create `harness/tool-executor.ts`, `harness/langchain-loop.ts`, `harness/langchain-model.ts` | 권한/검증 실행, 내부 프레임워크 번역 |
| Modify `harness/harness.ts`, `harness/run-state.ts`, `tools/registry.ts` | 실행 총괄과 상태 전이, native 도구 설명 |
| Modify `main.ts`, `settings/index.ts`, `view/settings-tab.ts`, `plugin/.dependency-cruiser.cjs` | 생성/설정/생명주기와 경계 검증 |

위 경로는 `plugin/src/` 기준이며 `plugin/.dependency-cruiser.cjs`만 루트 기준이다. 테스트 경로는 작업별 명시한다. 미래 파일에 기존 파일인 것처럼 줄 번호를 붙이지 않는다.

### P0: 계약과 재현 기준선 고정 — 리더 전용

**Files:** Modify `plugin/src/providers/types.ts`, `plugin/src/harness/events.ts`, `plugin/src/context/{packet,evidence}.ts`, `plugin/src/tools/registry.ts`; Create `plugin/tests/contracts.test.ts`.

**Interfaces:** 기존 `ModelMessage`, `EvidenceReference`, `BudgetUsage`, `RunState`를 재사용한다. 다음 정확한 인터페이스를 이 작업에서 정의한다.

```ts
// context/packet.ts
export interface SelectedStyle { readonly id: string; readonly text: string }
export interface ResearchTopic { readonly id: string; readonly text: string; readonly language: "ko" | "en" }
// ContextPacket에 style: SelectedStyle | null, researchTopic: ResearchTopic | null 추가.
// tools/registry.ts
export interface ToolExecutionContext {
  readonly signal: AbortSignal; readonly researchTopic: ResearchTopic | null;
  readonly allowedWikipediaPages: Set<string>;
  readonly permissions: () => PermissionContext;
  readonly onResearchQuery: (query: string, language: "ko" | "en") => void;
}
// ToolDefinition.run(input: Input, context: ToolExecutionContext): Promise<Output>
// ToolDefinition에 readonly parameters: Record<string, unknown> 추가(Zod input과 동등한 JSON Schema).
// providers/types.ts
export interface TokenEstimate { readonly promptTokens: number; readonly method: "exact" | "verified_upper_bound" }
export interface RequestCounter { count(request: ModelRequest): Promise<TokenEstimate> }
// ModelRequest에 contextWindow: number 추가. ModelInfo에 usable: boolean, reason?: string 추가.
// ModelEvent done에 usage?: { promptTokens: number; outputTokens: number; loadMs?: number; promptMs?: number; generationMs?: number } 추가.
// harness/events.ts: 기존 RunEvent union에 아래 두 항목 추가.
// { type: "run_started"; runId: RunId; question: string; currentNote: CurrentNoteContext | null }
// { type: "research_query"; runId: RunId; query: string; language: "ko" | "en" }
export interface RunSnapshot {
  readonly version: number; readonly state: RunState; readonly events: readonly RunEvent[];
}
// context/evidence.ts
export interface CitedEvidence { readonly sourceId: string; readonly reference: EvidenceReference }
// 기존 evidence RunEvent에 sourceId: string 추가. [[S1]], [[S2]]가 이 ID를 참조한다.
```

- [ ] **Step 1:** `contracts.test.ts`에 `registry schemas describe the same accepted input` 테스트 작성: 예를 들어 `expect(def.input.safeParse({query: "노트"}).success).toBe(true)`, `expect(def.parameters.additionalProperties).toBe(false)` 및 required/enum 일치를 확인한다. 초기 등록 fixture 1개로 시작하며 P4/P6가 실제 도구 fixture를 추가한다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/contracts.test.ts` 실행. 새 registry 계약 부재로 FAIL 확인.
- [ ] **Step 3:** 위 계약 및 `ToolRegistry.definitions(): readonly ToolDefinition<never, never>[]` 구현, fake와 기존 테스트 packet에 nullable 필드 추가. public signature에 SDK 타입을 사용하지 않는다.
- [ ] **Step 4:** `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` PASS 확인. 24개 기존 테스트의 의미를 유지하며 baseline 기록.
- [ ] **Step 5:** 리더가 계약 변경만 커밋하고 P1/P2/P3/P4/A1 작업자에게 정확한 계약과 commit을 전달한다.

### P1: 종료 의미·재구독·생명주기 보호

**Files:** Modify `plugin/src/harness/{harness,run-state}.ts`; Create `plugin/src/harness/session.ts`, `plugin/tests/session.test.ts`; Modify `plugin/tests/harness.test.ts`.

**Interfaces:** `new RunSession(harness: AgentHarness)`; `getSnapshot(): RunSnapshot`; `subscribe(listener: () => void): () => void`; `history(): readonly ConversationTurn[]`; `dispose(): void`. `AgentHarness.run(input: RunInput): Promise<void>` 유지. Session은 harness 이벤트를 한 번만 구독한다.

- [ ] **Step 1:** 테스트 이름/검사: `length is incomplete` → length 종료 시 incomplete; `EOF without done fails` → 오류+failed; `reopen reads full snapshot` → 첫/둘째 delta 모두 보존; `busy run does not mutate active question` → 두 번째 요청 거부 시 기존 state 유지; `dispose drops late output` → dispose 이후 이벤트 0; `timeout remains input ready` → fake timer 120000ms 뒤 failed 및 다음 실행 가능. RunSession은 현재 실행의 연속 text 이벤트를 합쳐 무제한 chunk 저장을 막는다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/session.test.ts tests/harness.test.ts` FAIL 확인.
- [ ] **Step 3:** 종료 이유 분기, 종료 없는 EOF 오류, idempotent dispose, 실행 ID로 늦은 이벤트 거부 구현. 스냅샷은 변경 시에만 새 객체를 만든다. 취소는 cancelled, 시간 초과는 메시지 있는 failed. 완료 대화만 최근 10개까지 history에 추가한다. run_started는 동기적으로 새 질문과 문맥을 고정한다.
- [ ] **Step 4:** 같은 명령 및 전체 플러그인 4종 검사 PASS. busy 거부를 소비하는 view 경계는 A1에서 연결한다.
- [ ] **Step 5:** 리뷰 후 커밋. 실제 Obsidian unload 검증은 A4에 남긴다.

### P2: 문맥 조립과 전송 전 예산 검사

**Files:** Create `plugin/src/context/{request,token-budget,tokenizer-profiles}.ts`, `plugin/tests/request.test.ts`; Modify `plugin/src/context/evidence.ts`, `plugin/src/harness/budget.ts`, `plugin/src/harness/harness.ts` (리더 직렬 통합).

**Interfaces:** `buildRequest(input: RunInput, history: readonly ModelMessage[], citations: readonly CitedEvidence[], tools: readonly ModelToolSchema[], limits: BudgetLimits, counter: RequestCounter, model: string): Promise<{ request: ModelRequest; usage: BudgetUsage; omitted: readonly OmittedItem[] }>`; `assertBudget(request: ModelRequest, limits: BudgetLimits, counter: RequestCounter): Promise<TokenEstimate>`. 모델의 canonical history는 수정하지 않는다. `context/evidence.ts`의 `registerEvidence(existing: readonly CitedEvidence[], incoming: readonly EvidenceReference[]): readonly CitedEvidence[]`는 referenceKey로 동일 항목을 찾고 새로운 근거에만 S1부터 증가하는 ID를 부여한다. run 안에서는 삭제/재번호 부여하지 않는다.

- [ ] **Step 1:** `request.test.ts`에서 `current note and selection survive serialization`, `question cannot be silently truncated`, `tool groups remain paired`, `style loses priority before evidence`, `each continuation is recounted` 작성. 검증용 counter가 6344를 반환하면 6344+1400+256=8000 PASS, 6345면 `await expect(assertBudget(request, limits, counter)).rejects.toThrow()`다. 한글/emoji/escape와 100000자 질문 fixture 포함. `count` 호출에 최종 system/messages/tools 전체가 들어가는지 assert한다. 근거를 생략한 뒤 재선택해도 같은 sourceId인지 검사한다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/request.test.ts` FAIL 확인.
- [ ] **Step 3:** 질문·안전 지시·현재 선택은 필수로 유지한다. 전체 노트/근거는 원문 문단 단위로 선택하고 누락 사유를 기록한다. 선택 자료도 너무 크면 전송 전 거부한다. 공간 부족 시 오래된 완료 대화 → 추가 스타일 예시 → 낮은 순위 근거 순으로 제거하며 도구 호출/결과는 한 그룹으로 제거한다. 양측 충돌 근거는 묶어서 보존하거나 해당 답변을 거부한다. 선택된 근거만 고정 sourceId와 함께 모델에 보내고 사용한 주장에 [[S1]] 형식 인용을 요청한다. 압축을 구현했다고 주장하지 않고 `compress()` placeholder를 호출하지 않는다.
- [ ] **Step 4:** 검증되지 않은 문자/4 추정은 금지. 지원 모델의 정확한 counter 또는 검증된 byte-tokenizer 상한만 주입한다. 상한에는 모델 chat template와 tool framing도 포함하며 그 상한을 입증 못 하면 해당 모델을 usable=false 처리한다. 테스트 counter 통과를 실모델 예산 합격으로 기록하지 않는다.
- [ ] **Step 4-profile:** `BudgetProfile { modelDigest: string; templateSha256: string; tokenizerFamily: "byte_bpe"; contentExpansionBound: number; perMessageTokens: number; perToolTokens: number; fixedTokens: number; evidencePath: string }`와 `createVerifiedCounter(profile: BudgetProfile): RequestCounter`를 구현한다. P3의 공식 tokenizer/template 사전 감사 증거가 있는 프로필만 등록하며 초기 production 목록은 비워 둔다. 상한식은 직렬화 messages/tools의 UTF-8 bytes × contentExpansionBound + message수 × perMessageTokens + tool수 × perToolTokens + fixedTokens다. 각 계수는 해당 template가 입력을 반복/장식하는 횟수의 상한을 검토한 값이지 실측 평균/임의 상수가 아니다. 음수·비정수·digest/template 불일치는 거부하고 synthetic profile로 경계식만 테스트한다. 프로필 추가 전에는 실모델 지원 검증이 미완료라는 제한을 유지한다.
- [ ] **Step 4a:** 기존 BudgetUsage의 instructions에는 system+질문+문체를 합산하고 UI 명칭을 “지시·질문·문체”로 표시한다. history는 대화 의도 참고이며 사실 근거가 아님을 명시하고 이전 run의 `[[S숫자]]` 표시는 요청 뷰에서 제거해 현재 출처와 혼동하지 않게 한다. 원래 대화 기록은 바꾸지 않는다. `history citation cannot point to new evidence` 회귀 테스트에서 과거 S1이 새 S1의 인용으로 취급되지 않음을 검사한다.
- [ ] **Step 5:** 단위 테스트+플러그인 4종 검사 PASS 후 리뷰/커밋. G2가 없으면 검증용 counter로 구조만 완료, 실제 예산 보장은 V2 미검증으로 남긴다.

### P3: Ollama native 제공자

**Files:** Create `plugin/src/providers/{ollama,ndjson}.ts`, `plugin/tests/ollama.test.ts`, `docs/testing/tokenizer-profiles.md`; Modify `plugin/src/settings/index.ts`, `plugin/src/context/tokenizer-profiles.ts` (P2 후 리더 통합).

**Interfaces:** `createOllamaProvider(baseUrl: string, fetchImpl: typeof fetch = fetch): ModelProvider`; `decodeNdjson(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncIterable<unknown>`; `validateLocalProviderUrl(value: string): URL`. 기존 health/listModels/stream 계약을 구현하며 provider가 도구를 실행하지 않는다.

- [ ] **Step 1:** `ollama.test.ts`: 한글 한 글자를 byte별 chunk로 주어 원문과 동일한 text를 얻음; 복수 tool_calls와 argument object 보존; 잘못된 JSON/종료 없는 EOF/비정상 HTTP는 오류; abort가 fetch/read를 중단; `https://example.com`, credentials, redirect 거부; loopback IPv4/IPv6 허용. text로 출력된 가짜 JSON은 도구로 실행하지 않는다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/ollama.test.ts` FAIL 확인.
- [ ] **Step 3:** `/api/tags`, `/api/show`, `/api/chat`를 공식 API 기준으로 구현한다. 스트림은 TextDecoder streaming으로 처리하고 마지막 buffer까지 파싱한다. native call마다 한 번 안정적인 ID를 부여하고 재전송하지 않는다. `num_ctx`, `num_predict`, `keep_alive`를 명시한다. keep_alive는 실험 잠정값 5m, UI에 제품 최적화값으로 광고하지 않는다.
- [ ] **Step 4:** 실행 시 공식 docs의 tool-result 연결 필드를 다시 확인하고 HTTP fixture로 assistant calls와 각 결과가 다음 요청에 대응하는지 검사한다. `/api/show`가 context/native tool 지원을 증명하지 못하면 usable=false + 이유. 모델명 자동 선택/다운로드는 하지 않는다.
- [ ] **Step 4a:** P2 이후 선택된 설치 모델의 digest/template와 공식 tokenizer 형식을 확인하고 `docs/testing/tokenizer-profiles.md`에 상한 증명 및 출처를 기록한다. 맞는 프로필만 tokenizer-profiles.ts에 추가한다. 이 작업은 P7/V2의 전체 실행을 기다리지 않고 수행하는 사전 적격 확인이다. 자료 부족/비byte tokenizer/알 수 없는 template이면 G2 blocked, 검증되지 않은 임시 counter로 실사용을 열지 않는다. V2는 이 사전 증거를 실제 최대 예산 입력으로 추가 검증한다.
- [ ] **Step 5:** 테스트+플러그인 4종 PASS, 네트워크 없는 검증임을 기록해 리뷰/커밋. 실제 provider gate는 P7/V2에서 검증한다.

### P4: 제한된 Vault 검색·읽기

**Files:** Create `plugin/src/tools/{vault-tools,vault-search}.ts`, `plugin/tests/vault-tools.test.ts`; Modify `plugin/src/obsidian/vault-adapter.ts`, `plugin/tests/contracts.test.ts` (어댑터 변경은 A 담당과 직렬).

**Interfaces:** `VaultReader { listNotes(): NoteSummary[]; readNote(path: string): Promise<string | null> }`; `registerVaultTools(registry: ToolRegistry, vault: VaultReader): void`; search input `{query: string, limit?: number}`, read input `{path: string, heading?: string}`. 두 입력 모두 Zod strict이며 query 1..200자, limit 기본 5/최대10. 출력 `{references: EvidenceReference[], omitted: string[]}`. 기존 generic register가 각 도구의 입력/출력 타입을 검증한 뒤 registry 내부에서만 타입을 지운다.

- [ ] **Step 1:** `vault-tools.test.ts`: `../`, 절대경로, attachment 경로 거부; 없는 노트는 구조화된 도구 실패; 제목/본문에 같은 단어가 있으면 제목 우선, 동점은 path 정렬; 최대 10건; 문단 경계를 자르지 않고 노트당 최대 UTF-8 4096 bytes만 반환; 중복 heading/path 참조 정규화; 취소 후 추가 read 0건.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/vault-tools.test.ts tests/contracts.test.ts` FAIL 확인.
- [ ] **Step 3:** 제목 포함 +3, 각 query 단어의 본문 포함 +1인 결정적 검색 구현. NFKC+소문자+공백 단어 분리, 같은 단어 반복 가산 없음. 읽기 concurrency=4, 작업 시간 10초, 최대 1000개 노트 검사 후 불완전 범위를 표시한다. 시작 시 Vault scan 금지; 요청 시 실행. 캐시는 초기 미도입하여 변경 노트의 stale 결과를 피한다. 필요한 노트는 Vault API로만 읽는다.
- [ ] **Step 4:** 결과마다 실제 note path와 heading/excerpt를 붙이고, 전체 문단이 한도를 넘으면 excerpt를 조용히 자르지 말고 omitted에 남긴다. 검색 결과 한도는 UI/모델에 전달한다. 검색 정확도는 V1 corpus에서 별도 측정한다.
- [ ] **Step 5:** 테스트+4종 PASS, 리뷰/커밋. 1000개 초과 Vault는 지원 제한으로 기록하며 전체 검색했다고 주장하지 않는다.

### P5: 권한·검증·반복 제한을 갖춘 LangChain 실행

**Depends:** P0/P1/P2, P3/P4의 인터페이스. **Gate:** G1; 미충족이면 정책 실행기 테스트까지 진행하고 프레임워크 통합만 blocked.

**Files:** Create `plugin/src/harness/{tool-executor,langchain-model,langchain-loop}.ts`, `plugin/tests/agent-loop.test.ts`; Modify `plugin/src/harness/{harness,run-state}.ts`, `plugin/.dependency-cruiser.cjs`; 승인 후 `plugin/package.json`, `pnpm-lock.yaml`.

**Interfaces:** `executeTool(call: ModelToolCall, registry: ToolRegistry, permissions: () => PermissionContext, context: ToolExecutionContext): Promise<{ content: string; references: readonly EvidenceReference[] }>`; `runAgentLoop(runId: RunId, input: RunInput, options: {provider: ModelProvider; model: string; tools: ToolRegistry; limits: BudgetLimits; counter: RequestCounter; permissions: () => PermissionContext}, signal: AbortSignal): AsyncIterable<RunEvent>` 내부용. loop는 처음과 모든 연속 호출에서 P2 buildRequest를 사용한다. 공급자 이벤트를 제품 이벤트로 번역하고 입력 runId를 붙인다. 상태 이벤트는 harness가 go/transition으로 검증해 전달하고 terminal reason을 한 번만 반영한다. loop가 harness 밖에 상태를 직접 쓰지 않는다.

- [ ] **Step 1:** `agent-loop.test.ts`에 counter/provider/tool spy로 검사: schema invalid 및 권한 거부 시 `expect(tool.run).not.toHaveBeenCalled()`; 도구당 6번째/전체13번째/9번째 model 요청은 전송 0; 동일 call ID 두 번은 run 1; invalid args는 최대1회 repair; 결과도 Zod 검증; tool-only 첫 응답도 합법 상태 전이; 종료 없는 악성 모델은 시간 제한으로 종료; 권한을 함수로 다시 읽어 실행 직전 OFF면 network 0.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/agent-loop.test.ts` FAIL 확인.
- [ ] **Step 3:** `executeTool`에서 순서 고정: 등록 확인 → 최신 권한 → input.parse → timeout/abort 경계 → run → output.parse → 근거/결과 예산. 중복 ID·라운드·시도 횟수는 성공 실행 수와 별도로 센다. 오류 결과를 tool call에 대응시키거나 전체 실행을 종료한다. 자동 모델 재시도는 끈다. 결과 근거는 P2 registerEvidence로 ID를 등록하고 evidence 이벤트와 후속 요청에 같은 ID를 쓴다. 답변 지시는 사용자 프로젝트에는 Vault, 일반 사실에는 Wikipedia를 우선하되 충돌 시 양쪽 주장을 인용하도록 명시한다. 실제 의미 보존은 V2에서 판정하며 인용 ID 유효성만으로 사실성 통과를 주장하지 않는다.
- [ ] **Step 4:** G1 충족 시 설치 전 공식 API/peer dependency/Node 호환성을 확인해 정확한 버전을 잠근다. `createAgent`와 `@langchain/core`의 custom chat adapter를 위 ModelProvider에 연결한다. 모델/도구 middleware가 P2 및 executeTool을 반드시 거치게 하고, 일반 SDK 도구 직접 실행 경로를 만들지 않는다. 매 라운드 입력·출력 프로토콜을 테스트한다. SDK 타입은 harness 밖으로 내보내지 않는다.
- [ ] **Step 5:** `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` PASS 및 baseline 대비 bundle byte delta 기록. 기존 build 제한을 넘으면 import/tree shaking을 먼저 줄인다. 예산을 조용히 높이지 말고 측정된 잔여 차단으로 기록한다. G1 미충족/크기 실패는 MVP 완료가 아니다.
- [ ] **Step 6:** 독립 보안/기능 리뷰 후 리더가 scope별 커밋. 구현한 루프가 허용되지 않은 write/external tools를 0회 실행함을 통합 테스트로 증명한다.

### P6: 공개 주제만 사용하는 Wikipedia

**Files:** Create `plugin/src/tools/{research-topic,wikipedia}.ts`, `plugin/tests/wikipedia.test.ts`; Modify `plugin/src/harness/events.ts`, `plugin/tests/contracts.test.ts` (리더).

**Interfaces:** `createResearchTopic(text: string, language: "ko" | "en"): ResearchTopic`; `registerWikipediaTools(registry: ToolRegistry, fetchImpl: typeof fetch): void`. search input `{topicId: string}`; read input `{pageId: number, language: "ko" | "en"}`. 실행 context의 topic ID와 일치해야 검색하며 pageId는 그 run에서 검색으로 얻은 ID만 허용한다. P0 ToolExecutionContext는 run마다 새로 만들고 allowedWikipediaPages 키는 `language:pageId`다. 다른 run의 페이지 허용을 재사용하지 않는다.

- [ ] **Step 1:** `wikipedia.test.ts`: `VAULT_SECRET_SENTINEL`이 모델 args/노트에 있어도 `expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain("VAULT_SECRET_SENTINEL")`; opt-out fetch 0; topicId mismatch 거부; 임의 page ID/URL 거부; redirect 거부; 연구 이벤트의 query와 URL search param이 동일; ko/en 외 언어 거부; 취소 직후 늦은 응답 무시.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/wikipedia.test.ts tests/contracts.test.ts` FAIL 확인.
- [ ] **Step 3:** topic은 A1의 명시적 공개 주제 입력으로만 만든다. 1..120자, control character/URL/경로 패턴 거부, 질문·노트·스타일에서 자동 복사하지 않는다. 질문 전체를 주제로 삼지 않는다. 모델에는 문자열 query 대신 topicId만 제공한다.
- [ ] **Step 4:** HTTPS `ko.wikipedia.org/w/api.php`, `en.wikipedia.org/w/api.php` 고정 endpoint 사용. 검색 최대5개, 페이지 plaintext 문단 최대 UTF-8 4096 bytes; 응답 본문은 읽는 동안 최대 1MiB로 제한. fetch redirect:error, 매 fetch 직전 최신 권한 재검사. canonical URL과 정확한 excerpt를 provenance로 반환하고 제한된 발췌임을 표시한다.
- [ ] **Step 5:** 테스트+4종 PASS, 리뷰/커밋. 개인정보 유출 차단 증거에 사용된 sentinel과 요청 캡처는 합성 데이터만 저장한다. 네트워크 실제 연결은 V2에서 별도 검증.

### P7: 실제 생성 경로와 설정 연결

**Depends:** P5/P6/A1. A1은 P0/P1만 필요하므로 순환 의존이 없다.

**Files:** Modify `plugin/src/main.ts`, `plugin/src/view/settings-tab.ts`, `plugin/src/settings/index.ts`, `plugin/src/view/chat-view.tsx`; Create `plugin/tests/plugin-runtime.test.ts`; Modify `plugin/tests/obsidian-stub.ts`.

**Interfaces:** root는 provider/tools/counter/session을 한 번 조립한다. `updateSettings(patch: Partial<FathomarkSettings>): Promise<void>` 유지, model/provider 변경은 진행 run 취소 후 새 구성에 적용. 권한은 매 실행 시 최신 값 조회. UI command 계약은 A1을 사용한다.

- [ ] **Step 1:** 통합 테스트: onload HTTP/scan 0; 명시적인 설정 확인에서 health/listModels 호출; provider 선택 후 question→search→read→answer→sources; network OFF 즉시 차단; 모델 변경 시 이전 run cancelled; 설정 저장 실패 시 UI 오류와 이전 구성 유지; onUnload cancel/listener release.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/plugin-runtime.test.ts` FAIL 확인.
- [ ] **Step 3:** 설정에 연결 확인·모델 선택을 제공하고 정상 확인 전 녹색 연결 표시 금지. fake는 테스트/개발 전용으로 유지한다. 실제 모델 선택이 없으면 설정 안내와 입력 가능한 오류를 제공한다. 현재 노트 캡처는 A1의 EditorTargetTracker를 사용한다. packet.conversation은 RunSession.history()에서 채우고 루프 안의 ModelMessage history는 해당 run의 호출/결과만 보관해 이전 대화를 중복 삽입하지 않는다.
- [ ] **Step 4:** 4종 검사 PASS; G2/G3가 준비되면 한 개 실제 노트로 읽기 대화 smoke 실행, 없으면 mock integration PASS와 실제 smoke BLOCKED를 분리해 기록한다.
- [ ] **Step 5:** 리뷰/커밋. P5 LangChain이 미완료면 이 작업은 최종 통합 완료로 표시하지 않는다.

## 공식 참고와 검증 기록

계획 작성 시 확인: [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md), [LangChain createAgent](https://reference.langchain.com/javascript/langchain/index/createAgent), [AgentMiddleware](https://reference.langchain.com/javascript/langchain/index/AgentMiddleware). 실행 시 사용 버전의 문서를 다시 확인하고 어댑터 내부에서 차이를 흡수한다.

| 작업 | commit | 명령/결과 | 환경 제한 |
|---|---|---|---|
| 계획 작성 | 없음 | 인터페이스와 테스트 설계만 작성 | 구현/실모델 검증 전 |
