# Authoring Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 노트·근거·문체를 확인하고 생성 결과를 미리 본 뒤 안전하게 한 번 삽입할 수 있는 사용자 흐름을 완성한다.

**Architecture:** 뷰는 하네스의 스냅샷과 주입된 명령만 사용한다. 편집 대상은 MarkdownView가 마지막으로 활성 상태였을 때 캡처하고, 승인 시 같은 대상과 본문·범위를 다시 확인한다. 학습 없이 선택한 구절을 스타일 지시로 사용하는 경로부터 완성한다.

**Tech Stack:** 기존 React 19, design-system, Obsidian editor API, Vitest/testing-library/happy-dom. 새 UI·diff 의존성 없음.

**Spec:** `docs/PRODUCT.md`, `docs/adr/0005-react-chat-ui.md`, `docs/adr/0006-user-selected-style-personalization.md`, `design-system/docs/chat-ui.md`, [상위 계획](2026-09-27-fathomark-completion.md), [런타임 계약 P0](2026-09-27-plugin-runtime.md).

## Global Constraints

- 컴포저는 항상 존재하고 사용자가 계속 입력할 수 있다. 생성 중 새 전송만 차단하며 Stop을 제공한다.
- UI는 provider/tool/Obsidian 객체에 직접 접근하지 않는다. view가 명령을 연결한다.
- 문체 선택은 사실 출처나 학습 동의가 아니다. 자동 Vault 스캔과 자동 후보 활성화 금지.
- 승인 전 쓰기 0회, 승인 후 하나의 editor 연산, 중복 승인 쓰기 0회.
- 작성 스타일 최대 UTF-8 4096 bytes, 초과 시 조용히 자르지 않고 더 짧은 선택 안내.
- 디자인 시스템의 기존 컴포넌트와 토큰을 사용한다. 앱 밖의 전역 스타일 변경 금지.

## Review Focus

1. sidebar 포커스로 MarkdownView가 비활성화돼도 올바른 이전 문서를 유지한다 → A1.
2. 한글 IME 확정 Enter/생성 중 Enter가 새 질문을 보내지 않는다 → A1.
3. 문체 예시의 비밀 숫자·이름은 출처 목록이나 사실 근거로 승격되지 않는다 → A2.
4. 같은 문자열의 다른 위치·커서 이동·본문 수정·파일 rename 후 승인하면 쓰기를 거부한다 → A3.
5. 빠른 두 번 승인, 패널 닫기, unload 직전 승인이 중복 쓰기를 만들지 않는다 → A3/A4.

---

## 파일 지도

| 파일 | 책임 |
|---|---|
| Modify `plugin/src/ui/{App.tsx,state/panel-store.ts,screens/Conversation.tsx,panel/Composer.tsx}` | 외부 스냅샷 렌더와 명령, IME·중복 전송 처리 |
| Create `plugin/src/ui/panel/{ContextSummary,Sources,StylePicker,InsertionPreview}.tsx` | 작은 표시·사용자 선택 단위 |
| Create `plugin/src/obsidian/editor-target.ts` | 마지막 MarkdownView와 정확한 편집 상태 캡처 |
| Modify `plugin/src/obsidian/editor-adapter.ts` | 캡처된 대상에 대한 단일 검증/편집 |
| Create `plugin/src/context/style.ts` | 선택 스타일 검증 및 세션/명시 저장 자료 |
| Create `plugin/src/obsidian/insertion-preview.ts` | preview ID, 상태, 적용 중복 방지 |
| Modify `plugin/src/view/chat-view.tsx`, `plugin/src/main.ts`, `plugin/src/settings/index.ts` | 통합 리더가 직렬 연결 |

### A1: 현재 노트·실행·근거를 유지하는 패널

**Depends:** P0/P1. P3/P5 없이 fake와 snapshot으로 독립 구현 가능.

