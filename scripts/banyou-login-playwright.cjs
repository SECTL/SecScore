const { chromium } = require("playwright")

const LOGIN_URL = "https://care.seewo.com/"
const LOGIN_BUTTON_SELECTOR = "a#index-login-btn"
const USER_PANEL_SELECTOR = "span#user-info-panel"
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000

const toCookieHeader = (cookies) => {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
}

;(async () => {
  let browser
  try {
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60 * 1000 })
    await page.locator(LOGIN_BUTTON_SELECTOR).click({ timeout: 60 * 1000 })
    await page.locator(USER_PANEL_SELECTOR).waitFor({
      state: "visible",
      timeout: LOGIN_TIMEOUT_MS,
    })

    const cookies = await context.cookies(LOGIN_URL)
    const cookieHeader = toCookieHeader(cookies)
    if (!cookieHeader) {
      throw new Error("No care.seewo.com cookies were captured after login")
    }

    process.stdout.write(
      JSON.stringify({
        cookie: cookieHeader,
        count: cookies.length,
      })
    )
  } catch (error) {
    process.stderr.write(error && error.stack ? error.stack : String(error))
    process.exitCode = 1
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined)
    }
  }
})()
