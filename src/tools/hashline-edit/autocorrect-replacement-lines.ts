function stripAllWhitespace(text: string): string {
  return text.replace(/\s+/g, "")
}

function stripTrailingContinuationTokens(text: string): string {
  return text.replace(/(?:&&|\|\||\?\?|\?|:|=|,|\+|-|\*|\/|\.|\()\s*$/u, "")
}

function leadingWhitespace(text: string): string {
  if (!text) return ""
  const match = text.match(/^\s*/)
  return match ? match[0] : ""
}

function restoreOldWrappedLines(originalLines: string[], replacementLines: string[]): string[] {
  if (originalLines.length === 0 || replacementLines.length < 2) return replacementLines
  const canonicalToOriginal = new Map<string, { line: string; count: number }>()
  for (const line of originalLines) {
    const canonical = stripAllWhitespace(line)
    const existing = canonicalToOriginal.get(canonical)
    if (existing) existing.count += 1
    else canonicalToOriginal.set(canonical, { line, count: 1 })
  }

  const candidateCounts = new Map<string, number>()
  const candidates = new Map<string, { start: number; len: number; replacement: string }>()
  for (let start = 0; start < replacementLines.length; start += 1) {
    for (let len = 2; len <= 10 && start + len <= replacementLines.length; len += 1) {
      const span = replacementLines.slice(start, start + len)
      if (span.some((line) => line.trim().length === 0)) continue
      const canonical = stripAllWhitespace(span.join(""))
      const original = canonicalToOriginal.get(canonical)
      if (!original || original.count !== 1 || canonical.length < 6) continue
      candidateCounts.set(canonical, (candidateCounts.get(canonical) ?? 0) + 1)
      candidates.set(canonical, { start, len, replacement: original.line })
    }
  }

  const uniqueCandidates = [...candidates.entries()]
    .filter(([canonical]) => (candidateCounts.get(canonical) ?? 0) === 1)
    .map(([, candidate]) => candidate)
  if (uniqueCandidates.length === 0) return replacementLines

  uniqueCandidates.sort((a, b) => b.start - a.start)
  const correctedLines = [...replacementLines]
  for (const candidate of uniqueCandidates) {
    correctedLines.splice(candidate.start, candidate.len, candidate.replacement)
  }
  return correctedLines
}

function maybeExpandSingleLineMerge(originalLines: string[], replacementLines: string[]): string[] {
  if (replacementLines.length !== 1 || originalLines.length <= 1) return replacementLines
  const merged = replacementLines[0]
  const parts = originalLines.map((line) => line.trim()).filter((line) => line.length > 0)
  if (parts.length !== originalLines.length) return replacementLines

  const indices: number[] = []
  let offset = 0
  for (const part of parts) {
    let idx = merged.indexOf(part, offset)
    let matchedLen = part.length
    if (idx === -1) {
      const stripped = stripTrailingContinuationTokens(part)
      if (stripped !== part) {
        idx = merged.indexOf(stripped, offset)
        if (idx !== -1) matchedLen = stripped.length
      }
    }
    if (idx === -1) return semicolonSplitFallback(merged, originalLines.length, replacementLines)
    indices.push(idx)
    offset = idx + matchedLen
  }

  const expanded: string[] = []
  for (let i = 0; i < indices.length; i += 1) {
    const start = indices[i]
    const end = i + 1 < indices.length ? indices[i + 1] : merged.length
    const candidate = merged.slice(start, end).trim()
    if (candidate.length === 0) return semicolonSplitFallback(merged, originalLines.length, replacementLines)
    expanded.push(candidate)
  }
  return expanded.length === originalLines.length
    ? expanded
    : semicolonSplitFallback(merged, originalLines.length, replacementLines)
}

function semicolonSplitFallback(merged: string, expectedCount: number, replacementLines: string[]): string[] {
  const semicolonSplit = merged
    .split(/;\s+/)
    .map((line, idx, arr) => (idx < arr.length - 1 && !line.endsWith(";") ? `${line};` : line))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return semicolonSplit.length === expectedCount ? semicolonSplit : replacementLines
}

function restoreIndentForPairedReplacement(originalLines: string[], replacementLines: string[]): string[] {
  if (originalLines.length !== replacementLines.length) return replacementLines
  return replacementLines.map((line, idx) => {
    if (line.length === 0 || leadingWhitespace(line).length > 0) return line
    const indent = leadingWhitespace(originalLines[idx])
    if (indent.length === 0 || originalLines[idx].trim() === line.trim()) return line
    return `${indent}${line}`
  })
}

export function autocorrectReplacementLines(
  originalLines: string[],
  replacementLines: string[]
): string[] {
  let next = replacementLines
  next = maybeExpandSingleLineMerge(originalLines, next)
  next = restoreOldWrappedLines(originalLines, next)
  next = restoreIndentForPairedReplacement(originalLines, next)
  return next
}