**Files:** Modify `plugin/src/ui/{App.tsx,state/panel-store.ts,screens/Conversation.tsx,panel/Composer.tsx}`; Create `plugin/src/ui/panel/{ContextSummary,Sources}.tsx`, `plugin/src/obsidian/editor-target.ts`, `plugin/tests/{app,composer,editor-target}.test.tsx`; view/main 변경은 리더에게 전달.

**Interfaces:** App props는 `getSnapshot: () => RunSnapshot`, `subscribe: (listener: () => void) => () => void`, `commands: PanelCommands`, `modelLabel: string`이다. `PanelCommands.ask(question: string): Promise<{accepted: boolean; reason?: string}>`, `stop(): void`, `retry(): Promise<{accepted: boolean; reason?: string}>`, `openSource(reference: EvidenceReference): Promise<void>`, `setResearchTopic(text: string, language: "ko" | "en"): void`로 확장한다. view는 rejected run을 여기서 받아 화면의 지속 오류로 변환한다.

`EditorTargetTracker(app: App)`는 `capture(): EditorTarget | null`, `dispose(): void`를 제공한다. `EditorTarget`은 `id: string`, `path: string`, `text: string`, `selection: string`, `from/to: {line: number; ch: number}`를 갖는다. 실제 MarkdownView 객체는 tracker 내부 map에만 두며 UI/모델로 전달하지 않는다. `currentNote()`는 tracker capture에서 변환한다.

- [ ] **Step 1:** `composer.test.tsx`: `composition Enter does not submit`에서 isComposing=true/IME keyCode229일 때 ask 0회; `busy Enter preserves draft`에서 streaming+Enter는 ask 0, textarea 내용 유지; accepted=false에서도 draft 유지. `app.test.tsx`: 재열기 시 전체 답변/상태 복구; 같은 call ID 행1개; source/conflict 양쪽 표시; unsupported citation은 클릭 불가. `editor-target.test.tsx`: sidebar 포커스 이후 원래 note 캡처, 닫힌 leaf는 target null.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/app.test.tsx tests/composer.test.tsx tests/editor-target.test.tsx` FAIL 확인.
- [ ] **Step 3:** App은 `useSyncExternalStore`로 P1 snapshot을 읽고 기존 pure reducer로 표시 상태를 계산한다. 도구 activity는 ID별 갱신하며 일반 prose와 합치지 않는다. snapshot.events는 run 시작 이후의 기록이므로 재열기 시 처음부터 reduce하고 event를 다시 append하지 않는다.
- [ ] **Step 4:** ContextSummary는 note path/선택 여부/누락 사유를 표시한다. Sources는 실제 EvidenceReference만 링크로 만들며 `[[S1]]` 형식의 답변 인용 ID는 런타임에서 부여한 evidence 순서에 대응시킨다. 임의 모델 URL이나 모르는 ID는 링크로 만들지 않고 확인되지 않은 출처로 표시한다. 충돌은 양쪽 claim/reference를 모두 표시한다. 공개 주제 입력은 비어 있는 별도 필드로 시작하며 실제 전송 문자열을 명시한다.
- [ ] **Step 5:** retry는 마지막 질문과 캡처된 문맥으로 새 run을 시작하며 현재 노트가 바뀌었음을 표시한다. automatic retry 없음. getSnapshot reference 안정성, 구독 해제, draft 수명 테스트와 플러그인 4종 PASS 후 리뷰/커밋.

### A2: 사용자 선택 문체의 비학습 기준선

**Depends:** A1/P2. 모델 학습 작업과 독립 실행한다.

**Files:** Create `plugin/src/context/style.ts`, `plugin/src/ui/panel/StylePicker.tsx`, `plugin/tests/style.test.ts`, `plugin/tests/style-picker.test.tsx`; Modify `plugin/src/context/request.ts`, `plugin/src/settings/index.ts`, `plugin/src/view/chat-view.tsx` (각 담당과 직렬).

**Interfaces:** `createSelectedStyle(text: string): SelectedStyle`; `StyleStore { get(): SelectedStyle | null; select(text: string): void; clear(): void; persist(): Promise<void> }`. `persist()`는 사용자가 보관 버튼을 눌렀을 때만 root saveData를 호출한다. PanelCommands에 `selectStyle(): Promise<void>`, `clearStyle(): Promise<void>`, `saveStyle(): Promise<void>`를 추가한다. 선택은 A1 tracker의 현재 명시적 selection에서만 얻는다.

- [ ] **Step 1:** `style.test.ts`: 빈 선택 거부, UTF-8 4096 경계 허용/4097 거부, 기본 select에서 saveData 0회, clear 후 다음 요청에 구절 0회. `style-picker.test.tsx`: 명시 버튼 전 selection 수집 0회, 삭제/저장 동작과 오류 표시. `request.test.ts`에 스타일 속 `SECRET_STYLE_FACT_73`은 style section에만 있고 evidence/citations에는 없으며 같은 사실을 근거로 인용하지 말라는 system 지시 확인.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/style.test.ts tests/style-picker.test.tsx tests/request.test.ts` FAIL 확인.
- [ ] **Step 3:** 인용 가능한 근거와 스타일 예시를 별도 JSON section으로 직렬화하고 style 안 지시는 따르지 않게 한다. 비학습 기준선은 동일 질문/근거/모델/생성 설정에서 style 유무만 바꿔 비교 가능하게 유지한다. 프롬프트 분리가 실제 유출 방지의 증명은 아니며 V2 실제 답변 검토가 필요하다.
- [ ] **Step 4:** 저장/삭제는 같은 plugin data 필드만 변경하며 원본 노트를 수정하지 않는다. 삭제하면 메모리와 저장 예시를 지우고 다음 run부터 사용하지 않는다. 진행 중 run이 자료를 보유하면 취소하고 새 run만 허용한다. 모델 후보 파일/학습 자료 삭제는 다른 기능이며 이 버튼이 처리한다고 표시하지 않는다.
- [ ] **Step 5:** 테스트+4종 PASS, 리뷰/커밋. 실제 사용자 문체의 우월성은 M3/V2 평가 전 미검증으로 기록한다.

