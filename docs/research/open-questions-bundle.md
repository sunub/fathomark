# 번들 크기 / 호환성 / checkpointer 실측

실측일 2026-10-05. 환경: Node v24.18, esbuild 0.25.12(락파일 기준), pnpm 12.5.1.
저장소는 수정하지 않았고 scratchpad `bundle-delta/`에 workspace 복사본을 `--frozen-lockfile`로 설치해 측정했다.
추가 설치: langchain 1.5.15, @langchain/core 1.2.14, @langchain/langgraph 1.4.19. 모든 빌드는 `node build.mjs production` 그대로(예산 900KB 검사 포함).

## 1~2. main.js 크기 (minified)

| 구성 | main.js | 기준선 대비 | 예산 검사 |
|---|---|---|---|
| 기준선(현재 main) | 306 KB | - | 통과 |
| + langgraph 3노드 StateGraph(조건 엣지, interrupt, MemorySaver) | 1412 KB | +1106 KB | 실패 (900KB 초과) |
| + langchain `createAgent` | 1476 KB | +1170 KB | 실패 |
| + 둘 다 | 1485 KB | +1179 KB | 실패 |

- 예산 검사는 `process.exit(1)`로 빌드를 실패시키지만 main.js는 그 전에 이미 써진다(수치는 그 파일 기준).
- createAgent는 langgraph를 이미 쓰는 상태에서는 추가 +73 KB다. 두 번째 수치(+1170)는 단독 도입 비용이다.
- 이전 조사(langchain-stack-fit.md)의 단독 번들 수치(langgraph 1304, createAgent 1369)와 플러그인 306을 합친 값에서 중복 제거만큼 작게 나온다. 일관됨.
- 플러그인 예산 900KB 안에서는 어느 쪽도 불가능하다. 예산 상향(약 1.5MB) 또는 지연 로딩이 필요하다.
  지연 로딩(💡 동적 import: 필요한 시점에 번들 조각을 불러오는 방식)은 esbuild `format: "cjs"`에서는 코드 분할이 안 되므로 측정/검증하지 않았다: 확인 못함.

## 3. Node 전용 모듈 / Obsidian(Electron) 렌더러

- 번들 안 `require(...)`: `obsidian`(external)과 `worker_threads` 한 건뿐. `node:` 접두 require, child_process, fs, ws, net은 없음. esbuild metafile의 external import도 obsidian/react뿐.
- `worker_threads`는 실제 import가 아니라 langsmith가 워커용으로 만든 소스 문자열 안의 텍스트다. 워커를 띄우는 경로는 실행하지 않았다: 실제로 호출되는지 확인 못함(트레이싱 비활성 시 쓰이지 않는 것이 코드 설명상 기대됨).
- build.mjs의 builtin-modules 목록은 `node:` 접두 없는 이름만 있다(실측). 소스에 `node:async_hooks`처럼 쓰면 `Could not resolve`로 빌드가 실패한다. 번들에서 쓰려면 접두 없는 `async_hooks`를 써야 한다.
- 주의할 요소:
  - 💡 AsyncLocalStorage: 비동기 호출 체인 전체에 컨텍스트를 전달하는 Node 기능. browser 번들에는 포함되지 않아 `interrupt()`가 "Called interrupt() outside the context of a graph"로 실패한다(재현함).
    해결: 시작 시 `AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new AsyncLocalStorage())`(`@langchain/core/singletons`, `async_hooks`는 external이라 Obsidian의 require로 로드). 이 초기화 후 정상 동작함.
  - 런타임 판별 코드가 `process.versions.node`와 `navigator.userAgent`를 본다. Electron 렌더러에는 둘 다 있어 브라우저/노드 어느 쪽으로 판정될지는 실제 Obsidian에서만 알 수 있다: 확인 못함.
  - LangSmith 트레이싱은 환경변수로 켜질 때만 외부 전송한다(코드상). 이 플러그인 egress 정책(S7)에 맞게 끄는 설정이 필요한지는 확인 못함.
