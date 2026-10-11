> **보관된 계획 (사용하지 않음)**: 보류. 로컬 Gemma 4가 끝까지 동작한 뒤에 다시 연다(조건: SDK 라이선스와 Obsidian 렌더러 동작 확인).
> 현재 계획은 `../plans/2026-10-05-career-writing-index.md`와 `docs/DIRECTION.md`를 따른다. 실행하지 말고 참고용으로만 읽는다.

# S8: ChatGPT 로그인(SIWC) provider

> 이전 `career-s8-codex-cli-provider.md`를 대체한다. Codex CLI 자식 프로세스 경로는 채택하지 않고, 실측 기록만 남긴다(맨 아래).

**목표**: 사용자가 "Sign in with ChatGPT"로 로그인하면 본인의 ChatGPT 요금제로 모델을 호출하는 선택적 provider를 만든다. 로그인하지 않았거나 쓸 수 없으면 S10의 규칙에 따라 로컬 Gemma 4를 쓴다.

**선행**: S6(구조화 호출), S7(동의 게이트). **프레임워크**: 없음.

## 결정 배경

- 사용자 결정(2026-10-05): 로그인으로 구독 요금제를 쓰는 경로를 제공하고, 쓰지 않을 때는 Gemma 4를 쓴다.
- 근거 문서: OpenAI Cookbook "Sign in with ChatGPT"(요약 도구를 거쳐 읽은 내용이라 원문 대조가 필요하다). 확인된 서술:
  - 대상: "open-source projects, personal projects that run locally, and selected private apps". 유료 또는 원격 호스팅 앱은 waitlist 요청이 필요하다.
  - 흐름: 127.0.0.1 콜백 리스너와 시스템 브라우저, state·nonce·PKCE, refresh token. SDK(`createChatGPT`, `signIn`, `listProfiles`, `selectProfile`)가 OAuth와 자격증명 저장을 처리한다.
  - 요청: `chatgpt.streamResponse({ model, input, instructions })`로 공개 Responses API를 호출한다. 모델은 `chatgpt.listModels()`로 조회한다. 구체적인 한도 수치는 문서에 없고 usage limit 오류 처리를 권한다.
  - 주의: "Keep this instance in the main process" — Electron 메인 프로세스에서 인증·저장·요청을 관리하라고 한다.
- 이 경로는 Codex 에이전트를 거치지 않으므로 CLI의 고정 입력 오버헤드(약 18~27k 토큰)와 내장 지시문·도구가 없을 가능성이 있고, `instructions`로 우리 시스템 프롬프트를 직접 준다. 이는 가설이며 S8-0에서 확인한다.
- 배포 조건: 무료·오픈소스 또는 로컬 개인 프로젝트일 때만 해당한다. 유료화나 원격 호스팅으로 바뀌면 이 경로를 재검토한다.

## 스파이크 조사 결과 ([siwc-sdk-spike.md](../../research/siwc-sdk-spike.md), 판단: 조건부)

- SDK `@siwc/local`은 **npm에 없다(404).** `github.com/openai/sign-in-with-chatgpt-devkit`의 비공개 워크스페이스(0.1.0)이고, 직접 의존성은 `jose`, `proper-lockfile`, `engines.node >=22`.
- **라이선스는 MIT가 아니라 "Noncommercial License v1.0"**이다(라이선스 사본 첨부·변경 표시·동일 라이선스 요구). 무료 오픈소스인 Fathomark에 허용되는지는 **확인 못함**(법률 확인 필요). 대안은 문서에 공개된 OAuth 흐름(PKCE, 127.0.0.1 콜백)을 직접 구현하는 것이다.
- 기술적으로는 가능해 보인다: SDK 소스에 `electron` import가 없고 번들 증가분은 79.8 KB. 단 OS 암호화 제공자(`credentialEncryption`)가 필수인데 예제는 메인 프로세스 전용 `safeStorage`를 쓰므로 렌더러용 구현이 따로 필요하다.
- 저장 경로는 `storageDir`로 지정 가능(기본 `~/.config/<appId>`). Vault 밖에 둔다(해석).
- `streamResponse`는 `{ model, input, instructions, signal, onDelta }` → `{ text }`만 반환한다. **구조화 출력과 usage가 없다.** S6의 구조화 호출과 사용량 측정이 필요하면 직접 HTTP 호출이 필요하다.
- 한도 도달은 `ChatGPTError.code === "subscription_sharing_usage_limit_exceeded"`(429)로 구분된다. Plus의 5시간 한도는 모든 앱이 공유하고 Pro는 적용되지 않으며, 앱별 주간 한도는 사용자가 정한다. 요청은 `store:false`, `stream:true` 필수, `temperature`·`max_output_tokens` 미지원. 허용 모델 목록·사용자 수 상한·약관 링크는 문서에 없다.
- 확인 못함: 렌더러 `fetch`의 CORS, Obsidian 내장 Chromium의 `AbortSignal.any` 지원, 서버 측 고정 입력 오버헤드, 구조화 출력 직접 호출의 허용 여부. 대부분 실제 로그인과 Obsidian 구동이 필요하다.

### 이 결과가 만드는 선택지

