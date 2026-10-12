# ADR 현황 (2026-10-12 기준)

ADR은 결정 당시의 기록이다. 본문은 고치지 않고, 바뀐 결정은 새 ADR로 대체·보완한 뒤 상단에 표시한다. 이 문서는 색인이며 원문이 우선한다. 지금 상태와 다음 작업은 [DIRECTION.md](../DIRECTION.md)에 있다.

## 요약

| ADR | 상태 | 결정 | 지금의 효력 |
|---|---|---|---|
| [0001](./0001-obsidian-native-product.md) | accepted | Obsidian 데스크톱 플러그인이 유일한 제품 표면. VS Code 사이드바 에이전트는 상호작용 참고일 뿐이다. | 유효 |
| [0002](./0002-plugin-contained-agent-harness.md) | accepted (0007로 보정) | harness는 플러그인 안에서 돈다. 제품이 띄우는 별도 엔진 프로세스는 측정된 한계가 있을 때만 재검토. | 유효. 0010이 채택되면 provider 보정 문구를 0010으로 연결한다 |
| [0003](./0003-separate-training-from-runtime.md) | superseded | LoRA 학습 워크스페이스를 런타임에서 분리하자는 제안. | 0007이 대체. `model/`은 실험 기록 |
| [0004](./0004-protect-vault-only-terms-from-research-egress.md) | accepted | Wikipedia 검색은 공개 주제어만 보내고, 보낸 질의는 실행 추적에 보인다. | 유효 |
| [0005](./0005-react-chat-ui.md) | accepted | Chat UI는 React로 `ItemView` 하나에 렌더링해 번들한다. 번들 예산을 빌드에서 검사한다. | 유효. 본문의 286 KB는 당시 값이다. 2026-10-12 `main.js`는 약 826 KB, 예산은 900 KB |
| [0006](./0006-user-selected-style-personalization.md) | accepted (0007로 보정) | 문체는 사용자가 고른 글을 예시로 쓴다. 사실 근거 평가가 문체 선호보다 먼저다. | 규칙은 유효. 문체는 제품의 중심 목표가 아니다(DIRECTION) |
| [0007](./0007-grounded-career-writing-with-hosted-models.md) | accepted (0009로 보정, 0010 검토 중) | 커리어 글쓰기를 근거 기반 고정 단계로 만든다. provider는 교체 가능. LoRA 제거. | 고정 단계·근거·LoRA 제거는 유효. "사용자 API 키"와 "로컬은 이점 없음"은 0010 검토 중 |
| [0008](./0008-no-agent-framework.md) | accepted | LangChain·LangGraph·Deep Agents 없이 워크플로와 도구 루프를 직접 구현한다. | 유효 (사후 기록) |
| [0009](./0009-hybrid-local-retrieval.md) | accepted | 키워드 + `bge-m3` 임베딩 + 로컬 판정의 하이브리드 검색을 기본으로 쓴다. | 유효. PRODUCT의 "의미 벡터 검색 비목표"를 대체 |
| [0010](./0010-local-curation-codex-drafting.md) | **proposed** | 로컬 모델은 근거 선별·검증, Codex CLI는 작성, 구독이 없으면 로컬이 작성. | A/B 검증 통과 후 채택 |

## 열린 결정

ADR로 다룰 열린 결정은 [DIRECTION.md의 열린 결정](../DIRECTION.md#열린-결정)에 모은다. 그중 ADR 후보는 다음과 같다.

- 네이티브 도구 호출 게이트(200개 시나리오)의 적용 범위. PRODUCT 합격 기준 17·18, ARCHITECTURE, MODEL_SELECTION이 "기본 모델 필수"로 두지만, 작성 흐름은 도구 없는 구조화 호출로 돈다.
- 외부 전송 동의 경험(S7).
