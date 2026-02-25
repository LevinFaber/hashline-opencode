import { collectLineRefs, dedupeEdits, detectOverlappingRanges, getEditLineNumber } from "./edit-sorting"
import type { HashlineEdit } from "./types"
import { validateLineRefs, validateLineRef, parseLineRef } from "./validation"
import { autocorrectReplacementLines } from "./autocorrect-replacement-lines"
import {
  restoreLeadingIndent,
  stripInsertAnchorEcho,
  stripInsertBeforeEcho,
  stripInsertBoundaryEcho,
  stripRangeBoundaryEcho,
  toNewLines,
} from "./edit-text-normalization"

interface EditApplyOptions {
  skipValidation?: boolean
}

function shouldValidate(options?: EditApplyOptions): boolean {
  return options?.skipValidation !== true
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function applySetLine(
  lines: string[],
  anchor: string,
  newText: string | string[],
  options?: EditApplyOptions
): string[] {
  if (shouldValidate(options)) validateLineRef(lines, anchor)
  const { line } = parseLineRef(anchor)
  const result = [...lines]
  const originalLine = lines[line - 1] ?? ""
  const corrected = autocorrectReplacementLines([originalLine], toNewLines(newText))
  const replacement = corrected.map((entry, idx) => {
    if (idx !== 0) return entry
    return restoreLeadingIndent(originalLine, entry)
  })
  result.splice(line - 1, 1, ...replacement)
  return result
}

export function applyReplaceLines(
  lines: string[],
  startAnchor: string,
  endAnchor: string,
  newText: string | string[],
  options?: EditApplyOptions
): string[] {
  if (shouldValidate(options)) {
    validateLineRef(lines, startAnchor)
    validateLineRef(lines, endAnchor)
  }

  const { line: startLine } = parseLineRef(startAnchor)
  const { line: endLine } = parseLineRef(endAnchor)

  if (startLine > endLine) {
    throw new Error(
      `Invalid range: start line ${startLine} cannot be greater than end line ${endLine}`
    )
  }

  const result = [...lines]
  const originalRange = lines.slice(startLine - 1, endLine)
  const stripped = stripRangeBoundaryEcho(lines, startLine, endLine, toNewLines(newText))
  const corrected = autocorrectReplacementLines(originalRange, stripped)
  const restored = corrected.map((entry, idx) => {
    if (idx !== 0) return entry
    return restoreLeadingIndent(lines[startLine - 1] ?? "", entry)
  })
  result.splice(startLine - 1, endLine - startLine + 1, ...restored)
  return result
}

export function applyInsertAfter(
  lines: string[],
  anchor: string,
  text: string | string[],
  options?: EditApplyOptions
): string[] {
  if (shouldValidate(options)) validateLineRef(lines, anchor)
  const { line } = parseLineRef(anchor)
  const result = [...lines]
  const newLines = stripInsertAnchorEcho(lines[line - 1], toNewLines(text))
  if (newLines.length === 0) {
    throw new Error(`append (anchored) requires non-empty text for ${anchor}`)
  }
  result.splice(line, 0, ...newLines)
  return result
}

export function applyInsertBefore(
  lines: string[],
  anchor: string,
  text: string | string[],
  options?: EditApplyOptions
): string[] {
  if (shouldValidate(options)) validateLineRef(lines, anchor)
  const { line } = parseLineRef(anchor)
  const result = [...lines]
  const newLines = stripInsertBeforeEcho(lines[line - 1], toNewLines(text))
  if (newLines.length === 0) {
    throw new Error(`prepend (anchored) requires non-empty text for ${anchor}`)
  }
  result.splice(line - 1, 0, ...newLines)
  return result
}

export function applyAppend(lines: string[], text: string | string[]): string[] {
  const normalized = toNewLines(text)
  if (normalized.length === 0) {
    throw new Error("append requires non-empty text")
  }
  if (lines.length === 1 && lines[0] === "") {
    return [...normalized]
  }
  return [...lines, ...normalized]
}

export function applyPrepend(lines: string[], text: string | string[]): string[] {
  const normalized = toNewLines(text)
  if (normalized.length === 0) {
    throw new Error("prepend requires non-empty text")
  }
  if (lines.length === 1 && lines[0] === "") {
    return [...normalized]
  }
  return [...normalized, ...lines]
}

export interface HashlineApplyReport {

  content: string
  noopEdits: number
  deduplicatedEdits: number
}

export function applyHashlineEditsWithReport(content: string, edits: HashlineEdit[]): HashlineApplyReport {
  if (edits.length === 0) {
    return {
      content,
      noopEdits: 0,
      deduplicatedEdits: 0,
    }
  }

  const dedupeResult = dedupeEdits(edits)
  const EDIT_PRECEDENCE: Record<string, number> = { replace: 0, append: 1, prepend: 2 }
  const sortedEdits = [...dedupeResult.edits].sort((a, b) => {
    const lineA = getEditLineNumber(a)
    const lineB = getEditLineNumber(b)
    if (lineB !== lineA) return lineB - lineA
    return (EDIT_PRECEDENCE[a.op] ?? 3) - (EDIT_PRECEDENCE[b.op] ?? 3)
  })

  let noopEdits = 0

  let lines = content.length === 0 ? [] : content.split("\n")

  const refs = collectLineRefs(sortedEdits)
  validateLineRefs(lines, refs)

  const overlapError = detectOverlappingRanges(sortedEdits)
  if (overlapError) throw new Error(overlapError)

  for (const edit of sortedEdits) {
    switch (edit.op) {
      case "replace": {
        const next = edit.end
          ? applyReplaceLines(lines, edit.pos, edit.end, edit.lines, { skipValidation: true })
          : applySetLine(lines, edit.pos, edit.lines, { skipValidation: true })
        if (arraysEqual(next, lines)) {
          noopEdits += 1
          break
        }
        lines = next
        break
      }
      case "append": {
        const next = edit.pos
          ? applyInsertAfter(lines, edit.pos, edit.lines, { skipValidation: true })
          : applyAppend(lines, edit.lines)
        if (arraysEqual(next, lines)) {
          noopEdits += 1
          break
        }
        lines = next
        break
      }
      case "prepend": {
        const next = edit.pos
          ? applyInsertBefore(lines, edit.pos, edit.lines, { skipValidation: true })
          : applyPrepend(lines, edit.lines)
        if (arraysEqual(next, lines)) {
          noopEdits += 1
          break
        }
        lines = next
        break
      }
    }
  }

  return {
    content: lines.join("\n"),
    noopEdits,
    deduplicatedEdits: dedupeResult.deduplicatedEdits,
  }
}

export function applyHashlineEdits(content: string, edits: HashlineEdit[]): string {
  return applyHashlineEditsWithReport(content, edits).content
}
