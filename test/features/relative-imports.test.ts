import { strict as assert } from 'assert'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import {
  stripJsonComments,
  buildMappings,
  resolveAlias,
  toAlias,
  toRelative,
  findTsConfig,
  loadPathsFromConfig,
  findImportMatches,
  findAliasMatches,
  type ResolvedPaths,
} from '../../src/features/relative-imports-utils'

// --- helpers ---

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ri-test-'))
}

function writeJson(filePath: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2))
}

describe('stripJsonComments', () => {
  it('should remove single-line comments', () => {
    const input = '{\n  // this is a comment\n  "key": "value"\n}'
    const result = JSON.parse(stripJsonComments(input))
    assert.equal(result.key, 'value')
  })

  it('should remove block comments', () => {
    const input = '{\n  /* block\n  comment */\n  "key": "value"\n}'
    const result = JSON.parse(stripJsonComments(input))
    assert.equal(result.key, 'value')
  })

  it('should remove trailing commas', () => {
    const input = '{\n  "a": 1,\n  "b": 2,\n}'
    const result = JSON.parse(stripJsonComments(input))
    assert.deepEqual(result, { a: 1, b: 2 })
  })

  it('should handle all three issues at once', () => {
    const input = `{
      // comment
      "a": 1, /* inline */
      "b": [1, 2,],
    }`
    const result = JSON.parse(stripJsonComments(input))
    assert.deepEqual(result, { a: 1, b: [1, 2] })
  })
})

describe('buildMappings', () => {
  it('should create wildcard mapping', () => {
    const mappings = buildMappings({ '@server/*': ['src/server/*'] })
    assert.equal(mappings.length, 1)
    assert.equal(mappings[0].prefix, '@server/')
    assert.equal(mappings[0].wildcard, true)
    assert.deepEqual(mappings[0].targets, ['src/server/*'])
  })

  it('should create exact mapping', () => {
    const mappings = buildMappings({ '@utils': ['src/utils/index'] })
    assert.equal(mappings.length, 1)
    assert.equal(mappings[0].prefix, '@utils')
    assert.equal(mappings[0].wildcard, false)
  })

  it('should sort by prefix length (longest first)', () => {
    const mappings = buildMappings({
      '@a/*': ['a/*'],
      '@a/b/*': ['ab/*'],
      '@ab/c/*': ['abc/*'],
    })
    assert.equal(mappings[0].prefix, '@ab/c/')
    assert.equal(mappings[1].prefix, '@a/b/')
    assert.equal(mappings[2].prefix, '@a/')
  })
})

describe('resolveAlias', () => {
  const config: ResolvedPaths = {
    baseUrl: '/project',
    mappings: buildMappings({
      '@server/*': ['src/server/*'],
      '@utils': ['src/utils/index'],
      '@components/*': ['src/ui/components/*'],
    }),
  }

  it('should resolve wildcard alias', () => {
    const result = resolveAlias('@server/payments/repository', config)
    assert.equal(result, path.resolve('/project', 'src/server/payments/repository'))
  })

  it('should resolve exact alias', () => {
    const result = resolveAlias('@utils', config)
    assert.equal(result, path.resolve('/project', 'src/utils/index'))
  })

  it('should return undefined for non-matching import', () => {
    assert.equal(resolveAlias('lodash', config), undefined)
    assert.equal(resolveAlias('./local', config), undefined)
  })

  it('should resolve deeply nested wildcard path', () => {
    const result = resolveAlias('@components/Button/styles', config)
    assert.equal(result, path.resolve('/project', 'src/ui/components/Button/styles'))
  })

  it('should not match partial prefix', () => {
    // '@serverExtra/foo' should NOT match '@server/*'
    assert.equal(resolveAlias('@serverExtra/foo', config), undefined)
  })
})

describe('toRelative', () => {
  it('should return ./ for same directory', () => {
    const result = toRelative('/project/src/a/handler.ts', '/project/src/a/repository')
    assert.equal(result, './repository')
  })

  it('should return ../ for parent directory', () => {
    const result = toRelative('/project/src/a/handler.ts', '/project/src/b/service')
    assert.equal(result, '../b/service')
  })

  it('should handle deeply nested paths', () => {
    const result = toRelative(
      '/project/src/server/payments/handler.ts',
      '/project/src/server/auth/service'
    )
    assert.equal(result, '../auth/service')
  })

  it('should handle going up multiple levels', () => {
    const result = toRelative(
      '/project/src/deep/nested/file.ts',
      '/project/src/utils/helpers'
    )
    assert.equal(result, '../../utils/helpers')
  })

  it('should always start with ./ or ../', () => {
    const result = toRelative('/a/b.ts', '/a/c')
    assert.ok(result.startsWith('./') || result.startsWith('../'))
  })
})

