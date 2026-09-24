export function normalizeOcrText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join('\n')
}
