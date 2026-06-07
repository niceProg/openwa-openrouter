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
// OpenRouter key/base tingkat sistem dikelola admin (DB), fallback env.
const settings = require('./settings')
const { aiSystem } = settings

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
  const k = aiSystem.apiKey
  return {
    model: aiCfg.model,
    baseUrl: aiSystem.baseUrl,
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
    Authorization: `Bearer ${aiSystem.apiKey}`,
    'X-Title': 'WhatsApp Auto-Reply',
  }
}

// Minta balasan dari OpenRouter (non-streaming) memakai riwayat per pengirim.
async function aiReply(sessionId, chatId, text, model) {
  if (!aiSystem.apiKey) throw new Error('OPENROUTER_API_KEY belum diset')
  const useModel = model || aiCfg.model

  const hist = aiHistFor(sessionId, chatId)
  const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...hist, { role: 'user', content: text }]

  const r = await fetch(`${aiSystem.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ model: useModel, messages, stream: false }),
    signal: AbortSignal.timeout(60000),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    let msg = `OpenRouter HTTP ${r.status}`
    if (r.status === 401) msg = 'OPENROUTER_API_KEY tidak valid (401)'
    else if (r.status === 404 || /model/i.test(t)) msg = `model "${useModel}" tidak ditemukan di OpenRouter`
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

function createSession({ name, ownerId, aiModel }) {
  const id = `u${ownerId}-${slugify(name)}`
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
    ownerId,
    aiModel: aiModel || aiCfg.model,
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
        const reply = await aiReply(id, msg.from, msg.body, session.aiModel)
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
app.set('trust proxy', 1) // di belakang nginx → req.ip pakai X-Forwarded-For
// CORS: batasi ke origin frontend bila CORS_ORIGIN diset (mis. https://openwa.yum-dev.com).
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Rute auth (publik) — dipasang SEBELUM gate X-API-Key agar bebas akses.
const { router: authRouter, authRequired } = require('./auth')
app.use('/api/auth', authRouter)

// Rute admin (auth via JWT + passphrase, bukan X-API-Key) — juga sebelum gate.
const { router: adminRouter } = require('./admin')
app.use('/api/admin', adminRouter)

// --- Auth multi-tenant (Fase 3): JWT user untuk panel, gateway API key untuk akses luar ---
const jwt = require('jsonwebtoken')
const { query: dbQuery } = require('./db')
const { JWT_SECRET } = require('./config')

// Muat user dari DB (status & is_admin selalu fresh) setelah JWT terverifikasi.
async function loadDbUser(req, res, next) {
  try {
    const r = await dbQuery('SELECT id, email, status, is_admin, ai_model FROM users WHERE id=$1', [req.user.uid])
    if (!r.rows.length) return res.status(401).json({ message: 'User tidak ditemukan' })
    req.dbUser = r.rows[0]
    next()
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}
function requireApproved(req, res, next) {
  if (req.dbUser.is_admin || req.dbUser.status === 'approved') return next()
  res.status(403).json({ message: 'Akun menunggu persetujuan admin' })
}
// Rantai untuk endpoint panel: JWT → user DB → approved.
const waUser = [authRequired, loadDbUser, requireApproved]

// Endpoint kirim pesan: boleh JWT (panel) ATAU gateway API key (akses luar/UMKM).
async function waUserOrKey(req, res, next) {
  if ((req.get('Authorization') || '').startsWith('Bearer ')) {
    return authRequired(req, res, () => loadDbUser(req, res, () => requireApproved(req, res, next)))
  }
  const key = req.get('X-API-Key')
  if (!key) return res.status(401).json({ message: 'Butuh token login atau API key' })
  try {
    const r = await dbQuery(
      `SELECT u.id, u.email, u.status, u.is_admin, u.ai_model
       FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key=$1 AND k.active=TRUE`,
      [key],
    )
    if (!r.rows.length) return res.status(401).json({ message: 'API key tidak valid' })
    if (!r.rows[0].is_admin && r.rows[0].status !== 'approved') {
      return res.status(403).json({ message: 'Akun belum disetujui' })
    }
    req.dbUser = r.rows[0]
    dbQuery('UPDATE api_keys SET last_used_at=now() WHERE key=$1', [key]).catch(() => {})
    next()
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

// Kepemilikan session (admin boleh semua).
function canAccess(req, s) {
  return req.dbUser.is_admin || String(s.ownerId) === String(req.dbUser.id)
}
// Ambil session milik sendiri; balas 404 bila bukan milik (hindari enumerasi).
function ownedSession(req, res) {
  const s = sessions.get(req.params.id)
  if (!s || !canAccess(req, s)) {
    res.status(404).json({ message: 'Session not found' })
    return null
  }
  return s
}

app.get('/api/sessions', waUser, (req, res) => {
  res.json([...sessions.values()].filter((s) => canAccess(req, s)).map(publicSession))
})

app.post('/api/sessions', waUser, (req, res) => {
  const session = createSession({ name: req.body?.name, ownerId: req.dbUser.id, aiModel: req.dbUser.ai_model })
  res.status(201).json(publicSession(session))
})

app.get('/api/sessions/:id', waUser, (req, res) => {
  const s = ownedSession(req, res)
  if (s) res.json(publicSession(s))
})

app.get('/api/sessions/:id/qr', waUser, (req, res) => {
  const s = ownedSession(req, res)
  if (s) res.json({ code: s.qr, image: s.qrImage })
})

// Riwayat pesan masuk yang dibuffer (untuk muatan awal inbox).
app.get('/api/sessions/:id/messages', waUser, (req, res) => {
  const s = ownedSession(req, res)
  if (s) res.json(inbox.get(req.params.id) || [])
})

// Aktif/nonaktifkan auto-reply AI untuk satu session.
app.post('/api/sessions/:id/ai', waUser, (req, res) => {
  const s = ownedSession(req, res)
  if (!s) return
  s.aiEnabled = !!req.body?.enabled
  res.json({ id: s.id, aiEnabled: s.aiEnabled })
})

// Konfigurasi AI per user: model pilihan + daftar model yang diizinkan admin.
app.get('/api/me/ai', authRequired, loadDbUser, async (req, res) => {
  res.json({
    model: req.dbUser.ai_model || '',
    allowedModels: await settings.listAllowedModels(),
    systemReady: !!aiSystem.apiKey,
  })
})

app.post('/api/me/ai', authRequired, loadDbUser, async (req, res) => {
  const model = String(req.body?.model || '').trim()
  const allowed = await settings.listAllowedModels()
  if (!model || !allowed.includes(model)) {
    return res.status(400).json({ message: 'Model tidak ada di daftar yang diizinkan admin' })
  }
  await dbQuery('UPDATE users SET ai_model=$1 WHERE id=$2', [model, req.dbUser.id])
  // Segarkan model pada session aktif milik user ini.
  for (const s of sessions.values()) if (String(s.ownerId) === String(req.dbUser.id)) s.aiModel = model
  res.json({ ok: true, model })
})

// Stream pesan masuk realtime (Server-Sent Events).
// EventSource tak bisa kirim header → auth via query ?token=<JWT>.
app.get('/api/sessions/:id/events', async (req, res) => {
  try {
    const dec = jwt.verify(String(req.query.token || ''), JWT_SECRET)
    const r = await dbQuery('SELECT id, status, is_admin FROM users WHERE id=$1', [dec.uid])
    if (!r.rows.length) throw new Error('no user')
    req.dbUser = r.rows[0]
  } catch {
    return res.status(401).json({ message: 'Token tidak valid' })
  }
  if (!req.dbUser.is_admin && req.dbUser.status !== 'approved') {
    return res.status(403).json({ message: 'Akun menunggu persetujuan admin' })
  }
  const s = sessions.get(req.params.id)
  if (!s || !canAccess(req, s)) return res.status(404).json({ message: 'Session not found' })

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

app.delete('/api/sessions/:id', waUser, async (req, res) => {
  const s = ownedSession(req, res)
  if (!s) return
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

app.post('/api/sessions/:id/messages/send-text', waUserOrKey, async (req, res) => {
  const s = ownedSession(req, res)
  if (!s) return
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

// Jalankan migrasi DB (idempotent) sebelum mulai melayani auth.
const { migrate } = require('./db')
migrate()
  .then(() => settings.loadAiSystem())
  .then(() => console.log('  DB       : migrasi OK'))
  .catch((e) => console.error('  DB       : migrasi GAGAL —', e.message))

app.listen(PORT, () => {
  console.log('────────────────────────────────────────────')
  console.log(`  OpenWA gateway listening on http://localhost:${PORT}`)
  console.log(`  API base : http://localhost:${PORT}/api`)
  console.log(`  API KEY  : ${API_KEY}`)
  console.log('  (kunci di atas dipakai di field "API Key" pada frontend)')
  console.log(
    `  AI       : OpenRouter (${aiSystem.baseUrl})  model=${aiCfg.model}  key=${aiSystem.apiKey ? 'set' : 'MISSING'}  auto-reply default=${AI_DEFAULT ? 'ON' : 'OFF'}`,
  )
  console.log('────────────────────────────────────────────')
})
