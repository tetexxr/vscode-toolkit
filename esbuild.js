const esbuild = require('esbuild')

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'info',
    // `vscode` is provided by the host; `typescript` is a runtime dependency used
    // by the type-only-imports feature and is shipped from node_modules (see
    // .vscodeignore) rather than inlined — it's large and resolves fine at runtime.
    external: ['vscode', 'typescript']
  })
  if (watch) {
    await ctx.watch()
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
