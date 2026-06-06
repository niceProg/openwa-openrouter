// Minimal WhatsApp gateway yang kompatibel dengan endpoint OpenWA yang dipakai
// frontend (folder ../). Memakai whatsapp-web.js (Chromium/Puppeteer) untuk
// benar-benar terhubung ke WhatsApp.
//
//   GET    /health
//   GET    /api/sessions
//   POST   /api/sessions                       { name }
//   GET    /api/sessions/:id
//   GET    /api/sessions/:id/qr
//   DELETE /api/sessions/:id
//   POST   /api/sessions/:id/messages/send-text { chatId, text }
//
// Semua /api/* butuh header  X-API-Key.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const QRCode = require('qrcode')
const { Client, LocalAuth } = require('whatsapp-web.js')

// Muat variabel dari backend/.env (kalau ada) sebelum membaca process.env.
require('dotenv').config({ path: path.join(__dirname, '.env') })

const PORT = Number(process.env.PORT || 2785)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// API key: pakai env API_KEY, atau seed satu key default (persist ke file)
// ---------------------------------------------------------------------------
function loadApiKey() {
  if (process.env.API_KEY) return process.env.API_KEY
  const keyFile = path.join(DATA_DIR, 'api-key.txt')
  if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, 'utf8').trim()
  const key = 'owa_' + crypto.randomBytes(16).toString('hex')
  fs.writeFileSync(keyFile, key)
  return key
}
const API_KEY = loadApiKey()

// ---------------------------------------------------------------------------
// Konfigurasi AI auto-reply (OpenRouter, OpenAI-compatible). Lihat ../openrouterChat.
// ---------------------------------------------------------------------------
// Konfigurasi AI yang bisa diubah runtime: env = nilai awal, override di-persist ke file
// (data/ai-config.json) lewat POST /api/ai/config — jadi key & model bisa diganti tanpa redeploy.
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json')
const aiCfg = {
  baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  apiKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
}
try {
  if (fs.existsSync(AI_CONFIG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8'))
    if (saved.baseUrl) aiCfg.baseUrl = String(saved.baseUrl).replace(/\/$/, '')
    if (typeof saved.apiKey === 'string' && saved.apiKey) aiCfg.apiKey = saved.apiKey
    if (saved.model) aiCfg.model = saved.model
  }
} catch (e) {
  console.error('Gagal memuat ai-config.json:', e.message)
}
function saveAiCfg() {
  try {
    fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(aiCfg, null, 2))
  } catch (e) {
    console.error('Gagal menyimpan ai-config.json:', e.message)
  }
}
// Ringkasan config yang aman dikirim ke UI (key disamarkan, tidak pernah dibalikkan utuh).
function aiCfgPublic() {
  const k = aiCfg.apiKey
  return {
    model: aiCfg.model,
    baseUrl: aiCfg.baseUrl,
    hasKey: !!k,
    keyMasked: k ? `${k.slice(0, 8)}…${k.slice(-4)}` : '',
  }
}
const AI_SYSTEM_PROMPT =
  process.env.AI_SYSTEM_PROMPT ||
  'Kamu asisten WhatsApp yang ramah, membantu, dan ringkas. ' +
    'Jawab dalam bahasa yang sama dengan pengirim (biasanya Bahasa Indonesia). ' +
    'Jawab singkat, maksimal beberapa kalimat.'
const AI_FALLBACK =
  process.env.AI_FALLBACK || 'Maaf, asisten AI sedang tidak tersedia. Coba lagi nanti ya 🙏'
const AI_DEFAULT = process.env.AI_AUTOREPLY === '1' // auto-reply aktif default?
const AI_HISTORY_TURNS = 10 // simpan N pasang pesan terakhir per chat

// Riwayat percakapan AI per (sessionId → chatId). Di memori, dibatasi.
/** @type {Map<string, Map<string, {role:string, content:string}[]>>} */
const aiHistory = new Map()

function aiHistFor(sessionId, chatId) {
  let perChat = aiHistory.get(sessionId)
  if (!perChat) {
    perChat = new Map()
    aiHistory.set(sessionId, perChat)
  }
  let hist = perChat.get(chatId)
  if (!hist) {
    hist = []
    perChat.set(chatId, hist)
  }
  return hist
}

