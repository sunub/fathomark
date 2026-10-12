# Fathomark 기능별 설계 문서

상태: **설계 · 부분 구현** (아래 [구현 현황](#구현-현황))  
기준일: 2026-10-11

이 문서 묶음은 전체 글쓰기 흐름, 실행 책임, 도구 기능을 각각 분리한 설계 초안이다. 도구 문서는 기능·사용 조건·요구사항·워크플로우·시각화·검증 기준을 독립적으로 정의한다. 기존 단일 문서는 본문 대신 이 목차를 안내한다.

현재 코드와 설계의 차이는 아래 [구현 현황](#구현-현황)에 모은다. 각 문서의 `.html` 사본은 2026-10-11 초판 그대로이므로, 현황이 다르면 Markdown을 따른다.

## 전체 흐름과 실행 책임

용어: **Harness**는 실행 수명(상태 전환·취소·타임아웃)을 맡는 `AgentHarness`이고, **Harness Loop**는 그 안에서 권한·한도·종료를 다루는 루프 정책이다. 현재 코드의 [agent-loop.ts](../../../plugin/src/harness/agent-loop.ts)가 두 루프 정책을 한 함수에 담고 있다.

| 문서 | 설명 |
|---|---|
| [제품 목표·용어·현재 구현 상태](overview.md) | 현재 코드와 제안 설계의 차이 |
| [전체 커리어 글쓰기 워크플로우](overall-workflow.md) | 요청부터 검증과 승인 후 적용까지 |
| [워크플로우·에이전트 선택](workflow-routing.md) | 입력 상태에 따른 실행 방식 |
| [Harness Loop](harness-loop.md) | 실행·권한·한도·대기·종료 |
| [Agent Loop](agent-loop.md) | 관측에 따른 다음 행동 선택 |

## 도구별 기능·요구사항·시각화

[도구 목차](tools/README.md)에서 각 도구 문서로 이동한다.

| 도구 | 문서 |
|---|---|
| Vault 검색 | [search_vault](tools/search-vault.md) |
| 노트 원문 읽기 | [read_note](tools/read-note.md) |
| Wikipedia 검색 | [search_wikipedia](tools/search-wikipedia.md) |
| Wikipedia 원문 읽기 | [read_wikipedia_page](tools/read-wikipedia-page.md) |
| 사용자 사실 확인 | [ask_user](tools/ask-user.md) |
| 연결 노트 문맥 | [get_note_context](tools/get-note-context.md) |
| 공개 자료 원문 | [read_public_source](tools/read-public-source.md) |
| 공개 자료 검색 | [search_public_sources](tools/search-public-sources.md) |
| 선택적 작업 상태 보존 | [save_working_note](tools/save-working-note.md) |
| 부분 수정 제안 | [propose_revision](tools/propose-revision.md) |

## 공통 계약과 참고 자료

| 문서 | 설명 |
|---|---|
| [근거·공유 상태 계약](evidence-model.md) | 노트·사용자 답변·공개 자료·문체·모델 해석 구분 |
| [실행 정책](execution-policy.md) | 한도·대기·재검증·승인 |
| [요청 사례](request-example.md) | 판단 → 행동 → 관측 → 다음 판단 |
| [기업 조사](research-references.md) | Notion·Claude·NotebookLM·Rovo·Word·Grammarly |
| [후속 검토](future-decisions.md) | CLI·프레임워크 선택 보류 |
| [구현 순서와 검증 기준](verification.md) | 단계별 구현·완료 조건 |

## 읽는 순서

전체 워크플로우 → 실행 방식 선택 → Harness·Agent Loop → 필요한 도구 문서 → 근거·실행 정책 순으로 읽는다. 각 문서의 HTML은 같은 이름의 `.html` 파일로 제공한다. 이미지 원본은 `../assets/harness-workflow/`에 보관하며 HTML에는 해당 이미지를 포함한다.

## 구현 현황

기준: 2026-10-12, `main` 브랜치. 전체 상태와 다음 작업은 [DIRECTION.md](../../DIRECTION.md)가 기준이다. "실제 모델"은 로컬 `gemma4:e4b`와 합성 fixture Vault로 잰 값이며 표본이 작아 방향 확인용이다. 실제 Vault 합격 판정은 [S2 보고서](../../testing/career-retrieval-s2-report.md)의 검색 지표뿐이다.

| 영역 | 상태 | 근거 |
|---|---|---|
| 단일 요청 작성 흐름 | 연결됨. 분석 → 근거 → 작성 가능성 → 개요 → 초안 → 검증 → 수정 1회 → 미리보기 | [career-graph.ts](../../../plugin/src/workflow/career-graph.ts). 전체 흐름 평가(`plugin/tests/career-eval.test.ts`, 앱 구성, 문항 16개×2회): 검증된 초안 완료 0.81(26/32), 실패 0 |
| 검색 | 키워드 + `bge-m3` 임베딩 + 채팅 모델의 본인 경험 판정. 설정으로 켬(기본 켬), 실패 시 키워드 | S2 실제 Vault 합격. 전체 흐름 평가 근거 발견 1.00(32/32), 키워드만 쓸 때 0.56 |
| 작성 가능성 검사 | 필요한 사실마다 개인 출처 문장을 인용하게 하고 인용이 출처에 실제로 있는지 코드로 확인 | [readiness.ts](../../../plugin/src/workflow/readiness.ts). 근거 없는 문항 24회: 문항 주제를 지어낸 초안 0건, 관련 낮은 실제 경험으로 답한 경우 4건 |
| 의미 검증 | 주장을 원자 사실로 나눠 근거와 대조한 뒤 판정. 항목 하나라도 어긋나면 코드가 차단 | `plugin/tests/meaning-eval.test.ts`(33개×5회): 잘못된 초안 검출 dev 1.00·heldout 0.93, 정상 초안 오차단 dev 0.17·heldout 0.28. 다른 출처 인용 검출은 약함 |
| 질문 대기·재개·취소 | 연결됨. 대기 중 시간 정지, 중복·늦은 답변 차단 | 자동 테스트 |
| 후속 요청 | 연결됨. 이전 근거와 적용 전 초안을 이어받고 "더 짧게"는 탐색 없이 이전 초안을 수정 | 자동 테스트. 실제 앱 미확인 |
| 문서 변경 후 미리보기 | 적용 차단과 재실행·재검증 안내. 자동 재검증은 없음 | 자동 테스트 |
| 도구 오류 | 탐색 중 입력 형식 오류는 1회 수정 기회, 없는 노트 요청은 모델에 알리고 계속, 권한 거부는 건너뜀, 그 밖은 종료 | 자동 테스트 |
| 토큰 예산 | 실제 모델 측정 비율(바이트당 0.5)로 추정, 최악의 경우도 모델 컨텍스트 이내 | [tokenizer-profiles.md](../../testing/tokenizer-profiles.md) |

알려진 위험:

- 모든 단계의 출력 한도가 1,400토큰으로 같아서, 실제 Vault의 긴 노트에서는 근거 확인·초안 단계 응답이 잘려 미완료가 된다(`Unexpected completion: length`). 합성 Vault에서는 드러나지 않았다.
- 근거가 여러 개 모이면 요청이 토큰 예산을 넘어 실패할 수 있다(최종 평가 68회 중 1회). 근거 선별·압축 단계가 없다.
- 판정 검색은 모델이 바쁘면 검색 제한 시간(30초)을 넘을 수 있고, 그러면 실행이 실패한다.
- 근거 없는 문항에 관련성이 낮은 실제 경험으로 답하는 경우가 남아 있다(지어낸 주장은 아님).

미구현·보류:

- 근거가 이미 충분할 때 새 글의 초기 노트 읽기·검색 생략(수정과 후속 수정은 탐색을 생략한다).
- 경험 선택 이유·개요·검증 상세를 화면에 검토 가능한 결과로 표시.
- 근거표·초안 버전·승인 이력을 담는 공통 상태.
- 500자 같은 분량 조건의 코드 검사, 공고 URL 읽기.
- `search_public_sources`, `save_working_note` 등록(의도적 보류).
- 실제 Obsidian 수동 확인: 실제 Vault에서 실행해 위 출력 잘림을 발견했지만, [체크리스트](../../testing/obsidian-manual-checklist.md)를 끝까지 실행한 기록은 없다.

