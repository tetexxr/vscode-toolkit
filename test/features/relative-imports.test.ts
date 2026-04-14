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
  type ResolvedPaths
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
    const mappings = buildMappings({ '@lib/*': ['src/lib/*'] })
    assert.equal(mappings.length, 1)
    assert.equal(mappings[0].prefix, '@lib/')
    assert.equal(mappings[0].wildcard, true)
    assert.deepEqual(mappings[0].targets, ['src/lib/*'])
  })

  it('should create exact mapping', () => {
    const mappings = buildMappings({ '@config': ['src/config/index'] })
    assert.equal(mappings.length, 1)
    assert.equal(mappings[0].prefix, '@config')
    assert.equal(mappings[0].wildcard, false)
  })

  it('should sort by prefix length (longest first)', () => {
    const mappings = buildMappings({
      '@a/*': ['a/*'],
      '@a/b/*': ['ab/*'],
      '@ab/c/*': ['abc/*']
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
      '@lib/*': ['src/lib/*'],
      '@config': ['src/config/index'],
      '@views/*': ['src/ui/views/*']
    })
  }

  it('should resolve wildcard alias', () => {
    const result = resolveAlias('@lib/orders/store', config)
    assert.equal(result, path.resolve('/project', 'src/lib/orders/store'))
  })

  it('should resolve exact alias', () => {
    const result = resolveAlias('@config', config)
    assert.equal(result, path.resolve('/project', 'src/config/index'))
  })

  it('should return undefined for non-matching import', () => {
    assert.equal(resolveAlias('lodash', config), undefined)
    assert.equal(resolveAlias('./local', config), undefined)
  })

  it('should resolve deeply nested wildcard path', () => {
    const result = resolveAlias('@views/Dashboard/styles', config)
    assert.equal(result, path.resolve('/project', 'src/ui/views/Dashboard/styles'))
  })

  it('should not match partial prefix', () => {
    // '@library/foo' should NOT match '@lib/*'
    assert.equal(resolveAlias('@library/foo', config), undefined)
  })
})