// Header standar untuk request OpenRouter (Bearer + atribusi opsional).
function aiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${aiCfg.apiKey}`,
    'X-Title': 'WhatsApp Auto-Reply',
  }
}

// Minta balasan dari OpenRouter (non-streaming) memakai riwayat per pengirim.
async function aiReply(sessionId, chatId, text) {
  if (!aiCfg.apiKey) throw new Error('OPENROUTER_API_KEY belum diset')

  const hist = aiHistFor(sessionId, chatId)
  const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...hist, { role: 'user', content: text }]

  const r = await fetch(`${aiCfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ model: aiCfg.model, messages, stream: false }),
    signal: AbortSignal.timeout(60000),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    let msg = `OpenRouter HTTP ${r.status}`
    if (r.status === 401) msg = 'OPENROUTER_API_KEY tidak valid (401)'
    else if (r.status === 404 || /model/i.test(t)) msg = `model "${aiCfg.model}" tidak ditemukan di OpenRouter`
    else if (r.status === 429) msg = 'rate limit OpenRouter (429) — coba model lain atau tunggu'
    throw new Error(msg)
  }
  const data = await r.json()
  const reply = (data.choices?.[0]?.message?.content || '').trim()
  if (!reply) throw new Error('balasan AI kosong')

  hist.push({ role: 'user', content: text }, { role: 'assistant', content: reply })
  if (hist.length > AI_HISTORY_TURNS * 2) hist.splice(0, hist.length - AI_HISTORY_TURNS * 2)
  return reply
}

// ---------------------------------------------------------------------------
// State session (in-memory). Auth WhatsApp dipersist oleh LocalAuth per id.
// ---------------------------------------------------------------------------
/** @type {Map<string, { id:string, name:string, status:string, qr:string, qrImage:string, phoneNumber:string, client:import('whatsapp-web.js').Client }>} */
const sessions = new Map()

// Pesan masuk yang dibuffer per session (maks 100 terbaru) + subscriber SSE.
/** @type {Map<string, object[]>} */
const inbox = new Map()
/** @type {Map<string, Set<import('express').Response>>} */
const subscribers = new Map()
const INBOX_LIMIT = 100

function pushInbox(id, entry) {
  const list = inbox.get(id) || []
  list.push(entry)
  if (list.length > INBOX_LIMIT) list.splice(0, list.length - INBOX_LIMIT)
  inbox.set(id, list)

  const subs = subscribers.get(id)
  if (subs) {
    const payload = `data: ${JSON.stringify(entry)}\n\n`
    for (const res of subs) res.write(payload)
  }
}

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'sess-' + crypto.randomBytes(4).toString('hex')
}

function publicSession(s) {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    phoneNumber: s.phoneNumber,
    aiEnabled: !!s.aiEnabled,
  }
}

