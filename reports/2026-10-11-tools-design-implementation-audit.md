# 도구 설계 대비 구현 평가

> 기록 (2026-10-11). 이후 상태는 [실제 모델 보고서](../docs/testing/career-flow-real-model-report.md)와 [DIRECTION.md](../docs/DIRECTION.md)를 본다.

평가일: 2026-10-11. 대상은 `docs/design/workflow/tools/`의 README 및 도구 10개 문서와 현재 작업 트리의 코드다. 미커밋 코드도 포함했다. 코드·기존 문서는 수정하지 않았다.

## 결론

**모두 구현되고 요구사항을 만족한 상태는 아니다.** 도구 10개 모두 구현 파일은 있고, 앱에는 6개가 등록됐다. 나머지 4개는 독립 모듈과 테스트가 있으나 실제 앱 실행에서 제외된다. 공통 결과 예산, 사용자 질문 대기·재개, 공개 자료 보관·인용, 사실 의미 보존은 미완성이다.

앱은 여전히 고정 답변만 출력하는 `FakeModelProvider`를 사용한다. 따라서 등록된 6개도 실제 모델이 판단해 사용하는 사용자 흐름이 완성됐다고 볼 수 없다. [앱 구성](/Users/sunub/workspace/fathomark/plugin/src/main.ts:40), [가짜 모델의 출력](/Users/sunub/workspace/fathomark/plugin/src/providers/fake.ts:78).

💡 등록: 모델에게 도구를 공개하고 실제 호출 대상으로 연결하는 것이다. 독립 모듈의 존재, 앱 등록, 실제 사용자 흐름의 완성은 각각 다른 평가 기준이다.

완성률 백분율은 제시하지 않는다. 요구사항의 중요도가 다르고 일부는 선택적 확장 또는 미정 사항이므로, 파일 개수로 기능 완성률을 계산하면 오해를 부른다.

## 도구별 평가

### 1. search_vault: 기본 계약 구현, 전체 설계 부분 충족

- 구현·앱 등록됨. 검색어 1~200자, 결과 1~10개/기본 5개, 추가 입력 거부, 경험 우선순위, 경로·구절 출처, 삭제된 노트 누락, 취소 처리가 있다. 단어 검색은 1,000개 노트까지 읽는다.
- **`supported`·`reason` 보존은 이미 해결됐다.** 현재 출력 형식에 명시돼 실행기의 검증과 문자열 변환 뒤에도 남는다. 문서의 “출력 형식에 없다”는 설명은 오래됐다. [출력 계약](/Users/sunub/workspace/fathomark/plugin/src/tools/search-vault.ts:17).
- 의미 검색은 구현돼 있으나 앱 구성에서 해당 서비스를 주입하지 않아 실제 앱은 단어 검색으로 동작한다. 의미 검색이 선택적이라는 문서 계약에는 부합하지만 앱 기능으로 활성화됐다고 설명하면 안 된다. [앱 등록 구성](/Users/sunub/workspace/fathomark/plugin/src/tools/create-registry.ts:32), [기본값](/Users/sunub/workspace/fathomark/plugin/src/tools/search-vault.ts:34).
- 도구별 1,400토큰 예산과 단계별 폴더 범위 제한은 아직 강제되지 않는다. 경험 폴더 설정은 순위 조정이며 접근 허용 범위가 아니다.
- 시험 근거: `vault-tools.test.ts`, `vault-search-ranking.test.ts`, `hybrid-search.test.ts`, `tool-composition.test.ts`.

### 2. read_note: 기본 읽기 계약 대체로 충족

- 구현·등록됨. 상대 Markdown 경로만 허용하고 절대 경로·상위 이동·추가 입력을 거부한다. 파일 없음은 `not_found`, 제목 없음과 긴/추가 문단 생략은 `omitted`로 구분한다. 원문 구절 합계는 4,096 UTF-8 바이트까지다. [읽기 계약](/Users/sunub/workspace/fathomark/plugin/src/tools/read-note.ts:8), [구절 제한](/Users/sunub/workspace/fathomark/plugin/src/tools/vault-search.ts:187).
- 공통 README가 요구하는 세분화된 결과 상태는 완성되지 않았다. 빈 노트는 빈 출처·빈 누락으로 반환하고 제목·구절 없음은 주로 설명 문자열로 표현한다. 도구별 1,400토큰 예산도 미강제다.
- 원문을 반환하는 기능과 본인 역할·성과를 검증하는 기능은 다르다. 후자는 도구 자체에서 수행하지 않는다.
- 시험 근거: `vault-tools.test.ts`. 제목 부재와 여러 문단의 합계 제한에 대한 전용 시험은 보강할 여지가 있다.

