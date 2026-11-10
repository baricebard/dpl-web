import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadVerificationArtifact } from '../../scripts/verify/artifact.ts'

export default defineConfig(({ command, mode }) => {
  if (command !== 'serve' || mode !== 'development') throw new Error('Readonly verification tool is localhost development only; no build or preview')
  return {
    root: import.meta.dirname, base: '/', publicDir: false,
    plugins: [react(), {
      name: 'localhost-readonly-verifier',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const remote = req.socket.remoteAddress
          const host = req.headers.host?.split(':')[0]
          if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '') || !['localhost', '127.0.0.1'].includes(host ?? '')) {
            res.statusCode = 403; res.end('Localhost only'); return
          }
          next()
        })
      },
      resolveId(id) { if (id === 'virtual:verification-artifact') return '\0verification-artifact' },
      load(id) { if (id === '\0verification-artifact') return `export default ${JSON.stringify(loadVerificationArtifact())}` },
    }],
    server: { host: '127.0.0.1', port: 5175, strictPort: true, allowedHosts: ['localhost'], cors: false,
      fs: { allow: [resolve(import.meta.dirname, '../..')] } },
  }
})
