import type { PluginInput } from "@opencode-ai/plugin"
import { computeLineHash } from "../../tools/hashline-edit/hash-computation"

const WRITE_SUCCESS_MARKER = "File written successfully."


const COLON_READ_LINE_PATTERN = /^\s*(\d+): ?(.*)$/
const PIPE_READ_LINE_PATTERN = /^\s*(\d+)\| ?(.*)$/
const CONTENT_OPEN_TAG = "<content>"
const CONTENT_CLOSE_TAG = "</content>"
const FILE_OPEN_TAG = "<file>"
const FILE_CLOSE_TAG = "</file>"
const OPENCODE_LINE_TRUNCATION_SUFFIX = "... (line truncated to 2000 chars)"

function isReadTool(toolName: string): boolean {
  return toolName.toLowerCase() === "read"
}

function isWriteTool(toolName: string): boolean {
  return toolName.toLowerCase() === "write"
}


function isTextFile(output: string): boolean {
  const firstLine = output.split("\n")[0] ?? ""
  return COLON_READ_LINE_PATTERN.test(firstLine) || PIPE_READ_LINE_PATTERN.test(firstLine)
}

function parseReadLine(line: string): { lineNumber: number; content: string } | null {
  const colonMatch = COLON_READ_LINE_PATTERN.exec(line)
  if (colonMatch) {
    return {
      lineNumber: Number.parseInt(colonMatch[1], 10),
      content: colonMatch[2],
    }
  }

  const pipeMatch = PIPE_READ_LINE_PATTERN.exec(line)
  if (pipeMatch) {
    return {
      lineNumber: Number.parseInt(pipeMatch[1], 10),
      content: pipeMatch[2],
    }
  }

  return null
}

function transformLine(line: string): string {
  const parsed = parseReadLine(line)
  if (!parsed) {
    return line
  }
  if (parsed.content.endsWith(OPENCODE_LINE_TRUNCATION_SUFFIX)) {
    return line
  }
  const hash = computeLineHash(parsed.lineNumber, parsed.content)
  return `${parsed.lineNumber}#${hash}|${parsed.content}`
}

function extractContentBlock(
  output: string
): { prefix: string[]; contentLines: string[]; suffix: string[] } | null {
  const lines = output.split("\n")

  // Detect <content> or <file> block
  const contentStart = lines.findIndex(
    (line) => line === CONTENT_OPEN_TAG || line.startsWith(CONTENT_OPEN_TAG)
  )
  const contentEnd = lines.indexOf(CONTENT_CLOSE_TAG)
  const fileStart = lines.findIndex((line) => line === FILE_OPEN_TAG || line.startsWith(FILE_OPEN_TAG))
  const fileEnd = lines.indexOf(FILE_CLOSE_TAG)

  const blockStart = contentStart !== -1 ? contentStart : fileStart
  const blockEnd = contentStart !== -1 ? contentEnd : fileEnd
  const openTag = contentStart !== -1 ? CONTENT_OPEN_TAG : FILE_OPEN_TAG

  // No block found
  if (blockStart === -1 || blockEnd === -1 || blockEnd <= blockStart) {
    return null
  }

  // Handle inline-open-tag: <content>1: first line
  const openLine = lines[blockStart] ?? ""
  const inlineFirst = openLine.startsWith(openTag) && openLine !== openTag
    ? openLine.slice(openTag.length)
    : null

  const contentLines = inlineFirst !== null
    ? [inlineFirst, ...lines.slice(blockStart + 1, blockEnd)]
    : lines.slice(blockStart + 1, blockEnd)

  const prefixLines = inlineFirst !== null
    ? [...lines.slice(0, blockStart), openTag]
    : lines.slice(0, blockStart + 1)

  const suffixLines = lines.slice(blockEnd)

  return {
    prefix: prefixLines,
    contentLines,
    suffix: suffixLines,
  }
}

function transformOutput(output: string): string {
  if (!output) {
    return output
  }

  // Try to extract a block (<content> or <file>)
  const block = extractContentBlock(output)

  if (block !== null) {
    // Validate that contentLines start with text-file format
    if (!isTextFile(block.contentLines[0] ?? "")) {
      return output
    }

    // Transform content lines
    const result: string[] = []
    for (const line of block.contentLines) {
      if (!parseReadLine(line)) {
        result.push(...block.contentLines.slice(result.length))
        break
      }
      result.push(transformLine(line))
    }

    // Reassemble: prefix + transformed content + suffix
    return [...block.prefix, ...result, ...block.suffix].join("\n")
  }

  // Plain text mode: no explicit block tags found
  const lines = output.split("\n")
  if (!isTextFile(lines[0] ?? "")) {
    return output
  }

  const result: string[] = []
  for (const line of lines) {
    if (!parseReadLine(line)) {
      result.push(...lines.slice(result.length))
      break
    }
    result.push(transformLine(line))
  }

  return result.join("\n")
}

function extractFilePath(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined
  }

  const objectMeta = metadata as Record<string, unknown>
  const candidates = [objectMeta.filepath, objectMeta.filePath, objectMeta.path, objectMeta.file]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
  }

  return undefined
}

async function appendWriteHashlineOutput(output: { output: string; metadata: unknown }): Promise<void> {
  if (output.output.startsWith(WRITE_SUCCESS_MARKER)) {
    return
  }

  const outputLower = output.output.toLowerCase()
  if (outputLower.startsWith("error") || outputLower.includes("failed")) {
    return
  }

  const filePath = extractFilePath(output.metadata)
  if (!filePath) {
    return
  }

  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return
  }

  const content = await file.text()
  const lineCount = content === "" ? 0 : content.split("\n").length
  output.output = `${WRITE_SUCCESS_MARKER} ${lineCount} lines written.`
}

export function createHashlineReadEnhancerHook(
  _ctx: PluginInput
) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (!isReadTool(input.tool)) {
        if (isWriteTool(input.tool) && typeof output.output === "string") {
          await appendWriteHashlineOutput(output)
        }
        return
      }
      if (typeof output.output !== "string") {
        return
      }
      output.output = transformOutput(output.output)
    },
  }
}
