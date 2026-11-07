import "./assets/main.css"
import "./i18n"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ClientContext } from "./ClientContext"
import { StudentService } from "./services/StudentService"
import { ServiceProvider } from "./contexts/ServiceContext"
import { cloudApi, ensureLogin, startAutoRefresh } from "./web/cloudApi"
;(window as any).__SECSCORE_LAN__ = true
;(window as any).__SECSCORE_WEB__ = true
;(window as any).api = cloudApi

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
})

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => void 0))
}
