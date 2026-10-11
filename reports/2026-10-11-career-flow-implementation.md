# 모델과 글쓰기 흐름 연결 결과

## 결과

실제 로컬 모델 호출 → 요청 분석 → 조건부 탐색 → 작성 가능성 검사 → 경험·개요 선택 → 초안 → 구조·의미·문체 검증 → 검증된 답변·미리보기를 연결했다. 사용자가 선택한 문단을 우선하고, 선택이 없으면 실제 노트의 문단 ID로 자동 수정 대상을 찾는다.

기존 미커밋 코드 위에 구현했으며 기존 커리어 모드·요청 정리·도구·미리보기와 별도의 학습 실험 변경을 보존했다. 새 의존성을 추가하지 않았고 Python 학습·모델 다운로드를 실행하지 않았다.

## 코드별 책임

### 1. 실제 모델과 설정

- [main.ts](/Users/sunub/workspace/fathomark/plugin/src/main.ts): 가짜 모델 대신 `createOllamaProvider`를 사용한다. `resolveRuntime`은 실행 시작 시 모델·도구·붙여넣기 보관소를 구성한다. 진행 중 모델 설정이 바뀌어도 이미 시작한 실행은 같은 모델로 진행한다.
- [ollama.ts](/Users/sunub/workspace/fathomark/plugin/src/providers/ollama.ts): 로컬 접속·모델 목록·실시간 답변·도구 호출·사용량을 처리한다. 템플릿과 컨텍스트 지원을 검사한다. 도구 호출 미지원 모델은 고정 읽기 경로를 사용한다.
- [settings/index.ts](/Users/sunub/workspace/fathomark/plugin/src/settings/index.ts), [settings-tab.ts](/Users/sunub/workspace/fathomark/plugin/src/view/settings-tab.ts): 기본 모델명은 `gemma4:e4b`, 기존 `fake` 설정은 이 기본값으로 이동한다. 실제 설치 모델 이름을 설정할 수 있다. 설치 여부는 실행 시 확인한다.
- [local-counter.ts](/Users/sunub/workspace/fathomark/plugin/src/context/local-counter.ts), [token-budget.ts](/Users/sunub/workspace/fathomark/plugin/src/context/token-budget.ts): 바이트·메시지 여유량으로 입력량을 보수적으로 추정한다. 정확한 계산 또는 검증된 상한이라고 주장하지 않으며 화면에도 추정 표시를 한다.

### 2. 구조화 모델 호출

[structured.ts](/Users/sunub/workspace/fathomark/plugin/src/providers/structured.ts)의 `callStructured`를 분석·대상 선택·개요·초안·의미 검증에 사용한다. 도구 목록을 비우고 JSON 형식을 검사하며 출력 형식 오류는 한 번만 재시도한다. 완전한 단일 JSON 코드 블록도 허용하지만 바깥 설명문을 임의로 잘라 성공 처리하지 않는다. 출력 65,536바이트 초과·비정상 종료·출력 길이 한도·도구 호출은 거부한다. 취소·오류 시 모델 요청과 반복자를 정리한다.

### 3. 단계 순서와 통과 조건

[career-graph.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/career-graph.ts)의 `runCareerWorkflow`가 전체 순서를 관리한다. 별도 그래프 프레임워크는 추가하지 않았다.

1. 붙여넣기 자료를 먼저 읽고 요청 의도·지원 문항·수정 기준·검색어·필요한 사실을 분석한다. 문단 선택만으로 새 글 요청을 수정으로 분류하지 않는다.
2. 새 글은 기존 도구로 읽기·검색한다. 도구 호출 지원 모델은 추가 검색·읽기·질문을 선택할 수 있다. 도구 없는 탐색 응답은 다음 작성 가능성 검사로 이어진다.
3. 개인 경험 근거·필수 행동·중요한 충돌을 검사한다. 출처 ID는 실제 수집 목록과 대조한다. 해결되지 않은 부족·충돌은 초안 전에 차단한다. 숫자 성과를 필수로 강제하지 않는다.
4. 경험·개요를 선택하고 근거와 문체 예시를 분리해 초안을 생성한다.
5. 구조·의미·문체 검증 후 수정 초안은 최대 한 번만 생성한다. 새 사실이 필요하거나 두 번째 검증도 실패하면 미완료다.
6. 최종 통과 결과만 `verified_draft`로 전달한다. 답변 완료와 노트 적용 선택은 분리한다.

