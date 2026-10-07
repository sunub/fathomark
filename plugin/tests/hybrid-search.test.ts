import { describe, expect, it } from "vitest"

import type { Embedder } from "../src/providers/ollama-embedder"
import { VectorIndex } from "../src/retrieval/vector-index"
import type { EvidenceJudge } from "../src/providers/ollama-judge"
import { isAnswerChunk, missingLatinTerms, searchHybrid } from "../src/tools/hybrid-search"
import { fakeEmbedder } from "./support/fake-embedder"

const signal = new AbortController().signal

function vaultOf(notes: Record<string, string>) {
  return {
    listNotes: () => Object.keys(notes).map((path) => ({ path, title: path.replace(/\.md$/, "") })),
    readNote: async (path: string) => notes[path] ?? null,
  }
}

async function indexed(notes: Record<string, string>, embedder: Embedder = fakeEmbedder()) {
  const vault = vaultOf(notes)
  const index = new VectorIndex(embedder)
  await index.sync(vault, signal)
  return { vault, semantic: { index, embedder } }
}

describe("searchHybrid", () => {
  it("returns the keyword result unchanged without a semantic backend", async () => {
    const vault = vaultOf({ "a.md": "캐시 도입 사례" })
    const result = await searchHybrid(vault, "캐시 도입", 5, signal)
    expect(result.references.map((item) => item.path)).toEqual(["a.md"])
    expect(result.supported).toBe(true)
  })

  it("falls back to the keyword result while the index is empty", async () => {
    const vault = vaultOf({ "a.md": "캐시 도입 사례" })
    const embedder = fakeEmbedder()
    const result = await searchHybrid(vault, "캐시 도입", 5, signal, undefined, { index: new VectorIndex(embedder), embedder })
    expect(result.references.map((item) => item.path)).toEqual(["a.md"])
  })

  it("falls back and says why when the embedder fails", async () => {
    const { vault, semantic } = await indexed({ "a.md": "캐시 도입 사례" })
    const broken: Embedder = { model: "fake-embed", embed: async () => Promise.reject(new Error("connection refused")) }
    const result = await searchHybrid(vault, "캐시 도입", 5, signal, undefined, { ...semantic, embedder: broken })
    expect(result.references.map((item) => item.path)).toEqual(["a.md"])
    expect(result.omitted.join(" ")).toContain("connection refused")
  })

  it("lets a Stop through instead of reporting it as an embedder failure", async () => {
    const { vault, semantic } = await indexed({ "a.md": "캐시 도입 사례" })
    const controller = new AbortController()
    const aborting: Embedder = {
      model: "fake-embed",
      embed: async () => {
        controller.abort()
        throw new Error("aborted")
      },
    }
    await expect(
      searchHybrid(vault, "캐시 도입", 5, controller.signal, undefined, { ...semantic, embedder: aborting })
    ).rejects.toThrow()
  })

  it("finds a note the keywords miss, using its closest chunk as the excerpt", async () => {
    // No query word appears in "b.md", but the characters overlap enough for the fake embedder.
    const { vault, semantic } = await indexed({
      "a.md": "zzz qqq xxx",
      "b.md": "도입한 캐시 사례를 정리했다",
    })
    const result = await searchHybrid(vault, "캐시도입사례", 5, signal, undefined, semantic)
    expect(result.references[0]?.path).toBe("b.md")
    expect(result.references[0]?.excerpt).toBe("도입한 캐시 사례를 정리했다")
  })

  it("ranks an experience note first on a near tie", async () => {
    const { vault, semantic } = await indexed({
      "의견.md": "캐시 도입 사례",
      "경험/기록.md": "캐시 도입 사례",
    })
    const result = await searchHybrid(vault, "캐시 도입 사례", 2, signal, { folder: "경험" }, semantic)
    expect(result.references.map((item) => item.path)).toEqual(["경험/기록.md", "의견.md"])
  })

  it("reports unsupported when the closest experience note is below the similarity threshold", async () => {
    const { vault, semantic } = await indexed({ "경험/기록.md": "zzz qqq xxx www" })
    const result = await searchHybrid(vault, "캐시 도입 사례", 5, signal, { folder: "경험" }, semantic)
    expect(result.supported).toBe(false)
    expect(result.reason).toBe("below_threshold")
  })

  it("judges support by experience notes only, even when an opinion note is closer", async () => {
    const { vault, semantic } = await indexed({
      "의견.md": "캐시 도입 사례",
      "경험/기록.md": "zzz qqq xxx www",
    })
    const result = await searchHybrid(vault, "캐시 도입 사례", 5, signal, { folder: "경험" }, semantic)
    expect(result.supported).toBe(false)
  })

  it("is supported when an experience note is close and every Latin term is in the notes", async () => {
    const { vault, semantic } = await indexed({ "경험/기록.md": "Redis 캐시 도입 사례" })
    const result = await searchHybrid(vault, "Redis 캐시 도입 사례", 5, signal, { folder: "경험" }, semantic)
    expect(result.supported).toBe(true)
  })

  it("blocks a question that names a tool no experience note mentions", async () => {
    const { vault, semantic } = await indexed({ "경험/기록.md": "캐시 도입 사례를 정리했다" })
    const result = await searchHybrid(vault, "Kafka 캐시 도입 사례", 5, signal, { folder: "경험" }, semantic)
    expect(result.supported).toBe(false)
  })

  it("returns at most `limit` references", async () => {
    const { vault, semantic } = await indexed({ "a.md": "캐시 하나", "b.md": "캐시 둘", "c.md": "캐시 셋" })
    expect((await searchHybrid(vault, "캐시", 2, signal, undefined, semantic)).references).toHaveLength(2)
  })
})

