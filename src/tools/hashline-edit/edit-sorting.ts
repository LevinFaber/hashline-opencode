import { parseLineRef } from "./validation"
import type { HashlineEdit } from "./types"
import { toNewLines } from "./edit-text-normalization"

export function getEditLineNumber(edit: HashlineEdit): number {
  switch (edit.op) {
    case "replace":
      return parseLineRef(edit.end ?? edit.pos).line
    case "append":
      return edit.pos ? parseLineRef(edit.pos).line : Number.NEGATIVE_INFINITY
    case "prepend":
      return edit.pos ? parseLineRef(edit.pos).line : Number.NEGATIVE_INFINITY
    default:
      return Number.POSITIVE_INFINITY
  }
}

export function collectLineRefs(edits: HashlineEdit[]): string[] {
  return edits.flatMap((edit) => {
    switch (edit.op) {
      case "replace":
        return edit.end ? [edit.pos, edit.end] : [edit.pos]
      case "append":
      case "prepend":
        return edit.pos ? [edit.pos] : []
      default:
        return []
    }
  })
}

export function detectOverlappingRanges(edits: HashlineEdit[]): string | null {
  const ranges: { start: number; end: number; idx: number }[] = []
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    if (edit.op !== "replace" || !edit.end) continue
    const start = parseLineRef(edit.pos).line
    const end = parseLineRef(edit.end).line
    ranges.push({ start, end, idx: i })
  }
  if (ranges.length < 2) return null

  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1]
    const curr = ranges[i]
    if (curr.start <= prev.end) {
      return (
        `Overlapping range edits detected: ` +
        `edit ${prev.idx + 1} (lines ${prev.start}-${prev.end}) overlaps with ` +
        `edit ${curr.idx + 1} (lines ${curr.start}-${curr.end}). ` +
        `Use pos-only replace for single-line edits.`
      )
    }
  }
  return null
}

function normalizeEditPayload(payload: string | string[]): string {
  return toNewLines(payload).join("\n")
}

function buildDedupeKey(edit: HashlineEdit): string {
  switch (edit.op) {
    case "replace":
      return `replace|${edit.pos}|${edit.end ?? ""}|${normalizeEditPayload(edit.lines)}`
    case "append":
      return `append|${edit.pos ?? ""}|${normalizeEditPayload(edit.lines)}`
    case "prepend":
      return `prepend|${edit.pos ?? ""}|${normalizeEditPayload(edit.lines)}`
    default:
      return JSON.stringify(edit)
  }
}

export function dedupeEdits(edits: HashlineEdit[]): { edits: HashlineEdit[]; deduplicatedEdits: number } {
  const seen = new Set<string>()
  const deduped: HashlineEdit[] = []
  let deduplicatedEdits = 0

  for (const edit of edits) {
    const key = buildDedupeKey(edit)
    if (seen.has(key)) {
      deduplicatedEdits += 1
      continue
    }
    seen.add(key)
    deduped.push(edit)
  }

  return { edits: deduped, deduplicatedEdits }
}
