# S5: 장르별 문체 예시와 베끼기 검사

**목표**: 사용자가 고른 글을 장르(이력서 bullet / 에세이)별 문체 예시로 쓰고, 초안이 예시 문장을 그대로 베꼈는지 기계적으로 검사한다.

**선행**: S3. **프레임워크**: 없음.

## 왜 베끼기 검사인가

LoRA 후보는 문체 샘플의 제목과 코드를 그대로 재현했다(ADR 0007). 프롬프트 예시 방식도 같은 위험이 있어서(ADR 0006: "문체 일반화와 원문 재현을 구분해서 평가"), 재현 여부를 결정적으로 측정한다.

## 범위

- `SelectedStyle`을 장르 태그가 있는 예시 집합으로 확장(현재는 4,096 바이트 한 개).
- 장르별 예시를 요청 프롬프트에 넣는 규칙과 예산 상한.
- 초안과 예시의 n-gram 겹침 비율로 베끼기 검사(`copyRate`).
- 문체 선호 비교(방식 가림 비교)는 ADR 0006 그대로, 이 슬라이스에서는 구현하지 않는다.

범위 밖: 사실이 없는 문체 프로필 자동 생성, Vault 스캔 기반 추정(금지), UI 선택 화면(후속).

## 파일

- Modify: `plugin/src/context/style.ts`, `plugin/src/context/packet.ts`(`SelectedStyle` 확장), `plugin/src/context/request.ts`(예시 삽입과 예산)
- Create: `plugin/src/context/copy-check.ts`
- Test: `plugin/tests/style-examples.test.ts`, `plugin/tests/copy-check.test.ts`

## 인터페이스

- Produces: `interface StyleExample { id: string; genre: "resume_bullet" | "essay"; text: string }`, `copyRate(draft: string, examples: readonly StyleExample[], n?: number): number`. S3의 검증 결과에 `style_copy` 경고를 더한다.
- Consumes: S3의 `VerifiedClaim`, 기존 `createSelectedStyle` 제약(4,096 바이트).

## 작업

- [ ] 실패하는 테스트: 장르별로 예시를 저장·조회하고, 같은 텍스트 중복은 하나로 합친다.
- [ ] 실패하는 테스트: 요청 생성 시 요청 장르의 예시만 들어가고 예산 초과 시 오래된 것부터 빠진다.
- [ ] 실패하는 테스트: 초안에 예시 문장이 8-gram 이상 그대로 들어 있으면 `copyRate`가 임계값을 넘는다. 한국어 토큰 기준(공백·형태소가 아닌 문자 n-gram)을 정의하고 케이스를 고정한다.
- [ ] 구현해서 통과시킨다.
- [ ] S1의 평가에 "예시를 베낀 가짜 초안" 케이스를 추가해 검출을 확인한다.
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- 베낀 초안은 경고되고, 정상 초안은 경고 없이 통과한다.
- 예시가 사실이 든 문장을 포함해도 "근거 없는 사실"로 허용되지 않는다(S3 검증이 우선).

## 리뷰 초점

- 짧은 예시(bullet)에서 우연히 겹치는 구절이 오탐이 되지 않는가.
- 예시가 개인 정보를 포함할 때 호스티드 provider 전송 미리보기(S7)에 포함되는가.
