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
})
