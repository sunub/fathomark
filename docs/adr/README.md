# ADR 현황 (2026-10-05 기준)

각 ADR의 결정과 현재 상태, 그리고 ADR 0007 이후 낡은 문서가 어디인지 정리한다. 원문이 우선이며 이 문서는 색인이다.

## 요약

| ADR | 상태 | 결정 | 지금의 효력 |
|---|---|---|---|
| [0001](./0001-obsidian-native-product.md) | accepted | Obsidian 데스크톱 플러그인이 유일한 제품 표면. MCP 서버·터미널 UX는 요구사항이 아니다. VS Code 사이드바 에이전트의 상호작용(현재 노트 인식, 스트리밍, 도구 활동 표시, 중지·재시도, 승인 후 반영)만 참고한다. | 유효 |
| [0002](./0002-plugin-contained-agent-harness.md) | accepted (0007로 보정) | 에이전트 harness는 플러그인 안에서 돈다. 별도 엔진 프로세스는 측정된 한계가 있을 때만 재검토. provider는 로컬뿐 아니라 호스티드도 가능(0007). | 유효. 무거운 작업은 유예·제한한다는 원칙 포함 |
| [0003](./0003-separate-training-from-runtime.md) | **superseded** | 학습 워크스페이스를 런타임에서 분리하자는 제안. | 0007이 대체. `model/`은 실험 기록으로만 남김 |
| [0004](./0004-protect-vault-only-terms-from-research-egress.md) | accepted | Wikipedia 검색은 공개 주제어만 보낸다. Vault에서만 발견된 이름·문구·경로·메타데이터는 외부 질의에서 제외하고, 전송된 질의는 실행 추적에 보인다. | 유효. 호스티드 provider 동의와는 별개로 유지 |
| [0005](./0005-react-chat-ui.md) | accepted | Chat UI는 React를 `ItemView` 하나에 렌더링해 `main.js`에 번들한다. 번들 크기는 예산을 두고 빌드에서 검사한다(React 등 약 286 KB). | 유효. **새 의존성의 번들 예산 근거로 쓰인다** |
| [0006](./0006-user-selected-style-personalization.md) | accepted (0007로 보정) | 문체는 사용자가 고른 글을 예시로 쓴다. Vault 스캔 추론 없음. 사실 근거 평가를 문체 선호보다 먼저 통과시킨다. 선호 한 번으로 저장된 문체를 바꾸지 않는다. | 규칙은 유효. LoRA·폴더 준비·학습 시퀀스는 제거됨 |
| [0007](./0007-grounded-career-writing-with-hosted-models.md) | accepted | 커리어 글쓰기를 근거 기반 고정 단계 워크플로로 만든다. provider는 교체 가능. LoRA는 제품 경로에서 제거. | **현재 방향의 기준** |

## ADR 0007이 정한 것 (한 문단)

고정 단계(검색 → 근거 선택·인용 → 초안 → 주장별 검증 → 미리보기 → 승인)를 harness가 소유한다. 검색이 가장 큰 위험이라 먼저 검증한다. 모든 경험 주장은 Evidence Reference를 갖거나 "근거 없음"으로 표시한다. 문체는 사용자가 고른 글에서 온다. 호스티드 provider로 Vault 내용을 보내려면 전송 내용을 보여 주는 명시적 동의가 필요하다.

## 서로 어긋나는 곳 (ADR 0007 이후 정리가 필요한 문서)

ADR 본문은 서로 모순이 없다. 어긋나는 쪽은 ADR 밖의 문서다.

| 문서 | 낡은 내용 | 정리 방향 |
|---|---|---|
| `docs/ROADMAP.md` Phase 1 | 로컬 모델 기본값의 지연·도구 호출 신뢰도 게이트(200 시나리오), 16 GB 기기 벤치마크 | 선택적 로컬 provider에만 적용하도록 분리 |
| `docs/TECH_STACK.md` | "기본 모델은 네이티브 tool calling을 노출해야 한다", "Deep Agent 프레임워크는 MVP에 필요 없다", LangGraph는 보류 | 새 계획(`docs/superpowers/plans/` 색인)에 맞춰 갱신 |
| `docs/ARCHITECTURE.md` LangChain boundary | LangGraph 보류 문구 | 위와 동일 |
| `plugin/src/harness/agent-loop.ts` | LangChain 패키지를 import하지 않는 직접 구현 루프(파일명은 `langchain-loop.ts`에서 변경). `plugin/package.json`에도 langchain 의존성이 없다. | 슬라이스 0에서 실제 LangChain/LangGraph 연결 여부를 결정 |

## 열린 결정 (ADR 0007 기준)

첫 호스티드 provider와 계약, 전송 동의와 키 저장 경험, lexical 이후의 검색 방식, 이력서 bullet과 에세이의 흐름 통합 여부, 문체 예시 선택 경험, `model/` 워크스페이스의 보관 방식. 구독 CLI provider는 새 ADR 후보다([service-direction](../research/service-direction.md)).