| 선택 | 내용 | 선결 조건 |
|---|---|---|
| a. SDK 사용 | 개발 키트를 소스로 가져와 사용 | Noncommercial 라이선스가 무료 오픈소스 배포에 허용되는지 확인 |
| b. OAuth 직접 구현 | 공개 문서의 흐름(PKCE, 로컬 콜백, refresh)을 직접 작성, Responses 호출도 직접 | 문서만으로 구현 가능한지와 약관 허용 확인 |
| c. 보류 | 로컬 Gemma 4만으로 먼저 출시 | – |

S8-0의 다음 단계는 **라이선스·약관 확인**이다. 코드 구현은 그 뒤에 한다.

## 위험 (먼저 확인할 것)

1. **Obsidian 플러그인은 Electron 렌더러에서 실행된다.** 문서는 메인 프로세스를 권한다. 렌더러에서 SDK가 동작하는지, 127.0.0.1 콜백 리스너를 열 수 있는지 확인하지 못했다.
2. (조사 완료) SDK는 npm에 없고 번들 증가분은 약 80 KB다. 위 결과를 본다.
3. 허용 모델 목록과 한도, preview의 변경 가능성.
4. 인증 정보 저장 위치: `chatgpt-auth.json` 등을 사용자 홈 아래에 둔다고 한다. Obsidian Vault 안(동기화 대상)에 저장되면 안 된다.

## S8-0: 스파이크 (코드 병합 안 함)

- [ ] 공식 문서에서 SDK 패키지 이름·버전과 설치 방법, 지원 환경(Node 버전, Electron)을 확인한다.
- [ ] scratchpad에서 SDK를 번들해 크기와 Node 전용 모듈 의존을 측정한다(S0과 같은 방식).
- [ ] 개발용 Obsidian Vault에서 `signIn()`이 콜백 리스너와 브라우저 로그인을 완료하는지, 렌더러에서 안 되면 대안(사용자 PC에서 별도 헬퍼 프로세스, 메인 프로세스 접근)이 있는지 확인한다. 이 단계는 사용자가 직접 로그인해야 한다.
- [ ] `listModels()` 결과와 Responses 호출로 구조화 출력(JSON)이 되는지, 입력 토큰이 우리 프롬프트 크기와 일치하는지(고정 오버헤드 없음) 확인한다.
- [ ] 결과를 `docs/research/siwc-spike.md`에 기록하고, 렌더러에서 불가능하면 이 슬라이스를 중단하고 사용자에게 알린다.

## 구현 (스파이크가 통과한 경우)

**파일**
- Create: `plugin/src/providers/chatgpt-signin.ts` (`ModelProvider` 구현, 인증은 SDK에 위임)
- Modify: `plugin/src/settings/index.ts` (provider 선택, 로그인 상태), 설정 UI(로그인/로그아웃 버튼, 상태 표시)
- Modify: `plugin/.dependency-cruiser.cjs` (SDK import를 이 파일로 제한)
- Test: `plugin/tests/chatgpt-signin.test.ts` (SDK를 가짜로 대체, 실제 로그인·네트워크 금지)

**인터페이스**
- Produces: `createChatGptSignInProvider(sdk): ModelProvider` — S6의 `callStructured`가 그대로 쓴다. `health()`는 로그인 상태를, `listModels()`는 `listModels()` 결과를 반환한다.
- Consumes: S6 `callStructured`, S7 `ConsentGate`(`destination: "hosted"`).

**작업**
- [ ] 실패 테스트: 로그인된 상태에서 `streamResponse` 이벤트가 `text`/`done` 이벤트로 매핑된다.
- [ ] 실패 테스트: usage limit 오류가 "한도 도달"로 분류되어 S10의 폴백 신호가 된다.
- [ ] 실패 테스트: 로그아웃/토큰 만료 상태에서 `health()`가 `reachable: false`와 안내 문구를 반환한다.
- [ ] 실패 테스트: 동의 없이는 `streamResponse`가 호출되지 않는다.
- [ ] 실패 테스트: `AbortSignal` 중단 시 요청이 취소된다.
- [ ] 구현하고 통과시킨다. 검증 명령 실행 후 커밋한다.

## 완료 기준

- 가짜 SDK 기준 모든 경로가 테스트로 고정된다.
- 인증 정보가 Vault나 로그에 쓰이지 않는다.
- 로그인하지 않으면 이 provider는 후보에서 빠진다(S10).

## 리뷰 초점

- 로그아웃 후 인증 파일이 남는지.
- 로그인 도중 플러그인 언로드 시 콜백 리스너 포트가 닫히는지.

## 부록: 채택하지 않은 Codex CLI 경로의 실측 기록 (2026-10-05, codex-cli 0.160.0)

- `codex exec --sandbox read-only --ephemeral --json --output-schema`로 구조화 호출 성공, 이벤트는 `thread.started → turn.started → item.completed → turn.completed(usage)`.
- 입력 토큰은 `ok`만 보내도 약 27,000, 빈 `CODEX_HOME`(인증 링크만)이면 약 18,000. `--ignore-user-config`는 `config.toml`만 무시하고 AGENTS.md와 skills는 막지 않는다.
- 이 경로는 SIWC가 막히거나 SDK가 Electron 렌더러에서 동작하지 않을 때만 대안으로 다시 검토한다.
