// Records every scene of the demo video from the running app (web on :5173, API on :8000).
// Frames come from the Chrome DevTools screencast (sharp JPEGs with timestamps); each narration line
// gets a timestamp mark so subtitles appear exactly when their moment is on screen.
//
//   node demo-video/record.mjs            prepare data, then record every scene
//   node demo-video/record.mjs root meal  record only these scenes (no data reset)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(HERE, '..', 'frontend', 'package.json'))
const { chromium } = require('@playwright/test')

const WEB = process.env.WEB ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://localhost:8000/api/v1'
const OUT = path.join(HERE, 'out', 'frames')
const story = JSON.parse(fs.readFileSync(path.join(HERE, 'storyboard.json'), 'utf8'))
const SCENES = Object.fromEntries(story.scenes.map((s) => [s.id, s]))
const WPS = story.words_per_second
const GAP_MS = 450
const ALEX = { name: 'Alex Morgan', email: 'alex.morgan@example.com', password: 'Warehouse-2026' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lineMs = (scene, i) => (scene.lines[i].split(/\s+/).length / WPS + 0.35) * 1000

async function api(pathname, { method = 'GET', token, body } = {}) {
  const r = await fetch(API + pathname, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${pathname} -> ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
const demoLogin = (id) => api('/auth/demo-login', { method: 'POST', body: { user_id: id } })
const passwordLogin = (email, password) => api('/auth/login', { method: 'POST', body: { email, password } })

// ---------------------------------------------------------------- data preparation
const IDS = {}
async function prepare() {
  const admin = (await demoLogin('u-arjun')).access_token
  await api('/admin/reset', { method: 'POST', token: admin })
  const p = await api('/admin/provider', { method: 'PUT', token: admin, body: { provider: 'groq' } })
  console.log('provider', p.provider, p.available)
  await findIds(admin)
  // Pre-generate the real model drafts so scenes never wait on the model.
  for (const key of ['span', 'meal', 'kai', 'conflict', 'sam', 'otPriya']) {
    let d = await api(`/exceptions/${IDS[key]}/drafts`, { method: 'POST', token: admin, body: { force: false } })
    if (key === 'span' && d.route !== 'suggest') d = await api(`/exceptions/${IDS[key]}/drafts`, { method: 'POST', token: admin, body: { force: true } })
    console.log('draft', key, IDS[key], d.route, d.provider, `${d.latency_ms} ms`)
  }
}
async function findIds(token) {
  const q = await api('/exceptions', { token })
  const pick = (rule, emp) => q.items.find((i) => i.rule_id === rule && i.employee_id === emp)?.id
  Object.assign(IDS, {
    span: pick('R-PUNCH-SPAN', 'E-FRE-002'),
    meal: pick('R-MEAL-MISSED', 'E-FRE-003'),
    kai: pick('R-PUNCH-MISSING-OUT', 'E-FRE-007'),
    conflict: pick('F-SCHED-CONFLICT', 'E-FRE-012'),
    sam: pick('R-PUNCH-MISSING-OUT', 'E-FRE-006'),
    otPriya: pick('F-OT-RISK', 'E-FRE-003'),
  })
}

// ---------------------------------------------------------------- browser helpers
const CURSOR = `
(() => {
  const svg = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 2 L4 21 L9 16.5 L12.5 24 L15.6 22.6 L12.2 15.3 L19 15.3 Z" fill="#111827" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  const install = () => {
    if (document.getElementById('__cur')) return
    const c = document.createElement('div')
    c.id = '__cur'
    c.innerHTML = svg
    const last = JSON.parse(sessionStorage.getItem('__cur') || '[840,470]')
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(' + last[0] + 'px,' + last[1] + 'px)', filter: 'drop-shadow(0 2px 4px rgb(0 0 0 / .35))' })
    document.documentElement.appendChild(c)
    document.addEventListener('mousemove', (e) => {
      c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'
      sessionStorage.setItem('__cur', JSON.stringify([e.clientX, e.clientY]))
    }, true)
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      Object.assign(r.style, { position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px', width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgb(109 139 255 / .9)', background: 'rgb(109 139 255 / .18)', zIndex: '2147483646', pointerEvents: 'none', transition: 'transform .5s ease-out, opacity .5s ease-out' })
      document.documentElement.appendChild(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(1.9)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 600)
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install)
  else install()
})()
`

class Take {
  constructor(scene, page, cdp) {
    this.scene = scene
    this.page = page
    this.cdp = cdp
    this.marks = {}
    this.frames = []
    this.mouse = [800, 450]
    this.dir = path.join(OUT, scene.id)
  }
  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
    let n = 0
    this.cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      const file = `f${String(n++).padStart(6, '0')}.jpg`
      fs.writeFileSync(path.join(this.dir, file), Buffer.from(data, 'base64'))
      this.frames.push({ t: metadata.timestamp, file })
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId }) } catch {}
    })
    const vp = this.page.viewportSize()
    const dpr = await this.page.evaluate(() => window.devicePixelRatio)
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr), everyNthFrame: 1 })
    await this.nudge()
    await sleep(250)
    this.t0 = Date.now() / 1000
  }
  async stop() {
    this.end = Date.now() / 1000
    await sleep(300)
    await this.cdp.send('Page.stopScreencast')
    fs.writeFileSync(path.join(this.dir, 'meta.json'), JSON.stringify({ id: this.scene.id, t0: this.t0, end: this.end, marks: this.marks, frames: this.frames }, null, 1))
    console.log(`recorded ${this.scene.id}: ${(this.end - this.t0).toFixed(1)} s, ${this.frames.length} frames`)
  }
  async nudge() {
    // Force a repaint so the screencast emits a frame even on a static page.
    await this.page.evaluate(() => { const c = document.getElementById('__cur'); if (c) c.style.opacity = c.style.opacity === '0.999' ? '1' : '0.999' })
  }
  async say(i, during) {
    const t = Date.now()
    this.marks[i] = t / 1000
    if (during) await during()
    const left = lineMs(this.scene, i) + GAP_MS - (Date.now() - t)
    if (left > 0) await sleep(left)
  }
  async hold(ms) {
    await sleep(ms)
  }
  async moveTo(target, ms = 650) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target
    await loc.scrollIntoViewIfNeeded().catch(() => {})
    const b = await loc.boundingBox()
    if (!b) return
    const [x0, y0] = this.mouse
    const x1 = b.x + b.width / 2
    const y1 = b.y + Math.min(b.height / 2, 22)
    const steps = Math.max(8, Math.round(ms / 16))
    for (let k = 1; k <= steps; k++) {
      const p = k / steps
      const e = 1 - Math.pow(1 - p, 3)
      await this.page.mouse.move(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e)
      await sleep(ms / steps)
    }
    this.mouse = [x1, y1]
  }
  async click(target, ms) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target
    await this.moveTo(loc, ms)
    await sleep(120)
    await this.page.mouse.down()
    await sleep(90)
    await this.page.mouse.up()
    await sleep(250)
  }
  async type(target, text, delay = 55) {
    await this.click(target)
    await this.page.keyboard.type(text, { delay })
  }
  async key(k, after = 500) {
    await this.page.keyboard.press(k)
    await sleep(after)
  }
  /** Smoothly scroll the window, or a scroll container, so `target` sits `offset` px from the top. */
  async scrollTo(target, { container = null, offset = 90, ms = 1100 } = {}) {
    await this.page.evaluate(
      ([sel, cont, offset, ms]) =>
        new Promise((res) => {
          const el = document.querySelector(sel)
          const box = cont ? document.querySelector(cont) : document.scrollingElement
          if (!el || !box) return res()
          const top = cont
            ? el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - offset
            : el.getBoundingClientRect().top + window.scrollY - offset
          const from = box.scrollTop
          const t0 = performance.now()
          const step = (now) => {
            const p = Math.min(1, (now - t0) / ms)
            box.scrollTop = from + (top - from) * (1 - Math.pow(1 - p, 3))
            if (p < 1) requestAnimationFrame(step)
            else res()
          }
          requestAnimationFrame(step)
        }),
      [target, container, offset, ms],
    )
    await sleep(150)
  }
  /** Smoothly scroll the window so the first element containing `text` sits at `offset` (or centred). */
  async scrollToText(text, { offset = 'center', ms = 1300 } = {}) {
    await this.page.evaluate(
      ([text, offset, ms]) =>
        new Promise((res) => {
          const all = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent && e.textContent.includes(text))
          const el = all[0]
          if (!el) return res()
          const r = el.getBoundingClientRect()
          const top = offset === 'center' ? r.top + window.scrollY - window.innerHeight / 2 + r.height / 2 : r.top + window.scrollY - offset
          const from = window.scrollY
          const t0 = performance.now()
          const step = (now) => {
            const p = Math.min(1, (now - t0) / ms)
            window.scrollTo(0, from + (top - from) * (1 - Math.pow(1 - p, 3)))
            if (p < 1) requestAnimationFrame(step)
            else res()
          }
          requestAnimationFrame(step)
        }),
      [text, offset, ms],
    )
    await sleep(150)
  }
  async scrollBy(dy, { container = null, ms = 900 } = {}) {
    await this.page.evaluate(
      ([dy, cont, ms]) =>
        new Promise((res) => {
          const box = cont ? document.querySelector(cont) : document.scrollingElement
          const from = box.scrollTop
          const t0 = performance.now()
          const step = (now) => {
            const p = Math.min(1, (now - t0) / ms)
            box.scrollTop = from + dy * (1 - Math.pow(1 - p, 3))
            if (p < 1) requestAnimationFrame(step)
            else res()
          }
          requestAnimationFrame(step)
        }),
      [dy, container, ms],
    )
  }
  /** Smooth camera zoom onto an element (CSS transform on <body>), and back. */
  async zoom(target, scale = 1.25, ms = 900) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target
    const b = await loc.boundingBox()
    if (!b) return
    await this.page.evaluate(
      ([cx, cy, scale, ms]) => {
        const s = document.body.style
        s.transition = `transform ${ms}ms cubic-bezier(.2,.8,.2,1)`
        s.transformOrigin = `${cx + window.scrollX}px ${cy + window.scrollY}px`
        s.transform = `scale(${scale})`
      },
      [b.x + b.width / 2, b.y + b.height / 2, scale, ms],
    )
    await sleep(ms + 100)
  }
  async unzoom(ms = 800) {
    await this.page.evaluate((ms) => {
      document.body.style.transition = `transform ${ms}ms cubic-bezier(.2,.8,.2,1)`
      document.body.style.transform = 'none'
    }, ms)
    await sleep(ms + 100)
  }
}

