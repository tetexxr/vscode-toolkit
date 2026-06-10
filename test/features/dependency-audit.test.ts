import { strict as assert } from 'assert'
import {
  normalizeSeverity,
  parseDotnetVulnerableJson,
  parseNpmAuditJson,
  parseYarnAuditNdjson,
  sortFindings,
  summarizeFindings
} from '../../src/features/dependency-audit-utils'

describe('parseNpmAuditJson (v2 format)', () => {
  const V2 = JSON.stringify({
    vulnerabilities: {
      lodash: {
        name: 'lodash',
        severity: 'high',
        isDirect: true,
        via: [{ title: 'Prototype Pollution', url: 'https://github.com/advisories/GHSA-x', severity: 'high' }],
        range: '<4.17.21',
        fixAvailable: true
      },
      minimist: {
        name: 'minimist',
        severity: 'critical',
        isDirect: false,
        via: [{ title: 'Prototype Pollution in minimist', url: 'https://github.com/advisories/GHSA-y' }],
        range: '<1.2.6',
        fixAvailable: { name: 'mocha', version: '10.0.0', isSemVerMajor: true }
      },
      'dep-of-dep': {
        name: 'dep-of-dep',
        severity: 'moderate',
        isDirect: false,
        via: ['lodash'],
        range: '*',
        fixAvailable: false
      }
    },
    metadata: { vulnerabilities: { critical: 1, high: 1, moderate: 1 } }
  })

  it('should extract one finding per vulnerable package', () => {
    const findings = parseNpmAuditJson(V2)
    assert.equal(findings.length, 3)
    const lodash = findings.find(f => f.package === 'lodash')!
    assert.equal(lodash.severity, 'high')
    assert.equal(lodash.title, 'Prototype Pollution')
    assert.equal(lodash.url, 'https://github.com/advisories/GHSA-x')
    assert.equal(lodash.range, '<4.17.21')
    assert.equal(lodash.fixAvailable, true)
    assert.equal(lodash.transitive, false)
  })

  it('should mark indirect packages as transitive and honor fixAvailable=false', () => {
    const findings = parseNpmAuditJson(V2)
    const dep = findings.find(f => f.package === 'dep-of-dep')!
    assert.equal(dep.transitive, true)
    assert.equal(dep.fixAvailable, false)
    assert.match(dep.title, /Vulnerable via dependencies: lodash/)
  })

  it('should return empty for a clean report', () => {
    assert.deepEqual(parseNpmAuditJson('{"vulnerabilities":{},"metadata":{}}'), [])
  })

  it('should throw on non-JSON output', () => {
    assert.throws(() => parseNpmAuditJson('not json'), /Could not parse/)
  })
})

describe('parseNpmAuditJson (v1 / pnpm format)', () => {
  const V1 = JSON.stringify({
    advisories: {
      '1065': {
        module_name: 'qs',
        severity: 'high',
        title: 'Prototype Pollution in qs',
        url: 'https://github.com/advisories/GHSA-z',
        vulnerable_versions: '<6.10.3'
      }
    },
    metadata: { vulnerabilities: { high: 1 } }
  })

  it('should parse the advisories map', () => {
    const findings = parseNpmAuditJson(V1)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].package, 'qs')
    assert.equal(findings[0].severity, 'high')
    assert.equal(findings[0].range, '<6.10.3')
  })
})

