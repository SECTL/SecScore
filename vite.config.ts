import { resolve } from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    // Avoid scanning legacy `old-ss` entries under project root.
    entries: ["index.html", "settings-window.html"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "settings-window": resolve(__dirname, "settings-window.html"),
      },
    },
  },
  server: {
    host: process.env.TAURI_DEV_HOST || false,
    port: 1420,
    strictPort: false,
    hmr: process.env.TAURI_DEV_HOST
      ? {
          protocol: "ws",
          host: process.env.TAURI_DEV_HOST,
          port: 1421,
        }
      : undefined,
  },
  clearScreen: false,
})
