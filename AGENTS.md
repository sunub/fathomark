# Fathomark

A desktop-only Obsidian plugin. TypeScript lives in `plugin/` and `design-system/`;
`model/` is an optional Python training workspace whose ADR (0003) is still proposed.

<!--
This file is loaded into every conversation, so each line has to earn its tokens.

Two things do not belong here:
  - anything a tool already checks. tsconfig, dependency-cruiser and the test
    suite catch those for free; restating them costs context on every turn.
  - "read <document> first". A pointer costs the size of what it points at, not
    its own length, and it fires on a typo fix as readily as on a design change.
    Distil the invariant and inline it in a path-scoped rule under .claude/rules/.

English, not Korean: this is input on every turn, and English tokenizes cheaper.
Replies, 💡 explanations and commit messages stay Korean.
-->

## Working agreement

- A prompt that asks how, why, or which is better is a **discussion**. Explain the
  proposed solution first; change code only after explicit acceptance.
- Keep the diff inside the requested scope. No drive-by formatting, no unrelated
  refactoring.
- Investigate a failure's root cause before retrying it.
- **Explain core terms every time:** Whenever a response introduces a technical term or core concept the user may not know, briefly define it in 1–2 sentences before moving on. Do not assume the term is familiar because it appeared earlier in the conversation. Prefix the explanation with `💡` (for example, `💡 임베딩: 텍스트의 의미를 숫자 벡터로 표현한 것입니다.`).

## Verification

Run this before claiming a change works:

```bash
pnpm typecheck && pnpm test && pnpm boundaries && pnpm build
```

## Commits

Follow the `commit` skill.