let browser
async function take(id, { viewport = { width: 1680, height: 945 }, dpr = 1, auth = null, url = null, tours = 'done', setup = null, cursor = true } = {}, run) {
  const scene = SCENES[id]
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: 'no-preference' })
  const page = await ctx.newPage()
  if (cursor) await page.addInitScript(CURSOR)
  await page.addInitScript(([tours]) => {
    localStorage.setItem('countersign.theme', 'light')
    if (tours === 'done') {
      localStorage.setItem('countersign.tour.landing', 'done')
      localStorage.setItem('countersign.tour.app', 'done')
    }
  }, [tours])
  if (auth) {
    await page.goto(WEB + '/login')
    await page.evaluate(([t, u]) => {
      localStorage.setItem('countersign.token', t)
      localStorage.setItem('countersign.user', JSON.stringify(u))
    }, [auth.access_token, auth.user])
  }
  if (url) {
    await page.goto(url.startsWith('file:') ? url : WEB + url)
    await page.waitForLoadState('networkidle').catch(() => {})
    await sleep(1800)
  }
  if (setup) await setup(page)
  const cdp = await ctx.newCDPSession(page)
  const t = new Take(scene, page, cdp)
  await t.start()
  await run(t, page)
  await t.stop()
  await ctx.close()
}

