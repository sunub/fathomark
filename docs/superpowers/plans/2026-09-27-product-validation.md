# Product Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 제품과 기본 모델 후보가 문서의 기능·속도·도구·문체 기준을 충족하는지 재현 가능한 증거로 판정한다.

**Architecture:** 오프라인 실패 주입 테스트와 실제 모델 평가를 분리한다. 평가 데이터는 합성 사례부터 구축하고, 같은 사례/모델/설정/버전을 기록한 실행 결과만 비교한다. 앱 검증과 대표 하드웨어 측정이 없으면 출시 검증은 미완료다.

**Tech Stack:** 기존 Vitest/TypeScript, Python unittest, JSONL/JSON, GitHub Actions. 새 평가 서비스나 유료 API를 추가하지 않는다.

**Spec:** `docs/PRODUCT.md` acceptance 1~18, `docs/MODEL_SELECTION.md` accepted criteria, [상위 계획](2026-09-27-fathomark-completion.md), [모델 무결성 계획](2026-09-27-model-evaluation-integrity.md).

## Global Constraints

- 서로 다른 Fathomark 도구 시나리오 최소 200개. 같은 질문 200회 반복으로 대체하지 않는다.
- 첫 행동 정확도 ≥95%, 첫 인자 유효성 ≥98%, 최대1회 수정 후 ≥99.5%, 금지 도구 실행0, 무한 반복0.
- 대표 16GB 환경에서 cold first event p95 목표 ≤5초, >8초 탈락; warm p95 목표 ≤2초. spinner는 first event가 아니다.
- 5초 초과~8초 이하는 cold 목표 미달이며 합격으로 표시하지 않는다. 측정 실패와 누락을 0초나 성공으로 바꾸지 않는다.
- 합성 자료 테스트 통과를 실제 사용자 문체 개선으로 보고하지 않는다. 개인 노트와 모델 응답은 저장소 밖에 저장한다.
- 새 dependency, 모델 다운로드, 공개 배포는 자동으로 수행하지 않는다.

## Review Focus

1. no-tool 사례로 schema 성공률 분모를 부풀리지 않는다 → V1.
2. 도구 결과 이전/이후 요청의 ID와 근거가 누락돼도 단순 정답 문자열로 통과시키지 않는다 → V1.
3. cold 실패·timeout을 제외해 지연값을 좋게 보이게 하지 않는다 → V2.
4. 큰 메모리 개발기를 16GB 기준 장비로 둔갑시키지 않는다 → V2.
5. 문체 선호가 높아도 사실·안전 실패 답변은 비교 자격을 주지 않는다 → V2/M2/M3.

---

## 파일 지도

- Create `plugin/tests/fixtures/evaluation/tool-scenarios.jsonl`: 200개 고유 시나리오, expected action/허용 도구/필수 근거.
- Create `plugin/tests/evaluation/scenarios.ts`, `metrics.ts`: 자료 검증과 순수 지표 계산.
- Create `plugin/tests/evaluation/live-runner.ts`: P3/P5를 사용하는 실제 로컬 제공자 실행과 JSON 보고서 작성.
- Create `plugin/tests/{evaluation-metrics,evaluation-fixtures,live-model}.test.ts`: 오프라인 계산/fixture/명시 opt-in 실측 entrypoint.
- Create `docs/testing/{model-evaluation,release-gates}.md`: 재현 명령·판정 기준·환경 준비·결과 해석.
- Create `.github/workflows/check.yml`: 네트워크 없는 단위/경계/빌드 및 모델 테스트.
- Modify `.github/workflows/release.yml`, `docs/{ROADMAP,NEXT_SESSION,TECH_STACK}.md`, `docs/adr/0003-separate-training-from-runtime.md`: 검증된 현재 상태 및 실행 가능한 release checks만 갱신.

### V1: 200개 시나리오와 조작할 수 없는 지표

**Depends:** P0 계약. fixture 제작은 P1~P6와 병렬 가능.

**Interfaces:** `Scenario { id: string; category: string; question: string; packet: ContextPacket; expectedAction: "answer" | "refuse" | "tool"; allowedTools: readonly string[]; requiredReferenceKeys: readonly string[] }`; `loadScenarios(text: string): readonly Scenario[]`; `ScenarioResult { id: string; firstActionCorrect: boolean; expectsTool: boolean; firstArgumentsValid: boolean; repairedArgumentsValid: boolean; disallowedExecutions: number; terminated: boolean }`; `summarize(scenarios: readonly Scenario[], results: readonly ScenarioResult[]): EvaluationMetrics`. `EvaluationMetrics`의 number 필드는 cases/toolCases/actionCorrect/firstArgumentsValid/repairedArgumentsValid/disallowedExecutions/nonTerminatingRuns/actionRate/schemaFirstRate/schemaRepairedRate이며 status는 `"passed" | "failed"`다. expectedAction과 expectsTool의 불일치, toolCases=0, 결과 ID 집합이 시나리오와 다르면 오류로 거부한다. 이 passed는 도구 지표만의 결과이며 제품 전체 합격이 아니다.

