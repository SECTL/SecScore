import { useState } from "react"

function Versions(): React.JSX.Element {
  const [versions] = useState({
    tauri: "2.x",
    webview: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || "unknown",
  })

  return (
    <ul className="versions">
      <li className="tauri-version">Tauri v{versions.tauri}</li>
      <li className="webview-version">WebView Chrome v{versions.webview}</li>
    </ul>
  )
}

export default Versions
