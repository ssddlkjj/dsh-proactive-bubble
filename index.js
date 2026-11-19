import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'proactive-bubble'

export const inject = ['timer', 'agents', 'sessions', 'connection']

const TICK_MS = 5000
const DEFAULT_SECONDS = 1800
const MIN_SECONDS = 15
const MAX_SECONDS = 43200

const FALLBACK_PROMPT =
  '（冒泡）自己开个口，一到两句。先看一眼你的人物状态和近况文件。' +
  '在日常就起一句闲聊；正在一段场面里就不要抽离、不要总结，只写此刻的反应。' +
  '短，不重复上一条，不催对方干活。'

function llmCandidates() {
  const list = []
  const dir = process.env.DSH_INSTALL_DIR
  if (dir) list.push(path.join(path.dirname(dir), 'dsh-llm', 'lib', 'index.js'))
  if (process.resourcesPath) {
    list.push(path.join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-llm', 'lib', 'index.js'))
  }
  return list
}

export function apply(ctx, config = {}) {
  const logger = ctx.logger(name)
  const basePrompt = typeof config.prompt === 'string' && config.prompt.trim() !== ''
    ? config.prompt
    : FALLBACK_PROMPT
  const configSeconds = Number.isFinite(config.seconds) ? Math.round(config.seconds) : DEFAULT_SECONDS

  /** sessionId -> { enabled, seconds, focused, lastFire, style } */
  const state = new Map()
  const entry = (sid) => {
    let s = state.get(sid)
    if (s === undefined) {
      s = { enabled: false, seconds: configSeconds, focused: false, lastFire: 0, style: '' }
      state.set(sid, s)
    }
    return s
  }

  let llm = null
  let llmTried = false
  const loadLlm = async () => {
    if (llm !== null || llmTried) return llm
    llmTried = true
    for (const file of llmCandidates()) {
      try {
        const mod = await import(pathToFileURL(file).href)
        if (typeof mod.createUserMessage === 'function') {
          llm = mod
          logger.info('bubble: loaded dsh-llm from %s', file)
          return llm
        }
      } catch (error) {
        logger.warn('bubble: cannot load %s (%s)', file, error?.message ?? error)
      }
    }
    try {
      const mod = await import('@deepseek-ai/dsh-llm')
      if (typeof mod.createUserMessage === 'function') llm = mod
    } catch (error) {
      logger.error('bubble: dsh-llm unavailable (%s)', error?.message ?? error)
    }
    return llm
  }

  const json = (status, payload) =>
    new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })

  const route = {
    path: '/api/proactive-bubble/state',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body = null
      try { body = await request.json() } catch { body = null }
      if (body === null || typeof body !== 'object') return json(400, { ok: false })
      const sid = typeof body.sessionId === 'string' ? body.sessionId : ''
      if (sid === '') return json(400, { ok: false })
      const s = entry(sid)
      if (typeof body.enabled === 'boolean') {
        const was = s.enabled
        s.enabled = body.enabled
        if (!was && s.enabled) s.lastFire = Date.now()
      }
      if (typeof body.seconds === 'number' && Number.isFinite(body.seconds)) {
        const wanted = Math.round(body.seconds)
        s.seconds = wanted >= MIN_SECONDS ? Math.min(MAX_SECONDS, wanted) : DEFAULT_SECONDS
      }
      if (typeof body.focused === 'boolean') s.focused = body.focused
      if (typeof body.style === 'string') s.style = body.style.slice(0, 400)
      return json(200, { ok: true, enabled: s.enabled, seconds: s.seconds, focused: s.focused, style: s.style })
    },
  }

  ctx.effect(() => {
    try {
      return ctx.connection.fetch.register(route)
    } catch (error) {
      logger.error('bubble: route registration failed (%s)', error?.message ?? error)
      return () => {}
    }
  }, 'proactive-bubble: state route')

  ctx.effect(() => {
    const tick = async () => {
      const now = Date.now()
      const due = []
      for (const [sid, s] of state) {
        if (!s.enabled || !s.focused) continue
        if (s.lastFire !== 0 && now - s.lastFire < s.seconds * 1000) continue
        due.push([sid, s])
      }
      if (due.length === 0) return
      const mod = await loadLlm()
      if (mod === null) return
      for (const [sid, s] of due) {
        const agent = ctx.agents.get(sid)
        if (agent === undefined) continue
        if (agent.status !== 'idle') continue
        s.lastFire = now
        try {
          const text = s.style ? basePrompt + '\n这个对话的额外要求：' + s.style : basePrompt
          agent.followup(mod.createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: 'proactive-bubble' },
          }))
          await ctx.sessions.flush(agent.session)
          logger.info('bubble sent for %s', sid)
        } catch (error) {
          logger.warn('bubble failed for %s: %s', sid, error?.message ?? error)
        }
      }
    }
    const timer = setInterval(() => { tick().catch(() => {}) }, TICK_MS)
    return () => clearInterval(timer)
  }, 'proactive-bubble: timer')
}
