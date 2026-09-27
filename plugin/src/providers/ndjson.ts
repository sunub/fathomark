export async function* decodeNdjson(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncIterable<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const onAbort = () => {
    void reader.cancel(signal.reason)
  }
  signal.addEventListener("abort", onAbort, { once: true })

  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line.trim()) yield parseLine(line)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) yield parseLine(buffer)
    signal.throwIfAborted()
  } finally {
    signal.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch (error) {
    throw new Error(
      `Invalid NDJSON from the local provider: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
