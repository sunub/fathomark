# S3: 주장 단위 근거 연결과 검증

**목표**: 초안의 모든 경험 주장이 근거 구간에 연결되거나 "근거 없음"으로 표시되도록, 모델 출력을 구조화해서 기계적으로 검증한다.

**선행**: S1. **프레임워크**: zod만. 모델 호출 없이 결정적(deterministic) 검증기부터 만든다.

## 왜 이 형태인가

학습 실험에서 모델이 주어진 사실을 무시하거나 숫자를 버렸다(ADR 0007). 그래서 숫자·인용은 모델의 말이 아니라 노트 원문과의 대조로 검증한다. 또한 조사에서 core 1.2.14의 `withStructuredOutput`은 `bindTools`가 없으면 던지므로, 파싱은 제품 쪽 zod `safeParse`로 한다.

## 범위

- 초안 출력 스키마: `{ claims: [{ text, evidence: [sourceId...] }] }`와 파싱 실패 처리.
- 결정적 검증: ① 인용된 `sourceId`가 실제 수집된 근거에 있는가 ② 주장에 든 숫자·고유 literal이 인용 근거 `excerpt`에 그대로 있는가 ③ 인용이 없으면 `unsupported`.
- 근거 참조 granularity는 현재의 note+heading(`EvidenceReference`)을 그대로 쓴다(ROADMAP 열린 결정 6은 여기서 풀지 않는다).

범위 밖: 모델 기반 함의(entailment) 검사(S4의 verify 노드에서 선택), 문체 베끼기 검사(S5).

## 파일

- Create: `plugin/src/context/claims.ts` (스키마, `verifyClaims`)
- Modify: `plugin/src/context/evidence.ts` (필요 시 `sourceId` 조회 헬퍼만)
- Test: `plugin/tests/claims.test.ts`
- 평가 연동: S1 지표에 `groundingRate`, `numberPreservation` 추가(`plugin/tests/support/retrieval-metrics.ts`)

## 인터페이스

- Produces:
  ```ts
  type ClaimStatus = "supported" | "unsupported" | "invalid_citation" | "literal_mismatch"
  interface VerifiedClaim { text: string; evidence: string[]; status: ClaimStatus }
  verifyClaims(draft: unknown, evidence: readonly CitedEvidence[]): VerifiedClaim[]
  ```
  `draft`가 스키마에 안 맞으면 모든 주장을 `unsupported`로 처리한다. S4의 verify 노드와 S5가 이 함수를 쓴다.
- Consumes: `CitedEvidence`, `EvidenceReference`(`plugin/src/context/evidence.ts`).

## 작업

- [ ] 실패하는 테스트: 인용 없는 주장 → `unsupported`.
- [ ] 실패하는 테스트: 없는 `sourceId` 인용 → `invalid_citation`.
- [ ] 실패하는 테스트: 근거에 `320ms`가 있는데 주장에 `230ms` → `literal_mismatch`. 한글 단위(예: `32퍼센트` vs `32%`)는 정규화 규칙을 정의하고 케이스를 고정한다.
- [ ] 실패하는 테스트: 스키마에 안 맞는 JSON/문자열 입력 → 전체 `unsupported`, 예외 없음.
- [ ] 최소 구현으로 위 테스트를 통과시킨다.
- [ ] 평가 지표 `groundingRate`, `numberPreservation`을 추가하고 S1 고정셋에 "지어낸 숫자가 든 가짜 초안" 케이스로 검증기가 잡는지 확인한다.
- [ ] 검증 명령을 실행하고 커밋한다.

## 완료 기준

- 지어낸 숫자와 근거 없는 주장이 모두 표시된다(고정셋의 의도적 오류 케이스 100% 검출).
- 정상 초안은 오탐 없이 `supported`다.

## 리뷰 초점

- 숫자 정규화(쉼표, 한글 단위, 날짜)에서 오탐이 나지 않는가.
- 근거 `excerpt`가 4,096 바이트 제한으로 잘렸을 때 잘린 부분의 숫자 주장은 어떻게 처리하는가.
