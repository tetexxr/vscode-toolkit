const esbuild = require('esbuild')

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

const shared = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'info',
  // `vscode` is provided by the host; `typescript` is a runtime dependency used
  // by the type-only-imports feature and is shipped from node_modules (see
  // .vscodeignore) rather than inlined — it's large and resolves fine at runtime.
  external: ['vscode', 'typescript']
}

const builds = [
  { ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js' },
  // The Regex Playground spawns this as a worker thread via
  // `new Worker(path.join(__dirname, 'regex-worker.js'))`, so it must be emitted
  // as its own bundle next to extension.js in dist/.
  { ...shared, entryPoints: ['src/features/workspace/regex-worker.ts'], outfile: 'dist/regex-worker.js' }
]

async function main() {
  const contexts = await Promise.all(builds.map(b => esbuild.context(b)))
  if (watch) {
    await Promise.all(contexts.map(c => c.watch()))
  } else {
    await Promise.all(contexts.map(c => c.rebuild()))
    await Promise.all(contexts.map(c => c.dispose()))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