### 3. search_wikipedia: 조회·전송 경계 구현, 근거 분리 부분 충족

- 구현·등록됨. `topicId`만 받고 사용자 공개 주제와 일치해야 한다. 설정 재검사, 최대 5개 후보, 언어·페이지 허용 목록, 리디렉션 거부, HTTP/JSON 오류, 응답 1 MiB 제한이 있다. [검색](/Users/sunub/workspace/fathomark/plugin/src/tools/search-wikipedia.ts:33), [응답 제한](/Users/sunub/workspace/fathomark/plugin/src/tools/wikipedia-shared.ts:40).
- **검색 요약과 읽은 본문이 같은 근거 종류로 등록된다.** 검색의 `provenance`도 요약을 근거 목록에 넣으며, “읽은 본문으로 확인된 자료”라는 구분 필드가 없다. 요약을 후보 선택용으로만 쓰라는 요구를 제품 수준에서 강제하지 못한다. [검색 출처 반환](/Users/sunub/workspace/fathomark/plugin/src/tools/search-wikipedia.ts:32), [공통 근거 등록](/Users/sunub/workspace/fathomark/plugin/src/harness/langchain-loop-calls.ts:73).
- JSON 문법 오류는 거부하지만, HTTP 성공 응답의 예상 검색 구조가 없으면 빈 결과로 처리한다. API 오류 객체 등은 검색 결과 없음과 구분되지 않을 수 있다. [응답 해석](/Users/sunub/workspace/fathomark/plugin/src/tools/search-wikipedia.ts:49).
- Wikipedia 전용 상태가 공통 실행 문맥에 남아 있고 1,400토큰 예산은 미강제다.
- 시험 근거: `wikipedia.test.ts`, `tool-composition.test.ts`.

### 4. read_wikipedia_page: 제한된 본문 읽기 대체로 충족

- 구현·등록됨. 같은 실행에서 검색한 페이지만 읽으며 공개 주제 언어·설정을 검사한다. 응답 1 MiB, 선택 본문 4,096 UTF-8 바이트 제한과 생략 안내가 있다. 본문 필드가 없으면 누락, 네트워크 실패는 오류로 처리한다. [본문 읽기](/Users/sunub/workspace/fathomark/plugin/src/tools/read-wikipedia.ts:38).
- 빈 문자열 본문은 출처·누락 모두 빈 배열로 끝날 수 있어 원문 부재의 명시적 안내가 부족하다. 개별 결과 예산과 오류 후 제한된 복구는 공통 경로의 미완성 사항이다.
- 읽은 배경 지식이 사용자의 경력으로 바뀌지 않는다는 의미 검증은 별도다.
- 시험 근거: `wikipedia.test.ts`. 1 MiB·잘못된 JSON·HTTP 실패·문단 생략의 세부 경계 시험은 충분히 갖춰졌다고 보기 어렵다.

### 5. get_note_context: 구현·등록됨, 실행 단위 관리 부분 충족

- 제목 구조, 연결 후보 위치, 깨진 링크, 파일 부재·읽기 불가를 구분한다. 연결은 한 단계만 조회하며 최대 20개/기본 10개다. 한 호출 안에서 자기 링크·중복 링크를 제거하고 출처를 생성하지 않는다. [구현](/Users/sunub/workspace/fathomark/plugin/src/tools/note-context.ts:25).
- 동일 노트·연결을 다른 호출 ID로 다시 조회한 기록을 활용하지 않는다. 실행 전체의 조회 대상·후보 기록, 명시적 허용 폴더 범위 검사는 없다. 제목 목록에도 별도 크기 상한이 없어 선언된 800토큰 예산을 보장하지 못한다.
- 고정 깊이 1은 무제한 순환을 방지하는 합리적인 구현이나, 문서의 깊이 입력 요구와 달라 문서에 확정해야 한다.
- 시험 근거: `note-context.test.ts` 11개, `tool-composition.test.ts`의 등록·호출 시험.

### 6. ask_user: 질문 생성만 구현, 핵심 대기·재개 미구현