[state.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/state.ts)는 근거·대상·이력·누적 한도·질문 계약을 정의한다. [request.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/request.ts)는 기존 입력 정리를 유지하고 선택 없는 수정 요청을 `resolve_target`으로 반환한다.

### 4. 자동 수정 대상

[targets.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/targets.ts)는 노트 스냅샷에서 최대 40개, 각각 2,000자 이하의 문단 후보를 만든다. 제목·코드·메타데이터는 제외하고 너무 긴 문단을 중간에서 잘라 후보로 만들지 않는다. 모델에는 ID와 본문만 전달한다. 위치·원문은 모델 출력 대신 실제 후보 조회로 가져온다. 후보 하나는 제안, 2~4개는 사용자 선택, 더 많거나 없으면 직접 선택 안내로 처리한다.

자동 대상도 원래 에디터 추적 ID를 유지한다. `selectionGuard`는 요청 당시 선택·커서 상태를 보관해 자동 수정 범위와 적용 시 검사할 화면 상태를 구분한다.

### 5. 질문 대기·재개

[harness.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/harness.ts)의 `waitForUser`는 실행에 묶인 질문 ID를 만들고 활성 타이머·모델·도구 호출을 멈춘다. `answerQuestion`은 현재 질문·취소·길이·선택지를 검사하고 중복·늦은 답변을 거부한다. 답변 후 같은 실행의 근거·한도와 남은 활성 시간을 유지한다.

[run-state.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/run-state.ts), [events.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/events.ts)는 단계·질문·답변·검증 결과·미완료를 표현한다. [QuestionPanel.tsx](/Users/sunub/workspace/fathomark/plugin/src/ui/panel/QuestionPanel.tsx)는 선택지·직접 답변·중복 제출 방지·중지를 제공한다. 새로 확인한 사실은 사용자 답변 출처로 보존하고 노트 인용으로 가장하지 않는다.

### 6. 도구와 공개 자료

- [create-registry.ts](/Users/sunub/workspace/fathomark/plugin/src/tools/create-registry.ts): 필요한 서비스가 있는 실행에서 질문과 공개 자료 읽기를 등록한다.
- [public-sources.ts](/Users/sunub/workspace/fathomark/plugin/src/workflow/public-sources.ts): 요청별 새 보관소의 `P1`을 모델이 읽게 한다. 붙여넣기 한 건은 24,000 UTF-8 바이트까지다.
- [read-public-source.ts](/Users/sunub/workspace/fathomark/plugin/src/tools/read-public-source.ts): 원래 상한 12,000바이트를 유지하며 실제 보수적 결과 예산을 쓰는 실행에서는 본문을 3,000바이트로 제한한다. 부분 추출·생략을 근거와 최종 안내에 보존한다.
- [tool-executor.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/tool-executor.ts): 기존 권한·형식·시간·취소 검사를 재사용하고 결과 예산을 검사한다.
- [vault-output.ts](/Users/sunub/workspace/fathomark/plugin/src/tools/vault-output.ts)의 `boundVaultOutput`: 읽기·검색 결과를 전체 JSON 예산 안에서 완전한 문단 단위로 줄이고 생략을 표시한다. 근거가 전부 빠지면 검색은 `supported: false`다.
- [evidence.ts](/Users/sunub/workspace/fathomark/plugin/src/context/evidence.ts): Vault·Wikipedia·사용자 답변·붙여넣기 자료를 구분한다. 같은 노트의 서로 다른 구절은 근거 등록 때 각각 보존하며 기존 위치 기반 중복 제거 동작은 유지한다.

### 7. 사실·문체 검증

[claims.ts](/Users/sunub/workspace/fathomark/plugin/src/context/claims.ts)는 모든 경험 주장에 출처를 요구하고 실제 ID·개인 경험 출처·숫자·단위·직접 인용을 검사한다. 인용 표기는 코드가 조립하고 실패한 초안은 최종 글을 반환하지 않는다. [copy-check.ts](/Users/sunub/workspace/fathomark/plugin/src/context/copy-check.ts)는 문체에만 있는 숫자·URL·영문 고유 표현과 정규화한 40자 연속 복사를 검사한다.

