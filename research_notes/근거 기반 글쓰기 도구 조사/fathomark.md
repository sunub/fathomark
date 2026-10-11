# Fathomark 도구 확장: 구현 상태와 최소 설계

## 지금 무엇이 구현되어 있고 무엇이 계획인가?

### Takeaway
도구가 검색·읽기뿐인 그림은 범위를 축약한 것이다. 네 가지 도구 모듈이 구현됐지만 실제 플러그인 진입점은 빈 도구 목록과 가짜 모델을 사용한다. 따라서 새 도구 수보다 기존 기능의 실제 연결과 필수 글쓰기 단계 구현이 먼저다.

### Cited Findings
- `search_vault`는 키워드+선택적 의미 검색, `read_note`는 노트 또는 제목 아래 읽기를 구현한다. [Vault 도구](/Users/sunub/workspace/fathomark/plugin/src/tools/vault-tools.ts:46)
- `search_wikipedia`와 `read_wikipedia_page`도 구현됐다. 검색어는 사용자가 입력한 공개 주제이며, 읽기는 이번 실행의 검색 결과만 허용한다. [Wikipedia 도구](/Users/sunub/workspace/fathomark/plugin/src/tools/wikipedia.ts:30)
- 그러나 `main.ts`는 빈 `ToolRegistry`와 `FakeModelProvider`를 생성한다. 모듈 구현을 실제 앱에서 제공되는 기능으로 단정하면 안 된다. [앱 연결](/Users/sunub/workspace/fathomark/plugin/src/main.ts:40)
- 검색 내부에는 경험 노트 우선순위와 선택적인 근거 judge가 있다. 이는 검색 결과가 질문을 뒷받침하는지 평가하며, 초안의 모든 주장을 검증하는 것은 아니다. [검색 내부](/Users/sunub/workspace/fathomark/plugin/src/tools/hybrid-search/hybrid-search.ts:72)
- 출처 구절에 `S1` 등 ID를 붙이고 모델에게 사실 주장 인용을 요구한다. 별도 주장별 의미 검증은 이 경로에 없다. [출처](/Users/sunub/workspace/fathomark/plugin/src/context/evidence.ts:64), [요청](/Users/sunub/workspace/fathomark/plugin/src/context/request.ts:88), [종료](/Users/sunub/workspace/fathomark/plugin/src/harness/agent-loop.ts:136)
- 문체 예시 선택·4096바이트 제한과 승인 미리보기·문서 변경 검사·중복 적용 차단은 구현됐다. 모델 선택 도구는 아니다. [문체](/Users/sunub/workspace/fathomark/plugin/src/context/style.ts:30), [적용](/Users/sunub/workspace/fathomark/plugin/src/obsidian/insertion-preview.ts:43)
- 커리어 workflow와 질문 대기·재개는 미구현 제안이다. [설계 초안](/Users/sunub/workspace/fathomark/.omx/plans/2026-10-11-career-harness-workflow-draft.md:3)

### Inferences
- '인용 있음'은 '주장 참'과 다르다. 잘못된 출처를 붙인 주장도 ID 검사만으로 통과한다.

### Gaps
- 실제 앱에서 이 네 모듈과 실모델을 사용하는 별도 배포 경로는 확인하지 못했다. 테스트 실행·실제 Obsidian 검증은 이번 조사 범위 밖이다.

## 어떤 선택 도구를 우선 추가할 것인가?

### Takeaway
다음 세 도구는 새로운 관측 또는 사용자 사실을 가져온다. '생각하기'를 그대로 이름 붙인 도구보다 입력·출력이 검사 가능한 도구가 유용하다.

### Cited Findings
- 등록 도구는 입력/출력, 권한, 승인, 시간 제한, 결과량, 출처를 선언해야 한다. [계약](/Users/sunub/workspace/fathomark/plugin/src/tools/registry.ts:24)
- 일반 웹은 현재 차단되며 Vault에서만 발견한 표현을 외부 조사에 보내지 않는다. [권한](/Users/sunub/workspace/fathomark/plugin/src/harness/policy.ts:66), [ADR0004](/Users/sunub/workspace/fathomark/docs/adr/0004-protect-vault-only-terms-from-research-egress.md:7)

