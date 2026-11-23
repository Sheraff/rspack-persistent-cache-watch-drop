// One build of `app/` with a persistent cache in `app/.cache`.
//
//   node build.mjs run              compiler.run()
//   node build.mjs watch            compiler.watch(): after the first build, overwrite
//                                   app/src/a.js with fixture/edited/a.js (it drops its
//                                   only import), wait for the rebuild, idle 1 s, close
//   add --rebuild to call compilation.rebuildModule(b.js) at finishMake
//
// Prints one line per compilation: error count, how many modules of
// app/src/dropped/ the compilation holds, and the first error.
import fs from 'node:fs/promises'
import path from 'node:path'
import { rspack } from '@rspack/core'

const mode = process.argv[2]
const rebuild = process.argv.includes('--rebuild')
const app = path.resolve('app')

// Rebuilds an unchanged module in place, as a plugin that re-runs a loader would.
class RebuildModulePlugin {
  apply(compiler) {
    compiler.hooks.finishMake.tapPromise('RebuildModulePlugin', async (compilation) => {
      const b = [...compilation.modules].find((module) => module.resource?.endsWith('/src/b.js'))
      await new Promise((resolve, reject) => {
        compilation.rebuildModule(b, (error) => (error ? reject(error) : resolve()))
      })
    })
  }
}

const compiler = rspack({
  mode: 'production',
  context: app,
  entry: './src/index.js',
  output: { path: path.join(app, 'dist') },
  optimization: { minimize: false },
  cache: {
    type: 'persistent',
    storage: { type: 'filesystem', directory: path.join(app, '.cache') },
  },
  plugins: rebuild ? [new RebuildModulePlugin()] : [],
})

function report(label, stats) {
  const { errors } = stats.toJson({ all: false, errors: true })
  const dropped = [...stats.compilation.modules].filter((module) =>
    module.resource?.includes('/src/dropped/'),
  )
  const firstError = errors[0]?.message.split('\n').find((line) => line.trim())
  console.log(
    `  ${label}: ${errors.length} errors, ${dropped.length} modules of src/dropped/` +
      (firstError ? `\n    ${firstError.trim()}` : ''),
  )
}

function close() {
  return new Promise((resolve) => compiler.close(resolve))
}

if (mode === 'run') {
  const stats = await new Promise((resolve, reject) => {
    compiler.run((error, stats) => (error ? reject(error) : resolve(stats)))
  })
  report('run', stats)
} else if (mode === 'watch') {
  let builds = 0
  let finish
  const finished = new Promise((resolve) => (finish = resolve))
  const watching = compiler.watch({}, async (error, stats) => {
    if (error) {
      throw error
    }
    builds++
    report(`watch build ${builds}`, stats)
    if (builds === 1) {
      // Wait a little so the watcher sees the write as a change.
      await new Promise((resolve) => setTimeout(resolve, 500))
      await fs.copyFile('fixture/edited/a.js', path.join(app, 'src/a.js'))
    } else {
      // Close after a short idle, as a watch session normally would.
      setTimeout(finish, 1000)
    }
  })
  await finished
  await new Promise((resolve) => watching.close(resolve))
}
await close()
