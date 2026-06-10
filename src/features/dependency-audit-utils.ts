/**
 * Pure parsing logic for the dependency vulnerability audit.
 * No VS Code dependency — testable standalone.
 *
 * Sources parsed:
 *  - `npm audit --json`  (v2 format: { vulnerabilities: { name: ... } })
 *  - `pnpm audit --json` (npm v1 format: { advisories: { id: ... } })
 *  - `yarn audit --json` (NDJSON lines with type "auditAdvisory")
 *  - `dotnet list package --vulnerable --format json`
 */

export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info' | 'unknown'

export interface VulnerabilityFinding {
  package: string
  severity: Severity
  title: string
  url: string | null
  /** Affected range or resolved version, depending on the source. */
  range: string
  fixAvailable?: boolean
  transitive?: boolean
}

/** Narrowing String() replacement: objects fall back instead of "[object Object]". */
function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return fallback
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  info: 4,
  unknown: 5
}

export function normalizeSeverity(value: unknown): Severity {
  const lower = asString(value).toLowerCase()
  if (lower === 'critical' || lower === 'high' || lower === 'low' || lower === 'info') {
    return lower
  }
  if (lower === 'moderate' || lower === 'medium') {
    return 'moderate'
  }
  return 'unknown'
}

export function sortFindings(findings: VulnerabilityFinding[]): VulnerabilityFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.package.localeCompare(b.package)
  )
}

export function summarizeFindings(findings: VulnerabilityFinding[]): string {
  const counts = new Map<Severity, number>()
  for (const f of findings) {
    counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const severity of Object.keys(SEVERITY_ORDER) as Severity[]) {
    const count = counts.get(severity)
    if (count) {
      parts.push(`${count} ${severity}`)
    }
  }
  const total = findings.length
  return `${total} vulnerabilit${total === 1 ? 'y' : 'ies'} (${parts.join(', ')})`
}

/* -------------------------------------------------------------------------- */
/*  npm / pnpm                                                                */
/* -------------------------------------------------------------------------- */

interface NpmV2Via {
  title?: string
  url?: string
  severity?: string
  range?: string
}

export function parseNpmAuditJson(stdout: string): VulnerabilityFinding[] {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    throw new Error('Could not parse audit output as JSON.')
  }

  // npm v1 / pnpm format
  if (data.advisories && typeof data.advisories === 'object') {
    const findings: VulnerabilityFinding[] = []
    for (const advisory of Object.values(data.advisories as Record<string, Record<string, unknown>>)) {
      findings.push({
        package: asString(advisory.module_name, 'unknown'),
        severity: normalizeSeverity(advisory.severity),
        title: asString(advisory.title, '(no title)'),
        url: typeof advisory.url === 'string' ? advisory.url : null,
        range: asString(advisory.vulnerable_versions)
      })
    }
    return findings
  }

  // npm v2+ format
  if (data.vulnerabilities && typeof data.vulnerabilities === 'object') {
    const findings: VulnerabilityFinding[] = []
    for (const [name, raw] of Object.entries(data.vulnerabilities as Record<string, Record<string, unknown>>)) {
      const via = Array.isArray(raw.via) ? raw.via : []
      // `via` mixes advisory objects and plain strings (names of vulnerable deps).
      const advisories = via.filter((v): v is NpmV2Via => typeof v === 'object' && v !== null)
      const first = advisories[0]
      findings.push({
        package: name,
        severity: normalizeSeverity(raw.severity),
        title: first?.title ?? 'Vulnerable via dependencies: ' + via.filter(v => typeof v === 'string').join(', '),
        url: typeof first?.url === 'string' ? first.url : null,
        range: asString(raw.range),
        fixAvailable: raw.fixAvailable !== false && raw.fixAvailable !== undefined,
        transitive: !(raw.isDirect === true)
      })
    }
    return findings
  }

  return []
}

/* -------------------------------------------------------------------------- */
/*  yarn (classic)                                                            */
/* -------------------------------------------------------------------------- */

export function parseYarnAuditNdjson(stdout: string): VulnerabilityFinding[] {
  const findings: VulnerabilityFinding[] = []
  const seen = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    let event: Record<string, unknown>
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue
    }
    if (event.type !== 'auditAdvisory') {
      continue
    }
    const advisory = (event.data as Record<string, unknown> | undefined)?.advisory as
      | Record<string, unknown>
      | undefined
    if (!advisory) {
      continue
    }
    const key = `${String(advisory.module_name)}|${String(advisory.id)}`
    if (seen.has(key)) {
      continue // yarn repeats the advisory once per dependency path
    }
    seen.add(key)
    findings.push({
      package: asString(advisory.module_name, 'unknown'),
      severity: normalizeSeverity(advisory.severity),
      title: asString(advisory.title, '(no title)'),
      url: typeof advisory.url === 'string' ? advisory.url : null,
      range: asString(advisory.vulnerable_versions)
    })
  }
  return findings
}

/* -------------------------------------------------------------------------- */
/*  dotnet                                                                    */
/* -------------------------------------------------------------------------- */

interface DotnetPackage {
  id?: string
  resolvedVersion?: string
  vulnerabilities?: Array<{ severity?: string; advisoryurl?: string }>
}

export function parseDotnetVulnerableJson(stdout: string): VulnerabilityFinding[] {
  let data: {
    projects?: Array<{
      frameworks?: Array<{ topLevelPackages?: DotnetPackage[]; transitivePackages?: DotnetPackage[] }>
    }>
  }
  try {
    data = JSON.parse(stdout) as typeof data
  } catch {
    throw new Error('Could not parse dotnet output as JSON.')
  }

  const findings: VulnerabilityFinding[] = []
  const seen = new Set<string>()
  for (const project of data.projects ?? []) {
    for (const framework of project.frameworks ?? []) {
      const groups: Array<{ packages: DotnetPackage[]; transitive: boolean }> = [
        { packages: framework.topLevelPackages ?? [], transitive: false },
        { packages: framework.transitivePackages ?? [], transitive: true }
      ]
      for (const { packages, transitive } of groups) {
        for (const pkg of packages) {
          for (const vulnerability of pkg.vulnerabilities ?? []) {
            const key = `${pkg.id}|${pkg.resolvedVersion}|${vulnerability.advisoryurl}`
            if (seen.has(key)) {
              continue // the same package can repeat across frameworks
            }
            seen.add(key)
            findings.push({
              package: String(pkg.id ?? 'unknown'),
              severity: normalizeSeverity(vulnerability.severity),
              title: `${pkg.id} ${pkg.resolvedVersion ?? ''}`.trim(),
              url: typeof vulnerability.advisoryurl === 'string' ? vulnerability.advisoryurl : null,
              range: String(pkg.resolvedVersion ?? ''),
              transitive
            })
          }
        }
      }
    }
  }
  return findings
}