describe('parseYarnAuditNdjson', () => {
  const NDJSON = [
    JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { high: 1 } } }),
    JSON.stringify({
      type: 'auditAdvisory',
      data: {
        resolution: { path: 'a>b>qs' },
        advisory: {
          id: 1065,
          module_name: 'qs',
          severity: 'high',
          title: 'Prototype Pollution in qs',
          url: 'https://github.com/advisories/GHSA-z',
          vulnerable_versions: '<6.10.3'
        }
      }
    }),
    // yarn repeats the same advisory for every dependency path
    JSON.stringify({
      type: 'auditAdvisory',
      data: {
        resolution: { path: 'c>qs' },
        advisory: { id: 1065, module_name: 'qs', severity: 'high', title: 'Prototype Pollution in qs' }
      }
    })
  ].join('\n')

  it('should parse advisory lines and dedupe repeated advisories', () => {
    const findings = parseYarnAuditNdjson(NDJSON)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].package, 'qs')
  })

  it('should skip malformed lines and other event types', () => {
    assert.deepEqual(parseYarnAuditNdjson('garbage\n{"type":"auditSummary"}'), [])
  })
})

describe('parseDotnetVulnerableJson', () => {
  const DOTNET = JSON.stringify({
    version: 1,
    projects: [
      {
        path: '/src/App/App.csproj',
        frameworks: [
          {
            framework: 'net8.0',
            topLevelPackages: [
              {
                id: 'Newtonsoft.Json',
                requestedVersion: '12.0.1',
                resolvedVersion: '12.0.1',
                vulnerabilities: [{ severity: 'High', advisoryurl: 'https://github.com/advisories/GHSA-n' }]
              }
            ],
            transitivePackages: [
              {
                id: 'System.Text.Encodings.Web',
                resolvedVersion: '4.5.0',
                vulnerabilities: [{ severity: 'Critical', advisoryurl: 'https://github.com/advisories/GHSA-m' }]
              }
            ]
          },
          {
            framework: 'net6.0',
            topLevelPackages: [
              {
                id: 'Newtonsoft.Json',
                resolvedVersion: '12.0.1',
                vulnerabilities: [{ severity: 'High', advisoryurl: 'https://github.com/advisories/GHSA-n' }]
              }
            ]
          }
        ]
      }
    ]
  })

  it('should extract findings from top-level and transitive packages', () => {
    const findings = parseDotnetVulnerableJson(DOTNET)
    assert.equal(findings.length, 2)
    const top = findings.find(f => f.package === 'Newtonsoft.Json')!
    assert.equal(top.severity, 'high')
    assert.equal(top.transitive, false)
    const transitive = findings.find(f => f.package === 'System.Text.Encodings.Web')!
    assert.equal(transitive.severity, 'critical')
    assert.equal(transitive.transitive, true)
  })

  it('should dedupe the same advisory across frameworks', () => {
    const findings = parseDotnetVulnerableJson(DOTNET)
    assert.equal(findings.filter(f => f.package === 'Newtonsoft.Json').length, 1)
  })

  it('should return empty for a clean report', () => {
    assert.deepEqual(parseDotnetVulnerableJson('{"version":1,"projects":[{"frameworks":[]}]}'), [])
  })
})

describe('severity helpers', () => {
  it('should normalize severities including medium → moderate', () => {
    assert.equal(normalizeSeverity('Critical'), 'critical')
    assert.equal(normalizeSeverity('medium'), 'moderate')
    assert.equal(normalizeSeverity('Moderate'), 'moderate')
    assert.equal(normalizeSeverity('???'), 'unknown')
    assert.equal(normalizeSeverity(undefined), 'unknown')
  })

  it('should sort by severity then package name', () => {
    const sorted = sortFindings([
      { package: 'b', severity: 'low', title: '', url: null, range: '' },
      { package: 'a', severity: 'critical', title: '', url: null, range: '' },
      { package: 'c', severity: 'critical', title: '', url: null, range: '' }
    ])
    assert.deepEqual(
      sorted.map(f => f.package),
      ['a', 'c', 'b']
    )
  })

  it('should summarize counts by severity', () => {
    const summary = summarizeFindings([
      { package: 'a', severity: 'critical', title: '', url: null, range: '' },
      { package: 'b', severity: 'critical', title: '', url: null, range: '' },
      { package: 'c', severity: 'low', title: '', url: null, range: '' }
    ])
    assert.equal(summary, '3 vulnerabilities (2 critical, 1 low)')
  })
})
