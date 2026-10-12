# 진행 방향 (기준일 2026-10-12)

지금 상태, 다음 작업, 열린 결정을 보는 단일 문서다. 이전의 `ROADMAP.md`와 `NEXT_SESSION.md`를 합쳤다. 결정의 근거는 [ADR](./adr/README.md)에 있다.

## 한 줄 요약

내 Vault 노트를 근거로 이력서·자기소개서를 쓰게 돕는 Obsidian 플러그인. **로컬 모델(Gemma 4)은 Vault에서 근거를 찾아 고르고 초안을 검증하며, 글쓰기는 Codex CLI가 맡는다.** Codex 구독이 없으면 로컬 모델이 글쓰기까지 대신한다. 이 역할 분담은 [ADR 0010](./adr/0010-local-curation-codex-drafting.md)으로 제안됐고, 아래 "구현 전 검증"을 통과해야 채택된다.

## 원칙

1. 로컬 모델은 클라우드가 못 하는 일을 맡는다. 기기 밖으로 보내기 어려운 내용을 다루는 일, Vault 전체를 반복해서 처리하는 일이다. 한국어 장문 작성 품질로 클라우드와 경쟁하지 않는다.
2. 모델 학습(LoRA)은 하지 않는다. 문체는 제품의 중심 목표가 아니며, 사용자가 고른 예시로만 맞춘다.
3. 모든 경험 주장은 노트 근거에 연결하거나 "근거 없음"으로 표시한다.
4. 흐름은 고정 단계다: 분석 → 근거 찾기 → 작성 가능성 확인 → 개요 → 초안 → 검증 → 미리보기 → 사용자 승인.
5. 모델에 닿는 곳은 `ModelProvider`와 구조화 호출(`providers/structured.ts`) 두 곳뿐이다. 새 작성 경로는 이 인터페이스의 구현 하나로 더한다.
6. Vault 내용이 기기 밖으로 나가기 전에는 보낼 내용을 보여 주고 동의를 받는다.

## 현재 상태