describe('toRelative', () => {
  it('should return ./ for same directory', () => {
    const result = toRelative('/project/src/a/controller.ts', '/project/src/a/model')
    assert.equal(result, './model')
  })

  it('should return ../ for parent directory', () => {
    const result = toRelative('/project/src/a/controller.ts', '/project/src/b/helpers')
    assert.equal(result, '../b/helpers')
  })

  it('should handle deeply nested paths', () => {
    const result = toRelative('/project/src/lib/orders/controller.ts', '/project/src/lib/catalog/helpers')
    assert.equal(result, '../catalog/helpers')
  })

  it('should handle going up multiple levels', () => {
    const result = toRelative('/project/src/deep/nested/file.ts', '/project/src/common/format')
    assert.equal(result, '../../common/format')
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
        paths: { '@app/*': ['src/*'] }
      }
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
        paths: { '@/*': ['*'] }
      }
    })
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.baseUrl, path.join(root, 'src'))
  })

  it('should follow extends chain', () => {
    writeJson(path.join(root, 'tsconfig.base.json'), {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@lib/*': ['lib/*'] }
      }
    })
    writeJson(path.join(root, 'tsconfig.json'), {
      extends: './tsconfig.base.json'
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
        paths: { '@/*': ['*'] }
      }
    })
    writeJson(path.join(root, 'tsconfig.json'), {
      extends: './tsconfig.base.json',
      compilerOptions: { baseUrl: 'src' }
    })
    const result = loadPathsFromConfig(path.join(root, 'tsconfig.json'))
    assert.ok(result)
    assert.equal(result.baseUrl, path.join(root, 'src'))
  })

  it('should return undefined when no paths are defined', () => {
    writeJson(path.join(root, 'tsconfig.json'), {
      compilerOptions: { strict: true }
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
      '@lib/*': ['src/lib/*'],
      '@config': ['src/config/index']
    })
  }

  const filePath = '/project/src/lib/orders/controller.ts'

  it('should match import ... from', () => {
    const source = `import * as store from '@lib/orders/store'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].importPath, '@lib/orders/store')
    assert.equal(matches[0].relativePath, './store')
  })

  it('should match named imports', () => {
    const source = `import { create, update } from '@lib/orders/store'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './store')
  })

  it('should match require()', () => {
    const source = `const store = require('@lib/orders/store')`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './store')
  })

  it('should match dynamic import()', () => {
    const source = `const mod = await import('@lib/orders/store')`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './store')
  })

  it('should match export ... from', () => {
    const source = `export { create } from '@lib/orders/store'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './store')
  })

  it('should match export * from', () => {
    const source = `export * from '@lib/orders/store'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './store')
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
      `import * as store from '@lib/orders/store'`,
      `import { search } from '@lib/catalog/helpers'`,
      `import express from 'express'`,
      `import { validate } from './validate'`
    ].join('\n')

    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 2)
    assert.equal(matches[0].relativePath, './store')
    assert.equal(matches[1].relativePath, '../catalog/helpers')
  })

  it('should handle double quotes', () => {
    const source = `import { foo } from "@lib/orders/store"`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, './store')
  })

  it('should correctly compute pathStart offset', () => {
    const source = `import { foo } from '@lib/orders/store'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    // The import path starts right after the opening quote
    assert.equal(
      source.slice(matches[0].pathStart, matches[0].pathStart + matches[0].importPath.length),
      '@lib/orders/store'
    )
  })

  it('should resolve cross-directory alias to correct relative path', () => {
    const deepFile = '/project/src/web/routes/orders.ts'
    const source = `import { store } from '@lib/orders/store'`
    const matches = findImportMatches(source, deepFile, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '../../lib/orders/store')
  })

  it('should resolve exact alias', () => {
    const source = `import { settings } from '@config'`
    const matches = findImportMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '../../config/index')
  })
})

describe('toAlias', () => {
  const config: ResolvedPaths = {
    baseUrl: '/project',
    mappings: buildMappings({
      '@lib/*': ['src/lib/*'],
      '@config': ['src/config/index'],
      '@views/*': ['src/ui/views/*']
    })
  }

  it('should convert absolute path to wildcard alias', () => {
    const result = toAlias('/project/src/lib/orders/store', config)
    assert.equal(result, '@lib/orders/store')
  })

  it('should convert absolute path to exact alias', () => {
    const result = toAlias('/project/src/config/index', config)
    assert.equal(result, '@config')
  })

  it('should return undefined for paths outside any alias', () => {
    assert.equal(toAlias('/project/src/other/thing', config), undefined)
  })

  it('should handle nested alias paths', () => {
    const result = toAlias('/project/src/ui/views/Dashboard/styles', config)
    assert.equal(result, '@views/Dashboard/styles')
  })

  it('should use the most specific alias', () => {
    const config2: ResolvedPaths = {
      baseUrl: '/project',
      mappings: buildMappings({
        '@app/*': ['src/*'],
        '@app/lib/*': ['src/lib/*']
      })
    }
    const result = toAlias('/project/src/lib/logger', config2)
    assert.equal(result, '@app/lib/logger')
  })
})

// --- findAliasMatches ---

describe('findAliasMatches', () => {
  const config: ResolvedPaths = {
    baseUrl: '/project',
    mappings: buildMappings({
      '@lib/*': ['src/lib/*'],
      '@config': ['src/config/index']
    })
  }

  const filePath = '/project/src/lib/orders/controller.ts'

  it('should convert relative import to alias', () => {
    const source = `import * as store from './store'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].importPath, './store')
    assert.equal(matches[0].relativePath, '@lib/orders/store')
  })

  it('should convert parent-relative import to alias', () => {
    const source = `import { search } from '../catalog/helpers'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '@lib/catalog/helpers')
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
      `import * as store from './store'`,
      `import { search } from '../catalog/helpers'`,
      `import express from 'express'`
    ].join('\n')

    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 2)
    assert.equal(matches[0].relativePath, '@lib/orders/store')
    assert.equal(matches[1].relativePath, '@lib/catalog/helpers')
  })

  it('should handle require()', () => {
    const source = `const store = require('./store')`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '@lib/orders/store')
  })

  it('should handle dynamic import()', () => {
    const source = `const mod = await import('./store')`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].relativePath, '@lib/orders/store')
  })

  it('should correctly compute pathStart offset', () => {
    const source = `import { foo } from './store'`
    const matches = findAliasMatches(source, filePath, config)
    assert.equal(matches.length, 1)
    assert.equal(source.slice(matches[0].pathStart, matches[0].pathStart + matches[0].importPath.length), './store')
  })
})
