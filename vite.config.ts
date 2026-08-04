import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Unique id per build, baked into the bundle AND emitted as version.json.
// The app polls version.json and reloads itself when the two stop matching,
// so waiter phones (especially installed-PWA ones that cling to cached
// bundles) always pick up a new deploy without anyone clearing caches.
const buildId = Date.now().toString(36)

const versionFile = (): Plugin => ({
  name: 'emit-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: buildId }) })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: {
    // The waiters' phones are not all new. Vite's default target assumes a
    // browser that understands `?.`, `??` and `??=` — Chrome 80, which is
    // Android 10. An older handset's WebView hits the first `?.`, throws a
    // SyntaxError before a single line runs, and shows a blank white page
    // with no clue why. Lowering the target makes esbuild rewrite that
    // syntax, at the cost of a slightly larger bundle.
    //
    // This only covers SYNTAX. Missing runtime APIs on a genuinely ancient
    // WebView would still fail — but the boot guard in index.html now says
    // so out loud instead of showing white.
    target: ['es2015', 'chrome58', 'safari11'],
  },
})
