# Workflow 설계 대비 준비도 재평가

> 기록 (2026-10-11). 여기서 지적한 후속 요청·미리보기 재생성 등은 이후 고쳐졌다. 이후 상태는 [실제 모델 보고서](../docs/testing/career-flow-real-model-report.md)와 [DIRECTION.md](../docs/DIRECTION.md)를 본다.

평가일: 2026-10-11. 대상: `docs/design/workflow/`의 Markdown·HTML과 최신 작업 트리의 코드·테스트. 평가 과정에서 제품 코드와 설계 문서는 수정하지 않았다. 이 보고서만 추가했다.

## 결론

**단일 요청을 작성·검증·미리보기까지 진행하는 기반은 구현됐고 자동 검사도 통과한다. 문서 계약 전체와 실사용 품질은 아직 완료되지 않았다.** 특히 후속 대화의 이전 초안·근거 재사용, 충분한 근거에서 탐색 생략, 중간 판단 결과의 검토, 문서 변경 후 새 미리보기 연결이 남아 있다.

준비도는 두 축으로 판단했다. “연결됨”은 코드 경로와 모의 모델 시험이 있다는 뜻이다. 실제 모델이 올바른 경험을 선택하고 역할·성과 왜곡을 찾아낸다는 뜻은 아니다. 선택적 확장과 명시적으로 보류한 기능은 필수 누락과 구분했다.

## 문서별 판단

| 설계 문서 | 준비도 | 근거와 남은 일 |
|---|---|---|
| `overall-workflow.md` | 핵심 단계 연결, 부분 충족 | 분석·근거·개요·초안·검증·미리보기 및 수정 1회 구현. 근거 충분 시 탐색 생략과 이전 결과를 참고하는 후속 요청은 부족. |
| `workflow-routing.md` | 부분 충족 | 새 글/수정 분석, 직접 선택 우선, 자동 후보 ID 확인, 모호한 후보 선택 구현. 새 글에서는 현재 노트 읽기와 검색을 먼저 강제해 상태별 탐색 생략이 미완성. |
| `harness-loop.md` | 주요 안전 경계 연결, 부분 충족 | 작성 가능성·개인 출처·누락·충돌·호출 한도·오류 구분 구현. 실제 커리어 경로는 도구 오류 후 제한 복구 대신 즉시 종료. |
| `agent-loop.md` | 조건부 탐색 연결, 부분 충족 | 도구 지원 모델에서 검색·읽기·문맥·질문 선택 가능, 탐색 중 수정 도구 차단. 경험 선택 이유·개요·구성 대안을 검토 가능한 결과로 표시하는 경로 없음. |
| `evidence-model.md` | 출처 종류 연결, 공유 상태 일부 | Vault·사용자 답변·Wikipedia·붙여넣기 구분. 분석·개요·검증 중간 결과는 주로 지역 변수이며 전체 근거표·초안 버전·승인 계보를 공통 상태로 노출하지 않음. |
| `execution-policy.md` | 한도·대기·검증·승인 보호 구현, 부분 충족 | 동일 실행 재개, 대기 중 타이머 정지, 중복·늦은 답변 차단, 수정 1회, 승인 전 쓰기 없음. 문서 변경 후 재검증·새 미리보기 화면 흐름은 미완성. |
| `verification.md` | 자동 시험 준비, 실사용 평가 대기 | 389개 테스트 통과. 실제 모델·실제 Obsidian·고정 문항의 경험 발견률/질문 수/출처 일치율 비교는 미검증. |
| `request-example.md` | 사례 일부 실행 가능 | 붙여넣기 공고·경험 검색·사용자 보충·초안·검증 가능. 예시의 공고 URL 읽기, 이전 초안에 “더 짧게”, 500자 조건의 객관적 검사는 미준비. |
| `README.md`, `overview.md` | 현황 갱신 필요 | 일부 연결 설명 추가는 있으나 “구현 전”, 빈 Registry·가짜 모델·작성 가능성 검사 미구현 등 과거 설명이 남음. |
| `tools/README.md` | 공통 계약 부분 충족 | 단계/권한·결과 예산 추정·질문 대기는 연결. 내부 원본 결과의 완료/대기/실패 공통 반환과 실행 문맥 분리는 미완성. |
| `research-references.md` | 참고 자료 | 다른 제품 조사 문서이며 그대로 구현할 요구사항 목록은 아님. 이번에는 외부 조사 내용을 재검증하지 않음. |
| `future-decisions.md` | 의도적 보류 | CLI·실행 프레임워크 비교를 미룬 문서. 이 기능이 없다는 이유로 필수 작성 경로 미완료로 세지 않음. |

