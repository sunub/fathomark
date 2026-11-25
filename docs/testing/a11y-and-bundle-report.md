# 접근성·번들·자동화 품질 검증 보고서 (2026-11-25)

이 문서는 로컬 자동 검증 환경에서 계측한 플러그인 번들 크기, 아키텍처 경계 검사, 단위·통합 테스트, 그리고 디자인 시스템의 WCAG 2.2 AA 자동 접근성 감사 결과를 기록한다. 모든 수치는 실사용자 원격 측정(RUM)이나 실제 Obsidian 런타임 계측이 아니라 **로컬 빌드·테스트 및 headless Chromium 시뮬레이션 환경**에서 측정한 값이다.

## 측정 환경

- OS / 런타임: macOS, Node `v24.14.1`, pnpm `12.5.1`
- 플러그인 테스트: Vitest `2.1.9` (`happy-dom`)
- 아키텍처 경계: `dependency-cruiser` (`plugin/.dependency-cruiser.cjs`)
- 디자인 시스템 접근성·빌드: Storybook `10.6.0` (Vite `8.3.0`), Vitest `5.0.3`, `@vitest/browser-playwright` (headless Chromium), axe-core `4.13` (`a11y: { test: "error" }`)

## 검증 명령 및 결과 요약

| 항목 | 실행 명령 | 결과 | 비고 |
|---|---|---|---|
| 타입 검사 | `pnpm typecheck` | 통과 (`tsc --noEmit`, 0 errors) | `plugin/` + `@fathomark/design-system` 소스 직접 검사 |
| 단위·통합 테스트 | `pnpm test` | **65개 파일, 435개 통과** | 로컬 워크스페이스 기준 3개 파일·4개 테스트 건너뜀(아래 주석 참고) |
| 아키텍처 경계 | `pnpm boundaries` | **0 violations** | `114 modules, 354 dependencies cruised` (`ui-owns-no-policy`, `langchain-stays-in-the-harness`, `no-circular`, `no-orphans`) |
| 프로덕션 번들 | `pnpm build` | **통과 (예산 91.8%)** | `main.js` **845,958 B (826.1 KB)** / 예산 900 KB, `styles.css` **51,214 B (50.0 KB)** |
| Storybook 빌드 | `pnpm run build:storybook` | **통과** | 2,081 modules transformed → `design-system/storybook-static` (미사용 기본 예제 `src/stories/` 제거 후) |
| 디자인 시스템 a11y | `pnpm run test:ds` | **5개 파일, 19개 통과 (0 violations)** | `a11y: { test: "error" }` 승격 직후 포착한 3건 수정 뒤 재검증 완료 |

> **건너뛴 테스트 표기:** 저장소에 추적된 테스트 파일 67개 중 2개(`career-eval.test.ts`, `local-vault-eval.test.ts`)와 `meaning-eval.test.ts`의 라이브 모델 케이스는 `FATHOMARK_LIVE_MODEL` 환경 변수가 설정된 실제 Ollama 평가 시에만 실행된다. 로컬 작업 디렉터리에는 추적되지 않은 실험 파일(`plugin/tests/ab-packets.test.ts`) 1건도 건너뛴 항목에 포함됐다.

## 번들 구성 및 예산 분석 (`esbuild` metafile)

`plugin/build.mjs`는 프로덕션 빌드 시 `main.js`가 **900 KB**를 넘으면 프로세스를 실패(exit code 1)시킨다. 2026-11-25 빌드 기준 출력 크기는 다음과 같다.

- `main.js`: **845,958 bytes (826.1 KB minified)** — 900 KB 예산 대비 잔여 여유 **73.9 KB**
- `styles.css`: **51,214 bytes (50.0 KB minified)** (`tailwindcss v4.3.3`, `tw:` 접두사 격리)

`esbuild` metafile 기준 `main.js` 주요 기여 모듈(상위 15개 그룹, 배너 제외 845,848 B 기준):

