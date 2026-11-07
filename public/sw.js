// 离线缓存：
// - 安装/每次成功加载页面后，从 "/" 出发抓取所有 /assets 下的 js/css（含懒加载分包）并缓存，保证断网可打开；
// - 页面导航网络优先（3 秒超时），失败回退缓存的外壳；静态资源缓存优先；
// - /v1/ 与 /oauth/ 不经过缓存，业务数据由页面自己存在 localStorage。
const CACHE = "secscore-web-v3"
const SKIP_CHUNK = /\/(xlsx|AutoScoreManager)/ // Web 端用不到的大分包，不预缓存
const NAV_TIMEOUT_MS = 3000

const putIfOk = async (cache, url, res) => {
  if (res.ok && !(res.headers.get("content-type") || "").includes("text/html")) {
    await cache.put(url, res.clone())
  }
}

const assetRefs = (text) => {
  const found = new Set()
  for (const m of text.matchAll(/assets\/[\w.\-]+\.(?:js|css)/g)) found.add("/" + m[0])
  for (const m of text.matchAll(/["'`]\.\/([\w.\-]+\.(?:js|css))["'`]/g)) found.add("/assets/" + m[1])
  return found
}

// 从入口 HTML 出发广度抓取依赖；全部成功后清理不再被引用的旧哈希文件。
const precache = async (html) => {
  const cache = await caches.open(CACHE)
  const queue = [...assetRefs(html)]
  const seen = new Set(queue)
  let complete = true
  while (queue.length && seen.size < 400) {
    const url = queue.shift()
    if (SKIP_CHUNK.test(url)) continue
    try {
      let res = await cache.match(url)
      if (!res) {
        res = await fetch(url)
        await putIfOk(cache, url, res)
      }
      if (url.endsWith(".js") && res.ok) {
        for (const ref of assetRefs(await res.clone().text())) {
          if (!seen.has(ref)) {
            seen.add(ref)
            queue.push(ref)
          }
        }
      }
    } catch {
      complete = false
    }
  }
  if (complete) {
    for (const req of await cache.keys()) {
      const p = new URL(req.url).pathname
      if (p.startsWith("/assets/") && !seen.has(p)) await cache.delete(req)
    }
  }
}

const refreshShell = async () => {
  const res = await fetch("/", { cache: "no-store" })
  if (!res.ok) return
  const cache = await caches.open(CACHE)
  await cache.put("/", res.clone())
  await precache(await res.text())
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(["/", "/manifest.webmanifest"])
      self.skipWaiting()
      // 预缓存失败（比如安装时网络差）不应使安装失败，之后每次导航会再试。
      await refreshShell().catch(() => void 0)
    })()
  )
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== "GET" || url.origin !== location.origin) return
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/oauth/")) return
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const network = fetch(req).then(async (r) => {
          if (r.ok) {
            const copy = r.clone()
            e.waitUntil(
              (async () => {
                const cache = await caches.open(CACHE)
                await cache.put("/", copy.clone())
                await precache(await copy.text()).catch(() => void 0)
              })()
            )
          }
          return r
        })
        try {
          return await Promise.race([
            network,
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
          ])
        } catch {
          network.catch(() => void 0)
          return (await caches.match("/")) || Response.error()
        }
      })()
    )
    return
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok && !(r.headers.get("content-type") || "").includes("text/html")) {
            const copy = r.clone()
            e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)))
          }
          return r
        })
    )
  )
})
