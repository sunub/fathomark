import type { Meta, StoryObj } from "@storybook/react-vite"
import { ArrowUpRightIcon, FileTextIcon, GlobeIcon, XIcon } from "lucide-react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "#components/ui/attachment"

/**
 * Attachment은 이 패널의 일꾼입니다. 증거를 가리키는 것은 전부 Attachment입니다.
 *
 * 하나의 컴포넌트가 세 가지 일을 합니다 — 아이들 화면의 컨텍스트 칩, 답변 아래 번호가
 * 붙은 출처 카드, 그리고 메모리 시트의 행. 차이는 미디어 슬롯에 무엇이 들어가는지와
 * 액션이 있는지뿐입니다.
 *
 * `state` prop이 idle → uploading → processing → error를 이미 다루는데, 이는 큰 노트를
 * 읽는 중이거나 핀해둔 노트가 이름이 바뀌거나 삭제된 경우에 그대로 대응됩니다.
 */
const meta = {
  title: "Components/Attachment",
  tags: ["autodocs"],
  component: Attachment,
} satisfies Meta<typeof Attachment>

export default meta
type Story = StoryObj<typeof meta>

/** 현재 노트와 그 비용. 점은 vault 증거 색입니다. */
export const ContextChip: Story = {
  render: () => (
    <Attachment size="sm" className="tw:w-full tw:bg-fm-panel">
      <AttachmentMedia className="tw:size-auto tw:bg-transparent tw:p-0">
        <span className="tw:size-1.5 tw:rounded-full tw:bg-fm-vault" aria-hidden="true" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle className="tw:text-fm-label">Retrieval budgeting.md</AttachmentTitle>
      </AttachmentContent>
      <AttachmentActions>
        <span className="tw:pr-1 tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">1.2k tok</span>
      </AttachmentActions>
    </Attachment>
  ),
}

/** 답변 아래 번호가 붙은 출처. 번호는 브랜드 색이 아니라 증거 색을 씁니다. */
export const SourceCard: Story = {
  render: () => (
    <div className="tw:flex tw:flex-col tw:gap-1.5">
      <Attachment size="sm" className="tw:w-full">
        <AttachmentMedia className="tw:size-[18px] tw:rounded-md tw:border tw:border-fm-vault-line tw:bg-fm-vault-tint tw:font-fm-mono tw:text-[10px] tw:text-fm-vault">
          1
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle className="tw:text-fm-label">Agent/Harness notes.md</AttachmentTitle>
          <AttachmentDescription className="tw:font-fm-mono tw:text-fm-micro">
            § Budget split · L118–L146
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <ArrowUpRightIcon className="tw:size-3.5 tw:text-fm-text-muted" aria-hidden="true" />
        </AttachmentActions>
        <AttachmentTrigger aria-label="Open Agent/Harness notes.md at the Budget split heading" />
      </Attachment>

      <Attachment size="sm" className="tw:w-full">
        <AttachmentMedia className="tw:size-[18px] tw:rounded-md tw:border tw:border-fm-external-line tw:bg-fm-external-tint tw:font-fm-mono tw:text-[10px] tw:text-fm-external">
          2
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle className="tw:text-fm-label">Large language model — Wikipedia</AttachmentTitle>
          <AttachmentDescription className="tw:font-fm-mono tw:text-fm-micro">
            rev 1281994 · fetched 14:02
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <GlobeIcon className="tw:size-3.5 tw:text-fm-external" aria-hidden="true" />
        </AttachmentActions>
        <AttachmentTrigger aria-label="Open the Wikipedia page for Large language model" />
      </Attachment>
    </div>
  ),
}

/**
 * 메모리 행. 두 번째는 혼자서 예산을 많이 차지해서 pending 색을 달고 이유를 말합니다 —
 * 숫자만으로는 사용자가 무엇을 해야 할지 알 수 없습니다.
 */
export const MemoryRow: Story = {
  render: () => (
    <div className="tw:flex tw:flex-col tw:gap-2">
      <Attachment size="sm" className="tw:w-full">
        <AttachmentMedia className="tw:size-auto tw:bg-transparent tw:p-0">
          <span className="tw:size-1.5 tw:rounded-full tw:bg-fm-vault" aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle className="tw:text-fm-label">Project brief.md</AttachmentTitle>
        </AttachmentContent>
        <AttachmentActions className="tw:gap-1">
          <span className="tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">620</span>
          <AttachmentAction aria-label="Remove Project brief.md from memory">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>

      <Attachment size="sm" className="tw:w-full tw:border-fm-pending-line tw:bg-fm-pending-tint">
        <AttachmentMedia className="tw:size-auto tw:bg-transparent tw:p-0">
          <span className="tw:size-1.5 tw:rounded-full tw:bg-fm-pending" aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle className="tw:text-fm-label">Meeting log 2026.md</AttachmentTitle>
          <AttachmentDescription className="tw:text-fm-pending-text">
            Large — 4.4k of the budget on its own
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions className="tw:gap-1">
          <span className="tw:font-fm-mono tw:text-fm-micro tw:text-fm-pending">4.4k</span>
          <AttachmentAction aria-label="Remove Meeting log 2026.md from memory">
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </div>
  ),
}

/** Vault에서 일어나는 일에 대응시킨 상태들. `idle`은 점선 "노트 추가" 버튼입니다. */
export const States: Story = {
  render: () => (
    <div className="tw:flex tw:flex-col tw:gap-2">
      {(
        [
          ["uploading", "Reading Meeting log 2026.md"],
          ["processing", "Counting tokens"],
          ["error", "Glossary.md — no longer in the vault"],
        ] as const
      ).map(([state, label]) => (
        <Attachment key={state} size="sm" state={state} className="tw:w-full">
          <AttachmentMedia>
            <FileTextIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle className="tw:text-fm-label">{label}</AttachmentTitle>
            <AttachmentDescription className="tw:font-fm-mono tw:text-fm-micro">{state}</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ))}
    </div>
  ),
}
