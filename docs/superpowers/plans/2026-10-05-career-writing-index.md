# 커리어 글쓰기 계획 색인

> 실행 에이전트용: 각 슬라이스 문서를 `superpowers:executing-plans` 또는 `superpowers:subagent-driven-development`로 한 번에 하나씩 실행한다. 모든 단계는 체크박스(`- [ ]`)다.

**목표**: ADR 0007의 고정 단계 워크플로를 기능 단위의 작은 슬라이스로 쪼개 점진적으로 만든다. 각 슬라이스는 혼자서 테스트되고 혼자서 되돌릴 수 있다.

**현재 상태와 다음 작업은 [DIRECTION.md](../../DIRECTION.md)가 기준이다.** 2026-10-12에 끝난 슬라이스 문서를 [plans-archive](../plans-archive/)로 옮기고 이 색인을 정리했다.

## 방향 (2026-10-12)

- 로컬 모델은 근거 선별·검증, Codex CLI는 작성, Codex 구독이 없으면 로컬이 작성한다([ADR 0010](../../adr/0010-local-curation-codex-drafting.md), 제안). 채택은 DIRECTION.md의 "구현 전 검증" 뒤다.
- LangChain·LangGraph는 쓰지 않는다([ADR 0008](../../adr/0008-no-agent-framework.md)). 슬라이스 문서의 프레임워크 언급은 당시 계획이다.
- 확장성 원칙: 모델에 닿는 곳은 `ModelProvider`와 구조화 호출 두 곳뿐이다. Codex CLI는 이 인터페이스의 구현 하나를 더하고 S7 동의 게이트에 연결한다.

## 전역 제약 (모든 슬라이스에 적용)

- 검증 명령: `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build` (AGENTS.md). 변경 범위 밖 정리·포맷 금지.
- Vault는 읽기 전용이다. 쓰기는 사용자 승인 뒤에만, Obsidian 에디터 API로만 한다.
- 번들 예산은 `plugin/build.mjs`의 900 KB다. 2026-10-12 `main.js`는 약 826 KB다.
- Vault 내용을 외부로 보내는 모든 경로는 S7의 동의 게이트를 통과한다.
- 커밋은 `commit` 스킬을 따른다(한국어 요약, 영어 type/scope).

## 남은 슬라이스

| # | 문서 | 상태 | 선행 |
|---|---|---|---|
| S5 | [문체 예시](./2026-10-05-career-s5-style-examples.md) | 부분. 문체 한 개 선택과 베끼기 검사만 있음 | – |
| S7 | [전송 동의 게이트](./2026-10-05-career-s7-egress-consent.md) | 미구현. ADR 0010 채택 시 필수 | – |
| S10 | [provider 선택](./2026-10-05-career-s10-provider-selection.md) | 미구현. ChatGPT 로그인 대신 Codex CLI로 읽는다 | S7 |
| S12 | [Gemma 4 품질 측정](./2026-10-06-career-s12-gemma-quality.md) | 부분. `gemma4:e4b` 하나만 측정 | – |

## 끝났거나 보관한 슬라이스 (plans-archive)

| # | 문서 | 결과 |
|---|---|---|
| S0 | [프레임워크 결정](../plans-archive/2026-10-05-career-s0-framework-decision.md) | 도입하지 않음(ADR 0008) |
| S1 | [평가 고정셋](../plans-archive/2026-10-05-career-s1-eval-fixtures.md) | 완료 |
| S2 | [검색 순위](../plans-archive/2026-10-05-career-s2-retrieval-ranking.md) | 2026-10-08 합격(ADR 0009) |
| S3 | [주장·근거 검증](../plans-archive/2026-10-05-career-s3-claim-verification.md) | 완료 |
| S4 | [워크플로 그래프](../plans-archive/2026-10-05-career-s4-workflow-graph.md) | 완료. 직접 구현한 상태 머신 |
| S6 | [구조화 호출](../plans-archive/2026-10-05-career-s6-structured-call.md) | 완료 |
| S11 | [미리보기·승인·적용](../plans-archive/2026-10-06-career-s11-preview-apply.md) | 완료 |
| – | [흐름 통합](../plans-archive/2026-10-11-career-flow-integration.md) | 완료 |
| S8 | [ChatGPT 로그인](../plans-archive/2026-10-05-career-s8-chatgpt-signin-provider.md) | 보관. Codex CLI로 대체 |
| S9 | [Deep Agents](../plans-archive/2026-10-05-career-s9-deepagents-spike.md) | 보관 |

## 💡 용어

- 💡 **슬라이스**: 한 가지 기능을 끝에서 끝까지(테스트 포함) 얇게 구현해 단독으로 병합할 수 있는 작업 단위입니다.
- 💡 **기준선(baseline)**: 변경 전 현재 상태의 측정값입니다. 개선 여부는 이 값과 비교해서 판단합니다.
