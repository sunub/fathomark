/**
 * Fathomark 토큰 목록.
 *
 * `src/styles/fathomark.css`가 원본입니다. 이 파일은 그것을 그대로 옮겨 적어,
 * 문서·테스트·도구가 토큰을 다시 타이핑하지 않고 순회할 수 있게 합니다.
 * 둘을 함께 갱신하세요 — 스타일시트에만 있고 여기 없는 토큰은 아무도 찾지 못합니다.
 *
 * `name`은 커스텀 프로퍼티, `value`는 기본 테마에서 그것이 해석되는 리터럴입니다
 * (표에 쓰거나, 계산된 스타일을 읽을 수 없는 코드에서 참고하기 위한 값).
 * 스와치는 언제나 `var(name)`으로 그리고, `value`로 그리지 마세요.
 */

export interface Token {
  /** 커스텀 프로퍼티. 예: `--fm-vault` */
  name: string
  /** `.theme-fathomark`에서 해석되는 리터럴 값. */
  value: string
  /** 무엇에 쓰는지 — 이름을 다시 풀어 쓴 말이 아니라, 이 토큰이 존재하는 이유. */
  use: string
}

export interface TokenGroup {
  id: string
  title: string
  /** 표를 보기 전에 읽어야 할 한 문장. */
  description: string
  tokens: Token[]
}

export const surfaces: Token[] = [
  { name: "--fm-shell", value: "#14151f", use: "패널 그 자체." },
  { name: "--fm-panel", value: "#1a1b26", use: "컴포저, 칩, 시트 — 셸 위에 얹히는 것들." },
  { name: "--fm-card", value: "#171822", use: "대화 영역 안의 카드." },
  { name: "--fm-raised", value: "#1f2231", use: "호버, 눌림, 지금 실행 중인 툴 행." },
  { name: "--fm-scrim", value: "#0d0e15", use: "시트 뒤." },
]

export const lines: Token[] = [
  { name: "--fm-line", value: "#262a3d", use: "카드 테두리. 섹션을 가르는 선으로는 절대 쓰지 않습니다." },
  { name: "--fm-line-strong", value: "#3b4261", use: "컴포저, 포커스 외곽선, 점선 추가 버튼." },
]

export const textColors: Token[] = [
  { name: "--fm-text", value: "#c0caf5", use: "본문, 그리고 모델이 말하는 모든 것." },
  { name: "--fm-text-dim", value: "#a9b1d6", use: "카드 안의 보조 문장." },
  { name: "--fm-text-muted", value: "#8f97c0", use: "캡션, 도움말, 모노 카운터. CLI의 #565f89가 셸 위에서 4.5:1을 통과하지 못해 밝게 올린 값." },
  { name: "--fm-text-faint", value: "#565f89", use: "장식과 비활성 상태 전용 — 본문에는 쓰지 않습니다." },
]

/**
 * 이 UI에서 색은 둘 중 하나를 답합니다: *이건 어디서 왔는가?* 또는
 * *지금 런이 무엇을 하고 있는가?* 장식으로 칠하는 색은 없습니다.
 */
export interface EvidenceRole {
  id: "brand" | "vault" | "external" | "pending" | "error" | "ok"
  label: string
  /** 이 색이 답하는 질문. */
  meaning: string
  /** 나타나도 되는 자리. */
  appearsOn: string
  base: string
  tint?: string
  tintLine?: string
  /** 틴트 위에서 읽히는 텍스트 색. base를 그대로 쓰면 너무 튀는 경우에 씁니다. */
  text?: string
}