## 준비된 코드 경로

- [career-graph.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/career-graph.ts:44): 전체 단계, 작성 가능성 검사, 개요·초안, 필수 검증, 수정 최대 1회, 검증된 최종 결과.
- [targets.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/targets.ts:14): 현재 노트의 실제 문단과 위치를 사용한 자동 대상. 모델은 후보 ID만 선택한다.
- [harness.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/harness.ts:59): 질문·답변 식별자, 같은 실행 재개, 활성 타이머 중단, 취소·중복·늦은 답변 검사.
- [main.ts](/Users/sunub/workspace/fathomark/plugin/src/main.ts:49), [structured.ts](/Users/sunub/workspace/fathomark/plugin/src/providers/structured.ts:17): 실제 로컬 제공자 구성과 도구 없는 단계별 구조화 호출.
- [claims.ts](/Users/sunub/workspace/fathomark/plugin/src/context/claims.ts:27), [copy-check.ts](/Users/sunub/workspace/fathomark/plugin/src/context/copy-check.ts:2): 실제 출처·개인 경험 근거·숫자·인용·문체 혼입 검사. 역할·성과 의미는 별도 모델 호출에 의존한다.
- [chat-view.tsx](/Users/sunub/workspace/fathomark/plugin/src/view/chat-view.tsx:136), [insertion-preview.ts](/Users/sunub/workspace/fathomark/plugin/src/obsidian/insertion-preview.ts:43): 검증된 결과만 미리보기, 승인 시 문서·선택 확인, 동일 적용 최대 1회.

현재 실행 한도는 모델 전체 24호출, 탐색 8라운드, 도구 전체 12호출·도구별 5호출, 질문 3회, 붙여넣기 24,000 UTF-8 바이트, 답변 12,000바이트, 기본 활성 시간 120초다. 모델 파싱 재시도는 전체 호출 한도에 포함한다. 사람 대기 시간은 활성 시간에서 제외한다.

## 반드시 구분해야 할 미완성 사항

### 1. 이전 결과를 참고하는 후속 요청

[chat-view.tsx](/Users/sunub/workspace/fathomark/plugin/src/view/chat-view.tsx:81)는 요청마다 `evidence: []`, `conversation: []`로 시작한다. [RunSession.history](/Users/sunub/workspace/fathomark/plugin/src/harness/session.ts:37)는 완료 답변을 보관하지만 현재 작성 입력에 연결하지 않는다. 미완료 결과의 보충 근거도 다음 요청으로 전달하지 않는다.

따라서 적용 전 생성한 초안에 “더 짧게”라고 이어 말하면 이전 초안과 보충 사실을 자동으로 참조하는 흐름은 없다. 이는 `overall-workflow.md`와 `request-example.md`의 후속 요청 계약에 미달한다.

### 2. 충분한 근거에서 탐색 생략

[career-graph.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/career-graph.ts:175)는 새 글 작성이면 현재 노트 읽기와 초기 Vault 검색을 수행한다. 이미 필요한 근거가 충분한지 먼저 검사하지 않는다. 선택 문단 수정은 탐색을 생략할 수 있으므로 완전 미구현이 아닌 부분 구현이다.

### 3. 검토 가능한 중간 판단 결과