### Inferences
1. **P0 `ask_user`**: 입력 `missingFactId/question/options`; 출력 `answerId/text/explicitlyConfirmed`. 본인의 역할·성과·충돌 해결에 사용한다. 실행을 정지·재개하는 상태 계약이 먼저 필요하다. 사용자 답변은 노트 인용과 구분한다.
2. **P1 `get_note_context`**: 입력 `path/heading/maxNeighbors`; 출력 제목 구조·연결 노트 목록·관련 출처 구절. 프로젝트 본문에서 회고·일지·성과 기록으로 이동할 때 반복 키워드 검색을 줄인다. 링크 존재는 사실을 입증하지 않으므로 원문 읽기가 뒤따른다.
3. **P1 `read_public_source`**: 입력 허용된 `sourceId` 또는 사용자 지정 공고 URL; 출력 본문·제목·URL·수집 시각·정확 구절·누락/오류. 초기에는 사용자가 붙여넣은 공고를 출처로 등록해 네트워크 없이 시작할 수 있다. 공개 회사 사실은 개인 경험의 증거로 쓰지 않는다.
4. **P2 `search_public_sources`**: 공개 조사 주제 ID·공식 도메인·최신성 조건 → 후보 ID·URL·설명. 검색 결과는 단서이며 `read_public_source`로 본문 확인한다. 외부 query 허용 계약을 확장한 후 도입한다. CLI는 후순위로 유지한다.

### Gaps
- 공고 사이트의 동적 화면·인증·PDF 처리 범위와 웹 검색 제공자는 미결정이다. 새 의존성을 이번 설계에서 가정하지 않는다.

## 사고·작성·검증을 어떻게 분리할 것인가?

### Takeaway
도구 목록과 제품 기능 목록을 분리한다. 필요한 사실 분석, 근거표, 개요, 검증은 고정 글쓰기 단계의 산출물이며 반드시 모두 독립 도구가 될 필요는 없다.

### Cited Findings
- ADR0007은 요구 분석 → 경험 검색 → 근거 선택 → 문체 작성 → 주장 검증 → 미리보기 → 승인을 정하며 전체 자율 Loop를 거부했다. [제품 방향](/Users/sunub/workspace/fathomark/docs/adr/0007-grounded-career-writing-with-hosted-models.md:25)
- 현재 초안은 사용자 보충·충돌·탐색 이력·주장 출처·검증 결과를 공유 상태로 보관하도록 제안한다. [행동 계약](/Users/sunub/workspace/fathomark/.omx/plans/2026-10-11-career-harness-workflow-draft.md:63)

### Inferences
- **필수 Harness 단계**: 문항을 요구사항·평가 기준·필수/선택 사실로 분해; 출처 구절→상황/역할/행동/결과 근거표; 확인/추정/누락/충돌 구분; 개요·초안; 출처 의미·수치·역할·성과·문체 사실 혼입 검증. 검증을 선택 도구로만 제공하면 모델이 건너뛸 수 있다.
- **선택적 작성 작업**: 개요 2안 비교(핵심 주장·근거·차이), 특정 문단 수정(대상 ID·목표·유지할 사실·변경안), 약점 검토(문항별 부족점·해결 제안). 먼저 고정 호출/산출물로 시작하고 반복 재사용이 확인되면 도구화한다. 막연한 `think`, `brainstorm`은 추가하지 않는다.
- **UI 기능**: 후보 경험/근거표/개요 선택, 변경 전후 비교, 출처 점프, 사용자 사실 확인, 승인/폐기. 모델의 임의 파일 쓰기로 대체하지 않는다.
- 최소 초기 확장은 기존 search/read 연결 + 질문 대기/재개 + 근거표 상태 + 필수 주장 검증이다. 외부 자료는 공고 붙여넣기부터 시작하고 공식 웹 읽기·검색을 차례로 확장한다.

### Gaps
- 개요 비교·문체 선호의 실제 효용은 실사용 문항의 평가가 필요하다. 도구 수만으로 글쓰기 품질 향상을 주장할 근거는 없다.