export const evidenceRoles: EvidenceRole[] = [
  {
    id: "brand",
    label: "브랜드 — 에이전트 자신",
    meaning: "증거가 아니라 에이전트가 행동하는 자리입니다.",
    appearsOn: "전송, 적용, 스트리밍 캐럿, 메모리 아이콘.",
    base: "--fm-brand",
    tint: "--fm-brand-tint",
    tintLine: "--fm-brand-tint-line",
    text: "--fm-brand-text",
  },
  {
    id: "vault",
    label: "Vault 증거",
    meaning: "사용자 자신의 노트에서 왔습니다.",
    appearsOn: "Vault 툴 행, 노트 칩, 인용, wikilink.",
    base: "--fm-vault",
    tint: "--fm-vault-tint",
    tintLine: "--fm-vault-tint-line",
  },
  {
    id: "external",
    label: "외부 증거",
    meaning: "이건 기기 밖으로 나갔습니다.",
    appearsOn: "Wikipedia 툴 행과 인용. 네트워크 읽기는 전부 눈에 띄게 파랗습니다.",
    base: "--fm-external",
    tint: "--fm-external-tint",
    tintLine: "--fm-external-tint-line",
  },
  {
    id: "pending",
    label: "미검증 · 대기",
    meaning: "아직 뒷받침이 없거나, 사용자를 기다리는 중입니다.",
    appearsOn: "근거 없는 주장, 출처 충돌, 예산 압박, NOT APPLIED.",
    base: "--fm-pending",
    tint: "--fm-pending-tint",
    tintLine: "--fm-pending-tint-line",
    text: "--fm-pending-text",
  },
  {
    id: "error",
    label: "실패",
    meaning: "런이 실패했습니다.",
    appearsOn: "실패 카드, Stop, 연결되지 않는 모델.",
    base: "--fm-error",
    tint: "--fm-error-tint",
    tintLine: "--fm-error-tint-line",
    text: "--fm-error-text",
  },
  {
    id: "ok",
    label: "연결됨",
    meaning: "모델이 응답합니다.",
    appearsOn: "모델 상태 줄의 점, 그리고 그 외에는 아무 데도.",
    base: "--fm-ok",
  },
]

export const diff: Token[] = [
  { name: "--fm-diff-added", value: "#243e4a", use: "삽입 미리보기에서 추가된 줄의 배경." },
  { name: "--fm-diff-added-text", value: "#a9dfc9", use: "추가된 줄의 글자." },
  { name: "--fm-diff-removed", value: "#4a272f", use: "삭제된 줄의 배경." },
  { name: "--fm-diff-removed-text", value: "#f7a3b1", use: "삭제된 줄의 글자." },
]

export const fonts: Token[] = [
  { name: "--fm-font-sans", value: '"Public Sans", ui-sans-serif, system-ui, sans-serif', use: "산문: 모델이 말하는 모든 것, 사람이 읽는 모든 라벨." },
  { name: "--fm-font-mono", value: '"IBM Plex Mono", ui-monospace, monospace', use: "기계값: 툴 이름, 토큰 수, 경로, 줄 범위, 런 id, 소요 시간." },
]

export const typeScale: Token[] = [
  { name: "--fm-size-title", value: "15px", use: "시트의 제목." },
  { name: "--fm-size-heading", value: "13px", use: "하위 화면 헤더의 화면 이름." },
  { name: "--fm-size-body", value: "13px", use: "모델이 말하는 모든 것. --fm-leading-body와 함께 씁니다." },
  { name: "--fm-size-label", value: "12.5px", use: "컨트롤 라벨, 파일명, 목록 행." },
  { name: "--fm-size-note", value: "12px", use: "제목 아래 붙는 보조 문장." },
  { name: "--fm-size-caption", value: "11.5px", use: "섹션 제목, 도움말, 모노 툴 행." },
  { name: "--fm-size-micro", value: "10.5px", use: "배지, 그리고 크롬에 들어가는 모노 카운터." },
]

export const leading: Token[] = [
  { name: "--fm-leading-body", value: "1.62", use: "400px에서의 답변 산문." },
  { name: "--fm-leading-note", value: "1.5", use: "두세 줄짜리 설명." },
  { name: "--fm-leading-tight", value: "1.45", use: "카드 안의 도움말." },
]

export const space: Token[] = [
  { name: "--fm-space-1", value: "2px", use: "라벨과 그 아래 한 줄 사이." },
  { name: "--fm-space-2", value: "4px", use: "헤더 아이콘 버튼 사이." },
  { name: "--fm-space-3", value: "6px", use: "행 안에서: 점과 글자, 아이콘과 라벨." },
  { name: "--fm-space-4", value: "8px", use: "목록의 행 사이. 기본 간격." },
  { name: "--fm-space-5", value: "10px", use: "카드 패딩." },
  { name: "--fm-space-6", value: "12px", use: "패널 좌우 여백." },
  { name: "--fm-space-7", value: "16px", use: "시트 안 섹션 사이." },
]

export const radii: Token[] = [
  { name: "--fm-radius-badge", value: "6px", use: "상태 배지, 인용 칩." },
  { name: "--fm-radius-control", value: "8px", use: "아이콘 버튼, 컴포저 칩." },
  { name: "--fm-radius-card", value: "10px", use: "목록 행, 출처 카드." },
  { name: "--fm-radius-panel", value: "12px", use: "컴포저, 툴 활동 그룹." },
  { name: "--fm-radius-sheet", value: "16px", use: "하위 화면 시트." },
]

