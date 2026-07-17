import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/rmsl.ts',
      name: 'rmsl',
      fileName: 'rmsl',
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
    },
  },
  plugins: [
    dts({
      include: ['src/rmsl.ts'],
      outDir: 'dist',
      rollupTypes: true,
    }),
  ],
})
