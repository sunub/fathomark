import type { Meta, StoryObj } from "@storybook/react-vite"
import { FileTextIcon } from "lucide-react"

import { Bubble, BubbleContent, BubbleGroup } from "#components/ui/bubble"

/**
 * 코필럿에서 질문은 말풍선이고 답변은 아닙니다.
 *
 * 400px에서 말풍선은 좌우 패딩으로 약 24px를 쓰고 최대 폭이 80%로 묶이는데, 그러면
 * 답변 산문이 한 줄에 40자 정도로 떨어집니다. 그래서 어시스턴트 턴은 `ghost`를 씁니다
 * — 전체 폭, 채움 없음 — 그리고 사용자 턴만 틴트를 씁니다. 이 비대칭은 의도된
 * 것입니다. 이 패널은 짧은 질문 하나가 길고 출처가 붙은 답변을 만나는 자리입니다.
 */
const meta = {
  title: "Components/Bubble",
  tags: ["autodocs"],
  component: Bubble,
  parameters: {
    docs: {
      description: {
        component:
          "질문은 `tinted`, 오른쪽 정렬. 답변은 `ghost`, 전체 폭. 반대로는 절대 쓰지 않습니다.",
      },
    },
  },
} satisfies Meta<typeof Bubble>

export default meta
type Story = StoryObj<typeof meta>

/** 사용자가 물은 것, 그리고 함께 보내진 컨텍스트. */
export const Question: Story = {
  render: () => (
    <BubbleGroup>
      <Bubble variant="tinted" align="end">
        <BubbleContent>
          Does my budgeting approach match how token budgets are normally described?
        </BubbleContent>
      </Bubble>
      <span className="tw:flex tw:items-center tw:gap-1.5 tw:self-end tw:text-fm-micro tw:text-fm-text-muted">
        <FileTextIcon className="tw:size-3 tw:text-fm-vault" aria-hidden="true" />
        Retrieval budgeting.md · selection
      </span>
    </BubbleGroup>
  ),
}

/**
 * 답변. `ghost`는 채움과 패딩을 걷어내서 산문이 `--fm-size-body` /
 * `--fm-leading-body`로 패널 전체 폭을 쓰게 합니다.
 */
export const Answer: Story = {
  render: () => (
    <BubbleGroup>
      <Bubble variant="ghost">
        <BubbleContent className="tw:text-fm-body tw:leading-[var(--fm-leading-body)]">
          Your note treats the budget as one ceiling. Your own harness notes split it
          into instructions, evidence, history, tool schemas and an output reserve
          <span className="tw:mx-0.5 tw:inline-flex tw:h-[17px] tw:items-center tw:gap-1 tw:rounded-fm-badge tw:border tw:border-fm-vault-line tw:bg-fm-vault-tint tw:px-1.5 tw:align-baseline tw:text-fm-micro tw:font-semibold tw:text-fm-vault">
            <span className="tw:size-1 tw:rounded-full tw:bg-fm-vault" aria-hidden="true" />
            1,2
          </span>{" "}
          so a long tool result can never crowd out the reply.
        </BubbleContent>
      </Bubble>
    </BubbleGroup>
  ),
}

/** 대화 영역이 실제로 그리는 모습, 질문과 답변 한 쌍. */
export const Turn: Story = {
  render: () => (
    <div className="tw:flex tw:flex-col tw:gap-3">
      <BubbleGroup>
        <Bubble variant="tinted" align="end">
          <BubbleContent>
            Does my budgeting approach match how token budgets are normally described?
          </BubbleContent>
        </Bubble>
        <span className="tw:flex tw:items-center tw:gap-1.5 tw:self-end tw:text-fm-micro tw:text-fm-text-muted">
          <FileTextIcon className="tw:size-3 tw:text-fm-vault" aria-hidden="true" />
          Retrieval budgeting.md · selection
        </span>
      </BubbleGroup>
      <BubbleGroup>
        <Bubble variant="ghost">
          <BubbleContent className="tw:text-fm-body tw:leading-[var(--fm-leading-body)]">
            Your note treats the budget as one ceiling. Your own harness notes split it
            into instructions, evidence, history, tool schemas and an output reserve, so
            a long tool result can never crowd out the reply.
          </BubbleContent>
        </Bubble>
      </BubbleGroup>
    </div>
  ),
}

/**
 * 답변이 왜 말풍선이 아닌지. 위는 틴트 말풍선이 400px에서 줄당 글자수에 하는 일이고,
 * 아래가 실제로 쓰는 `ghost`입니다.
 */
export const WhyGhost: Story = {
  name: "왜 ghost인가 (비교)",
  render: () => (
    <div className="tw:flex tw:flex-col tw:gap-4">
      <div className="tw:flex tw:flex-col tw:gap-1.5">
        <span className="tw:text-fm-caption tw:font-semibold tw:text-fm-error">하지 말 것 — 틴트 답변</span>
        <BubbleGroup>
          <Bubble variant="tinted">
            <BubbleContent className="tw:text-fm-body tw:leading-[var(--fm-leading-body)]">
              Your note treats the budget as one ceiling. Your own harness notes split it
              into instructions, evidence, history, tool schemas and an output reserve.
            </BubbleContent>
          </Bubble>
        </BubbleGroup>
      </div>
      <div className="tw:flex tw:flex-col tw:gap-1.5">
        <span className="tw:text-fm-caption tw:font-semibold tw:text-fm-vault">할 것 — ghost 답변</span>
        <BubbleGroup>
          <Bubble variant="ghost">
            <BubbleContent className="tw:text-fm-body tw:leading-[var(--fm-leading-body)]">
              Your note treats the budget as one ceiling. Your own harness notes split it
              into instructions, evidence, history, tool schemas and an output reserve.
            </BubbleContent>
          </Bubble>
        </BubbleGroup>
      </div>
    </div>
  ),
}
