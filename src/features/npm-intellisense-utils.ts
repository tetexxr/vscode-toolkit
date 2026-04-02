export function shouldProvide(line: string, cursor: number): boolean {
  if (!isImportOrRequire(line, cursor)) {
    return false
  }
  return !startsWithDot(line, cursor)
}

function isImportOrRequire(line: string, cursor: number): boolean {
  if (line.includes('require(')) {
    return true
  }
  if (!line.startsWith('import')) {
    return false
  }
  return isAfterFrom(line, cursor) || isDirectImportString(line, cursor)
}

function isAfterFrom(line: string, cursor: number): boolean {
  const patterns = [" from '", ' from "', "}from '", '}from "']
  return patterns.some((p) => {
    const pos = line.lastIndexOf(p)
    return pos !== -1 && pos < cursor
  })
}

function isDirectImportString(line: string, cursor: number): boolean {
  const patterns = [" '", "'", ' "', '"']
  return patterns.some((p) => {
    const pos = line.indexOf(p)
    return pos !== -1 && pos < cursor
  })
}

function startsWithDot(line: string, cursor: number): boolean {
  const textToPosition = line.substring(0, cursor)
  const quotePos = Math.max(textToPosition.lastIndexOf('"'), textToPosition.lastIndexOf("'"))
  if (quotePos === -1) {
    return false
  }
  return textToPosition[quotePos + 1] === '.'
}

export function guessVariableName(packageName: string): string {
  return packageName.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
}