- 대체 검증(전체 앱이 아닌 로드 가능성만 확인):
  - `main.js`(langgraph+createAgent 포함, obsidian stub)를 (a) 최소 전역만 둔 `vm` 컨텍스트, (b) happy-dom Window 컨텍스트에서 CJS로 로드: 에러 없이 `default` 클래스가 export됨.
  - 한계: obsidian은 stub이고 플러그인 onload는 실행하지 않았다. Electron의 실제 require/CSP/모듈 해석, 번들 파싱 시간(시작 지연)은 측정 못함: 확인 못함.

## 4. zod 3 peer 경고

- 설치 결과 zod는 3.25.76 한 벌만 설치됨. langchain/core/langgraph 관련 peer 경고와 충돌 없음(`pnpm peers check`의 unmet peer는 기존 storybook 쪽 vitest 5 vs ^3||^4 두 건뿐).
- 요구 범위: langchain/core `zod ^3.25.76 || ^4`, langgraph peer `^3.25.32 || ^4.2.0`. 플러그인 package.json의 `^3.24.0`은 하한이 이보다 낮다. 락파일은 3.25.76이라 지금은 통과하지만 `^3.25.76`으로 올려 두는 것이 안전하다.
- deepagents(zod ^4.3.6 요구)는 이번에 설치하지 않았다(이전 조사 참조).

## 5. 커스텀 checkpointer (BaseCheckpointSaver 서브클래스, Map 기반)

- 구현: `probe/ckpt.ts`의 `MapSaver`(약 50줄). 상태는 serde로 직렬화해 base64 문자열로 Map에 저장하고, `toJSON()/fromJSON()`으로 saveData 형태(JSON 문자열) 왕복이 된다.
- 시나리오(번들을 `vm` 샌드박스에서 실행, 샌드박스에는 process/Buffer 없음):
  1. 3노드 그래프 invoke -> verify 노드에서 interrupt, `next=["verify"]`, 체크포인트 3행/writes 3건.
  2. 스냅샷 JSON(약 2.5KB)을 새 MapSaver로 복원하고 새 그래프 인스턴스를 만들어(플러그인 재시작 모사) `Command({resume})` -> 이어서 write까지 완료(`draft: "r:hi!"`). 거절 분기(`approve:false`)는 조건 엣지로 END. 히스토리 5건 조회됨.
- 발견한 함정:
  - `Command({ resume: false })`(0, "", null 포함)는 "Received empty Command input"으로 실패한다. 기본 MemorySaver에서도 동일(재현함). resume 값은 `{ approve: false }` 같은 객체로 감싸야 한다.
  - `WRITES_IDX_MAP`과 `PendingWrite` 타입이 langgraph에서 export되지 않아 값(`__error__:-1, __scheduled__:-2, __interrupt__:-3, __resume__:-4`)을 직접 복제했다. 내부 구현 의존이라 버전 업 시 깨질 수 있다.
  - `BaseCheckpointSaver`/`copyCheckpoint`는 `@langchain/langgraph`에서 re-export된다. `@langchain/langgraph-checkpoint`는 직접 의존성이 아니라 pnpm 엄격 모드에서 직접 import할 수 없다.
  - 실제 `saveData` 호출(Obsidian API), 동시 쓰기, 체크포인트 누적에 따른 data.json 크기 증가/정리(deleteThread 호출 시점)는 검증 못함: 확인 못함.

## 결론

- 예산 900KB: langgraph만으로도 +1.1MB(총 1.4MB), createAgent는 추가 +73KB(단독은 +1.17MB). 예산 상향 결정 없이는 도입 불가.
- 로드 호환성: Node 전용 require는 없고 vm/happy-dom에서 로드·실행됨. 단 `interrupt()`는 AsyncLocalStorage 수동 초기화가 필수. 실제 Obsidian 구동은 확인 못함.
- zod 3.25.76에서 충돌 없음. package.json 하한을 `^3.25.76`으로 올릴 것을 권장.
- Map 기반 커스텀 checkpointer로 interrupt 후 재시작 모사 재개가 동작함. resume 값 객체 래핑 필요.
재현 파일: `scratchpad/bundle-delta/plugin/probe/{ckpt.ts,run.ts,vm.cjs,mainload.cjs}`.
