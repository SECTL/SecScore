import { resolve } from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  // lite 模式（vite build --mode lite）构建便携减法版；默认为 full 完整版。
  const isLite = mode === "lite"

  return {
    plugins: [react()],
    define: {
      __LITE__: JSON.stringify(isLite),
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    optimizeDeps: {
      // Avoid scanning legacy `old-ss` entries under project root.
      entries: ["index.html"],
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
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
        watch: {
          ignored: ["**/src-tauri/target/**"],
        },
    },
    clearScreen: false,
  }
})