- [ ] **Step 1:** `evaluation-metrics.test.ts`: 200개 중190개 행동 정답이면 `expect(metrics.actionRate).toBe(0.95)`; no-tool40개를 추가해도 schema 분모 불변; expected-tool인데 호출이 없으면 인자 성공 false; 유효 인자 뒤 금지 호출 한 번이면 전체 안전 실패; duplicated ID/empty 결과/누락 결과 거부. 한도 내 정상 종료와 한도 강제 종료를 구별해 보고한다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/evaluation-metrics.test.ts tests/evaluation-fixtures.test.ts` FAIL 확인.
- [ ] **Step 3:** 200개 고유 시나리오를 작성한다: 직접답변/도구불필요40, Vault검색·읽기60, 공개Wikipedia30, 사생활/권한20, 잘못된 요청·복구20, 반복유도10, 출처충돌10, 한국어복합입력10. 각 fixture는 서로 다른 요청과 원문을 포함한다. 개인정보·잘못된 요청 사례의 정답은 refuse/no-tool도 가능하며 기대 행동을 명시한다.
- [ ] **Step 4:** schema 분모는 expectedAction=tool인 사례 수로 고정한다. 최초 라운드의 모든 호출이 유효해야 그 사례 성공; 호출 없음/잘못된 호출/한 개라도 invalid면 실패. 수정 후 지표는 동일 분모에서 최대1회 수정 기회만 허용한다. 도구 이름 선택 정확성과 인자 유효성을 분리하며 비허용 실행은 분모와 무관하게 0이어야 한다. 모의 악성 provider의 직접 fault injection 결과는 실제 모델 성능 분모에 넣지 않는다.
- [ ] **Step 5:** fixture 검증은 ID·내용 중복·필수 근거·카테고리 개수·비공개 실자료 부재를 확인한다. 테스트+플러그인4종 PASS, 리뷰/커밋. 200개 fixture 작성 완료는 200개 실제 모델 평가 완료가 아니다.

### V2: 실제 모델·속도·문체의 증거 수집

**Depends:** P7/A4/M2/V1. G2/G3/G4 없는 부분은 명시적으로 not_measured.

**Files:** Create `plugin/tests/evaluation/live-runner.ts`, `plugin/tests/live-model.test.ts`, `docs/testing/model-evaluation.md`; Modify `plugin/tests/evaluation/metrics.ts`.

**Interfaces:** `runEvaluation(options: {baseUrl: string; model: string; outputDir: string; scenarios: readonly Scenario[]; signal: AbortSignal}): Promise<void>`. 출력은 environment.json, scenario-results.jsonl, timing-results.jsonl, summary.json. environment는 OS/CPU/RAM/provider/model digest/model parameters/context/quantization/revision/date를 포함하며 secret/note 원문은 넣지 않는다.

- [ ] **Step 1:** timing 단위 테스트 추가: nearest-rank p95는 정렬한 n개 중 ceil(0.95*n)번째; 30개 중 timeout2개를 포함하면 p95는 failure로 보고; spinner 이벤트만 있으면 latency null; tool activity가 prose보다 앞서면 tool 시간을 선택; cold p95=8.1초는 rejected, 6초는 target_missed, 5초는 target_met. 자료 없으면 `expect(report.status).toBe("not_measured")`.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/evaluation-metrics.test.ts` FAIL 확인.
- [ ] **Step 3:** 환경변수 `FATHOMARK_LIVE_EVAL=1`, `FATHOMARK_MODEL`, `FATHOMARK_EVAL_OUTPUT`가 모두 있을 때만 live-model.test.ts를 실행한다. 평소 테스트는 명확히 skip한다. 실행 명령: `FATHOMARK_LIVE_EVAL=1 FATHOMARK_MODEL='<installed-model-id>' FATHOMARK_EVAL_OUTPUT='/absolute/private/output' pnpm --filter fathomark-plugin exec vitest run tests/live-model.test.ts`. 표시된 placeholder는 설치 목록과 사용자 제공 경로에서 채우며 임의 모델 다운로드 금지.
- [ ] **Step 4:** 후보별 실제 200시나리오와 warm100/cold30샘플을 측정한다. cold는 선택 모델만 unload한 상태를 확인하고 별도 테스트용 제공자에서 실행한다; 공유 제공자를 임의 종료하지 않는다. Obsidian을 동시에 실행한다. timeout/오류를 별도 개수와 해당 latency 실패로 포함하며 제외해 percentile을 만들지 않는다. prompt/load/generation/tool 시간을 제공자가 노출하는 만큼 분리하고 없는 값은 null로 둔다.
- [ ] **Step 5:** 16GB가 아니면 비교 자료로만 남긴다. RSS/전체 메모리 압력/swap/사용 모델 크기를 수집하고 메모리 상한 미합의는 gate_pending으로 기록한다. P2의 토큰 상한 프로필을 실제 tokenizer/chat template 자료로 확인하고 알려지지 않은 모델은 budget_verified=false 유지. 모델 이름을 docs의 기본값으로 승격하지 않는다.
- [ ] **Step 6:** 사용자 자료가 있으면 M3가 요구하는 고정된 평가 사례에서 같은 모델/설정/근거의 비학습·LoRA 응답을 생성한다. M2의 품질 관문 후에만 무작위 방식 비공개 선호 검토를 진행한다. 자료가 없으면 합성 smoke만 실행하고 실제 문체 개선은 not_measured. 사용자 검토와 통계 기준이 없으면 자동 승자 선정 금지.
- [ ] **Step 7:** 계산 테스트+전체 검사 PASS 후 실제 측정 결과는 private output에 보관, 익명 집계와 재현 명령만 문서화해 리뷰/커밋. 코드 검증과 제품 합격 상태를 별도 보고한다.

