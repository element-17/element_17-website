import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    // three 被拆成独立异步 chunk（Scene 懒加载），单 chunk 偏大是预期行为
    chunkSizeWarningLimit: 1100,
  },
})
