import { describe, expect, it } from "vitest"

import type { EditorTarget } from "../src/context/insertion"
import { prepareCareerRequest } from "../src/workflow/request"

const target: EditorTarget = {
  id: "selection", path: "note.md", text: "선택 문단", selection: "선택 문단",
  from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 },
}

describe("prepareCareerRequest", () => {
  it("rejects an empty request and asks for an explicit intent even with a selection", () => {
    expect(prepareCareerRequest({ instruction: "  ", intent: null, target })).toEqual({
      status: "invalid", reason: "empty_instruction",
    })
    expect(prepareCareerRequest({ instruction: "작성", intent: null, target })).toMatchObject({
      status: "needs_user", missing: "intent",
    })
  })

  it("requires a question for drafts and does not interpret a selected paragraph as revision", () => {
    expect(prepareCareerRequest({ instruction: "작성", intent: "draft", target })).toMatchObject({
      status: "needs_user", missing: "application_question",
    })
    expect(prepareCareerRequest({
      instruction: " 작성 ", intent: "draft", applicationQuestion: " 협업 경험 ", target,
    })).toEqual({ status: "ready", request: {
      kind: "draft", instruction: "작성", applicationQuestion: "협업 경험",
    } })
  })

  it("preserves the explicit selection snapshot", () => {
    const result = prepareCareerRequest({
      instruction: " 수정 ", intent: "revise", revisionCriteria: " 간결하게 ", target,
    })
    expect(result).toEqual({ status: "ready", request: {
      kind: "revise", instruction: "수정", revisionCriteria: "간결하게", target,
    } })
    if (result.status === "ready" && result.request.kind === "revise") {
      expect(result.request.target).toBe(target)
    }
  })

  it("resolves the target automatically only after revision criteria are available", () => {
    expect(prepareCareerRequest({ instruction: "수정", intent: "revise", target: null })).toMatchObject({
      status: "needs_user", missing: "revision_criteria",
    })
    for (const selection of [null, { ...target, selection: "  " }]) {
      expect(prepareCareerRequest({
        instruction: "협업 부분 수정", intent: "revise", revisionCriteria: "구체화", target: selection,
      })).toEqual({ status: "resolve_target", instruction: "협업 부분 수정", revisionCriteria: "구체화" })
    }
  })
})
