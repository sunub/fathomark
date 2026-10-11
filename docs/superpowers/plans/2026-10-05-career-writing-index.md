# 커리어 글쓰기 계획 색인

> 실행 에이전트용: 각 슬라이스 문서를 `superpowers:executing-plans` 또는 `superpowers:subagent-driven-development`로 한 번에 하나씩 실행한다. 모든 단계는 체크박스(`- [ ]`)다.

**목표**: ADR 0007의 고정 단계 워크플로를 기능 단위의 작은 슬라이스로 쪼개 점진적으로 만든다. 각 슬라이스는 혼자서 테스트되고 혼자서 되돌릴 수 있다.

**근거 문서**: [ADR 현황](../../adr/README.md), [서비스 방향](../../research/service-direction.md), [LangChain 스택 적합성](../../research/langchain-stack-fit.md), [구독 CLI 조사(CLI 경로는 채택하지 않음)](../../research/subscription-cli-providers.md), [CLI 토큰 조사](../../research/cli-agent-wrapping-token-economy.md).

## 현재 실행 범위 (2026-10-05 결정)

**로컬 Gemma 4(Ollama)만으로 끝까지 동작하게 만든 뒤, 외부 provider는 나중에 붙인다.**

- 실행 순서: S1 → S2 → S3 → S6(구조화 호출) → S10(로컬 provider 선택) → S5 → S4(워크플로) → S7(동의 게이트)
- 보류: S8(ChatGPT 로그인, SIWC 라이선스·구현 방식 미정), S9(Deep Agents). S0(LangGraph 도입)은 S4 직전에 결정한다.
- 확장성 원칙: 모델에 닿는 곳은 `ModelProvider`와 S6의 `callStructured` 두 곳뿐이다. 워크플로·검증·검색은 provider가 무엇인지 모른다. 외부 provider는 이 인터페이스의 구현 하나를 더하고 S7 동의 게이트에 연결하는 것으로 끝난다.
- 진행 상황: S1 완료(검증 명령 통과, 미커밋). 기준선 수치는 `docs/testing/career-retrieval-baseline.md`.

## 전역 제약 (모든 슬라이스에 적용)

- 검증 명령: `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` (AGENTS.md). 변경 범위 밖 정리·포맷 금지.
- Vault는 읽기 전용이다. 쓰기는 사용자 승인 뒤에만, Obsidian 에디터 API로만 한다.
- LangChain·LangGraph 타입은 `plugin/src/workflow/` 밖으로 나가지 않는다(S0에서 depcruise 규칙으로 강제).
- 번들 예산은 `plugin/build.mjs`의 900 KB다. 현재 `main.js`는 약 306 KB. 예산 변경은 S0의 결정으로만 한다.
- Vault 내용을 외부로 보내는 모든 경로는 S7의 동의 게이트를 통과한다.
- 커밋은 `commit` 스킬을 따른다(한국어 요약, 영어 type/scope).

## 슬라이스

| # | 문서 | 한 줄 | 프레임워크 | 선행 |
|---|---|---|---|---|
| S1 | [평가 고정셋](./2026-10-05-career-s1-eval-fixtures.md) | 합성 Vault와 지표로 현재 검색의 기준선을 잰다 | 없음 | – |
| S2 | [검색 순위](./2026-10-05-career-s2-retrieval-ranking.md) | 경험 노트 우선, 근거 없음 보고 | 없음 | S1 |
| S3 | [주장·근거 검증](./2026-10-05-career-s3-claim-verification.md) | 주장마다 근거를 연결하고 기계적으로 검증 | zod | S1 |
| S0 | [프레임워크 결정](./2026-10-05-career-s0-framework-decision.md) | LangGraph 도입 여부를 실측으로 결정, ADR 0008 | LangChain·LangGraph | – |
| S4 | [워크플로 그래프](./2026-10-05-career-s4-workflow-graph.md) | 고정 단계를 그래프로, 승인에 interrupt | LangGraph, (선택) createAgent | S0, S2, S3 |
| S5 | [문체 예시](./2026-10-05-career-s5-style-examples.md) | 장르별 선택 예시와 베끼기 검사 | 없음 | S3 |
| S6 | [구조화 호출](./2026-10-05-career-s6-structured-call.md) | 도구 없는 텍스트 입력·구조화 출력 호출 | (선택) BaseChatModel | S3 |
| S7 | [전송 동의 게이트](./2026-10-05-career-s7-egress-consent.md) | 외부 전송 전 내용을 보여 주고 동의받기 | 없음 | – |
| S8 | [ChatGPT 로그인 provider](../plans-archive/2026-10-05-career-s8-chatgpt-signin-provider.md) | 사용자 구독 요금제로 호출(스파이크 후 구현, 무료 오픈소스 전제) | 없음 | S6, S7 |
| S10 | [provider 선택·Gemma 4 폴백](./2026-10-05-career-s10-provider-selection.md) | 로그인 시 ChatGPT, 아니면 로컬 Gemma 4 | 없음 | S6, S7 |
| S9 | [Deep Agents 재검토](../plans-archive/2026-10-05-career-s9-deepagents-spike.md) | 조건이 충족될 때만 | Deep Agents | S4 |
| S11 | [미리보기·승인·적용](./2026-10-06-career-s11-preview-apply.md) | 승인해야만 에디터 API로 Vault에 쓰기 | 없음 | S3 |
| S12 | [Gemma 4 품질 측정](./2026-10-06-career-s12-gemma-quality.md) | 변형별 한국어 글쓰기 품질 측정, S10 권장표 확정 | 없음 | S1, S3, S6, S10 |

