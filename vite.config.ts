import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'exclude-local-deployment-tool',
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (/[/\\](tools[/\\](deploy|verify)|scripts[/\\](deploy|verify|contracts))[/\\]/.test(id) || id.includes('teaching-artifact') || id.includes('verification-artifact')) {
          this.error(`Local deployment module cannot enter production: ${id}`)
        }
      }
    },
  }],
  base: '/dpl-web/',
})
