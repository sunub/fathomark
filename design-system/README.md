# design-system

Obsidian 사이드바 에이전트 **Fathomark**, 그리고 같은 팔레트를 쓰는 LLaMA CLI를 위한
컴포넌트 라이브러리이자 시각 언어입니다.

## 구성

| 경로 | 담고 있는 것 |
|---|---|
| `src/components/ui` | 컴포넌트 (base-ui + shadcn 관례, `cva` variant) |
| `src/styles/global.css` | shadcn 토큰 레이어, 라이트와 다크 |
| `src/styles/fathomark.css` | Fathomark 테마: Tokyo Night 표면과 의미를 나르는 토큰들 |
| `src/lib/tokens.ts` | 같은 토큰을 데이터로. 문서와 도구가 순회할 수 있게 |
| `docs/copilot-ui.md` | Copilot UI 사양 — 크롬 규칙, 셸 구조, 런 상태, 컴포넌트 매핑 |
| `obsidian-mcp-server/` | CLI, 그리고 팔레트의 원본 (`src/cli/theme/`) |

## Fathomark 테마 쓰기

```ts
import "#styles/global.css" // fathomark.css는 여기서 import됩니다
```

```html
<div class="dark theme-fathomark">…</div>
```

클래스 두 개가 모두 필요합니다. `dark`는 컴포넌트 자신의 다크 스타일을 켜고,
`theme-fathomark`는 그것을 플러그인 팔레트로 다시 칠합니다.

`--fm-*` 토큰이 계약입니다. 컴포넌트는 그것을 참조하고, Tokyo Night의 원시 hex를 직접
쓰지 않습니다 — `--fm-*` 이름이 없는 색은 아직 합의된 의미가 없다는 뜻입니다.

## Copilot UI를 건드리기 전에

`docs/copilot-ui.md`를 먼저 읽으세요. 실수로 깨기 쉬운 규칙이 셋 있습니다.

- 패널 안에 구분선을 두지 않고, 크롬에 제품명이나 마크를 넣지 않습니다
- 컴포저는 항상 존재합니다 — 스트리밍 중에는 Stop이 전송 버튼 자리를 대신합니다
- 색은 "이건 어디서 왔는가" 또는 "지금 런이 무엇을 하고 있는가"를 답합니다. 그 외에는 없습니다

## Storybook

```bash
pnpm storybook
```

`Fathomark` 섹션이 Foundations(색·타이포그래피·기하)와 Copilot(패널 구조, 컴포넌트
매핑)을, `Components` 섹션이 각 컴포넌트를 코필럿에서 쓰이는 형태로 보여줍니다.
툴바의 **Theme**과 **Width** 컨트롤로 팔레트와 폭을 바꿔볼 수 있습니다.

## Tailwind class prefix

Every Tailwind utility in this package carries a `tw:` prefix — `tw:flex`, `tw:bg-fm-brand`, `tw:group/alert`. It is not decoration.

The Obsidian plugin bundles these components, and Obsidian injects a plugin's stylesheet into its own document globally. A bare `.flex` there collides with the app and with every other installed plugin. The prefix is `tw` rather than `fm` because Tailwind's default theme already declares `--font-sans`, and `prefix(fm)` would emit `--fm-font-sans` on top of the one `fathomark.css` declares. Keeping the two namespaces apart also makes markup say which is which: `tw:bg-fm-brand` is a Tailwind utility reading a Fathomark token.

Three kinds of class name stay unprefixed, and they are the ones that are not Tailwind's:

- `theme-fathomark` and `dark`, the theme roots. `tokens.css` declares the dark variant by hand as `@custom-variant dark (&:is(.dark *))`, which names the literal `.dark`.
- `fm-mono` and anything else beginning `fm-`, which `fathomark.css` owns.
- `shimmer`, `scroll-fade-x` and `scroll-fade-b`, which currently resolve to nothing at all — no `@utility` declares them. They are left as a visible loose end rather than dressed up as utilities.

`group/name` and `peer/name` markers **do** take the prefix. Tailwind emits its group variants against `.tw\:group\/name`, so a marker left bare silently kills every variant pointing at it.

`scripts/prefix-codemod.py` at the repository root performed the migration and can be re-run: it reads the class names Tailwind actually generated from the current source and prefixes exactly those, so the resulting stylesheet has to contain the same rules.

## Stylesheet entry points

- `src/styles/tokens.css` — the theme contract. Nothing in it selects `:root`, `*`, `html` or `body`.
- `src/styles/global.css` — the Storybook entry. Full Tailwind including Preflight, plus the stock light/dark palettes so the toolbar's Theme control can show the components unthemed.
- `src/styles/tailwind.css` — the entry for anything embedded in someone else's DOM. No Preflight, explicit content detection. This is what the plugin imports.
