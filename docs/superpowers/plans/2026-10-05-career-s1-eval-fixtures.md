# S1: 커리어 평가 고정셋과 기준선

**목표**: 모델 없이 현재 `searchVault`의 검색 품질을 숫자로 잰다. 이후 모든 슬라이스는 이 숫자와 비교한다.

**선행**: 없음. **프레임워크**: 없음(Vitest만).

## 왜 먼저인가

ADR 0007은 검색을 가장 큰 위험으로 지목하고, 실험에서 의견 글이 경험 노트보다 먼저 잡히는 문제가 나왔다. 측정 없이 고치면 개선 여부를 알 수 없다.

## 범위

- 합성 Vault(개인 정보 없음): 경험 노트, 의견 노트, 스터디 노트를 섞은 20~30개.
- 질문 케이스 10~15개: 질문, 정답 노트 경로, 근거가 없는 질문 여부.
- 지표 순수 함수: `recallAtK`, `reciprocalRank`, `abstentionRate`(근거 없는 질문에서 "없음"으로 응답한 비율).
- 기준선 측정 스크립트(현재 `searchVault` 호출)와 결과 문서.

범위 밖: 임베딩, 모델 호출, 주장 검증 지표(S3).

## 파일

- Create: `plugin/tests/fixtures/career-vault/**.md` (합성 노트)
- Create: `plugin/tests/fixtures/career-cases.json`
- Create: `plugin/tests/support/retrieval-metrics.ts`
- Create: `plugin/tests/retrieval-metrics.test.ts`, `plugin/tests/retrieval-baseline.test.ts`
- Create: `docs/testing/career-retrieval-baseline.md` (측정 결과 기록)

## 인터페이스

- Produces: `recallAtK(ranked: string[], expected: string[], k: number): number`, `reciprocalRank(ranked, expected): number`, `abstentionRate(results: {supported: boolean; shouldAbstain: boolean}[]): number`. S2, S3이 그대로 쓴다.
- Consumes: `searchVault(vault, query, limit, signal)` (`plugin/src/tools/vault-search.ts`), 테스트용 `VaultReader`는 fixtures 폴더를 읽는 메모리 구현.

## 작업

- [ ] 지표 함수의 실패하는 테스트를 쓴다(정답이 상위/하위/없음인 경우의 값을 손으로 계산해 고정).
- [ ] 테스트 실행 → 실패 확인.
- [ ] 지표 함수를 최소 구현하고 통과시킨다.
- [ ] 합성 Vault와 케이스를 작성한다. 케이스에는 반드시 다음을 넣는다: 같은 주제를 의견 글이 더 많이 언급하는 경우, 영문·한글 혼용, 근거가 아예 없는 질문, 숫자가 든 성과 노트.
- [ ] `retrieval-baseline.test.ts`가 현재 `searchVault`로 모든 케이스를 돌려 지표를 출력하도록 한다. 임계값은 아직 단언하지 않고, 기준선 숫자를 `career-retrieval-baseline.md`에 기록한다.
- [ ] 검증 명령을 실행하고 커밋한다.

## 완료 기준

- 기준선 recall@3, MRR, abstention이 문서에 있다.
- 합성 데이터만 쓰고 실제 Vault 내용은 저장소에 없다.
- 표본이 작으므로 숫자는 방향 확인용이라고 문서에 명시한다.

## 리뷰 초점

- 의견 노트가 경험 노트보다 상위에 오는 케이스가 포함되어 있는가.
- 근거 없는 질문에서 현재 검색이 무엇을 돌려주는가(아마도 억지 결과).
