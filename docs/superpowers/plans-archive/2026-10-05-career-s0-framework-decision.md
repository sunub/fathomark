# S0: 프레임워크 도입 결정 (ADR 0008)

**목표**: LangChain·LangGraph를 실제 플러그인 번들에서 측정하고, 도입 여부와 번들 예산을 ADR 0008로 결정한다. 코드는 스파이크 브랜치에서만 바꾼다.

**선행**: 없음(S1~S3과 병행 가능). **프레임워크**: LangChain core, LangGraph.

## 확인된 사실 ([langchain-stack-fit.md](../../research/langchain-stack-fit.md))

- 단독 번들(browser 설정, minified): core 974 KB, createAgent 1,369 KB, LangGraph 1,304 KB, createDeepAgent 1,800 KB. 현재 `main.js`는 약 306 KB이고 예산은 900 KB(`plugin/build.mjs`)라서, 어느 것이든 예산을 넘는다.
- 고정 비용: zod 약 500 KB, langsmith 약 200 KB. tree-shaking은 부분적이다. 네이티브 모듈은 없다.
- 이 숫자는 플러그인과 별개로 번들한 값이다. 이미 번들된 zod·공통 코드와 겹치는 정도는 **실제 플러그인에서 재야 한다**.
- 확인 못한 것: Electron 실구동, `node:` 접두 require의 번들 통과.
- 현재 `plugin/package.json`에 langchain 계열 의존성이 없고 `langchain-loop.ts`는 직접 구현이다.

## 결정할 것

1. 실제 번들 증가량(KB)과 예산을 어떻게 할지(올림 / 의존성 줄임 / 도입 안 함).
2. zod 3 → 4 승격 여부(Deep Agents는 4를 요구, S9와 연결).
3. 도입하는 경우 LangChain 타입 격리 규칙(`src/workflow/`에만 import).
4. 도입하지 않는 경우: LangGraph의 구조(노드, 조건 엣지, interrupt)를 따르는 자체 상태 머신(S4 대안).

## 파일

- Create: `docs/adr/0008-workflow-framework.md` (결정 기록)
- Spike(병합 안 함): `plugin/src/workflow/spike.ts`, `plugin/package.json` 임시 변경
- Modify(결정 후): `plugin/build.mjs` 예산, `plugin/.dependency-cruiser.cjs` 규칙, `docs/TECH_STACK.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`

## 작업

- [ ] 브랜치를 만들고 `@langchain/langgraph`와 `@langchain/core`를 추가해 아주 작은 StateGraph(3노드, interrupt 1개)를 `src/workflow/spike.ts`에서 `main.js`에 포함시킨다.
- [ ] `pnpm build`의 출력 크기를 기록한다. (a) 그래프만 (b) 그래프 + createAgent 두 경우.
- [ ] 같은 그래프의 직접 구현 상태 머신(의존성 없음)과 코드량·테스트 가능성을 비교한다.
- [ ] 실제 Obsidian에 로드해서 번들이 동작하는지 확인한다(`pnpm run`/수동). 안 되면 원인을 기록한다.
- [ ] 선택 기준을 문서에 쓴다: interrupt 재개, 체크포인트 저장(`saveData`), 스트림→RunEvent 변환, 취소가 직접 구현 대비 얼마나 줄어드는가.
- [ ] ADR 0008을 쓰고(`status: proposed`), 사용자 승인 뒤 `accepted`로 바꾼다.
- [ ] 승인 후 스파이크를 정리하고 depcruise 규칙, 예산, TECH_STACK·ARCHITECTURE·ROADMAP 문구를 결정에 맞춰 수정한다.
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- 실제 번들 증가량이 숫자로 ADR에 있다.
- 도입 / 미도입 / 조건부 중 하나가 승인된 ADR로 남는다.
- 승인 없이 의존성이나 예산이 바뀌지 않는다.

## 권고(검증 전 가설)

고정 단계 + 사람 승인 대기는 LangGraph의 직접적인 용도라서 도입 쪽이 자연스럽다. 다만 증가량이 예산(900 KB)을 크게 넘으면 "올릴 가치가 있는가"는 사용자가 결정해야 한다. 이 권고는 측정 전 가설이고 결정이 아니다.
