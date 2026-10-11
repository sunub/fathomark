import type { EditorTarget } from "../context/insertion";

export interface CareerRequestInput {
  readonly instruction: string;
  readonly intent: "draft" | "revise" | null;
  readonly applicationQuestion?: string;
  readonly revisionCriteria?: string;
  readonly target: EditorTarget | null;
}

export type PreparedCareerRequest =
  | {
    readonly kind: "draft";
    readonly instruction: string;
    readonly applicationQuestion: string;
  }
  | {
    readonly kind: "revise";
    readonly instruction: string;
    readonly revisionCriteria: string;
    readonly target: EditorTarget;
  };

const QUESTIONS = {
  intent: "새 글을 작성할까요, 선택한 문단을 수정할까요?",
  application_question: "작성하려는 지원 문항을 알려주세요.",
  revision_criteria: "어떤 기준으로 문단을 수정할까요?",
} as const;

type MissingField = keyof typeof QUESTIONS;

export type PrepareRequestResult =
  | { readonly status: "ready"; readonly request: PreparedCareerRequest }
  | {
      readonly status: "resolve_target";
      readonly instruction: string;
      readonly revisionCriteria: string;
    }
  | {
    readonly status: "needs_user";
    readonly missing: MissingField;
    readonly question: string;
  }
  | { readonly status: "invalid"; readonly reason: "empty_instruction" };

function needsUser(missing: MissingField): Extract<PrepareRequestResult, { status: "needs_user" }> {
  return {
    status: "needs_user",
    missing,
    question: QUESTIONS[missing],
  };
}

export function prepareCareerRequest(input: CareerRequestInput): PrepareRequestResult {
  const instruction = input.instruction.trim();

  if (!instruction) {
    return { status: "invalid", reason: "empty_instruction" };
  }

  if (input.intent === null) {
    return needsUser("intent");
  }

  if (input.intent === "draft") {
    const applicationQuestion = input.applicationQuestion?.trim() ?? "";

    if (!applicationQuestion) {
      return needsUser("application_question");
    }

    return {
      status: "ready",
      request: { kind: "draft", instruction, applicationQuestion },
    };
  }

  const revisionCriteria = input.revisionCriteria?.trim() ?? "";

  if (!revisionCriteria) {
    return needsUser("revision_criteria");
  }

  const target = input.target;

  if (!target?.selection.trim()) {
    return { status: "resolve_target", instruction, revisionCriteria };
  }

  return {
    status: "ready",
    request: { kind: "revise", instruction, revisionCriteria, target },
  };
}
