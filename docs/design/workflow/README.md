# Fathomark 기능별 설계 문서

상태: **설계 초안 · 구현 전**  
기준일: 2026-10-11

이 문서 묶음은 전체 글쓰기 흐름, 실행 책임, 도구 기능을 각각 분리한 설계 초안이다. 도구 문서는 기능·사용 조건·요구사항·워크플로우·시각화·검증 기준을 독립적으로 정의한다. 기존 단일 문서는 본문 대신 이 목차를 안내한다.

현재 연결 코드와 설계의 차이는 [2026-10-11 구현 결과](../../../reports/2026-10-11-career-flow-implementation.md)에서 확인한다. 일부 문서의 “구현 전”·“빈 도구 목록” 설명은 과거 상태다. 실제 모델 호출·작성·검증·질문 재개·미리보기는 코드에 연결됐으며 실제 모델 품질과 Obsidian 수동 검증은 별도다.

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
