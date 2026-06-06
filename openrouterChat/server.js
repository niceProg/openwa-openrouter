// AI chat — backend ringan TANPA dependency (hanya modul inti Node 18+).
// Menyajikan UI statis + meneruskan chat ke OpenRouter (endpoint OpenAI-compatible)
// dengan streaming token demi token (SSE). Riwayat percakapan disimpan di memori.
//
// Konfigurasi via env:
//   PORT                (default 8787)
//   OPENROUTER_API_KEY  (wajib — dari https://openrouter.ai/keys)
//   OPENROUTER_BASE_URL (default https://openrouter.ai/api/v1)
//   AI_MODEL            (default meta-llama/llama-3.3-70b-instruct:free)
//   SYSTEM_PROMPT       (default: asisten WA ringkas)

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT || 8787)
const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const MODEL = process.env.AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'Kamu asisten WhatsApp yang ramah, membantu, dan ringkas. ' +
    'Jawab dalam bahasa yang sama dengan pengguna (biasanya Bahasa Indonesia).'

// Riwayat percakapan di memori — single-user localhost, tanpa database.
let history = [{ role: 'system', content: SYSTEM_PROMPT }]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
}

async function serveStatic(res, file) {
  try {
    const data = await readFile(join(__dirname, 'public', file))
    send(res, 200, MIME[extname(file)] || 'application/octet-stream', data)
  } catch {
    send(res, 404, 'text/plain; charset=utf-8', 'Not found')
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => resolve(b))
    req.on('error', reject)
  })
}

// Header standar untuk request OpenRouter (Bearer + atribusi opsional).
function aiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'X-Title': 'OpenRouter Chat',
  }
}

// Cek status OpenRouter + ketersediaan model.
async function checkAi() {
  if (!OPENROUTER_API_KEY) return { running: false, model: MODEL, reason: 'OPENROUTER_API_KEY belum diset' }
  try {
    // /key (perlu auth) memvalidasi API key; /models (publik) cek ketersediaan model.
    const [keyRes, modelsRes] = await Promise.all([
      fetch(`${OPENROUTER_BASE_URL}/key`, { headers: aiHeaders(), signal: AbortSignal.timeout(4000) }),
      fetch(`${OPENROUTER_BASE_URL}/models`, { headers: aiHeaders(), signal: AbortSignal.timeout(4000) }).catch(() => null),
    ])
    if (!keyRes.ok) {
      const reason = keyRes.status === 401 ? 'OPENROUTER_API_KEY tidak valid (401)' : `OpenRouter menjawab HTTP ${keyRes.status}`
      return { running: false, model: MODEL, reason }
    }
    let hasModel = true // default optimis bila daftar model tak terjangkau
    if (modelsRes && modelsRes.ok) {
      const data = await modelsRes.json()
      hasModel = (data.data || []).map((m) => m.id).includes(MODEL)
    }
    return { running: true, model: MODEL, hasModel }
  } catch (e) {
    return { running: false, model: MODEL, reason: e.message }
  }
}

async function handleChat(req, res) {
  const raw = await readBody(req)
  let message = ''
  try {
    message = JSON.parse(raw).message
  } catch {
    /* abaikan; ditangani di bawah */
  }
  if (!message || !String(message).trim()) {
    return send(res, 400, 'application/json', JSON.stringify({ error: 'Pesan kosong.' }))
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  if (!OPENROUTER_API_KEY) {
    sse({ error: 'OPENROUTER_API_KEY belum diset.' })
    return res.end()
  }

  history.push({ role: 'user', content: String(message) })

  let upstream
  try {
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({ model: MODEL, messages: history, stream: true }),
    })
  } catch (e) {
    history.pop()
    sse({
      error: `Tidak bisa terhubung ke OpenRouter di ${OPENROUTER_BASE_URL}. (${e.message})`,
    })
    return res.end()
  }

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => '')
    history.pop()
    let msg = `OpenRouter error HTTP ${upstream.status}.`
    if (upstream.status === 401) msg = 'OPENROUTER_API_KEY tidak valid (401).'
    else if (upstream.status === 404 || /model/i.test(txt)) msg = `Model "${MODEL}" tidak tersedia di OpenRouter.`
    else if (upstream.status === 429) msg = 'Rate limit OpenRouter (429). Coba model lain atau tunggu.'
    sse({ error: msg })
    return res.end()
  }

  // Parse SSE dari OpenRouter (format OpenAI) → teruskan token ke browser.
  // OpenRouter juga mengirim baris komentar keep-alive (":..."), yang otomatis
  // dilewati karena hanya baris berawalan "data:" yang diproses.
  const decoder = new TextDecoder()
  let buffer = ''
  let assistant = ''
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const token = json.choices?.[0]?.delta?.content || ''
          if (token) {
            assistant += token
            sse({ token })
          }
        } catch {
          /* lewati frame non-JSON */
        }
      }
    }
  } catch (e) {
    sse({ error: `Streaming terputus: ${e.message}` })
  }

  history.push({ role: 'assistant', content: assistant })
  sse({ done: true })
  res.end()
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req
  try {
    if (method === 'GET' && (url === '/' || url === '/index.html')) return serveStatic(res, 'index.html')
    if (method === 'GET' && url === '/style.css') return serveStatic(res, 'style.css')
    if (method === 'GET' && url === '/app.js') return serveStatic(res, 'app.js')

    if (method === 'GET' && url === '/api/health') {
      return send(res, 200, 'application/json', JSON.stringify(await checkAi()))
    }
    if (method === 'GET' && url === '/api/history') {
      return send(res, 200, 'application/json', JSON.stringify(history.filter((m) => m.role !== 'system')))
    }
    if (method === 'POST' && url === '/api/reset') {
      history = [{ role: 'system', content: SYSTEM_PROMPT }]
      return send(res, 200, 'application/json', JSON.stringify({ ok: true }))
    }
    if (method === 'POST' && url === '/api/chat') return handleChat(req, res)

    send(res, 404, 'text/plain; charset=utf-8', 'Not found')
  } catch (e) {
    send(res, 500, 'application/json', JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, () => {
  console.log('────────────────────────────────────────────')
  console.log(`  OpenRouter chat`)
  console.log(`  UI + API : http://localhost:${PORT}`)
  console.log(`  OpenRouter : ${OPENROUTER_BASE_URL}`)
  console.log(`  Model    : ${MODEL}`)
  console.log(`  Key      : ${OPENROUTER_API_KEY ? 'set' : 'MISSING'}`)
  console.log('────────────────────────────────────────────')
})