[개요 생성](/Users/sunub/workspace/fathomark/plugin/src/workflow/career-graph.ts:223)은 실제로 수행되지만 UI에는 단계 이름만 전달한다. 필요한 사실 목록, 경험 선택 이유, 구성 대안, 성공한 검증의 상세 결과를 보관·표시하는 계약은 부족하다. [CareerState](/Users/sunub/workspace/fathomark/plugin/src/workflow/state.ts:16)도 이 항목 전체를 공통 상태로 정의하지 않는다. 단일 실행은 지역 변수로 동작하므로 전체 작성 단계가 없다는 뜻은 아니다.

### 4. 문서 변경 후 미리보기 재생성

기존 적용기는 변경된 문서와 중복 승인을 차단한다. 그러나 [커리어 미리보기](/Users/sunub/workspace/fathomark/plugin/src/view/chat-view.tsx:136)는 `recapture: true`일 때 항상 `null`을 반환한다. [화면](/Users/sunub/workspace/fathomark/plugin/src/ui/panel/InsertionPreview.tsx:21)은 여전히 재생성 버튼을 제공한다. 안전 차단은 준비됐지만 새 요청·재검증·새 승인으로 안내하는 사용 흐름은 미완성이다.

### 5. 실패 복구와 공통 결과 계약

기존 일반 채팅의 [tool-call-handler.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/tool-call-handler.ts:23)는 시간 초과 재시도와 입력 수정 기회를 제공한다. 실제 커리어 경로의 [도구 호출](/Users/sunub/workspace/fathomark/plugin/src/workflow/career-graph.ts:95)은 실패 이벤트를 남기고 종료한다. 구조화 출력 파싱 재시도와 도구 장애 복구는 별개다.

[executeTool](/Users/sunub/workspace/fathomark/plugin/src/harness/tool-executor.ts:24)은 여전히 문자열과 출처를 반환하고 커리어 흐름이 문자열을 다시 해석한다. 문서가 제안한 완료/사용자 대기/실패의 공통 내부 결과 형식, 신뢰된 실행 ID와 좁은 서비스로 정리한 공통 문맥은 아직 완성되지 않았다.

### 6. 출력 조건과 실제 품질

500자 같은 조건은 요청 문장으로 모델에 전달하지만 글자 수와 포함 기준을 코드로 검사하지 않는다. 한국어 고유명사·짧은 문체 사실 혼입과 역할·성과 의미는 완전히 기계적으로 보장하지 못한다. 같은 모델의 별도 검토 호출도 오류를 낼 수 있다.

현재 검색은 기존 순위 구현을 사용한다. 작은 단어 검색 기준 시험에서 답변 가능한 9개 사례의 상위 3개 정답 회수율은 0.33으로 출력됐다. 이것은 실제 앱 전체 품질 점수가 아니며, 테스트의 품질 합격선도 아니다. 실제 문항과 Vault 평가가 필요하다.

## 도구별 준비도

커리어 요청별 Registry는 8개 도구를 등록한다. 앱 초기 Registry는 공개 자료 reader가 없는 7개다. 모델의 추가 도구 선택은 도구 호출을 지원하는 모델에서만 활성화된다. 지원하지 않아도 고정 읽기·검색과 구조화 작성은 가능하다.