- 질문·누락 사실·선택지 최대 4개 등의 입력 검사와 즉시 질문 요청 반환은 있다. [모듈](/Users/sunub/workspace/fathomark/plugin/src/tools/ask-user.ts:20).
- **앱에 등록되지 않는다.** 사용자 답변 대기 상태, 질문/답변 ID, 동일 호출 완료, 실행 재개, 대기 중 타이머 정지, 누적 예산 유지, 늦은 답변 거부가 없다. 현재 실행 상태에는 사용자 입력 대기가 없다. [실행 상태](/Users/sunub/workspace/fathomark/plugin/src/harness/run-state.ts:14).
- 사용자 답변 전용 출처 종류도 없다. 단순 등록하면 질문 요청을 일반 도구 결과처럼 모델에 넘기므로 등록 보류는 올바른 제한이다.
- 시험 근거: `ask-user.test.ts` 9개. 질문 요청 생성 시험이며 사람의 답변 이후 재개 시험이 아니다.

### 7. read_public_source: 붙여넣기 읽기 모듈 구현, 앱 보관 경로 미구현

- `sourceId`만 입력받고 자료 없음은 `not_found`로 반환한다. 제목·본문·수집 시각·완전/부분 추출·누락을 제공하며 가짜 URL을 만들지 않는다. 12,000 UTF-8 바이트까지 반환한다. [모듈](/Users/sunub/workspace/fathomark/plugin/src/tools/read-public-source.ts:25).
- 첫 문단 자체가 제한보다 크면 문단 중간을 자르고 안내한다. “문단 단위 반환”에 대한 예외 정책이므로 문서에 맞춰 확정할 필요가 있다. 4,000토큰 예산은 선언뿐이다. [초과 처리](/Users/sunub/workspace/fathomark/plugin/src/tools/read-public-source.ts:125).
- 앱에는 붙여넣기 입력·요청별 보관·자료 ID 발급/목록 전달·보관 상한이 없고 도구도 등록하지 않는다. URL 없는 공개 자료의 출처 표시 역시 미연결이다. 이는 문서가 밝힌 등록 보류 조건에 부합하는 의도된 미완성이다.
- 초기 계약에서 URL 읽기는 제외돼 있으므로 URL 수집 부재 자체는 초기 읽기 도구의 결함으로 세지 않는다.
- 시험 근거: `read-public-source.test.ts` 11개. 자료 속 지시를 실제 모델이 무시하는지까지 검증하지는 않는다.

### 8. search_public_sources: 준비 모듈 구현, 공개 검색 흐름 미완성

- 질문 최대 120자, 결과 최대 5개, 요약 최대 400자다. 주입된 Vault 전용 표현·경로·제어문자를 요청 전에 차단하고 서비스 오류·빈 결과·한도 소진을 구분한다. [모듈](/Users/sunub/workspace/fathomark/plugin/src/tools/search-public-sources.ts:129).
- 앱 등록·실제 검색 서비스·승인된 공개 조사 범위·질의/선택 이력 연결이 없다. `general_web` 권한은 계속 거부된다. 안전한 보류이며 작동하는 검색 기능은 아니다. [권한](/Users/sunub/workspace/fathomark/plugin/src/harness/policy.ts:82).
- 공식 출처 여부는 반환하지만 공식성·관련성·시점을 기준으로 선별하는 구현은 없다. 제공자가 준 순서를 유지한다. [후보 처리](/Users/sunub/workspace/fathomark/plugin/src/tools/search-public-sources.ts:175).
- 검색은 URL 후보를 주지만 공개 읽기는 붙여넣기 ID만 받는다. **검색 → 선택 → 원문 확인의 연결이 없다.**
- 시험 근거: `search-public-sources.test.ts` 8개. 주입된 검색 서비스와 차단 로직 시험이다.

### 9. save_working_note: 선택적 모듈, 재사용 계약 미완성

- 사실·해석·누락·개요를 분리하고 항목 수/길이 제한, 버전 충돌·종료 실행 거부, 출처 ID 반환을 구현했다. 실행 ID를 모델 입력 대신 저장소에 묶는 방식은 공통 README의 신뢰 경계에 부합한다. [저장소](/Users/sunub/workspace/fathomark/plugin/src/tools/save-working-note.ts:102).
- **저장된 내용을 읽는 경로가 없다.** 메모리 저장소는 `save`·`close`만 제공해 후속 판단에 재사용할 수 없다. 출처는 `S숫자` 형식만 검사하므로 해당 실행에서 발급되지 않은 ID도 저장 가능하다. [출처 입력](/Users/sunub/workspace/fathomark/plugin/src/tools/save-working-note.ts:23).
- 앱에서 등록하지 않는다. 문서 자체가 필요성이 확인될 때만 추가하는 선택적 도구이므로, 미등록만으로 필수 기능 누락이라고 판단하지 않는다. 다만 구현했다고 주장하려면 재사용·실존 출처 검사·실행 종료 연결이 필요하다.
- 시험 근거: `save-working-note.test.ts` 4개. 버전·종료·입력 형태 검증 중심이다.