작성 흐름의 별도 의미 검토는 역할·행동·성과·조건·필수 사실을 대조한다. 기존 [propose-revision.ts](/Users/sunub/workspace/fathomark/plugin/src/tools/propose-revision.ts)의 숫자·필수 구절 검사도 수정 경로에서 재사용한다. `keepFacts`가 제공되면 코드가 누락을 차단한다. 숫자·출처 생략 경고와 변경 없는 수정문도 승인 가능한 결과로 넘기지 않는다. Python의 원문·숫자 분리 아이디어를 가져왔지만 Python을 플러그인에서 실행하거나 추가 학습하지 않는다.

### 8. 검증 결과·승인·적용

[session.ts](/Users/sunub/workspace/fathomark/plugin/src/harness/session.ts)는 마지막 검증 결과를 실행 완료 상태일 때만 제공하고 새 실행에서 지운다. [chat-view.tsx](/Users/sunub/workspace/fathomark/plugin/src/view/chat-view.tsx)는 커리어 요청·붙여넣기·답변을 연결하고 검증된 대상·본문으로만 미리보기를 만든다. 바뀐 문서에 오래된 초안을 재캡처해 승인하는 경로는 차단한다.

[insertion-preview.ts](/Users/sunub/workspace/fathomark/plugin/src/obsidian/insertion-preview.ts)는 전체 문서와 원래 선택·커서 상태를 재검사한다. 승인 전 쓰기 0회, 같은 미리보기 적용 최대 1회를 유지한다. [App.tsx](/Users/sunub/workspace/fathomark/plugin/src/ui/App.tsx), [panel-store.ts](/Users/sunub/workspace/fathomark/plugin/src/ui/state/panel-store.ts), [Sources.tsx](/Users/sunub/workspace/fathomark/plugin/src/ui/panel/Sources.tsx)는 단계·질문·공고·검증 결과·생략·출처를 표시하고 최종 글 중복 출력을 방지한다.

## 한도·남은 제한

- 전체 모델 24호출, 탐색 8라운드, 전체 도구 12호출, 도구별 5호출, 질문 3회. 출력 형식 재시도도 모델 한도에 포함한다.
- 보충 답변 12,000 UTF-8 바이트, 기본 활성 시간 120초. 사람 입력 대기 시간은 활성 시간에서 제외한다.
- 입력량은 추정치다. 모델별 정확한 토큰·템플릿 검증은 남아 있으며 보수적 제한 때문에 긴 자료가 제외되거나 거부될 수 있다.
- 별도 의미 검토도 같은 모델을 호출하므로 상관된 오류가 남을 수 있다. 사실 무오류 보증이 아니며 적용 전 원문과 수정문을 확인해야 한다. 한국어 고유명사·짧은 문체 사실 혼입의 완전 검출도 보장하지 않는다.
- 기존 검색 순위 품질은 개선하지 않았다. 코드 연결과 실제 경험 검색 품질은 별도로 평가해야 한다.
- 로컬 `127.0.0.1:11434/api/tags` 읽기 시도에서 Ollama 서버에 연결하지 못했다. 실제 모델의 한국어 품질·응답 시간과 실제 Obsidian의 되돌리기·앱 종료 동작은 검증하지 않았다.
- 일반 웹·호스티드 모델·추가 학습·선택적 작업 메모·영속 복구는 이번 필수 경로에 추가하지 않았다.

## 검증

타입 검사, 전체 테스트, 의존 관계 검사, 빌드를 수행했다. 주요 회귀 시험은 `career-workflow`, `career-guardrails`, `career-harness`, `career-input-wiring`, `career-target-flow`, `career-stream-cleanup`, `career-tool-errors`, `vault-result-budget`, `structured`, `claims`, `copy-check`, `paragraph-targets`, `request-preparation` 테스트다. 기존 삽입·UI 시험도 실행했다.

최종 결과: 테스트 59개 파일·389개 항목 통과, 실제 Vault 평가 1개 건너뜀. 타입 검사 통과, 110개 모듈·332개 의존 관계에서 위반 없음, 생산 빌드 통과(`main.js` 813 KB minified), 변경 파일의 공백 검사 통과.

독립 검토에서 발견한 긴 노트 결과 예산 오류와 붙여넣기 분석 순서를 수정하고 재검토했다. 코드의 스트림 정리·질문 재개·미리보기 차단은 모의 모델로 검증했으며 실제 모델 품질 검증으로 대체하지 않는다.
