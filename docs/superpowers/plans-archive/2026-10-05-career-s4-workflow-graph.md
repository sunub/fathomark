# S4: 커리어 글쓰기 워크플로 그래프

**목표**: 고정 단계(분석 → 검색 → 근거 선택 → 초안 → 검증 → 미리보기·승인)를 그래프로 실행하고, 각 단계를 harness의 `RunEvent`로 내보낸다.

**선행**: S0(결정), S2(`supported`), S3(`verifyClaims`). 모델은 기존 fake provider로 테스트한다.
**프레임워크**: LangGraph(S0이 도입으로 결정된 경우). 미도입이면 같은 노드 구조의 직접 구현 상태 머신으로 대체한다.

## 설계

```text
analyze → retrieve ─(supported=false)→ report_no_evidence → END
             ↓
          select → draft → verify ─(unsupported 있음)→ draft(재시도 1회) / 표시 후 계속
                                ↓
                            preview ⏸ interrupt (사용자 승인) → apply → END
```

- harness가 소유하는 것(그래프 밖): 권한, 컨텍스트 예산, 도구 허용 목록, 취소, 승인 정책, Obsidian 적용.
- 그래프가 소유하는 것: 단계 순서, 단계 간 상태, 승인 대기·재개.
- `retrieve` 노드는 `searchVault`(S2)를 harness 도구 레지스트리를 통해 호출한다. 그래프가 Vault에 직접 접근하지 않는다.
- `verify` 노드는 `verifyClaims`(S3). 선택적으로 이후에 모델 기반 검사를 추가한다.
- 선택 확장(별도 PR): `retrieve`를 읽기 전용 `search_vault`·`read_note` 두 도구를 가진 createAgent로 바꿔 열린 탐색을 허용한다. 호출 수 상한을 둔다.

## 파일

- Create: `plugin/src/workflow/career-graph.ts`, `plugin/src/workflow/state.ts`, `plugin/src/workflow/events.ts`(스트림 → `RunEvent` 변환)
- Modify: `plugin/src/harness/harness.ts`(워크플로 실행 진입점), `plugin/src/harness/events.ts`(단계 이벤트 타입)
- Modify: `plugin/.dependency-cruiser.cjs`(LangGraph import 허용 경로를 `src/workflow/`로 제한)
- Test: `plugin/tests/career-graph.test.ts`

## 인터페이스

- Produces: `runCareerWorkflow(input: CareerInput, deps: WorkflowDeps, signal: AbortSignal): AsyncIterable<RunEvent>`, 재개용 `resumeCareerWorkflow(runId, decision: "approve" | "discard")`.
- Consumes: S2의 `searchVault` 결과(`supported`), S3의 `verifyClaims`, `ModelProvider`(S6의 구조화 호출 사용 가능 시), 기존 `RunEvent`.
- 주의: 노드 이름과 상태 키 이름이 같으면 LangGraph 컴파일 에러가 난다(조사에서 확인). 노드 이름에 `_step` 접미를 붙인다.

## 작업

- [ ] 실패하는 테스트: 근거 없는 질문 → draft 노드가 호출되지 않고 `no_evidence` 이벤트로 끝난다.
- [ ] 실패하는 테스트: 정상 경로 → 단계 이벤트가 정해진 순서로 나온다.
- [ ] 실패하는 테스트: preview에서 멈추고 `approve`로 재개하면 apply가 한 번만 실행된다. `discard`면 apply가 실행되지 않는다.
- [ ] 실패하는 테스트: 실행 중 `AbortSignal` 중단 → 이후 노드가 실행되지 않고 `cancelled`로 끝난다.
- [ ] 실패하는 테스트: 사용자 승인 없이는 Vault 쓰기 도구가 호출되지 않는다(policy 테스트).
- [ ] 그래프를 구현하고 위 테스트를 통과시킨다. 체크포인터는 메모리 저장소로 시작한다(영속화는 범위 밖).
- [ ] 스트림 모드 이벤트를 `RunEvent`로 변환하는 어댑터를 구현한다. 변환 결과가 LangGraph 타입을 노출하지 않음을 `pnpm boundaries`로 확인한다.
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- fake provider로 전 경로(근거 없음, 정상, 거부, 중단)가 테스트로 고정된다.
- LangGraph 타입이 `src/workflow/` 밖에 없다.
- 승인 전에 Vault가 바뀌지 않는다.

## 리뷰 초점

- 앱 재시작 후 승인 대기 중이던 실행은 어떻게 되는가(영속화 없음 → 폐기하고 알림). 이 동작을 명시한다.
- `verify` 실패 후 재시도 무한 루프가 없는가(최대 1회).
- 두 번 승인(더블 클릭)이 apply를 두 번 실행하지 않는가.
