import type { Meta, StoryObj } from "@storybook/react-vite"
import { CheckIcon, GlobeIcon, LoaderIcon, SearchIcon } from "lucide-react"

import { Marker, MarkerContent, MarkerIcon } from "#components/ui/marker"

/**
 * 마커 하나가 툴 호출 하나입니다.
 *
 * "툴 활동은 호출당 한 번 나타나고 절대 어시스턴트 산문이 되지 않는다"는 제품의 약속을
 * 지키는 컴포넌트입니다. 마커 안의 모든 것은 모노입니다 — 툴 이름도, 인자도, 반환값도
 * 말해진 것이 아니라 측정된 것이기 때문입니다.
 *
 * 아이콘 색은 증거 색입니다. Vault 읽기는 초록, 기기 밖으로 나간 것은 파랑. 사용자는 한
 * 글자도 읽지 않고 이 런이 네트워크를 건드렸는지 알 수 있습니다.
 */
const meta = {
  title: "Components/Marker",
  tags: ["autodocs"],
  component: Marker,
} satisfies Meta<typeof Marker>

export default meta
type Story = StoryObj<typeof meta>

function ToolRow({
  name,
  arg,
  result,
  tone = "vault",
  running = false,
}: {
  name: string
  arg: string
  result: string
  tone?: "vault" | "external"
  running?: boolean
}) {
  const ring = tone === "vault" ? "tw:border-fm-vault-line tw:bg-fm-vault-tint" : "tw:border-fm-external-line tw:bg-fm-external-tint"
  const ink = tone === "vault" ? "text-fm-vault" : "text-fm-external"

  return (
    <Marker className="tw:px-2.5 tw:py-2">
      <MarkerIcon className={`tw:flex tw:size-4 tw:items-center tw:justify-center tw:rounded-[5px] tw:border ${ring}`}>
        {running ? (
          <LoaderIcon className={`tw:size-2.5 tw:animate-spin ${ink}`} />
        ) : (
          <CheckIcon className={`tw:size-2.5 ${ink}`} />
        )}
      </MarkerIcon>
      <MarkerContent className="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2 tw:font-fm-mono tw:text-fm-caption">
        <span className="tw:text-fm-text-dim">{name}</span>
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-fm-text-faint">{arg}</span>
        <span className={`tw:shrink-0 tw:text-fm-micro ${running ? ink : "tw:text-fm-text-muted"}`}>{result}</span>
      </MarkerContent>
    </Marker>
  )
}

/** 끝난 vault 읽기. */
export const VaultTool: Story = {
  render: () => <ToolRow name="read_note" arg="Agent/Harness notes.md" result="1.8k tok" />,
}

/** 진행 중인 네트워크 읽기. 파랑이고, 혼자 도는 스피너 대신 running이라고 적습니다. */
export const ExternalTool: Story = {
  render: () => (
    <ToolRow name="wikipedia_search" arg='"context window"' result="running" tone="external" running />
  ),
}

/**
 * 대화 영역에 나타나는 그룹 전체: 제목 행, 그리고 호출당 마커 한 줄. 제목 아래 구분선은
 * 없습니다 — 여기서 유일한 선은 카드 자신의 테두리입니다.
 */
export const ToolActivity: Story = {
  render: () => (
    <div className="tw:overflow-hidden tw:rounded-fm-panel tw:border tw:border-fm-line tw:bg-fm-card">
      <div className="tw:flex tw:items-center tw:gap-2 tw:px-2.5 tw:pt-2.5 tw:pb-1">
        <SearchIcon className="tw:size-3.5 tw:text-fm-text-muted" aria-hidden="true" />
        <span className="tw:flex-1 tw:text-fm-caption tw:font-semibold tw:text-fm-text-muted">Tool activity</span>
        <span className="tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">3 calls</span>
      </div>
      <ToolRow name="search_vault" arg='"context budget"' result="7 hits" />
      <ToolRow name="read_note" arg="Agent/Harness notes.md" result="1.8k tok" />
      <div className="tw:bg-fm-raised">
        <ToolRow name="wikipedia_search" arg='"context window"' result="running" tone="external" running />
      </div>
    </div>
  ),
}

/** 긴 대화에서 런과 런 사이에 쓰는 `separator` variant. */
export const RunSeparator: Story = {
  render: () => (
    <Marker variant="separator">
      <MarkerContent className="tw:text-fm-micro">
        <GlobeIcon className="tw:mr-1 tw:inline tw:size-3 tw:align-[-2px]" aria-hidden="true" />
        14:02 · new run
      </MarkerContent>
    </Marker>
  ),
}
