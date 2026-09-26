export function normalizeOcrText(value: string): string {
  const result: string[] = []
  for (const sourceLine of value.split(/\r?\n/)) {
    const line = sourceLine.trim().replace(/\s+/g, ' ')
    if (!line) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('')
      continue
    }
    if (result[result.length - 1] !== line) result.push(line)
  }
  while (result[result.length - 1] === '') result.pop()
  return result.join('\n')
}