describe('findTsConfig', () => {
  let root: string

  beforeEach(() => {
    root = tmpDir()
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('should find tsconfig.json in the same directory', () => {
    writeJson(path.join(root, 'tsconfig.json'), {})
    assert.equal(findTsConfig(root), path.join(root, 'tsconfig.json'))
  })

  it('should find tsconfig.json in a parent directory', () => {
    writeJson(path.join(root, 'tsconfig.json'), {})
    const nested = path.join(root, 'src', 'deep')
    fs.mkdirSync(nested, { recursive: true })
    assert.equal(findTsConfig(nested), path.join(root, 'tsconfig.json'))
  })

  it('should prefer tsconfig.json over jsconfig.json', () => {
    writeJson(path.join(root, 'tsconfig.json'), {})
    writeJson(path.join(root, 'jsconfig.json'), {})
    assert.equal(findTsConfig(root), path.join(root, 'tsconfig.json'))
  })

  it('should fall back to jsconfig.json', () => {
    writeJson(path.join(root, 'jsconfig.json'), {})
    assert.equal(findTsConfig(root), path.join(root, 'jsconfig.json'))
  })

  it('should return undefined when no config exists', () => {
    assert.equal(findTsConfig(root), undefined)
  })
})

describe('loadPathsFromConfig', () => {
  let root: string

  beforeEach(() => {
    root = tmpDir()
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('should load paths from a simple tsconfig', () => {
    writeJson(path.join(root, 'tsconfig.json'), {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@app/*': ['src/*'] },
      },
    })
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.baseUrl, root)
    assert.equal(result.mappings.length, 1)
    assert.equal(result.mappings[0].prefix, '@app/')
  })

  it('should resolve baseUrl relative to config directory', () => {
    writeJson(path.join(root, 'tsconfig.json'), {
      compilerOptions: {
        baseUrl: 'src',
        paths: { '@/*': ['*'] },
      },
    })
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.baseUrl, path.join(root, 'src'))
  })

  it('should follow extends chain', () => {
    writeJson(path.join(root, 'tsconfig.base.json'), {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@lib/*': ['lib/*'] },
      },
    })
    writeJson(path.join(root, 'tsconfig.json'), {
      extends: './tsconfig.base.json',
    })
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.mappings.length, 1)
    assert.equal(result.mappings[0].prefix, '@lib/')
  })

  it('should override baseUrl from child config when extending', () => {
    writeJson(path.join(root, 'tsconfig.base.json'), {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['*'] },
      },
    })
    writeJson(path.join(root, 'tsconfig.json'), {
      extends: './tsconfig.base.json',
      compilerOptions: { baseUrl: 'src' },
    })
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.baseUrl, path.join(root, 'src'))
  })

  it('should return undefined when no paths are defined', () => {
    writeJson(path.join(root, 'tsconfig.json'), {
      compilerOptions: { strict: true },
    })
    assert.equal(loadPathsFromConfig(path.join(root, 'tsconfig.json')), undefined)
  })

  it('should handle tsconfig with comments', () => {
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      `{
        // Base config
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@app/*": ["src/*"], // app alias
          },
        },
      }`
    )
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.mappings[0].prefix, '@app/')
  })
})

describe('findImportMatches', () => {
  const config: ResolvedPaths = {
    baseUrl: '/project',
    mappings: buildMappings({
      '@server/*': ['src/server/*'],
      '@utils': ['src/utils/index'],
    }),
  }

  const filePath = '/project/src/server/payments/handler.ts'

  it('should match import ... from', () => {
    const source = `import * as repository from '@server/payments/repository'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].importPath, '@server/payments/repository')
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should match named imports', () => {
    const source = `import { create, update } from '@server/payments/repository'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should match require()', () => {
    const source = `const repo = require('@server/payments/repository')`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should match dynamic import()', () => {
    const source = `const mod = await import('@server/payments/repository')`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should match export ... from', () => {
    const source = `export { create } from '@server/payments/repository'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should match export * from', () => {
    const source = `export * from '@server/payments/repository'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should skip relative imports', () => {
    const source = `import { foo } from './bar'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 0)
  })

  it('should skip absolute imports', () => {
    const source = `import { foo } from '/absolute/path'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 0)
  })

  it('should skip non-aliased packages', () => {
    const source = `import express from 'express'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 0)
  })

  it('should handle multiple imports in one file', () => {
    const source = [
      `import * as repo from '@server/payments/repository'`,
      `import { auth } from '@server/auth/service'`,
      `import express from 'express'`,
      `import { helper } from './helper'`,
    ].join('\n')

    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 2)
    assert.equal(matches[0].relativePath, './repository')
    assert.equal(matches[1].relativePath, '../auth/service')
  })

  it('should handle double quotes', () => {
    const source = `import { foo } from "@server/payments/repository"`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './repository')
  })

  it('should correctly compute pathStart offset', () => {
    const source = `import { foo } from '@server/payments/repository'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    // The import path starts right after the opening quote
    assert.equal(source.slice(matches[0].pathStart, matches[0].pathStart + matches[0].importPath.length), '@server/payments/repository')
  })

  it('should resolve cross-directory alias to correct relative path', () => {
    const deepFile = '/project/src/web/controllers/auth.ts'
    const source = `import { repo } from '@server/payments/repository'`
    const matches = findImportMatches(source, deepFile, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '../../server/payments/repository')
  })

  it('should resolve exact alias', () => {
    const source = `import { helpers } from '@utils'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '../../utils/index')
  })
})

describe('toAlias', () => {
  const config: ResolvedPaths = {
    baseUrl: '/project',
    mappings: buildMappings({
      '@server/*': ['src/server/*'],
      '@utils': ['src/utils/index'],
      '@components/*': ['src/ui/components/*'],
    }),
  }

  it('should convert absolute path to wildcard alias', () => {
    const result = toAlias('/project/src/server/payments/repository', config)
    assert.equal(result, '@server/payments/repository')
  })

  it('should convert absolute path to exact alias', () => {
    const result = toAlias('/project/src/utils/index', config)
    assert.equal(result, '@utils')
  })

  it('should return undefined for paths outside any alias', () => {
    assert.equal(toAlias('/project/src/other/thing', config), undefined)
  })

  it('should handle nested alias paths', () => {
    const result = toAlias('/project/src/ui/components/Button/styles', config)
    assert.equal(result, '@components/Button/styles')
  })

  it('should use the most specific alias', () => {
    const config2: ResolvedPaths = {
      baseUrl: '/project',
      mappings: buildMappings({
        '@app/*': ['src/*'],
        '@app/server/*': ['src/server/*'],
      }),
    }
    const result = toAlias('/project/src/server/handler', config2)
    assert.equal(result, '@app/server/handler')
  })
})

// --- findAliasMatches ---

describe('findAliasMatches', () => {
  const config: ResolvedPaths = {
    baseUrl: '/project',
    mappings: buildMappings({
      '@server/*': ['src/server/*'],
      '@utils': ['src/utils/index'],
    }),
  }

  const filePath = '/project/src/server/payments/handler.ts'

  it('should convert relative import to alias', () => {
    const source = `import * as repository from './repository'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].importPath, './repository')
    assert.equal(matches[0].relativePath, '@server/payments/repository')
  })

  it('should convert parent-relative import to alias', () => {
    const source = `import { auth } from '../auth/service'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '@server/auth/service')
  })

  it('should skip alias imports (non-relative)', () => {
    const source = `import express from 'express'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 0)
  })

  it('should skip relative imports outside any alias', () => {
    const source = `import { foo } from '../../../other/thing'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 0)
  })

  it('should handle multiple relative imports', () => {
    const source = [
      `import * as repo from './repository'`,
      `import { auth } from '../auth/service'`,
      `import express from 'express'`,
    ].join('\n')

    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 2)
    assert.equal(matches[0].relativePath, '@server/payments/repository')
    assert.equal(matches[1].relativePath, '@server/auth/service')
  })

  it('should handle require()', () => {
    const source = `const repo = require('./repository')`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '@server/payments/repository')
  })

  it('should handle dynamic import()', () => {
    const source = `const mod = await import('./repository')`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '@server/payments/repository')
  })

  it('should correctly compute pathStart offset', () => {
    const source = `import { foo } from './repository'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(
      source.slice(matches[0].pathStart, matches[0].pathStart + matches[0].importPath.length),
      './repository'
    )
  })
})