### 10. propose_revision: 현재 좁은 계약 구현, 사실 의미 보존은 미충족

- 구현·등록·단계 제한·미리보기 연결이 있다. 추가 숫자·추가 출처·필수 구절 누락은 거절하고 사라진 숫자·출처는 검토 항목으로 반환한다. 탐색 중에는 모델 공개/실행을 거부한다. 거절된 제안은 1회 수정할 수 있으며 두 번째 거절에서 `incomplete`로 끝난다. [검사](/Users/sunub/workspace/fathomark/plugin/src/tools/propose-revision.ts:81), [실행 한도](/Users/sunub/workspace/fathomark/plugin/src/harness/langchain-loop-calls.ts:79).
- 마지막 제안이 `ready`이고 선택 구절과 원문이 맞을 때만 미리보기에 전달한다. 적용 전 문서·선택 영역 재검사와 중복 승인 방지는 기존 적용 경로에 있다. [미리보기 판정](/Users/sunub/workspace/fathomark/plugin/src/harness/revision.ts:38), [적용](/Users/sunub/workspace/fathomark/plugin/src/obsidian/insertion-preview.ts:43).
- **`ready`는 역할·수치·성과의 의미 보존을 증명하지 않는다.** 숫자 집합과 문자열을 비교하므로, 같은 숫자를 서로 다른 성과에 배치하거나 필수 구절을 지정하지 않은 역할 표현을 바꾸는 경우는 검출하지 못한다. 문서도 이 한계를 명시하고 후속 주장 검증 S3에 맡긴다.
- 사라진 숫자·출처가 있어도 `ready`가 된다. 미리보기에는 수정문만 전달돼 검토 항목·기준·수정 이유를 별도 안내하지 않는다. 이 정보는 도구 결과에는 있으나 승인 화면에서 충분히 전달되지 않는다. [전달](/Users/sunub/workspace/fathomark/plugin/src/view/chat-view.tsx:128), [승인 화면](/Users/sunub/workspace/fathomark/plugin/src/ui/panel/InsertionPreview.tsx:13).
- 시험 근거: `propose-revision.test.ts` 7개, `revision-flow.test.ts` 4개, `tool-composition.test.ts`, 기존 삽입 시험. 실제 Obsidian과 실제 모델을 사용한 흐름 검증은 이번 평가에서 수행하지 않았다.

## 공통 README 요구사항

💡 Harness: 모델 호출, 도구 권한·한도, 실행 상태와 다음 단계를 관리하는 코드다. 토큰 예산은 모델에 전달되는 정보량의 상한이다.

1. **기존 등록·입출력 검사·권한·시간 제한·취소: 구현됨.** 기존 구조를 재사용하며 승인 필요한 도구 실행은 차단한다. 실제 승인 대기·재개가 있다는 뜻은 아니다. [실행기](/Users/sunub/workspace/fathomark/plugin/src/harness/tool-executor.ts:26).
2. **단계별 공개와 실행 검사: 구현됨.** `explore`/`revise` 구분과 권한 필터를 모델 요청마다 적용하고 실행 직전에도 검사한다. 폴더/자료 범위별 허용 목록까지 확장된 상태는 아니다. [공개 필터](/Users/sunub/workspace/fathomark/plugin/src/harness/langchain-loop.ts:119), [단계](/Users/sunub/workspace/fathomark/plugin/src/harness/stage.ts:13).
3. **도구별 결과 토큰 예산: 미구현.** `resultBudgetTokens`는 정의에만 있다. 실행기는 결과를 그대로 문자열로 바꾸며 크기 검사·부분 결과·초과 오류가 없다. 전체 요청 예산 검사와 별개다. [결과 반환](/Users/sunub/workspace/fathomark/plugin/src/harness/tool-executor.ts:57).
4. **완료/사용자 대기/실패 공통 결과와 검증된 원본 유지: 미구현.** 현재 반환은 `content` 문자열과 출처뿐이며 실패는 예외다. 수정 제안도 이후 문자열을 다시 해석한다. 사용자 대기 결과를 연결할 계약이 없다.
5. **공통 문맥 분리: 미완성.** 공통 `ToolExecutionContext`에 Wikipedia 상태와 권한 함수가 남아 있고 신뢰된 실행·호출 ID는 없다. [문맥](/Users/sunub/workspace/fathomark/plugin/src/tools/registry.ts:10).
6. **오류별 복구·중복 처리: 부분 구현.** 입력 오류 수정 1회·권한 거부 후 계속 실행·완료 호출 ID 재사용은 있다. 다른 오류는 대부분 실행 종료다. 재사용 확인 전에 호출 수를 증가시켜 중복 결과도 한도를 소비한다. [호출 처리](/Users/sunub/workspace/fathomark/plugin/src/harness/langchain-loop-calls.ts:15).
7. **사용자 답변·붙여넣기 자료의 출처: 미구현.** 현재 출처 종류는 Vault와 Wikipedia뿐이다. [근거 형식](/Users/sunub/workspace/fathomark/plugin/src/context/evidence.ts:24).

