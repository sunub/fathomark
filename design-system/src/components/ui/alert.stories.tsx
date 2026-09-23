import type { Meta, StoryObj } from "@storybook/react-vite"
import { AlertCircleIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "#components/ui/alert"
import { Button } from "#components/ui/button"

/**
 * 여기서 알림은 사라지지 않고, 언제나 다음 걸음을 제안합니다.
 *
 * 이 제품은 토스트를 쓰지 않습니다. 사용자가 마침 보고 있지 않았던 실패는 본 적 없는
 * 실패입니다. 모든 알림은 같은 세 박자를 따릅니다 — 살아남은 것을 말하고, 더 좁은
 * 재시도를 제안하고, 컴포저를 살려둡니다.
 *
 * 실패는 *런*의 상태이지 패널의 상태가 아닙니다. 아래 어느 것도 입력을 막지 않고,
 * 버튼이 무엇을 제안하는지만 바꿉니다.
 */
const meta = {
  title: "Components/Alert",
  tags: ["autodocs"],
  component: Alert,
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

/** 모델에 닿지 않습니다. 질문과 컨텍스트는 살아 있고, 그 사실을 말해줍니다. */
export const ProviderOffline: Story = {
  render: () => (
    <Alert
      variant="destructive"
      className="tw:border-fm-error-line tw:bg-fm-error-tint tw:text-fm-error-text"
    >
      <WifiOffIcon />
      <AlertTitle>The local model is not answering</AlertTitle>
      <AlertDescription className="tw:text-fm-text-dim">
        Nothing reached <code className="tw:font-fm-mono tw:text-fm-caption tw:text-fm-text">localhost:11434</code>.
        Your question and its context are kept.
        <div className="tw:mt-2 tw:flex tw:gap-1.5">
          <Button size="sm" className="tw:bg-fm-error tw:text-fm-error-tint tw:hover:bg-fm-error/80">
            Retry run
          </Button>
          <Button size="sm" variant="outline" className="tw:border-fm-error-line tw:text-fm-error-text">
            Check model setup
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  ),
}

/**
 * 예산 소진. 오류가 아닙니다 — 망가진 것이 없습니다 — 그래서 pending 색을 쓰고,
 * 해결책은 조언이 아니라 동작으로 제시합니다.
 */
export const BudgetFull: Story = {
  render: () => (
    <Alert className="tw:border-fm-pending-line tw:bg-fm-pending-tint">
      <TriangleAlertIcon className="tw:text-fm-pending" />
      <AlertTitle className="tw:text-fm-pending-text">Context budget is full</AlertTitle>
      <AlertDescription className="tw:text-fm-text-dim">
        The evidence for this question does not fit alongside the note and the output
        reserve.
        <div className="tw:mt-2 tw:flex tw:items-center tw:gap-2">
          <span className="tw:flex tw:h-1.5 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-fm-line">
            <span className="tw:w-[26%] tw:bg-fm-brand" />
            <span className="tw:w-[52%] tw:bg-fm-vault" />
            <span className="tw:w-[22%] tw:bg-fm-pending" />
          </span>
          <span className="tw:font-fm-mono tw:text-fm-micro tw:text-fm-pending">8k / 8k</span>
        </div>
        <div className="tw:mt-2 tw:flex tw:gap-1.5">
          <Button size="sm" className="tw:bg-fm-pending tw:text-fm-pending-tint tw:hover:bg-fm-pending/80">
            Use selection only
          </Button>
          <Button size="sm" variant="outline" className="tw:border-fm-pending-line tw:text-fm-pending-text">
            Drop 3 sources
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  ),
}

/**
 * 출처 충돌. 이건 실패가 전혀 아니고, 제품이 제대로 동작하고 있다는 뜻입니다.
 * Vault 증거는 사용자의 프로젝트를, 외부 증거는 일반적인 사실을 관장합니다. 둘이
 * 어긋나면 하나를 고르는 대신 양쪽을 다 보여줍니다.
 */
export const SourceConflict: Story = {
  render: () => (
    <Alert className="tw:border-fm-pending-line tw:bg-fm-pending-tint">
      <AlertCircleIcon className="tw:text-fm-pending" />
      <AlertTitle className="tw:text-fm-pending-text">Sources disagree</AlertTitle>
      <AlertDescription className="tw:text-fm-text-dim">
        <span className="tw:mt-1 tw:flex tw:gap-2">
          <span className="tw:w-[3px] tw:shrink-0 tw:rounded-full tw:bg-fm-vault" aria-hidden="true" />
          <span className="tw:text-fm-note tw:leading-[var(--fm-leading-note)]">
            <strong className="tw:font-semibold tw:text-fm-vault">Your vault:</strong> the output
            reserve sits outside the evidence budget.
          </span>
        </span>
        <span className="tw:mt-1.5 tw:flex tw:gap-2">
          <span className="tw:w-[3px] tw:shrink-0 tw:rounded-full tw:bg-fm-external" aria-hidden="true" />
          <span className="tw:text-fm-note tw:leading-[var(--fm-leading-note)]">
            <strong className="tw:font-semibold tw:text-fm-external">Wikipedia:</strong> the response
            is counted inside the same window.
          </span>
        </span>
        <span className="tw:mt-2 tw:block tw:text-fm-caption tw:text-fm-text-muted">
          Both kept. Your vault governs your project; Wikipedia governs general facts.
        </span>
      </AlertDescription>
    </Alert>
  ),
}

/** 근거 없는 주장. 각주에 숨기지 않고 답변 안에 그 자리에서 표시합니다. */
export const UnsupportedClaim: Story = {
  render: () => (
    <div className="tw:rounded-r-fm-card tw:border-l-2 tw:border-fm-pending tw:bg-fm-pending-tint tw:px-2.5 tw:py-2">
      <p className="tw:text-fm-note tw:leading-[var(--fm-leading-note)] tw:text-fm-pending-text">
        <strong className="tw:font-semibold tw:text-fm-pending">Not supported by a source.</strong> A
        10% safety margin is a reasonable default, but no note or page in this run states it.
      </p>
    </div>
  ),
}