| 도구 | 평가 | 남은 조건 |
|---|---|---|
| `search_vault` | 연결됨, 부분 충족 | 판정값·출처·문단별 예산 구현. 허용 폴더 범위와 실검색 품질 검증은 별도. 경험 폴더 설정은 검색 순위 규칙이다. |
| `read_note` | 기본 계약 연결됨 | 파일 없음·제목/문단 누락·결과 한도 구현. 장애 이후 복구 탐색은 커리어 경로에서 제한적. |
| `get_note_context` | 연결됨, 부분 충족 | 제목·연결·깨진 링크·한 호출 중복 제거. 실행 전체 재조회 기록과 폴더 범위 검사는 없음. |
| `search_wikipedia` | 설정·모델 지원에 따른 연결 | 사용자 주제와 페이지 허용 목록 구현. 후보 요약과 읽은 원문의 근거 형식 구분은 부족. |
| `read_wikipedia_page` | 조건부 연결, 부분 충족 | 허용 페이지·언어·크기 검사. 같은 URL의 검색 요약이 먼저 등록되면 본문 출처가 대체되지 않는 중복 처리 공백이 있음. |
| `ask_user` | 핵심 대기·재개 연결됨 | 같은 실행·ID·한도·취소 구현. 의미상 같은 질문을 반복하지 않는 검사는 부족. |
| `read_public_source` | 붙여넣기 1건 연결됨 | P1·부분 추출·공개 출처 구현. 원문 상한 12,000바이트와 실제 실행 추출 3,000바이트 차이를 문서에 반영해야 함. URL 읽기는 미지원. |
| `propose_revision` | 검사 재사용·미리보기 연결됨 | 커리어 고정 단계는 도구 호출 대신 `checkRevision`을 직접 재사용하고 전체 검증을 추가한다. 의미 검토의 품질은 미검증. |
| `search_public_sources` | 독립 모듈만, 의도적 보류 | 미등록·일반 웹 접근 거부. 실제 검색 제공자·동의·URL 읽기 연결 필요. 초기 붙여넣기 흐름의 필수 누락으로 세지 않음. |
| `save_working_note` | 독립 모듈만, 선택적 보류 | 기존 상태로 충분하면 생략하도록 문서에 명시. 도구를 활성화하려면 저장 내용 재사용과 출처 실존 검사를 완성해야 함. |

Wikipedia의 중복 근거 문제는 [검색 출처](/Users/sunub/workspace/fathomark/plugin/src/tools/search-wikipedia.ts:32)와 [URL 기준 등록](/Users/sunub/workspace/fathomark/plugin/src/context/evidence.ts:68)에서 확인된다. 공개 출처는 개인 경험 주장에 사용할 수 없으므로 개인 경험 검증을 우회하는 것은 아니지만 공개 배경 조사 계약은 부분 충족이다.

결과 예산은 커리어 경로에서 추정치로 강제한다. 정확한 모델 토큰 수가 아니며 기존 일반 채팅 경로에는 동일한 카운터가 주입되지 않는다. 모든 실행 경로에 동일한 실제 토큰 한도를 보장했다고 표현하면 안 된다.

## 문서와 HTML 갱신 필요

- “빈 Registry”, “가짜 모델”, “질문/붙여넣기 구현 전”, “검색 판정값 미보존”, “작성 가능성 의미 검사 미구현” 설명이 현재 코드보다 뒤처져 있다.
- 기존 일반 채팅 루프와 실제 커리어 작성 흐름의 종료·재시도 정책을 구분해야 한다.
- `propose-revision.md`는 구현 상태·현 계약을 설명하지만 대응 HTML은 구현 전·옛 계약을 설명한다. Markdown과 HTML 자체가 불일치한다.
- CLI·새 프레임워크·영속 복구 등 명시적 후속 검토는 보류 상태로 유지하는 것이 맞다.

## 이번 검증과 다음 우선순위

`pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` 재실행 결과: 타입 검사 통과, 테스트 389개 통과·실제 Vault 평가 1개 건너뜀, 110개 모듈·332개 의존 관계 위반 없음, 빌드 통과(`main.js` 813 KB minified).

로컬 Ollama 상태도 접근 제한을 분리해 읽기 전용으로 확인했지만 `127.0.0.1:11434`에 연결할 수 없었다. 실제 모델의 글쓰기·의미 검증과 실제 Obsidian 수동 동작은 이번에도 평가하지 못했다. 의미 검사 테스트는 모의 모델의 판단을 미리 지정한 것이며 실제 모델의 발견 능력을 입증하지 않는다.

권장 우선순위는 (1) 후속 요청의 초안·근거 연결, (2) 변경된 대상의 새 검증·미리보기 안내, (3) 충분한 근거일 때 탐색 생략과 중간 결과 표시, (4) 실제 모델·실제 Obsidian 평가다. 문서·HTML 현황 갱신도 병행해야 한다. 일반 웹이나 추가 학습보다 이 초기 작성 경로의 완성이 먼저다.