| 모듈 / 경로 | 출력 크기 | 비중 |
|---|---:|---:|
| `zod` (`^4.6.5`) | 442.6 KB | 52.3% |
| `react-dom` (`^19.0.0`) | 205.1 KB | 24.2% |
| `cn` (`tailwind-merge` 등) | 25.8 KB | 3.0% |
| `plugin/src/tools` | 25.4 KB | 3.0% |
| `plugin/src/workflow` | 23.5 KB | 2.8% |
| `plugin/src/harness` | 16.0 KB | 1.9% |
| `plugin/src/ui` | 15.1 KB | 1.8% |
| `design-system/src` | 11.8 KB | 1.4% |
| `plugin/src/providers` | 9.6 KB | 1.1% |
| `react` (`^19.0.0`) | 8.2 KB | 1.0% |
| `plugin/src/view` | 6.4 KB | 0.8% |
| `plugin/src/context` | 6.2 KB | 0.7% |
| `@base-ui/react` | 5.4 KB | 0.6% |
| `lucide-react` | 4.3 KB | 0.5% |
| `plugin/src/obsidian` | 3.9 KB | 0.5% |

- **프레임워크 배제 근거([ADR 0008](../adr/0008-no-agent-framework.md)):** 2026-10-05 실측에서 LangGraph `StateGraph`는 `+1,106 KB`(총 1,412 KB), LangChain `createAgent`는 `+1,170 KB`(총 1,476 KB)를 더해 900 KB 예산을 초과했다. 제품 소유 상태 머신(`src/workflow`, 23.5 KB)과 하네스(`src/harness`, 16.0 KB)로 대체해 예산 이내를 유지하고 있다.
- **미사용 의존성 확인(`@openai/agents`):** `plugin/package.json`에 선언된 `@openai/agents`는 `plugin/src/` 어디에서도 import되지 않으며, metafile 기준 `main.js` 기여분은 **0 bytes**다. 네트워크가 차단된 로컬 검증 환경에서 `pnpm-lock.yaml`의 `--frozen-lockfile` 정합성을 깨지 않기 위해 선언 제거는 보류했으며, 온라인 환경에서 lockfile과 함께 정리해야 한다([DIRECTION.md](../DIRECTION.md#확인이-필요한-것)).

## 접근성(WCAG 2.2 AA) 강제 전환 및 결함 포착·수정 기록

`design-system/.storybook/preview.tsx`의 `@storybook/addon-a11y` 설정을 경고 전용(`a11y: { test: "todo" }`)에서 테스트 실패 강제(`a11y: { test: "error" }`)로 전환하고, 미사용 Storybook 스타터 예제(`design-system/src/stories/`)를 제거한 뒤 `pnpm run test:ds`로 5개 컴포넌트 스토리 전체(19개 스토리)를 headless Chromium + axe-core 4.13으로 실행했다.

### 자동 감사가 포착한 실제 결함

첫 실행에서 `marker.stories.tsx` 3개 스토리(`Vault Tool`, `External Tool`, `Tool Activity`)가 WCAG 2.2 AA `color-contrast` 규칙(일반 텍스트 최소 **4.5:1**) 위반으로 실패했다.

| 대상 스토리·요소 | 문제 (Before) | 원인 | 수정 (After) |
|---|---|---|---|
| `Marker / Vault Tool` (`--fm-shell` `#14151f`) | 명도비 **2.93:1** 실패 (`#565f89`) | 읽어야 하는 툴 인자(`Agent/Harness notes.md`)에 장식·비활성 전용 토큰 `--fm-text-faint` 사용 | `--fm-text-muted` (`#8f97c0`)로 교체 → 명도비 **6.36:1** 통과 |
| `Marker / Tool Activity` 일반 행 (`--fm-card` `#171822`) | 명도비 **2.85:1** 실패 (`#565f89`) | 동일 (`"context budget"`, `Agent/Harness notes.md`) | `--fm-text-muted` 적용 → 명도비 **6.18:1** 통과 |
| `Marker / Tool Activity` 활성 행 (`--fm-raised` `#1f2231`) | 명도비 **2.54:1** 실패 (`#565f89`) | 동일 (`"context window"`) | `--fm-text-muted` 적용 → 명도비 **5.52:1** 통과 |
| `Marker` 아이콘·상태 색상 (`marker.stories.tsx:39`) | `text-fm-vault` / `text-fm-external` 미적용 | Tailwind v4 격리 규칙의 필수 `tw:` 접두사 누락 | `tw:text-fm-vault` / `tw:text-fm-external`로 수정 |
| `Foundations / Typography` 문서 예시 (`Typography.mdx:29`) | 동일 툴 인자 예시에 `--fm-text-faint` 사용 | 디자인 시스템 문서와 수정된 스토리 간 불일치 | `--fm-text-muted`로 통일 |

수정 후 재실행 결과:

- `alert.stories.tsx` — 4/4 통과
- `attachment.stories.tsx` — 4/4 통과
- `badge.stories.tsx` — 3/3 통과
- `bubble.stories.tsx` — 4/4 통과
- `marker.stories.tsx` — 4/4 통과
- **합계: 5개 파일, 19/19 스토리 통과 (axe-core 0 violations)**

### UI 경계 보안 및 접근성 정적 확인

- `plugin/src/` 및 `design-system/src/` 전체에서 `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `new Function` 사용 **0건**.
- 상태 안내에 `role="status"` / `role="alert"`, 아이콘 버튼·입력창·출처 카드에 `aria-label`, 장식용 점·아이콘에 `aria-hidden` 적용(`plugin/src/ui/`, `design-system/src/components/`).
- 네트워크 경계: 기본 모델 통신은 `localhost`에 한정되며, 선택 기능인 Wikipedia 검색은 기본 비활성 상태이고 Vault 전용 용어 외부 유출 방지 규칙([ADR 0004](../adr/0004-protect-vault-only-terms-from-research-egress.md))과 테스트(`tests/wikipedia.test.ts`, `tests/search-public-sources.test.ts`, `tests/read-public-source.test.ts`)로 검증된다.

## CI 가드레일 및 Storybook 배포

- **[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml):** `main` 푸시 및 모든 PR에서 Node 20.x + `pnpm install --frozen-lockfile` 기준으로 두 잡을 실행한다.
  - `plugin`: `pnpm typecheck` → `pnpm test` → `pnpm boundaries` → `pnpm build` (900 KB 예산 강제) → `pnpm audit --prod --audit-level=high`
  - `design-system`: `pnpm run build:storybook` → Playwright Chromium 설치 → `pnpm run test:ds` (axe-core `error` 강제)
- **[`.github/workflows/storybook-pages.yml`](../../.github/workflows/storybook-pages.yml):** `design-system/**` 변경 푸시 또는 수동 실행(`workflow_dispatch`) 시 `design-system/storybook-static`을 GitHub Pages로 배포한다.

## 한계 및 남은 수동 검증

1. **로컬·CI 시뮬레이션 범위:** 본 보고서의 테스트·번들·a11y 수치는 로컬 환경에서 확인했으며, `pnpm audit --prod --audit-level=high`와 GitHub Pages 배포 URL 동작은 원격 저장소 푸시 후 GitHub Actions 실행에서 최종 검증해야 한다.
2. **Obsidian 실앱 수동 체크리스트 미완료:** 에디터 커서 삽입, `Cmd+Z` 되돌리기, 문서 변경 감지 후 미리보기 무효화, 백그라운드 색인 등 Obsidian 런타임 종속 동작은 자동 테스트로 대체할 수 없다. [obsidian-manual-checklist.md](./obsidian-manual-checklist.md) 15개 항목의 전체 실행 기록은 아직 남아 있다.
3. **로컬 모델 실제 Vault 출력 잘림:** [DIRECTION.md](../DIRECTION.md#알려진-문제)에 기록된 실제 Vault 긴 노트에서의 1,400토큰 출력 잘림 문제는 별도 해결 과제다.