### V3: 문서·자동 검사·출시 판정 일치

**Files:** Create `.github/workflows/check.yml`, `docs/testing/release-gates.md`; Modify `.github/workflows/release.yml`, `docs/ROADMAP.md`, `docs/NEXT_SESSION.md`, `docs/TECH_STACK.md`, `docs/adr/0003-separate-training-from-runtime.md`.

**Interfaces:** 제품 API 없음. release-gates는 `implemented / automated_verified / app_verified / model_measured / accepted` 열을 가진 요구사항별 표다.

- [ ] **Step 1:** check workflow에 플러그인4종과 모델3종 검사를 독립 job으로 정의한다. Python은 실제 pyproject 요구인 3.12와 uv.lock을 사용한다. 모델 테스트는 `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1`에서 실행해 테스트가 실제 모델 다운로드에 의존하지 않음을 확인한다. Node 버전은 현 package engines와 승인한 LangChain peer requirements를 모두 충족하는 버전으로 고정하고 release/check에서 일치시킨다.
- [ ] **Step 2:** 로컬에서 동일 명령을 실행하여 exit0 확인. `.venv`/package manager 부재는 환경 문제로 별도 기록한다. live 모델 테스트는 opt-in 변수 없이 skip됨을 확인한다. 기존 release는 draft만 생성하도록 유지하고 필수 검사 통과 후 빌드하도록 연결한다; 태그 push 자체는 이 계획에서 실행하지 않는다.
- [ ] **Step 3:** git tracking을 확인한 뒤 NEXT_SESSION의 오래된 design-system 설명을 수정한다. Phase0/1/2 각 항목은 실제 증거가 있는 것만 완료로 바꾼다. ADR0003은 구현 실험 현황을 추가하되 accepted로 자동 변경하지 않는다. TECH_STACK에는 실제 채택된 버전/계약과 제안 상태를 구분한다.
- [ ] **Step 4:** PRODUCT 기준1~18을 상위 추적표와 비교하고 evidence 링크 또는 미충족 gate를 채운다. 예상 예: 모든 단위 테스트 PASS라도 실제 undo 미검증이면 criterion10=app_verified:false. cold6초이면 목표 충족 false. 자료 없는 문체 개선은 false가 아니라 not_measured.
- [ ] **Step 5:** 최종 `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` 및 모델3종을 실행한다. 리더가 자체 요구사항 누락 검토를 하고 독립 리뷰어가 최종 변경 전체를 확인한다. scope별 커밋 후 파일/단순화/검증/잔여 위험을 보고한다. G5 미충족이면 학습 후보 자동 적용은 범위 밖으로 유지한다.

## 검증 기록

| 작업 | commit | 명령/결과 | 환경 제한 |
|---|---|---|---|
| 계획 작성 | 없음 | fixture/실행기 설계 | 실제 모델 결과 없음 |
