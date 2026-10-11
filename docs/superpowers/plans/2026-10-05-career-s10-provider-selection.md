# S10: provider 선택과 로컬 Gemma 4 폴백

**목표**: ChatGPT 로그인이 가능하면 그 provider를, 아니면 로컬 Gemma 4(Ollama)를 쓰는 선택 규칙과, 기기 사양에 맞는 Gemma 4 변형 안내를 만든다.

**선행**: S6, S7. S8과 병행 가능(S8이 없어도 로컬만으로 동작해야 한다). **프레임워크**: 없음.

## 결정 (사용자, 2026-10-05)

- 무료·오픈소스 배포가 전제다. 유료화나 원격 호스팅으로 바뀌면 SIWC 경로를 재검토한다(waitlist 필요).

- 로그인된 구독 요금제를 쓸 수 있으면 그것을 쓴다(S8).
- 그렇지 않으면 Gemma 4를 쓴다. 기본 모델은 공개 Gemma 4 그대로이고 LoRA는 쓰지 않는다([gemma4-sizes-and-qlora.md](../../research/gemma4-sizes-and-qlora.md)).

## 선택 규칙

| 상태 | 사용 provider | 동의 게이트(S7) |
|---|---|---|
| 사용자가 ChatGPT 로그인 provider를 선택, 로그인됨 | ChatGPT 로그인 | 필요 |
| 로그인 안 됨 / 토큰 만료 / 선택 안 함 | 로컬 Gemma 4 | 불필요(loopback) |
| 로그인됨, 요청 중 usage limit 도달 | **자동 전환하지 않고** 사용자에게 알린다. 로컬로 이어서 실행할지 묻는다. | 로컬 전환은 불필요 |
| 로컬 모델도 없음 | 설치 안내와 실패 상태(입력은 잠그지 않는다) | – |

- 자동 전환을 하지 않는 이유: 품질이 달라지고 Vault 내용이 외부에서 로컬로 바뀌는 사실을 사용자가 알아야 한다. 이 정책은 사용자가 확정했다(2026-10-05): 한도 도달 시 전환을 제시하고 사용자가 선택한다.
- 현재 선택된 provider와 모델은 항상 상태 줄에 보인다.

## Gemma 4 변형 안내 (조사 기준)

| 메모리 | 권장 | 비고 |
|---|---|---|
| 8 GB | E2B (QAT 4.3 GB) | 품질 한계 가능, 미측정 |
| 16 GB | 12B QAT (7.2 GB) 또는 E4B (6.1 GB) | KV cache 추정: 12B 8k 약 0.47 GB |
| 24 GB 이상 | 26B-A4B QAT (16 GB) | |

한국어 지원서 글쓰기 품질은 변형별로 측정하지 못했다. S1 고정셋으로 측정한 뒤 권장표를 확정한다.

## 파일

- Create: `plugin/src/providers/select.ts` (선택 규칙, 순수 함수)
- Modify: `plugin/src/providers/ollama.ts` (모델 목록에서 Gemma 4 변형 식별, 설치 여부 판별)
- Modify: `plugin/src/settings/index.ts` (선호 provider, 로컬 모델명)
- Test: `plugin/tests/provider-selection.test.ts`

## 인터페이스

- Produces: `selectProvider(state: { preferred: "chatgpt" | "local"; chatgptHealth: ProviderHealth | null; localHealth: ProviderHealth }): { use: "chatgpt" | "local" | "none"; reason: string }`.
- Consumes: 각 provider의 `health()`(`ModelProvider`), S8의 한도 도달 신호.

## 작업

- [ ] 실패 테스트: 표의 각 상태 조합에서 올바른 `use`와 `reason`이 나온다.
- [ ] 실패 테스트: 한도 도달 시 자동 전환이 일어나지 않고 `needs_user_choice` 상태가 된다.
- [ ] 실패 테스트: 둘 다 사용 불가면 `none`과 안내 문구가 나오고 입력이 잠기지 않는다.
- [ ] `selectProvider`를 구현하고 통과시킨다.
- [ ] Ollama 모델 목록에서 Gemma 4 변형 식별과 설치 여부 판별 테스트·구현.
- [ ] 설정 UI에 provider 선택과 로컬 모델 안내를 추가한다(장식 최소 원칙).
- [ ] 검증 명령 실행 후 커밋한다.

## 완료 기준

- 모든 선택 경로가 순수 함수 테스트로 고정된다.
- 사용자가 어떤 provider가 쓰였는지 항상 알 수 있다.

## 리뷰 초점

- 요청 도중 provider가 바뀔 때 진행 중인 실행이 어느 provider로 끝나는지.
- 로컬 모델이 구조화 출력을 안정적으로 내지 못하는 경우(S6의 파싱 실패 경로와 연결).
