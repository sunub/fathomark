# 미확인 항목 재조사: 약관·구독 한도·CLI 동작

> 기록 (2026-10-05). 현재 방향은 [DIRECTION.md](../DIRECTION.md)다.

확인일: 2026-10-05 (모든 항목 동일)

💡 용어: 1차 출처는 약관 원문, 공식 문서, 공식 저장소 소스처럼 운영 주체가 직접 낸 자료를 뜻합니다.

## 1. OpenAI 약관 vs 구독 로그인 Codex CLI 자식 프로세스 호출

- 약관 원문: 확인 못함. openai.com/policies/terms-of-use, row-terms-of-use, service-terms, help.openai.com 기사 모두 WebFetch가 HTTP 403이라 본문을 읽지 못했습니다. 약관 위반 여부는 판단하지 않습니다.
- 공식 문서(Codex auth)는 "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs"라고 권고하고, 접근 토큰은 "intended for trusted scripts, schedulers, and private CI runners"라고 적습니다. 제3자 앱의 자식 프로세스 호출을 허용/금지한다는 문장은 못 찾았습니다.
- Sign in with ChatGPT(developers.openai.com/siwc): 페이지가 미리보기(preview)로 표기되며 "Preview limitations" 절이 있음. 범위는 "let users sign in with ChatGPT and use their ChatGPT plan for eligible AI requests in your app", client ID를 요청해야 함. 정식 전환 여부는 확인 못함.
- 출처: https://developers.openai.com/siwc , https://learn.chatgpt.com/docs/auth (developers.openai.com/codex/auth가 308로 이동)

## 2. Anthropic 구독 자격증명의 제3자 사용 / Agent SDK

- Claude Code 법적 문서 원문: "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users."
- 같은 문서: 개발자는 "may not collect, store, or intermediate Claude.ai credentials or session tokens". 최종 사용자가 수정되지 않은 Claude Code 바이너리에 자기 구독으로 로그인하는 것은 제한하지 않는다고 명시.
- Consumer Terms(영문 원문): "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise."
- 참고: Usage Policy(AUP) 원문은 이번에 읽지 않음(확인 못함). 위 조항은 Consumer Terms와 Claude Code 법적 문서에서 나온 것입니다.
- 출처: https://code.claude.com/docs/en/legal-and-compliance , https://www.anthropic.com/legal/consumer-terms

## 3. Codex CLI 한도·지시문·로그인 확인

- 한도: Plus/Business는 5시간 단위 로컬 메시지 수로 표시. 입력·출력 토큰 모두 소모하고 캐시 입력 토큰은 "reduced rate but still count"(요약 확인, 원문 표현은 요약 도구 경유라 따옴표 일부 의역 가능). 프롬프트 길이만으로는 추정 불가라고 안내. 출처: https://learn.chatgpt.com/docs/pricing (developers.openai.com/codex/pricing에서 이동)
- 지시문 교체: config.toml 키 `model_instructions_file`(경로), 설명 "Replacement for built-in instructions instead of `AGENTS.md`." 소스에서도 base instructions override로 읽힘(codex-rs/core/src/config/mod.rs:4008). 출처: https://learn.chatgpt.com/docs/config-file/config-reference
- 읽기 전용 로그인 확인: 문서에 "Run `codex login status` to see the active authentication method." 종료 코드는 문서에 없음. 소스(codex-rs/cli/src/login.rs run_login_status): 로그인됨 0, "Not logged in" 1, 확인 오류 1. 출처: https://learn.chatgpt.com/docs/auth , https://github.com/openai/codex (커밋 7f89227)
- 로컬 실측(codex-cli 0.160.0): `codex login status`가 "Logged in using ChatGPT", exit 0.

## 4. Claude Code 한도·종료 코드

- 한도 계산식: 토큰 단위 공식은 확인 못함. 공식 도움말은 대화 길이, 첨부 크기, 도구 사용, 모델, effort 등이 영향을 주고 5시간 세션 한도와 주간 한도가 있으며 "Content in projects is cached and counts less against your limits when reused."라고만 설명합니다. 출처: https://support.claude.com/en/articles/9797557-usage-limit-best-practices , https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- `claude -p` 종료 코드: 성공 0, 실패는 0이 아닌 값. SIGTERM이면 143. 잘못된 플래그는 실행 전 stderr 오류. 실행 중 실패(예: 인증 누락)는 "prints the failure as the result on stdout". 출처: https://code.claude.com/docs/en/headless
- 오류 형식: `--output-format json`은 result/session ID/메타데이터, stream-json은 마지막 줄이 result 메시지. 재시도 이벤트 `system/api_retry`의 error 값은 authentication_failed, rate_limit, billing_error 등. 종료 코드별 세부 매핑 표는 확인 못함.

## 5. `--ignore-user-config`가 AGENTS.md·skills를 로드하는가 (openai/codex 소스, 커밋 7f89227)

- 결론: 로드함. 플래그 정의는 "Do not load `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`." (codex-rs/exec/src/cli.rs:45). 구현은 사용자 설정 레이어를 빈 테이블로 바꿀 뿐(codex-rs/config/src/loader/mod.rs:516).
- 전역 AGENTS.md는 별도 경로(codex-rs/codex-home/src/instructions/mod.rs)가 `$CODEX_HOME/AGENTS.override.md`, `AGENTS.md`를 읽고, 이 모듈에는 ignore_user_config 참조가 없음. skills 루트도 `codex_home.join("skills")`(codex-rs/exec-server/src/discoverV2/capability_locations.rs:72). 로컬 실측(플래그만 27k, 빈 CODEX_HOME 18k)과 일치.
- 한계: 플래그가 skills 로드를 막는 분기가 있는지 전수 추적은 하지 않음(exec 경로의 environment_manager 분기만 확인). 실측이 그 증거를 보완.
- 출처: https://github.com/openai/codex