앱 재시작 복구, 분산 실행, 모든 오류 자동 재시도는 문서에서 명시적으로 제외하므로 누락 점수에 넣지 않았다.

## 문서와 코드의 불일치

- README와 기존 4개 도구 문서의 “빈 Registry” 설명은 오래됐다. 현재 6개 도구를 앱에 등록한다.
- README의 “전체 도구 정의를 모델에 전달” 설명은 오래됐다. 단계·권한 필터가 있다.
- 검색 문서의 “`supported`·`reason` 출력 정의 없음” 설명은 오래됐다. 현재 보존한다.
- `get_note_context`의 “구현 전” 상태는 오래됐다. 구현·등록·모의 호출 시험이 있다.
- 나머지 새 도구의 “구현 전”은 “독립 모듈 구현, 앱 연결 전”으로 더 정확히 표현할 수 있다.

따라서 문서의 과거 상태 설명을 그대로 사용해 이미 구현된 부분을 누락으로 평가하면 안 된다. 반대로 제안 설계와 미정 계약을 작동하는 앱 기능으로 간주해서도 안 된다.

## 실행 검증과 한계

`pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` 전체 통과.

- 타입 검사 통과.
- 테스트 40개 파일 통과, 1개 파일 건너뜀. 개별 테스트 293개 통과, 1개 건너뜀.
- 의존 관계 위반 없음: 98개 모듈, 276개 관계 검사.
- 생산 빌드 통과: `main.js` 773 KB minified.

**테스트 통과는 설계 전체 충족을 뜻하지 않는다.** 구현되지 않은 사용자 대기·실제 제공자·자료 보관 흐름은 시험도 없다. 실제 Vault 평가 시험은 건너뛰었고, 실제 Obsidian/모델 동작과 의미 수준의 사실 보존은 이번에 검증하지 않았다.

참고로 단어 검색 기준 시험은 답변 가능한 9개 사례에서 상위 3개 결과의 정답 회수율이 0.33으로 출력됐다. 이 시험은 품질 통과선 대신 값이 0~1인지 검사한다. 작은 모의 자료의 기준 측정이므로 현재 앱 전체의 품질 점수로 일반화할 수 없지만, 테스트가 통과해도 검색 품질이 충분하다는 증거는 되지 않는다. [측정 시험](/Users/sunub/workspace/fathomark/plugin/tests/retrieval-baseline.test.ts:21).

## 권장 후속 순서

1. 문서의 상태를 현재 코드에 맞추고, 도구별 결과 예산·반환 상태 계약을 먼저 완성한다.
2. 실제 모델 연결과 사용자 질문 대기·답변·재개를 구현하고 같은 실행에서 한도/취소를 검증한다.
3. 붙여넣기 자료 보관·ID 전달·출처 표시를 연결한다. 일반 웹 검색은 제공자·동의·전송 범위 계약을 확정한 뒤 연결한다.
4. 수정 제안의 검토 항목을 승인 화면에 전달하고, 역할·수치·성과의 의미 검증을 연결한다.
5. 요청별 노트 범위·중복 조회 기록을 보완하고, 작업 메모는 기존 상태만으로 부족하다고 확인될 때 재사용 경로와 출처 검사를 완성한다.

산출물 변경은 이 평가 보고서 하나다. 코드 단순화·기능 수정은 수행하지 않았다. 기존 미커밋 변경을 보존했다.
