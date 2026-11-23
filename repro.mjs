// node repro.mjs [--control] [--rebuild-everywhere]
//
// Each step runs `build.mjs` in its own process, sharing app/.cache.
//
//   repro:   cold run → watch session that drops an import → warm run
//   control: the same final sources, built once with a fresh cache
//
// The cold run and the watch session call compilation.rebuildModule() on
// one unchanged module. --rebuild-everywhere also calls it in the warm run;
// that run aborts in about half the attempts, so it tries up to 5 times.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const control = process.argv.includes('--control')
const rebuildEverywhere = process.argv.includes('--rebuild-everywhere')

// Returns false when the process exits with an error or a signal.
function build(...args) {
  console.log(`$ node build.mjs ${args.join(' ')}`)
  try {
    execFileSync('node', ['build.mjs', ...args], { stdio: 'inherit' })
    return true
  } catch (error) {
    console.log(`  exited with ${error.status ?? error.signal}`)
    return false
  }
}

// Start from the initial sources, with no cache.
function reset() {
  fs.rmSync('app', { recursive: true, force: true })
  fs.cpSync('fixture/src', 'app/src', { recursive: true })
}

if (control) {
  reset()
  fs.copyFileSync('fixture/edited/a.js', 'app/src/a.js')
  build('run', '--rebuild')
} else if (rebuildEverywhere) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`attempt ${attempt}`)
    reset()
    build('run', '--rebuild')
    build('watch', '--rebuild')
    if (!build('run', '--rebuild')) {
      break
    }
  }
} else {
  reset()
  build('run', '--rebuild')
  build('watch', '--rebuild')
  build('run')
}
