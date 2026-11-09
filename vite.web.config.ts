import { resolve } from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, "web.html") },
  },
})
