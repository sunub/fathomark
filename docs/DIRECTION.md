# 진행 방향 (2026-10-05)

## 한 줄 요약

내 Vault 노트를 근거로 이력서·자기소개서를 쓰게 돕는 Obsidian 플러그인. **로컬 Gemma 4로 끝까지 동작하게 만든 뒤**, 외부 모델(ChatGPT 로그인 등)은 나중에 붙인다.

## 원칙

1. 모델 학습(LoRA)은 하지 않는다. 품질은 검색, 근거 검증, 사용자가 고른 문체 예시로 올린다.
2. 모든 경험 주장은 노트 근거에 연결하거나 "근거 없음"으로 표시한다.
3. 흐름은 고정 단계다: 검색 → 근거 선택 → 초안 → 검증 → 미리보기 → 사용자 승인.
4. 모델에 닿는 곳은 `ModelProvider`와 구조화 호출 두 곳뿐이다. 나중에 외부 모델을 붙일 때 이 인터페이스의 구현 하나만 더한다.
5. Vault 내용이 기기 밖으로 나가기 전에는 항상 사용자 동의를 받는다.

## 기능과 작업 순서

계획 문서는 `docs/superpowers/plans/` 아래에 있고, 파일명은 `2026-10-05-career-<슬라이스>-*.md`다(S11·S12는 `2026-10-06`). 순서는 실행 순서이고, 기능은 같은 줄의 묶음이다.

| 순서 | 기능 | 슬라이스 | 하는 일 | 상태 |
|---|---|---|---|---|
| 1 | 근거 검색 | S1 `eval-fixtures` | 합성 Vault와 지표로 검색 기준선 측정 | 완료 (미커밋) |
| 2 | 근거 검색 | S2 `retrieval-ranking` | 경험 노트 우선 순위, "근거 없음" 보고 | 구현 완료, 합격선 미달 종료 (실제 Vault 4개 중 1개 통과) |
| 3 | 주장·근거 검증 | S3 `claim-verification` | 주장마다 근거를 연결하고 기계적으로 검증 | |
| 4 | 모델 접근 | S6 `structured-call` | 도구 없는 구조화 호출 통일 | |
| 5 | 모델 접근 | S10 `provider-selection` | 로컬 Gemma 4 선택·안내 | |
| 6 | 품질 측정 | S12 `gemma-quality` | Gemma 4 한국어 글쓰기 품질 측정, 권장표 확정 | 신규 |
| 7 | 문체 예시 | S5 `style-examples` | 사용자가 고른 예시, 베끼기 검사 | |
| 8 | 미리보기·승인·적용 | S11 `preview-apply` | 승인해야만 에디터 API로 Vault에 쓰기 | 신규 |
| 9 | 워크플로 | S4 `workflow-graph` | 고정 단계 연결, 중단·재개 | |
| 10 | 외부 전송 동의 | S7 `egress-consent` | 외부 모델이 붙을 때만 켜지는 게이트 | |

의존: 품질 측정(S12)은 S1·S3·S6·S10 뒤, 미리보기·적용(S11)은 S3 뒤, 워크플로(S4)는 S2·S3·S11 뒤다. 외부 전송 동의(S7)는 로컬 전용인 동안 필수 경로가 아니다.

## 나중에

| 작업 | 문서 | 조건 |
|---|---|---|
| ChatGPT 로그인 | `docs/superpowers/plans-archive/2026-10-05-career-s8-chatgpt-signin-provider.md` | SDK 라이선스(비상업)와 Obsidian 렌더러 동작 확인 |
| LangGraph 도입 결정 | `2026-10-05-career-s0-framework-decision.md` | 7번 직전. 번들 +약 1.1 MB, 예산 900 KB 조정 필요 |
| Deep Agents | `docs/superpowers/plans-archive/2026-10-05-career-s9-deepagents-spike.md` | 번들·쓰기 도구 문제가 풀릴 때만 |

## 정해진 결정

- 한도 도달 시 자동 전환하지 않고 사용자에게 전환을 제시한다.
- 무료·오픈소스(비상업) 배포를 전제로 한다.
- Claude 구독 CLI 경로는 만들지 않는다. Codex CLI 경로도 채택하지 않는다.

## 확인이 필요한 것

- `plugin/package.json`에 의도하지 않은 변경이 있다(`@openai/agents` 추가, zod 4 승격). 직접 한 것인지 확인하고, 아니면 되돌린다.
- 로컬 Gemma 4의 한국어 지원서 글쓰기 품질은 아직 측정하지 못했다(S12가 담당).

## 참고 문서

| 문서 | 내용 |
|---|---|
| `docs/adr/README.md` | ADR 현황과 낡은 문서 목록 |
| `docs/research/service-direction.md` | 서비스 방향 보고서 |
| `docs/research/gemma4-sizes-and-qlora.md` | Gemma 4 크기, QLoRA 한계 |
| `docs/research/langchain-stack-fit.md`, `open-questions-bundle.md` | LangChain·LangGraph 번들 실측 |
| `docs/research/siwc-sdk-spike.md` | ChatGPT 로그인 SDK 조사 |
| `docs/testing/career-retrieval-baseline.md` | 검색 기준선 수치 |
| `design-system/docs/career-writing-ui-brief.md` | Claude Design 전달용 UI 브리프 |