describe("searchHybrid with an evidence judge", () => {
  function judging(accept: (excerpt: string) => boolean, asked: string[] = []): EvidenceJudge {
    return {
      model: "fake-judge",
      async supports(_question, excerpt) {
        asked.push(excerpt)
        return accept(excerpt)
      },
    }
  }
  const notes = {
    "경험/계획.md": "캐시 도입 사례를 앞으로 정리하고 싶다",
    "경험/기록.md": "캐시를 도입해 응답을 줄였다",
  }

  it("ranks the notes the judge confirms first and reports the question supported", async () => {
    const { vault, semantic } = await indexed(notes)
    for (const [marker, path] of [["줄였다", "경험/기록.md"], ["싶다", "경험/계획.md"]] as const) {
      const result = await searchHybrid(vault, "캐시 도입 사례", 5, signal, { folder: "경험" }, {
        ...semantic,
        judge: judging((excerpt) => excerpt.includes(marker)),
      })
      expect(result.supported).toBe(true)
      expect(result.references[0]?.path).toBe(path)
    }
  })

  it("reports the question unsupported when the judge confirms no note, however close the text", async () => {
    const { vault, semantic } = await indexed(notes)
    const result = await searchHybrid(vault, "캐시 도입 사례", 5, signal, { folder: "경험" }, { ...semantic, judge: judging(() => false) })
    expect(result.supported).toBe(false)
    expect(result.references.length).toBeGreaterThan(0)
  })

  it("does not ask the judge when the Latin-term gate already rules the question out", async () => {
    const { vault, semantic } = await indexed(notes)
    const asked: string[] = []
    const result = await searchHybrid(vault, "Kafka 캐시 도입 사례", 5, signal, { folder: "경험" }, {
      ...semantic,
      judge: judging(() => true, asked),
    })
    expect(result.supported).toBe(false)
    expect(asked).toEqual([])
  })

  it("falls back to the similarity threshold and says why when the judge fails", async () => {
    const { vault, semantic } = await indexed(notes)
    const broken: EvidenceJudge = { model: "broken", supports: async () => Promise.reject(new Error("model missing")) }
    const result = await searchHybrid(vault, "캐시 도입 사례", 5, signal, { folder: "경험" }, { ...semantic, judge: broken })
    expect(result.omitted.some((line) => line.startsWith("evidence judge unavailable"))).toBe(true)
  })

  it("passes a Stop through instead of falling back", async () => {
    const { vault, semantic } = await indexed(notes)
    const controller = new AbortController()
    const stopping: EvidenceJudge = {
      model: "stopping",
      async supports() {
        controller.abort()
        throw new Error("aborted")
      },
    }
    await expect(
      searchHybrid(vault, "캐시 도입 사례", 5, controller.signal, { folder: "경험" }, { ...semantic, judge: stopping })
    ).rejects.toThrow()
  })
})

describe("isAnswerChunk", () => {
  it("rejects a chunk that is mostly application-form question lines", () => {
    expect(isAnswerChunk("협업을 통해 갈등을 극복했던 경험을 작성해주세요. (최소 100자, 최대 500자 입력가능)")).toBe(false)
    expect(isAnswerChunk("* 최대 1,000자 이내로 작성해주세요.")).toBe(false)
    expect(isAnswerChunk("가장 어려웠던 문제는 무엇인가요?")).toBe(false)
  })

  it("keeps an answer that follows its question", () => {
    const answer = "팀원과 API 명세가 자꾸 어긋나서 Zod 스키마를 공용 패키지로 만들고, 양쪽이 같은 스키마로 응답을 검증하도록 바꿨습니다."
    expect(isAnswerChunk(`협업 경험을 작성해주세요.\n${answer}`)).toBe(true)
  })

  it("rejects an empty chunk", () => {
    expect(isAnswerChunk("  \n ")).toBe(false)
  })
})

describe("missingLatinTerms", () => {
  const notes = [{ chunks: [{ text: "Zod 와 Node.js 사용, 부스트캠프 bootcamp" }] }]

  it("returns the Latin words absent from every note", () => {
    expect(missingLatinTerms("Kafka 로 Zod 를 썼나요?", notes)).toEqual(["kafka"])
  })

  it("matches whole words, so boot is not found inside bootcamp", () => {
    expect(missingLatinTerms("Spring Boot 경험", notes)).toEqual(["spring", "boot"])
  })

  it("ignores case and a sentence-ending dot", () => {
    expect(missingLatinTerms("node.js 와 ZOD.", notes)).toEqual([])
  })

  it("ignores words shorter than three characters and questions without Latin words", () => {
    expect(missingLatinTerms("AI 도입", notes)).toEqual([])
    expect(missingLatinTerms("캐시 도입", notes)).toEqual([])
  })
})