function createSession(name) {
  const id = slugify(name)
  if (sessions.has(id)) return sessions.get(id)

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: path.join(DATA_DIR, 'sessions') }),
    puppeteer: {
      headless: true,
      // Di Docker pakai Chromium sistem via PUPPETEER_EXECUTABLE_PATH; lokal biarkan default.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  })

  const session = {
    id,
    name: name || id,
    status: 'INITIALIZING',
    qr: '',
    qrImage: '',
    phoneNumber: '',
    aiEnabled: AI_DEFAULT,
    client,
  }
  sessions.set(id, session)
  inbox.set(id, [])

  // Pesan masuk dari orang lain → buffer + broadcast ke website (SSE).
  client.on('message', async (msg) => {
    let fromName = ''
    try {
      const contact = await msg.getContact()
      fromName = contact.pushname || contact.name || contact.shortName || ''
    } catch {
      /* abaikan; pakai nomor saja */
    }
    pushInbox(id, {
      id: msg.id?._serialized || `${msg.from}-${msg.timestamp}`,
      sessionId: id,
      from: String(msg.from || '').replace(/@c\.us$/, ''),
      fromName,
      body: msg.body || '',
      type: msg.type || 'chat',
      hasMedia: !!msg.hasMedia,
      timestamp: (msg.timestamp || 0) * 1000,
    })

    // Auto-reply AI: hanya chat pribadi (@c.us) & saat fitur diaktifkan.
    const isIndividual = String(msg.from || '').endsWith('@c.us')
    if (session.aiEnabled && isIndividual && (msg.body || '').trim()) {
      try {
        const reply = await aiReply(id, msg.from, msg.body)
        await client.sendMessage(msg.from, reply)
        pushInbox(id, {
          id: `ai-${msg.id?._serialized || msg.timestamp}`,
          sessionId: id,
          from: String(msg.from).replace(/@c\.us$/, ''),
          fromName: '🤖 AI (balasan)',
          body: reply,
          type: 'ai-reply',
          outgoing: true,
          timestamp: Date.now(),
        })
      } catch (e) {
        console.error(`[${id}] AI auto-reply error:`, e.message)
        try {
          await client.sendMessage(msg.from, AI_FALLBACK)
        } catch {
          /* abaikan kegagalan kirim fallback */
        }
        pushInbox(id, {
          id: `ai-err-${msg.id?._serialized || msg.timestamp}`,
          sessionId: id,
          from: String(msg.from).replace(/@c\.us$/, ''),
          fromName: '⚠️ AI gagal',
          body: `${e.message} — fallback dikirim.`,
          type: 'ai-error',
          outgoing: true,
          timestamp: Date.now(),
        })
      }
    }
  })

  client.on('qr', async (qr) => {
    session.status = 'SCAN_QR'
    session.qr = qr
    try {
      session.qrImage = await QRCode.toDataURL(qr)
    } catch {
      session.qrImage = ''
    }
  })
  client.on('authenticated', () => {
    session.status = 'CONNECTING'
    session.qr = ''
    session.qrImage = ''
  })
  client.on('ready', () => {
    session.status = 'CONNECTED'
    session.qr = ''
    session.qrImage = ''
    session.phoneNumber = client.info?.wid?.user || ''
  })
  client.on('auth_failure', () => {
    session.status = 'FAILED'
  })
  client.on('disconnected', () => {
    session.status = 'DISCONNECTED'
    session.qr = ''
    session.qrImage = ''
  })

  client.initialize().catch((err) => {
    session.status = 'FAILED'
    console.error(`[${id}] initialize error:`, err.message)
  })

  return session
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Auth gate untuk semua /api/*
app.use('/api', (req, res, next) => {
  const key = req.get('X-API-Key') || req.query.apiKey
  if (key !== API_KEY) return res.status(401).json({ message: 'Invalid or missing API key' })
  next()
})

app.get('/api/sessions', (_req, res) => {
  res.json([...sessions.values()].map(publicSession))
})

app.post('/api/sessions', (req, res) => {
  const session = createSession(req.body?.name)
  res.status(201).json(publicSession(session))
})

app.get('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })
  res.json(publicSession(s))
})

app.get('/api/sessions/:id/qr', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })
  res.json({ code: s.qr, image: s.qrImage })
})

// Riwayat pesan masuk yang dibuffer (untuk muatan awal inbox).
app.get('/api/sessions/:id/messages', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })
  res.json(inbox.get(req.params.id) || [])
})

// Aktif/nonaktifkan auto-reply AI untuk satu session.
app.post('/api/sessions/:id/ai', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })
  s.aiEnabled = !!req.body?.enabled
  res.json({ id: s.id, aiEnabled: s.aiEnabled })
})

// Status OpenRouter + ketersediaan model (untuk peringatan di UI).
app.get('/api/ai/health', async (_req, res) => {
  if (!aiCfg.apiKey) {
    return res.json({ running: false, model: aiCfg.model, reason: 'OPENROUTER_API_KEY belum diset' })
  }
  try {
    // /key (perlu auth) memvalidasi API key; /models (publik) cek ketersediaan model.
    const [keyRes, modelsRes] = await Promise.all([
      fetch(`${aiCfg.baseUrl}/key`, { headers: aiHeaders(), signal: AbortSignal.timeout(4000) }),
      fetch(`${aiCfg.baseUrl}/models`, { headers: aiHeaders(), signal: AbortSignal.timeout(4000) }).catch(() => null),
    ])
    if (!keyRes.ok) {
      const reason = keyRes.status === 401 ? 'OPENROUTER_API_KEY tidak valid (401)' : `HTTP ${keyRes.status}`
      return res.json({ running: false, model: aiCfg.model, reason })
    }
    let hasModel = true // default optimis bila daftar model tak terjangkau
    if (modelsRes && modelsRes.ok) {
      const data = await modelsRes.json()
      hasModel = (data.data || []).map((m) => m.id).includes(aiCfg.model)
    }
    res.json({ running: true, model: aiCfg.model, hasModel })
  } catch (e) {
    res.json({ running: false, model: aiCfg.model, reason: e.message })
  }
})

// Baca konfigurasi AI aktif (key disamarkan).
app.get('/api/ai/config', (_req, res) => {
  res.json(aiCfgPublic())
})

// Ubah konfigurasi AI (model / apiKey / baseUrl) saat runtime — persist ke file.
app.post('/api/ai/config', (req, res) => {
  const { model, apiKey, baseUrl } = req.body || {}
  if (typeof model === 'string' && model.trim()) aiCfg.model = model.trim()
  if (typeof baseUrl === 'string' && baseUrl.trim()) aiCfg.baseUrl = baseUrl.trim().replace(/\/$/, '')
  if (typeof apiKey === 'string' && apiKey.trim()) aiCfg.apiKey = apiKey.trim()
  saveAiCfg()
  res.json(aiCfgPublic())
})

// Daftar model OpenRouter (untuk dropdown di UI). Hanya id, diurutkan.
app.get('/api/ai/models', async (_req, res) => {
  try {
    const r = await fetch(`${aiCfg.baseUrl}/models`, { headers: aiHeaders(), signal: AbortSignal.timeout(6000) })
    if (!r.ok) return res.status(502).json({ message: `OpenRouter HTTP ${r.status}` })
    const data = await r.json()
    const ids = (data.data || []).map((m) => m.id).sort()
    res.json({ models: ids })
  } catch (e) {
    res.status(502).json({ message: e.message })
  }
})

// Stream pesan masuk realtime (Server-Sent Events).
// EventSource tak bisa kirim header, jadi auth lewat query ?apiKey= (dicek middleware /api).
app.get('/api/sessions/:id/events', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()
  res.write(': connected\n\n')

  const subs = subscribers.get(req.params.id) || new Set()
  subs.add(res)
  subscribers.set(req.params.id, subs)

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000)
  req.on('close', () => {
    clearInterval(heartbeat)
    subs.delete(res)
  })
})

app.delete('/api/sessions/:id', async (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })
  try {
    await s.client.destroy()
  } catch (err) {
    console.error(`[${s.id}] destroy error:`, err.message)
  }
  // Tutup subscriber SSE & bersihkan buffer.
  const subs = subscribers.get(s.id)
  if (subs) {
    for (const r of subs) r.end()
    subscribers.delete(s.id)
  }
  inbox.delete(s.id)
  sessions.delete(s.id)
  res.json({ message: 'Session deleted' })
})

app.post('/api/sessions/:id/messages/send-text', async (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return res.status(404).json({ message: 'Session not found' })
  if (s.status !== 'CONNECTED') {
    return res.status(409).json({ message: `Session not connected (status: ${s.status})` })
  }
  const { chatId, text } = req.body || {}
  if (!chatId || !text) {
    return res.status(400).json({ message: 'chatId and text are required' })
  }
  try {
    const msg = await s.client.sendMessage(chatId, text)
    res.json({ id: msg.id?._serialized || null, chatId, status: 'SENT' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

app.listen(PORT, () => {
  console.log('────────────────────────────────────────────')
  console.log(`  OpenWA gateway listening on http://localhost:${PORT}`)
  console.log(`  API base : http://localhost:${PORT}/api`)
  console.log(`  API KEY  : ${API_KEY}`)
  console.log('  (kunci di atas dipakai di field "API Key" pada frontend)')
  console.log(
    `  AI       : OpenRouter (${aiCfg.baseUrl})  model=${aiCfg.model}  key=${aiCfg.apiKey ? 'set' : 'MISSING'}  auto-reply default=${AI_DEFAULT ? 'ON' : 'OFF'}`,
  )
  console.log('────────────────────────────────────────────')
})
