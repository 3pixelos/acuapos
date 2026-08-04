import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
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
  plugins: [
    react(),
    // Lowering the build target fixed the SYNTAX, but Vite still shipped the
    // app as <script type="module"> — and a WebView older than Chrome 61
    // doesn't just fail on those, it IGNORES them. No error, no exception,
    // nothing to catch: the tag is skipped and the page stays blank. That is
    // why the older handsets still showed nothing after the target change.
    //
    // This emits a SECOND, classic-script copy of the app marked `nomodule`,
    // which is the only thing such a browser will run, plus the core-js
    // polyfills those builds need. Modern phones ignore the legacy bundle
    // entirely and are unaffected — they never download it.
    legacy({
      // CHROME 49 IS THE FLOOR, and no build setting can move it. The app
      // uses Proxy (6 sites) and Reflect.construct (8) by way of its
      // dependencies, and neither can be polyfilled — they need engine
      // support. Proxy landed in Chrome 49. Targeting anything older just
      // produces a bundle that parses and then dies on the first render.
      //
      // So this targets exactly that floor. A phone below it cannot run the
      // app at all; the boot guard reports its Chrome version so that is a
      // fact on screen rather than a guess.
      targets: ['chrome >= 49', 'android >= 5', 'safari >= 10', 'ios >= 10'],
      modernPolyfills: true,
    }),
    tailwindcss(),
    versionFile(),
  ],
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
    //
    // Matches the legacy floor. This has to be set HERE as well as in the
    // legacy plugin: Babel down-levels the legacy chunks, and then the
    // minifier re-modernises them back up to whatever this says.
    target: ['chrome49'],
  },
})
