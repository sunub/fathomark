# S11: 미리보기·승인·Vault 적용

**목표**: 검증을 마친 초안을 사용자에게 보여 주고, 승인했을 때만 Obsidian 에디터 API로 노트에 쓴다. 승인 전에는 Vault가 바뀌지 않는다.

**선행**: S3(검증된 초안과 주장별 근거). S4와는 느슨하게 연결한다: S4의 `apply` 노드가 이 슬라이스의 `applyDraft`를 호출한다. 그래프 없이도 단독으로 테스트된다.
**프레임워크**: 없음.

## 범위

- 미리보기: 초안 본문, 주장별 근거 링크, "근거 없음" 표시를 한 화면에 보여 준다.
- 승인·폐기: 사용자의 명시적 선택으로만 진행한다. 더블 클릭이 쓰기를 두 번 실행하지 않는다.
- 적용: 대상 노트의 위치(커서 삽입 또는 새 노트)에 Obsidian 에디터 API로 쓴다. 파일을 직접 쓰지 않는다.

범위 밖: 그래프 상태 영속화(S4), 승인 후 되돌리기 UI(Obsidian 실행 취소에 맡긴다).

## 파일

- Create: `plugin/src/harness/apply.ts`(`applyDraft`), `plugin/src/ui/screens/draft-preview.tsx`
- Modify: `plugin/src/harness/policy.ts`(쓰기 도구는 승인 토큰이 있을 때만 허용)
- Test: `plugin/tests/apply.test.ts`

## 인터페이스

- Produces: `applyDraft(draft: VerifiedDraft, target: ApplyTarget, approval: ApprovalToken): Promise<ApplyResult>`.
- Consumes: S3의 `VerifiedDraft`, harness의 Obsidian 어댑터.

## 작업

- [ ] 실패하는 테스트: 승인 토큰 없이 `applyDraft`를 부르면 거부되고 Vault 어댑터의 쓰기가 호출되지 않는다.
- [ ] 실패하는 테스트: 같은 승인 토큰으로 두 번 호출해도 쓰기는 한 번만 일어난다.
- [ ] 실패하는 테스트: `unsupported` 주장이 있는 초안은 미리보기에 표시되고, 사용자가 승인해야만 쓰인다.
- [ ] 실패하는 테스트: 폐기하면 쓰기가 호출되지 않고 입력창이 잠기지 않는다.
- [ ] 구현하고 통과시킨다.
- [ ] 미리보기 컴포넌트와 Storybook 사례를 추가한다(장식 최소 원칙).
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- Vault 쓰기 경로가 이 슬라이스 하나뿐이고, 승인 없이는 닫혀 있다(테스트로 고정).
- 미리보기의 내용과 실제로 쓰인 내용이 일치한다.

## 리뷰 초점

- 미리보기와 적용 사이에 사용자가 노트를 편집했을 때 어떻게 되는가.
- 대상 노트가 그 사이에 삭제·이동됐을 때 실패가 명확히 보이는가.