const cardUrl = (card) => pathToFileURL(path.join(HERE, 'cards', 'card.html')).href + '?' + new URLSearchParams(Object.entries(card).map(([k, v]) => [k, String(v)])).toString()
const DETAIL = 'section[aria-label="Exception detail"]'

// ---------------------------------------------------------------- scenes
const RUN = {
  async card(id) {
    const s = SCENES[id]
    await take(id, { url: cardUrl(s.card), viewport: { width: 1920, height: 1080 }, cursor: false }, async (t, page) => {
      await page.reload()
      await t.hold(600)
      for (let i = 0; i < s.lines.length; i++) await t.say(i)
      await t.hold(s.lines.length ? 900 : 2600)
    })
  },

  async problem() {
    await take('problem', { url: '/', setup: async (page) => { await page.goto('about:blank') } }, async (t, page) => {
      await page.goto(WEB + '/')
      await t.hold(1600)
      await t.say(0)
      await t.say(1, async () => { await t.scrollTo('#how', { offset: 70, ms: 1600 }) })
      await t.say(2, async () => { await t.moveTo(page.getByText('6 unexplained items')) })
      await t.say(3, async () => { await t.moveTo(page.getByText('1 root cause, verified')) })
      await t.scrollTo('[data-tour="demo"]', { offset: 40, ms: 1500 })
      await t.click('button[aria-label="Restart walkthrough"]')
      await t.say(4)
      await t.say(5)
      await t.hold(2400)
    })
  },

  async brief() {
    await take('brief', { url: '/', setup: async (page) => { await page.evaluate(() => { const el = document.querySelector('#brief'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64) }); await sleep(2500) } }, async (t, page) => {
      await t.say(0, async () => { await t.moveTo(page.locator('#brief blockquote')) })
      await t.say(1, async () => {
        for (const p of ['Missed Punches', 'Overtime Risks', 'Schedule Conflicts', 'Policy Breaches']) await t.moveTo(page.locator('#brief h3', { hasText: new RegExp(p, 'i') }), 500)
      })
      await t.say(2, async () => { await t.moveTo(page.getByText('Compliant, and proven so')) })
      await t.say(3, async () => {
        await t.scrollTo('#harness', { offset: 30, ms: 1500 })
        for (const g of ['G5', 'G7', 'G8']) await t.moveTo(page.locator('#harness ol button', { hasText: g }), 450).then(() => sleep(700))
      })
      await t.say(4, async () => {
        await t.scrollTo('#top', { offset: 0, ms: 1200 })
        await t.click(page.getByRole('button', { name: 'Take the 60-second tour' }))
        await sleep(1300)
        await t.key('ArrowRight', 1500)
        await t.key('ArrowRight', 1500)
      })
      await t.hold(1500)
      await t.key('Escape', 700)
    })
  },

  async register() {
    await take('register', { url: '/login' }, async (t, page) => {
      await t.hold(500)
      await t.click(page.getByRole('link', { name: /Create an account/ }))
      await sleep(900)
      await t.say(0, async () => {
        await t.type(page.getByLabel('Full name'), ALEX.name, 60)
        await t.type(page.getByLabel('Work email'), ALEX.email, 38)
        await t.click(page.getByText('Fremont DC'))
      })
      await t.say(1, async () => {
        await t.type(page.getByLabel('Password', { exact: true }), ALEX.password, 95)
        await t.type(page.getByLabel('Confirm password'), ALEX.password, 45)
      })
      await t.click(page.getByRole('button', { name: /Create account/ }))
      await page.waitForURL(/registered=1/)
      await sleep(900)
      await t.say(2, async () => {
        await t.type(page.getByLabel('Password', { exact: true }), ALEX.password, 60)
        await t.click(page.getByRole('button', { name: /^Sign in/ }))
        await page.waitForURL(/\/queue/)
        await sleep(1200)
      })
      await t.hold(1800)
    })
  },

  async queue() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('queue', { auth, url: `/queue?selected=${IDS.span}` }, async (t, page) => {
      await t.say(0, async () => { await t.moveTo('[data-tour="queue-progress"]'); await sleep(500); await t.moveTo('[data-tour="cutoff"]') })
      await t.say(1, async () => {
        for (const l of ['Missed punches', 'Overtime risks', 'Schedule conflicts', 'Policy breaches']) await t.moveTo(page.locator('[data-tour="queue-lenses"] button', { hasText: l }), 420).then(() => sleep(350))
      })
      await t.say(2, async () => { await t.moveTo('[data-tour="briefing"]') })
      await t.say(3, async () => { await t.moveTo(page.getByRole('button', { name: /Start with/ })) })
      await t.say(4, async () => {
        await t.moveTo('[data-tour="shortcuts"]')
        await sleep(400)
        await t.key('j', 1600)
        await t.key('k', 900)
      })
      await t.say(5, async () => { await t.moveTo('[data-tour="provider"]') })
      await t.hold(600)
    })
  },

  async root() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('root', { auth, url: `/queue?selected=${IDS.span}` }, async (t, page) => {
      await t.say(0, async () => { await t.zoom('[data-tour="detail-header"]', 1.18); await sleep(1800); await t.unzoom() })
      await t.say(1, async () => {
        await t.moveTo(page.locator('[data-id]', { hasText: 'Two shifts joined' }).first().getByText(/Fixes 2 related/))
        await sleep(500)
        await t.moveTo(page.locator('[data-id]', { hasText: 'symptom' }).first())
      })
      await t.say(2, async () => {
        await t.scrollTo('[data-tour="detail-timeline"]', { container: DETAIL, offset: 16 })
        await t.click(page.getByRole('tab', { name: 'As recorded' }))
        await t.moveTo(page.locator('[data-tour="detail-timeline"]'))
      })
      await t.say(3, async () => { await t.click(page.getByRole('tab', { name: 'With correction' })) })
      await t.say(4, async () => {
        await t.scrollTo('[data-tour="detail-evidence"]', { container: DETAIL, offset: 16 })
        await t.moveTo(page.getByText(/phantom overtime removed/).first())
      })
      await t.say(5, async () => {
        await t.scrollTo('[data-tour="detail-draft"]', { container: DETAIL, offset: 16 })
        const chip = page.locator('[data-tour="detail-draft"] blockquote button').first()
        await t.click(chip)
        await sleep(2600)
      })
      await t.say(6, async () => {
        await t.key('Escape', 400)
        await t.scrollTo('[data-tour="detail-gates"]', { container: DETAIL, offset: 140 })
        for (const g of ['G1', 'G3', 'G5', 'G7', 'G8', 'G9']) await t.moveTo(page.locator('[aria-label="Harness gates"] li', { hasText: g }).first(), 330).then(() => sleep(250))
      })
      await t.say(7, async () => { await t.moveTo(page.locator('button[aria-label^="Evidence strength"]')) })
      await t.hold(800)
    })
  },

  async approve() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('approve', { auth, url: `/exceptions/${IDS.span}`, setup: async (page) => { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(900) } }, async (t, page) => {
      await t.say(0, async () => {
        await t.click(page.getByRole('button', { name: /Approve/ }))
        await sleep(500)
        await t.click(page.getByRole('button', { name: /Confirm/ }))
      })
      await t.say(1, async () => { await sleep(2600) })
      await t.click(page.locator('aside nav a', { hasText: 'Queue' }))
      await t.hold(2600)
    })
  },

  async meal() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('meal', { auth, url: `/queue?selected=${IDS.meal}` }, async (t, page) => {
      await t.say(0, async () => { await t.moveTo('[data-tour="detail-header"]'); await t.scrollTo('[data-tour="detail-timeline"]', { container: DETAIL, offset: 16 }) })
      await t.say(1, async () => {
        await t.scrollTo('[data-tour="detail-gates"]', { container: DETAIL, offset: 140 })
        await t.moveTo(page.locator('[aria-label="Harness gates"] li', { hasText: 'G9' }).first())
      })
      await t.say(2, async () => {
        await t.scrollTo('[data-tour="detail-draft"]', { container: DETAIL, offset: 16 })
        await t.moveTo(page.locator('[data-tour="detail-draft"] li').first())
      })
      await t.hold(700)
    })
  },

  async injection() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('injection', { auth, url: `/queue?selected=${IDS.kai}` }, async (t, page) => {
      await t.say(0, async () => {
        await t.scrollTo('[data-tour="detail-evidence"]', { container: DETAIL, offset: 16 })
        await t.zoom(page.locator('figure').first(), 1.22)
      })
      await t.say(1, async () => { await t.moveTo(page.getByText('Injection attempt detected').first()); await sleep(1500); await t.unzoom() })
      await t.say(2, async () => {
        await t.scrollTo('[data-tour="detail-gates"]', { container: DETAIL, offset: 140 })
        for (const g of ['G6', 'G7', 'G10']) await t.moveTo(page.locator('[aria-label="Harness gates"] li', { hasText: g }).first(), 380).then(() => sleep(450))
      })
      await t.hold(700)
    })
  },

  async forecast() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('forecast', { auth, url: '/forecast' }, async (t, page) => {
      await t.say(0, async () => { await t.moveTo(page.getByText('Projected overtime cost')) })
      await t.say(1, async () => {
        await t.scrollTo('table', { offset: 80 })
        await t.moveTo(page.locator('tr', { hasText: 'Priya Natarajan' }).first().locator('td').last())
      })
      await t.say(2, async () => {
        await t.scrollToText('Best fit', { offset: 'center' })
        await t.moveTo(page.getByText('Best fit').first())
        await sleep(600)
        await t.moveTo(page.locator('tr', { hasText: 'Best fit' }).first().locator('td').last())
      })
      await t.hold(700)
    })
  },

  async conflict() {
    const auth = await passwordLogin(ALEX.email, ALEX.password)
    await take('conflict', { auth, url: '/forecast', setup: async (page) => { await page.evaluate(() => { const el = document.querySelector('section[aria-label="Schedule conflicts"]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 600) }); await sleep(600) } }, async (t, page) => {
      await t.say(0, async () => { await t.scrollTo('section[aria-label="Schedule conflicts"]', { offset: 80 }) })
      await t.say(1, async () => {
        await t.click(page.locator('section[aria-label="Schedule conflicts"]').getByRole('button', { name: /Review drafted resolution/ }))
        await sleep(1500)
        await t.scrollTo('section[aria-label="Schedule conflicts"] [data-tour="detail-timeline"]', { offset: 80 })
      })
      await t.say(2, async () => {
        await t.scrollTo('section[aria-label="Schedule conflicts"] [data-tour="detail-draft"]', { offset: 80 })
        await t.moveTo(page.getByText(/Reassign shift to/).first())
        await sleep(900)
        await t.scrollTo('section[aria-label="Schedule conflicts"] [data-tour="detail-gates"]', { offset: 220 })
        await t.moveTo(page.getByText('This correction also resolves').first())
      })
      await t.hold(800)
    })
  },

  async payroll() {
    const auth = await demoLogin('u-arjun')
    await take('payroll', { auth, url: '/payroll' }, async (t, page) => {
      await t.say(0, async () => {
        for (const s of ['Fremont DC', 'Austin DC', 'Bengaluru Hub']) await t.moveTo(page.locator('[data-tour="payroll-sites"]').getByText(s), 450).then(() => sleep(450))
      })
      await t.say(1, async () => { await t.moveTo(page.locator('[data-tour="payroll-sites"] [role="img"]').first()) })
      await t.say(2, async () => {
        await t.click(page.getByRole('button', { name: /Sam Okafor/ }))
        await sleep(1500)
        await t.scrollTo('[data-tour="detail-draft"]', { offset: 90 })
        await t.moveTo(page.getByText('Why escalated:').first())
      })
      await t.hold(900)
    })
  },

  async inspector() {
    const auth = await demoLogin('u-arjun')
    await take('inspector', { auth, url: '/inspector' }, async (t, page) => {
      await t.say(0, async () => {
        await t.moveTo(page.getByText('Pipeline runs').first())
        await sleep(400)
        await t.click(page.locator('tbody tr', { hasText: IDS.kai }).first().locator('a').first())
        await page.waitForSelector('text=Pipeline waterfall')
      })
      await t.say(1, async () => {
        for (const s of ['Retrieve', 'Generate']) await t.click(page.locator('ol button', { hasText: s }).first(), 450).then(() => sleep(500))
        await t.click(page.getByRole('tab', { name: 'Prompt' }))
        await sleep(900)
        await t.click(page.getByRole('tab', { name: 'Raw output' }))
      })
      await t.say(2, async () => {
        await t.click(page.getByRole('button', { name: 'Replay with fault' }))
        await sleep(700)
        await t.moveTo(page.getByRole('button', { name: /Hallucinated clause/ }))
      })
      await t.click(page.getByRole('button', { name: /Hallucinated clause/ }))
      await page.getByText(/G3 unknown clause/).first().waitFor({ state: 'visible', timeout: 30000 })
      await page.getByText('Rule-based fallback').first().waitFor({ state: 'visible' })
      await sleep(1200)
      await t.scrollToText('Gate results across', { offset: 120 })
      await sleep(400)
      await t.say(3, async () => {
        await t.moveTo(page.getByText(/G3 unknown clause/).first())
        await sleep(900)
        await t.moveTo(page.getByText(/G4 cited but not retrieved/).first())
      })
      await t.say(4, async () => {
        await t.scrollBy(-900, { ms: 1100 })
        await t.moveTo(page.getByText('Rule-based fallback').first())
      })
      await t.hold(900)
    })
  },

  async mobile() {
    const auth = await demoLogin('u-diego')
    await take('mobile', { viewport: { width: 416, height: 900 }, dpr: 1, auth, url: '/me' }, async (t, page) => {
      await t.say(0, async () => { await t.moveTo(page.getByText(/We found a/)) })
      await t.say(1, async () => {
        await t.moveTo(page.getByText(/strong evidence/).first())
        await sleep(800)
        await t.click(page.getByRole('button', { name: /^Yes, / }))
      })
      await t.say(2, async () => { await t.moveTo(page.getByText(/Confirmation sent/)) })
      await t.hold(900)
    })
  },

  async evaluation() {
    const auth = await demoLogin('u-arjun')
    await take('evaluation', { auth, url: '/evaluation' }, async (t, page) => {
      await t.say(0, async () => { await t.moveTo(page.getByText(/commit/).first()) })
      await t.say(1, async () => {
        await t.scrollBy(300, { ms: 1200 })
        await t.moveTo(page.getByText('Precision').first())
        await sleep(500)
        await t.moveTo(page.locator('tr', { hasText: 'hybrid' }).first())
      })
      await t.say(2, async () => {
        await t.scrollTo('[aria-label$="caught"]', { offset: 260, ms: 1600 })
        await t.moveTo(page.getByText(/144\/144 caught/).first())
      })
      await t.scrollToText('Raw unsafe rate (no harness)', { offset: 'center' })
      await page.waitForTimeout(500)
      await t.say(3, async () => {
        await t.zoom(page.getByText('Raw unsafe rate (no harness)').first(), 1.3)
        await sleep(2400)
        await t.unzoom()
      })
      await t.hold(600)
    })
  },

  async audit() {
    const auth = await demoLogin('u-arjun')
    await take('audit', { auth, url: '/outcomes' }, async (t, page) => {
      await t.say(0, async () => {
        for (const l of ['Resolved before cutoff', 'Cleared by root-cause fixes', 'Unsafe drafts shown to a manager']) await t.moveTo(page.getByText(l).first(), 450).then(() => sleep(500))
      })
      await t.click(page.locator('aside nav a', { hasText: 'Audit chain' }))
      await sleep(1200)
      await t.say(1, async () => {
        await t.click(page.getByRole('button', { name: /Verify chain/ }))
        await sleep(1200)
        await t.moveTo(page.getByText(/Chain intact/).first())
      })
      await t.hold(1200)
    })
  },
}

async function recordScene(id) {
  const s = SCENES[id]
  if (s.kind === 'card') return RUN.card(id)
  if (!RUN[id]) throw new Error(`no recorder for ${id}`)
  return RUN[id]()
}

async function main() {
  const only = process.argv.slice(2)
  browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] })
  if (only.length === 0) await prepare()
  else await findIds((await demoLogin('u-arjun')).access_token)
  fs.mkdirSync(OUT, { recursive: true })
  for (const s of story.scenes) {
    if (only.length && !only.includes(s.id)) continue
    try {
      await recordScene(s.id)
    } catch (e) {
      console.error(`FAILED ${s.id}: ${e.message.split('\n')[0]}`)
      process.exitCode = 1
    }
  }
  await browser.close()
}

main()
