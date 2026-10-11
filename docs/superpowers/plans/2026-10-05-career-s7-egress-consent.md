# S7: 외부 전송 동의 게이트

**목표**: Vault 내용이 외부(ChatGPT 로그인 provider 또는 이후 추가될 API 키 provider)로 나가기 전에, 정확히 무엇이 전송되는지 보여 주고 사용자의 명시적 동의를 받는다.

**선행**: 없음. **프레임워크**: 없음. ADR 0004(Wikipedia 질의 제한)와 별개로 유지한다.

## 범위

- 요청 직전에 전송 페이로드(노트 경로, 발췌, 문체 예시, 질문)를 목록으로 보여 주는 `ConsentGate`.
- 동의 범위: 이번 한 번 / 이 세션 / 거부. "항상 허용"은 만들지 않는다(후속 결정).
- 로컬 provider(loopback)는 게이트를 건너뛴다. 외부로 나가는 provider(ChatGPT 로그인, API 키)는 항상 거친다.
- 동의 기록은 메모리에만 두고 디스크에 남기지 않는다.

범위 밖: API 키 provider와 키 저장(별도 결정, 필요해질 때), 모바일. 첫 외부 provider는 ChatGPT 로그인(S8)이다.

## 파일

- Create: `plugin/src/harness/consent.ts`
- Modify: `plugin/src/harness/policy.ts` (provider 종류별 동의 필요 규칙)
- Modify: `plugin/src/harness/harness.ts` (요청 전 게이트 호출)
- Modify: `plugin/src/ui/` 의 승인 UI(기존 미리보기 컴포넌트 재사용), `design-system`은 AGENTS의 UI 원칙(장식 최소)을 따른다
- Test: `plugin/tests/consent.test.ts`

## 인터페이스

- Produces:
  ```ts
  interface EgressPayload { items: { kind: "note_excerpt" | "style_example" | "question"; path?: string; bytes: number; preview: string }[]; totalBytes: number; destination: "chatgpt_signin" | "hosted_api" }
  interface ConsentGate { request(payload: EgressPayload, signal: AbortSignal): Promise<"once" | "session" | "denied"> }
  ```
- Consumes: `ModelRequest`(전송 내용 추출), `ModelProvider.id`(로컬 여부 판단).

## 작업

- [ ] 실패하는 테스트: 외부 provider(ChatGPT 로그인 포함) 요청은 동의 없이 `stream`이 호출되지 않는다.
- [ ] 실패하는 테스트: 로컬 loopback provider는 게이트 없이 진행된다.
- [ ] 실패하는 테스트: 페이로드 미리보기에 실제로 전송될 모든 노트 발췌가 빠짐없이 들어 있다(요청 메시지와 대조).
- [ ] 실패하는 테스트: `denied`면 요청이 취소되고 사용자가 입력을 계속할 수 있다(입력이 잠기지 않는다는 UI 규칙).
- [ ] 구현하고 통과시킨다.
- [ ] UI 컴포넌트와 Storybook 사례를 추가한다(기존 상태 규칙과 일치).
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- 외부로 나가는 모든 provider 경로가 게이트 뒤에 있다(테스트로 고정).
- 미리보기 내용과 실제 전송 내용이 일치한다.

## 리뷰 초점

- 요청 재시도 시 같은 페이로드를 다시 묻는가, 세션 동의를 따르는가.
- 페이로드가 매우 클 때 미리보기가 UI를 막지 않는가.