기준: `main` 브랜치 `c9f4abb`. 수치는 로컬 `gemma4:e4b`와 합성 테스트 Vault로 잰 방향 확인용이며, 실제 Vault 합격 판정은 검색 지표뿐이다. 자세한 구현 현황은 [설계 README](./design/workflow/README.md#구현-현황)에 있다.

| 영역 | 상태 | 근거 |
|---|---|---|
| 작성 흐름 | 연결됨. 검증된 초안 완료 0.81, 근거 없는 문항에서 지어낸 초안 0/24 | [실제 모델 보고서](./testing/career-flow-real-model-report.md) |
| 검색 | 하이브리드 검색 기본값. 실제 Vault 판정용 60문항에서 recall@3 0.85, 차단 0.95, 오차단 0.00 | [ADR 0009](./adr/0009-hybrid-local-retrieval.md), [S2 보고서](./testing/career-retrieval-s2-report.md) |
| 검증 | 숫자·인용 코드 검사, 원자 사실 단위 의미 검증. 정상 초안 오차단 0.28 | 실제 모델 보고서 |
| 미리보기·적용 | 승인 후에만 에디터 API로 쓰기, Obsidian 실행 취소 가능 | `obsidian/insertion-preview.ts` |
| 모델 연결 | Ollama 네이티브 API만. Codex CLI·외부 전송 동의는 없음 | `providers/ollama.ts` |
| 프레임워크 | LangChain·LangGraph 없이 직접 구현 | [ADR 0008](./adr/0008-no-agent-framework.md) |
| 번들 | `main.js` 약 826 KB / 예산 900 KB (2026-10-12 빌드) | `plugin/build.mjs` |

## 알려진 문제

- **실제 Vault에서 출력이 잘려 실패한다.** 모든 단계의 출력 한도가 1,400토큰으로 같아서, 근거 확인(필요한 사실마다 원문 인용)과 초안 단계가 긴 실제 노트를 만나면 `Unexpected completion: length`로 미완료가 된다. 합성 Vault의 짧은 노트에서는 드러나지 않았다. 제안: 단계별 한도, 근거 확인의 인용 길이·개수 축소, 사용자용 오류 문구, 긴 노트를 평가 데이터에 추가.
- **화면이 사용 전제를 안내하지 않는다.** 패널은 자기소개서 작성 전용(`mode: "career"`)인데 안내가 없고, 커서를 글 넣을 위치에 먼저 둬야 한다는 전제도 보이지 않는다. 쓰지 않는 Wikipedia 입력 칸이 눈에 띈다.
- 근거가 많이 모이면 요청이 입력 예산을 넘는다(전체 흐름 68회 중 1회). 근거 선별·압축 단계가 없다.
- 모델이 바쁘면 판정 검색이 30초 제한을 넘는다.
- 근거 없는 문항에 관련 낮은 실제 경험으로 답하는 경우가 24회 중 4회 남았다(지어낸 주장은 아님).
- Obsidian 수동 체크리스트([obsidian-manual-checklist.md](./testing/obsidian-manual-checklist.md))는 끝까지 실행한 기록이 없다. 실제 Vault 실행은 했고, 위 출력 잘림을 거기서 발견했다.

## 다음 작업

1. **구현 전 검증(A/B)** — 아래 절. ADR 0010의 채택 여부를 정한다.
2. **출력 잘림 수정** — 위 알려진 문제의 첫 항목. 검증 결과와 무관하게 로컬 작성 경로에 필요하다.
3. **사용 안내** — 빈 패널의 사용법 안내, 커서 전제 표시, Wikipedia 칸 정리.
4. ADR 0010이 채택되면: S7 외부 전송 동의 → S10 provider 선택(Codex CLI, 없으면 로컬) 순서로 구현한다.

## 구현 전 검증

Codex 작성 경로를 구현하기 전에, 같은 문항으로 두 방식을 비교한다.

- A: 클라우드 모델이 Vault 문서를 직접 읽고 쓴다.
- B: 로컬 모델이 고른 근거만 클라우드 모델에 넘겨 쓴다.

토큰 사용량, 외부로 나간 바이트·문서 수, 필요한 근거의 누락률, 초안 품질(블라인드 비교), 지어낸 주장 수를 잰다. 합격선은 측정 전에 정한다. 처음에는 합성 테스트 Vault로 잰다. CLI는 호출마다 고정 입력 토큰이 크므로(10/05 실측, `codex exec`에 "ok"만 보내도 약 27,000, 빈 `CODEX_HOME`으로 약 18,000) 고정분과 근거 부분을 나눠 기록한다.

## 슬라이스 현황

계획 색인은 [plans/2026-10-05-career-writing-index.md](./superpowers/plans/2026-10-05-career-writing-index.md)다. 끝난 슬라이스 문서는 `docs/superpowers/plans-archive/`로 옮겼다.

| 슬라이스 | 상태 |
|---|---|
| S0 프레임워크 결정 | 종결. 도입하지 않음([ADR 0008](./adr/0008-no-agent-framework.md)) |
| S1 평가 고정셋, S2 검색 순위 | 완료. S2는 2026-10-08 합격 |
| S3 주장 검증, S6 구조화 호출, S11 미리보기·적용 | 완료 |
| S4 워크플로 | 완료. LangGraph 대신 직접 구현한 상태 머신(`workflow/career-graph.ts`) |
| 2026-10-11 흐름 통합 | 완료 |
| S5 문체 예시 | 부분. 문체 한 개 선택(4,096바이트)과 베끼기 검사만 있고 장르별 예시는 없다 |
| S12 Gemma 품질 측정 | 부분. `gemma4:e4b` 하나로 전체 흐름을 쟀고 변형별 비교는 없다 |
| S7 외부 전송 동의 | 미구현. ADR 0010 채택 시 필수 |
| S10 provider 선택 | 미구현. ChatGPT 로그인(S8) 대신 Codex CLI로 다시 읽는다 |
| S8 ChatGPT 로그인, S9 Deep Agents | 보관 |

## 열린 결정

1. **모델 컨텍스트·출력 예산.** 코드에는 컨텍스트 16,000, 요청 8,000, 출력 1,400이 제안값으로 들어 있다(`harness/budget.ts`). 토큰 추정 비율은 0.5로 보정했다([tokenizer-profiles.md](./testing/tokenizer-profiles.md)). 단계별 출력 한도가 남았다.
2. **네이티브 도구 호출 게이트의 범위.** PRODUCT 합격 기준 17·18, ARCHITECTURE, MODEL_SELECTION은 "기본 모델은 네이티브 도구 호출 필수, 200개 시나리오 통과"를 요구한다. 작성 흐름은 도구 없는 구조화 호출로 돌고, 도구 호출은 탐색 단계에서만 쓴다. 이 게이트는 한 번도 실행하지 않았다. 범위를 탐색 단계로 줄일지 결정이 필요하다(ADR 후보).
3. **한국어 글쓰기·근거 평가의 합격선.** 평가 장치(`tests/career-eval.test.ts`, `tests/meaning-eval.test.ts`)는 있고 합격선은 없다.
4. **기본 로컬 모델.** 설정 기본값은 `gemma4:e4b`이지만 지연 시간 게이트와 변형 비교(S12)는 하지 않았다. 상주 메모리·유휴 언로드·양자화 정책도 미정이다.
5. **근거 참조 단위.** 지금은 노트+제목이다. 블록·범위 단위는 미정.
6. **외부 전송 동의 경험(S7).** 무엇을, 어떤 단위로 보여 주고 동의받을지.
7. **문체 예시 선택 경험(S5).** 이력서 bullet과 에세이 답변의 예시를 어떻게 고르게 할지.
8. **번들 예산.** 826 KB / 900 KB. 다음 큰 의존성은 예산 결정이 필요하다.

해결된 것: UI는 React([ADR 0005](./adr/0005-react-chat-ui.md)), 첫 provider는 Ollama 네이티브 API, 검색 방식([ADR 0009](./adr/0009-hybrid-local-retrieval.md)), 프레임워크([ADR 0008](./adr/0008-no-agent-framework.md)), 미리보기·승인 적용(S11).

## 나중에

| 작업 | 조건 |
|---|---|
| Wikipedia 밖의 일반 웹 조사(공고 URL 읽기 포함), 출처 표시와 네트워크 권한 설정 | 작성 흐름이 안정된 뒤. 지금은 공고를 붙여넣기로만 받는다 |
| 재사용 가능한 워크플로, 여러 세션에 걸친 재개 | 제품 요구가 생길 때. 프레임워크 재검토는 ADR 0008의 조건을 따른다 |
| 별도 엔진 프로세스 | 플러그인 안에서 측정된 한계가 있을 때만(ADR 0002) |
| ChatGPT 로그인(SIWC) | 보관. Codex CLI 경로가 막힐 때 재검토 |

## 정해진 결정

- Codex CLI(`codex exec`)를 기본 작성 경로로 쓴다. Codex 구독이 없으면 로컬 모델로 작성한다(ADR 0010, 검증 후 채택).
- 한도 도달 시 자동 전환하지 않고 사용자에게 전환을 제시한다.
- Claude 구독 CLI 경로는 만들지 않는다.
- 무료·오픈소스(비상업) 배포를 전제로 한다.

## 확인이 필요한 것

- 배포한 앱이 사용자가 로그인해 둔 `codex exec`를 호출해도 되는지 OpenAI 약관 원문으로 확인한다. 조사 당시 판단은 "모호"였다([subscription-cli-providers.md](./research/subscription-cli-providers.md)). 공개 배포 전에 필요하다.
- `plugin/package.json`의 `@openai/agents`는 `src` 어디에서도 쓰지 않는다. 의도한 추가가 아니면 제거한다. zod는 4로 올라가 있다.
- 공개 배포 전에 Obsidian 수동 체크리스트를 끝까지 실행한다.

## 문서 지도

| 층 | 문서 | 규칙 |
|---|---|---|
| 현재 기준 | `README.md`, 이 문서, [PRODUCT](./PRODUCT.md), [ARCHITECTURE](./ARCHITECTURE.md), [TECH_STACK](./TECH_STACK.md), [MODEL_SELECTION](./MODEL_SELECTION.md), [PLUGIN](./PLUGIN.md), `CONTEXT.md`, [설계 문서](./design/workflow/README.md) | 코드와 결정이 바뀌면 함께 고친다 |
| 진행 중 계획 | `docs/superpowers/plans/` | 끝나면 `plans-archive/`로 옮긴다 |
| 기록 | [ADR](./adr/README.md), `docs/research/`, `docs/testing/`, 루트 `reports/`, `docs/superpowers/plans-archive/`, `model/` | 내용은 고치지 않는다. 낡은 기록에는 맨 위에 현재 기준을 가리키는 한 줄만 단다 |
