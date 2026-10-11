# S6: 도구 없는 구조화 호출

**목표**: 고정 단계 워크플로가 쓰는 "텍스트 입력 → 검증된 구조화 출력" 호출을 provider와 무관한 제품 인터페이스로 만들고, 파싱 실패와 사용량을 일관되게 처리한다.

**선행**: S3(스키마·검증). **프레임워크**: 선택. S0이 도입으로 결정되면 `ModelProvider`를 LangChain `BaseChatModel`로 감싸는 어댑터를 `src/workflow/`에 추가한다.

## 왜 필요한가

- 현재 `ModelProvider`는 네이티브 tool calling을 전제로 한다. 고정 단계는 도구 호출이 필요 없다.
- ChatGPT 로그인 provider(S8)와 로컬 Gemma 4(S10)는 도구 호출 없이 텍스트 호출로 쓰는 것이 단순하고, 조사에서 core 1.2.14의 `withStructuredOutput`은 `bindTools`가 없으면 던졌다.
- 따라서 제품 쪽에서 JSON 요청 → zod `safeParse` → 1회 재시도 규칙을 소유한다.

## 파일

- Create: `plugin/src/providers/structured.ts` (`callStructured`)
- Modify: `plugin/src/providers/types.ts` (사용량 보고 타입, 최소 변경)
- Modify: `plugin/src/providers/fake.ts` (테스트용 구조화 응답)
- Create(선택): `plugin/src/workflow/chat-model.ts` (BaseChatModel 어댑터)
- Test: `plugin/tests/structured-call.test.ts`

## 인터페이스

- Produces:
  ```ts
  callStructured<T>(provider: ModelProvider, request: ModelRequest,
    schema: z.ZodType<T>, signal: AbortSignal
  ): Promise<{ ok: true; value: T; usage?: Usage } | { ok: false; reason: "parse" | "provider"; detail: string }>
  ```
  S4의 각 노드와 S3의 verify가 이 함수를 쓴다.
- Consumes: 기존 `ModelProvider.stream`의 `text`/`done` 이벤트. 도구 스키마는 비워 보낸다.

## 작업

- [ ] 실패하는 테스트: provider가 올바른 JSON을 주면 `ok: true`와 값이 반환된다.
- [ ] 실패하는 테스트: 코드펜스(```json)로 감싼 JSON도 파싱한다.
- [ ] 실패하는 테스트: 스키마 위반이면 1회만 재시도하고, 또 실패하면 `ok: false, reason: "parse"`. 예외를 던지지 않는다.
- [ ] 실패하는 테스트: provider 오류와 `AbortSignal` 중단이 구분되어 보고된다.
- [ ] 구현해서 통과시킨다.
- [ ] (S0이 도입일 때만) `BaseChatModel` 어댑터가 `callStructured`를 위임하게 하고, LangChain 타입이 `src/workflow/` 밖에 없음을 확인한다.
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- 파싱 실패가 안전하게 "근거 없음"/오류로 이어지고 앱이 죽지 않는다.
- 사용량(`promptTokens`, `outputTokens`)이 보고되면 그대로 전달된다.

## 리뷰 초점

- 재시도가 프롬프트 토큰을 두 배로 쓰는 점(구독 요금제의 사용 한도에 잡힌다). 재시도 횟수를 호출 수 예산에 포함하는가.
- 모델이 JSON 앞뒤에 설명 문장을 붙이는 경우의 처리.