export const controls: Token[] = [
  { name: "--fm-control-xs", value: "22px", use: "행 안에 들어가는 제거 버튼." },
  { name: "--fm-control-sm", value: "28px", use: "컴포저 툴바의 칩." },
  { name: "--fm-control-md", value: "32px", use: "헤더 아이콘 버튼." },
  { name: "--fm-control-lg", value: "36px", use: "주요 동작." },
]

export const metrics: Token[] = [
  { name: "--fm-dot", value: "6px", use: "상태 점. 배지 안에서는 5px." },
  { name: "--fm-meter", value: "4px", use: "예산 바." },
  { name: "--fm-hairline", value: "1px", use: "패널 안 모든 테두리." },
  { name: "--fm-panel-width", value: "400px", use: "기준 폭. 레이아웃은 320–520px에서도 버텨야 합니다." },
  { name: "--fm-header-height", value: "44px", use: "모든 화면에서 고정." },
  { name: "--fm-gutter", value: "12px", use: "패널 본문의 좌우 패딩." },
]

export const tokenGroups: TokenGroup[] = [
  { id: "surfaces", title: "표면", description: "어두운 쪽에서 밝은 쪽으로 다섯 단계. 패널 안의 무엇도 이 다섯 중 하나가 아닌 면 위에 놓이지 않습니다.", tokens: surfaces },
  { id: "lines", title: "선", description: "테두리 전용. 패널 안에 구분선은 존재하지 않습니다.", tokens: lines },
  { id: "text", title: "글자", description: "네 가지 분위기가 아니라, 네 단계의 주목도입니다.", tokens: textColors },
  { id: "diff", title: "Diff", description: "삽입 미리보기 한 화면에서만 쓰고, 다른 어디에서도 쓰지 않습니다.", tokens: diff },
  { id: "fonts", title: "서체", description: "두 개의 목소리: 산문, 그리고 기계값.", tokens: fonts },
  { id: "type", title: "타입 스케일", description: "일곱 단계. 컴포넌트에 박힌 px 리터럴은 아무도 합의하지 않은 크기입니다.", tokens: typeScale },
  { id: "leading", title: "행간", description: "400px의 산문은 데스크톱 단보다 더 많은 공기가 필요합니다.", tokens: leading },
  { id: "space", title: "여백", description: "2–16px 스케일. 패널이 좁아서, 큰 간격은 여유가 아니라 깨진 레이아웃으로 읽힙니다.", tokens: space },
  { id: "radii", title: "반경", description: "반경은 크기를 나타냅니다 — 면이 클수록 모서리가 둥급니다.", tokens: radii },
  { id: "controls", title: "컨트롤 높이", description: "네 가지 높이. 상호작용하는 것은 전부 이 중 하나입니다.", tokens: controls },
  { id: "metrics", title: "패널 기하", description: "셸에서 고정된 부분들.", tokens: metrics },
]

/** 헤더 배지·컴포저·모델 상태 줄이 함께 읽는 런 상태 머신. */
export interface RunState {
  id: string
  badge: string | null
  /** 배지가 색을 빌려오는 증거 역할. */
  role: EvidenceRole["id"] | null
  aboveBudget: string
  sendSlot: string
}

export const runStates: RunState[] = [
  { id: "idle", badge: null, role: null, aboveBudget: "—", sendSlot: "전송" },
  { id: "preparing context", badge: "PREPARING", role: "vault", aboveBudget: "—", sendSlot: "Stop" },
  { id: "waiting for model", badge: "WAITING", role: "brand", aboveBudget: "—", sendSlot: "Stop" },
  { id: "streaming", badge: "STREAMING", role: "brand", aboveBudget: "—", sendSlot: "Stop" },
  { id: "executing tool", badge: "TOOL", role: "external", aboveBudget: "—", sendSlot: "Stop" },
  { id: "awaiting approval", badge: "NOT APPLIED", role: "pending", aboveBudget: "Discard · Apply", sendSlot: "— (하위 화면)" },
  { id: "complete", badge: "COMPLETE", role: "vault", aboveBudget: "Insert · Copy · Retry", sendSlot: "전송" },
  { id: "cancelled", badge: "CANCELLED", role: "error", aboveBudget: "—", sendSlot: "전송" },
  { id: "failed", badge: "FAILED", role: "error", aboveBudget: "—", sendSlot: "전송" },
]
