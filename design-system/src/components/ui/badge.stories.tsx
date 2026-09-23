import type { Meta, StoryObj } from "@storybook/react-vite"

import { Badge } from "#components/ui/badge"
import { evidenceRoles, runStates } from "#lib/tokens"

/**
 * 배지는 패널에 남은 유일한 대문자입니다.
 *
 * 나머지 — 섹션 제목, 버튼, 도움말 — 는 전부 문장형입니다. 단일 요소 위의 대문자 라벨은
 * 소음이기 때문입니다. 배지는 다릅니다. 배지는 데이터이고, 런이 보고하는 값이며, 상수처럼
 * 읽히는 것이 바로 요점입니다.
 *
 * 쓰임은 셋뿐입니다: 헤더의 런 상태, 산문 속 인용 번호, 모델 상태 줄의 `LOCAL`.
 */
const meta = {
  title: "Components/Badge",
  tags: ["autodocs"],
  component: Badge,
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

const badgeClass = "tw:rounded-fm-badge tw:px-1.5 tw:text-fm-micro tw:font-semibold tw:tracking-[0.04em]"

/** 모든 런 상태를 각자의 증거 색으로. */
export const RunState: Story = {
  render: () => (
    <div className="tw:flex tw:flex-wrap tw:gap-1.5">
      {runStates
        .filter((s) => s.badge)
        .map((s) => {
          const role = evidenceRoles.find((r) => r.id === s.role)
          return (
            <Badge
              key={s.id}
              variant="outline"
              className={badgeClass}
              style={{
                color: `var(${role?.text ?? role?.base})`,
                background: `var(${role?.tint})`,
                borderColor: `var(${role?.tintLine})`,
              }}
            >
              <span
                className="tw:size-1.5 tw:rounded-full"
                style={{ background: `var(${role?.base})` }}
                aria-hidden="true"
              />
              {s.badge}
            </Badge>
          )
        })}
    </div>
  ),
}

/**
 * 인용 칩. 색이 그 주장의 출처를 말하기 때문에, 독자는 출처 목록을 열지 않고도 이 런이
 * 기기 밖으로 나갔는지 알 수 있습니다.
 */
export const Citation: Story = {
  render: () => (
    <p className="tw:text-fm-body tw:leading-[var(--fm-leading-body)] tw:text-fm-text">
      Your own harness notes split the budget into five shares{" "}
      <Badge
        variant="outline"
        className={`${badgeClass} tw:h-[17px] tw:border-fm-vault-line tw:bg-fm-vault-tint tw:text-fm-vault`}
      >
        <span className="tw:size-1 tw:rounded-full tw:bg-fm-vault" aria-hidden="true" />
        1,2
      </Badge>{" "}
      while general usage counts the response inside one window{" "}
      <Badge
        variant="outline"
        className={`${badgeClass} tw:h-[17px] tw:border-fm-external-line tw:bg-fm-external-tint tw:text-fm-external`}
      >
        <span className="tw:size-1 tw:rounded-full tw:bg-fm-external" aria-hidden="true" />3
      </Badge>
      .
    </p>
  ),
}

/** 모델 상태 줄. `LOCAL`은 프라이버시에 대한 주장이라, 암시하지 않고 명시합니다. */
export const ModelLine: Story = {
  render: () => (
    <div className="tw:flex tw:items-center tw:gap-1.5">
      <span className="tw:size-1.5 tw:shrink-0 tw:rounded-full tw:bg-fm-ok" aria-hidden="true" />
      <span className="tw:truncate tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">
        llama3.1:8b · localhost:11434
      </span>
      <span className="tw:flex-1" />
      <Badge
        variant="outline"
        className={`${badgeClass} tw:border-fm-vault-line tw:bg-fm-vault-tint tw:text-fm-vault`}
      >
        LOCAL
      </Badge>
    </div>
  ),
}
