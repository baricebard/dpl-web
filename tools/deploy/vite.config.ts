import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadDeploymentArtifact } from '../../scripts/deploy/artifact.ts'

export default defineConfig(({ command, mode }) => {
  if (command !== 'serve' || mode !== 'development') throw new Error('Local deployment tool cannot be built or previewed')
  return {
    root: import.meta.dirname, base: '/', publicDir: false,
    plugins: [react(), {
      name: 'local-hardhat-artifact',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const remote = req.socket.remoteAddress
          const host = req.headers.host?.split(':')[0]
          if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '') || !['127.0.0.1', 'localhost'].includes(host ?? '')) {
            res.statusCode = 403; res.end('Localhost only'); return
          }
          next()
        })
      },
      resolveId(id) { if (id === 'virtual:teaching-artifact' || id === 'virtual:exchange-artifact') return '\0' + id.slice(8) },
      load(id) {
        if (id === '\0teaching-artifact') return `export default ${JSON.stringify(loadDeploymentArtifact())}`
        if (id === '\0exchange-artifact') return `export default ${JSON.stringify(loadDeploymentArtifact('DPLFixedExchange'))}`
      },
    }],
    server: { host: '127.0.0.1', port: 5174, strictPort: true, allowedHosts: ['localhost'], cors: false,
      fs: { allow: [resolve(import.meta.dirname, '../..')] },
      // Prevent accidental exposure even if a caller overrides --host.
    },
  }
})