### A3: 편집 상태에 묶인 미리보기·승인·삽입

**Depends:** A1. P7 없이 deterministic generated text로 검증 가능.

**Files:** Create `plugin/src/obsidian/insertion-preview.ts`, `plugin/src/ui/panel/InsertionPreview.tsx`, `plugin/tests/insertion.test.ts`, `plugin/tests/insertion-preview.test.tsx`; Modify `plugin/src/obsidian/{editor-adapter,editor-target}.ts`.

**Interfaces:** `InsertionPreview { id: string; targetId: string; path: string; from: EditorPosition; to: EditorPosition; before: string; after: string; status: "pending" | "applied" | "discarded" | "stale" }`; `EditorPosition = {line: number; ch: number}`. `PreviewController.create(target: EditorTarget, generatedText: string): InsertionPreview`; `approve(id: string): {ok: true} | {ok: false; reason: string}`; `discard(id: string): void`; `dispose(): void`. 원본 본문 전체와 editor 객체는 controller/tracker 내부에만 보관하고 모델·설정에 저장하지 않는다. PanelCommands에 `previewAnswer(): void`, `approveInsertion(id: string): void`, `discardInsertion(id: string): void`를 추가한다.

- [ ] **Step 1:** `insertion.test.ts`에 editor write spy를 두고 미승인/폐기/unknown ID는 0회, 승인 두 번은 총1회, 동일 문자열의 다른 위치/커서 이동/본문 변경/rename/닫힌 leaf는 0회인지 검사한다. 대표 assertion은 `expect(write).toHaveBeenCalledTimes(1)`이다. 선택이 있으면 고정 from/to를 교체하고 없으면 고정 from=to에 삽입한다. `insertion-preview.test.tsx`는 경로·변경 전/후·승인/폐기 표시와 생성 중 적용 거부를 검사한다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/insertion.test.ts tests/insertion-preview.test.tsx` FAIL 확인.
- [ ] **Step 3:** 생성 요청 당시 EditorTarget을 유지한다. 승인 시 tracker 내부의 같은 view가 살아 있고 path/전체 본문/선택 from/to가 일치함을 동기적으로 확인한 뒤 고정 범위에 한 번의 `editor.replaceRange`를 수행한다. 검증과 쓰기 사이에 비동기 작업을 넣지 않는다. 기존 ApprovedInsertion의 현재 커서 적용 경로를 이 controller로 대체하고 사용하지 않는 이전 API는 삭제한다.
- [ ] **Step 4:** 차이는 선택 범위의 before/after를 나란히 보여주고 공통 앞/뒤 행을 제외한 변경 행을 표시한다. 별도 diff 의존성은 추가하지 않는다. stale이면 자동 재적용하지 않고 “문서가 바뀌었습니다. 미리보기를 다시 만들어 주세요.”를 표시한다. 재작성은 새 ID와 EditorTarget을 사용한다. approve는 임의 text가 아닌 ID만 받는다.
- [ ] **Step 5:** 테스트+4종 검사 PASS, 독립 리뷰/커밋. mock의 단일 편집 횟수만으로 실제 Obsidian undo 성공을 주장하지 않고 A4에서 확인한다.

### A4: 실제 시작·재개·undo를 포함한 전체 검증

**Depends:** P7/A1/A2/A3. G3가 없으면 모의 통합까지 완료한다.

**Files:** Create `plugin/tests/plugin-lifecycle.test.ts`, `docs/testing/obsidian-smoke.md`; Modify `plugin/tests/obsidian-stub.ts`, `plugin/src/view/chat-view.tsx`, `plugin/src/main.ts` (통합 리더만 수정).

**Interfaces:** 새 제품 API 없음. P1 session/A1 commands/A3 controller를 root에서 주입한다.

- [ ] **Step 1:** lifecycle test에서 load→open→generate→close→open→cancel→unload를 실행하고 `expect(activeSubscriptions).toBe(0)` 및 timeout/pending fetch=0을 확인한다. unload 이후 승인 write0, 모델 변경 뒤 이전 delta append0, view 두 개가 같은 snapshot을 표시하는지 검사한다.
- [ ] **Step 2:** `pnpm --filter fathomark-plugin exec vitest run tests/plugin-lifecycle.test.ts` FAIL 확인.
- [ ] **Step 3:** `onunload`에서 session/tracker/preview/harness를 dispose한다. workspace 이벤트는 registerEvent로 등록하고 leaf를 직접 detach하지 않는다. close는 구독과 React root만 제거하고 run/session을 유지한다.
- [ ] **Step 4:** 전체4종 검사 PASS 후 G3가 있으면 scratch Vault에서 “선택→질문→중단→재시도→출처→문체→미리보기→폐기→새 미리보기→승인→undo”를 실행한다. 승인 전 파일 차이0, 승인 후 지정 범위만 변경, undo 후 원문 일치를 기록한다. 실제 load/unload와 생성 중 재열기도 확인한다.
- [ ] **Step 5:** `docs/testing/obsidian-smoke.md`에 합성 노트, 조작, 기대값, 앱 버전, 날짜, 결과를 남긴다. G3가 없으면 not-run. 시각 확인에는 visual-verdict 스킬을 적용하고 외관 확인과 기능 시험을 분리한다. 리뷰/커밋.

## 검증 기록

| 작업 | commit | 명령/결과 | 환경 제한 |
|---|---|---|---|
| 계획 작성 | 없음 | 구현/시험 전 | 실제 Obsidian undo 미검증 |