## 진행 순서

```text
S1 → S2 ─┐
 └→ S3 ──┼→ S4 → S5
S0 ──────┘      ↘ S6 → S8
S7 ────────────────↗
                       S6/S7 → S10 (provider 선택, 로컬 폴백)
```

- **먼저(프레임워크 무관)**: S1 → S2 → S3. 이 셋만으로 ADR 0007의 핵심 위험(검색, 근거 없는 주장)에 대한 측정과 개선이 가능하다.
- **S0은 S1~S3과 병행**해도 된다. 코드 변경이 없는 측정·결정이다.
- **S4부터** 프레임워크가 들어온다. S0이 "도입하지 않음"으로 끝나면 S4는 같은 그래프 구조를 직접 구현한 상태 머신으로 수행한다(문서에 대안 표기).
- S8은 스파이크(S8-0)로 Obsidian 렌더러에서 동작하는지 먼저 확인한다. S10은 S8 없이도 로컬 Gemma 4만으로 동작해야 한다.

## 프레임워크 활용 지도

| 요소 | 쓰는 곳 | 근거 | 쓰지 않는 곳 |
|---|---|---|---|
| **LangGraph** | S4 고정 단계 그래프, 승인 단계 `interrupt`/`Command` 재개, 단계별 스트림을 RunEvent로 변환 | 조사에서 StateGraph, 조건 엣지, interrupt, MemorySaver, signal 취소가 실행으로 확인됨 | 권한·예산·승인 정책(harness 소유) |
| **LangChain `createAgent`** | S4의 선택 확장: 읽기 전용 `search_vault`·`read_note` 두 도구로 열린 검색 한 단계 | ADR 0007이 "열린 루프 대신 고정 단계"를 정했으므로 검색 단계 하나로 한정 | 초안·검증 단계 |
| **`@langchain/core`** | `ModelProvider`를 감싸는 chat model 어댑터(S6), 콜백으로 로컬 트레이스 | 조사: `BaseChatModel` 서브클래스로 연결 가능 | UI, Vault 어댑터, 저장되는 설정 |
| **Deep Agents** | S9 재검토 조건이 충족될 때만 | 번들 +약 1.5 MB, zod 4 승격, 파일 쓰기 도구를 제외할 수 없음 | 현재 계획 전체 |

주의: 조사에서 core 1.2.14의 `withStructuredOutput`은 `bindTools`가 없으면 던진다. 도구 호출이 없는 provider에서는 제품 쪽 zod `safeParse` 경로(S6)가 필요하다.

## 이 계획이 끝났을 때 갱신할 문서

S0 결정 후 `docs/TECH_STACK.md`, `docs/ARCHITECTURE.md`의 LangGraph·Deep Agents 문구, `docs/ROADMAP.md` Phase 1의 로컬 모델 게이트 위치를 정리한다(S0 마지막 단계).

## 💡 용어

- 💡 **슬라이스**: 한 가지 기능을 끝에서 끝까지(테스트 포함) 얇게 구현해 단독으로 병합할 수 있는 작업 단위입니다.
- 💡 **interrupt**: 그래프 실행을 사람 입력 때문에 중간에 멈추고, 입력이 오면 같은 지점부터 재개하는 LangGraph 기능입니다.
- 💡 **기준선(baseline)**: 변경 전 현재 상태의 측정값입니다. 개선 여부는 이 값과 비교해서 판단합니다.
