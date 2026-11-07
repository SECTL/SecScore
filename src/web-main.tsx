import "./assets/main.css"
import "./i18n"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ClientContext } from "./ClientContext"
import { StudentService } from "./services/StudentService"
import { ServiceProvider } from "./contexts/ServiceContext"
import { InstallPrompt } from "./web/InstallPrompt"
import { cloudApi, ensureLogin, startAutoRefresh } from "./web/cloudApi"
;(window as any).__SECSCORE_LAN__ = true
;(window as any).__SECSCORE_WEB__ = true
;(window as any).api = cloudApi

// 部署后旧分包文件名失效时，自动清掉旧缓存并重载一次，避免白屏。
window.addEventListener("vite:preloadError", () => {
  // 离线时分包加载失败是预期的，清缓存只会让离线更糟。
  if (!navigator.onLine) return
  if (sessionStorage.getItem("ssw_chunk_reload")) return
  sessionStorage.setItem("ssw_chunk_reload", "1")
  void caches
    .keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .finally(() => location.reload())
})

void ensureLogin().then((ready) => {
  if (!ready) return
  startAutoRefresh()
  const ctx = new ClientContext()
  new StudentService(ctx)
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ServiceProvider value={ctx}>
        <App />
      </ServiceProvider>
    </StrictMode>
  )
  // 独立挂载，避免受主应用布局影响。
  const promptHost = document.createElement("div")
  document.body.appendChild(promptHost)
  createRoot(promptHost).render(<InstallPrompt />)
})

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => void 0))
}
