// Rute admin: buka kunci via passphrase, kelola user + API key, pengaturan sistem.
const express = require('express')
const jwt = require('jsonwebtoken')
const { query } = require('./db')
const { authRequired } = require('./auth')
const settings = require('./settings')

const { JWT_SECRET, ADMIN_PASSPHRASE } = require('./config')

async function isAdminUser(uid) {
  const r = await query('SELECT is_admin FROM users WHERE id=$1', [uid])
  return r.rows.length > 0 && r.rows[0].is_admin
}

const router = express.Router()
router.use(authRequired) // semua butuh login dulu

// Buka kunci area admin: login + is_admin + passphrase benar → adminToken 12 jam.
router.post('/unlock', async (req, res) => {
  if (!(await isAdminUser(req.user.uid))) return res.status(403).json({ message: 'Akun ini bukan admin' })
  const passphrase = String(req.body?.passphrase || '')
  if (!ADMIN_PASSPHRASE || passphrase !== ADMIN_PASSPHRASE) {
    return res.status(401).json({ message: 'Passphrase admin salah' })
  }
  const adminToken = jwt.sign({ uid: req.user.uid, adm: true }, JWT_SECRET, { expiresIn: '12h' })
  res.json({ adminToken })
})

// Gerbang: butuh X-Admin-Token (hasil unlock) + masih admin.
async function adminRequired(req, res, next) {
  try {
    const dec = jwt.verify(req.get('X-Admin-Token') || '', JWT_SECRET)
    if (!dec.adm || !(await isAdminUser(dec.uid))) throw new Error('not admin')
    next()
  } catch {
    res.status(401).json({ message: 'Area admin terkunci — buka dengan passphrase' })
  }
}
router.use(adminRequired)

// --- Kelola user ---
router.get('/users', async (_req, res) => {
  const r = await query(
    `SELECT u.id, u.email, u.email_verified, u.status, u.is_admin, u.created_at,
       (SELECT key FROM api_keys k WHERE k.user_id=u.id AND k.active=TRUE ORDER BY k.id DESC LIMIT 1) AS api_key
     FROM users u ORDER BY u.id`,
  )
  res.json({ users: r.rows })
})

router.post('/users/:id/approve', async (req, res) => {
  const id = req.params.id
  await query("UPDATE users SET status='approved' WHERE id=$1", [id])
  const ex = await query('SELECT key FROM api_keys WHERE user_id=$1 AND active=TRUE LIMIT 1', [id])
  let key = ex.rows[0]?.key
  if (!key) {
    key = settings.genApiKey()
    await query('INSERT INTO api_keys(user_id, key) VALUES ($1,$2)', [id, key])
  }
  res.json({ ok: true, status: 'approved', apiKey: key })
})

router.post('/users/:id/reject', async (req, res) => {
  await query("UPDATE users SET status='rejected' WHERE id=$1", [req.params.id])
  await query('UPDATE api_keys SET active=FALSE WHERE user_id=$1', [req.params.id])
  res.json({ ok: true, status: 'rejected' })
})

router.post('/users/:id/api-key/regenerate', async (req, res) => {
  await query('UPDATE api_keys SET active=FALSE WHERE user_id=$1', [req.params.id])
  const key = settings.genApiKey()
  await query('INSERT INTO api_keys(user_id, key) VALUES ($1,$2)', [req.params.id, key])
  res.json({ ok: true, apiKey: key })
})

router.post('/users/:id/api-key/revoke', async (req, res) => {
  await query('UPDATE api_keys SET active=FALSE WHERE user_id=$1', [req.params.id])
  res.json({ ok: true })
})

// --- Pengaturan sistem (OpenRouter key/base + daftar model) ---
router.get('/settings', async (_req, res) => {
  res.json({
    openrouterBaseUrl: settings.aiSystem.baseUrl,
    hasOpenrouterKey: !!settings.aiSystem.apiKey,
    openrouterKeyMasked: settings.maskKey(settings.aiSystem.apiKey),
    allowedModels: await settings.listAllowedModels(),
  })
})

router.post('/settings', async (req, res) => {
  const { openrouterApiKey, openrouterBaseUrl } = req.body || {}
  if (typeof openrouterBaseUrl === 'string' && openrouterBaseUrl.trim()) {
    const v = openrouterBaseUrl.trim().replace(/\/$/, '')
    await settings.setSetting('openrouter_base_url', v)
    settings.aiSystem.baseUrl = v
  }
  if (typeof openrouterApiKey === 'string' && openrouterApiKey.trim()) {
    const v = openrouterApiKey.trim()
    await settings.setSetting('openrouter_api_key', v)
    settings.aiSystem.apiKey = v
  }
  res.json({ ok: true })
})

router.post('/models', async (req, res) => {
  const m = String(req.body?.model || '').trim()
  if (!m) return res.status(400).json({ message: 'Model kosong' })
  await settings.addAllowedModel(m)
  res.json({ ok: true, allowedModels: await settings.listAllowedModels() })
})

router.delete('/models', async (req, res) => {
  await settings.removeAllowedModel(String(req.body?.model || '').trim())
  res.json({ ok: true, allowedModels: await settings.listAllowedModels() })
})

// Daftar model OpenRouter (untuk admin pilih saat kurasi).
router.get('/openrouter-models', async (_req, res) => {
  try {
    const r = await fetch(`${settings.aiSystem.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${settings.aiSystem.apiKey}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return res.status(502).json({ message: `OpenRouter HTTP ${r.status}` })
    const d = await r.json()
    res.json({ models: (d.data || []).map((m) => m.id).sort() })
  } catch (e) {
    res.status(502).json({ message: e.message })
  }
})

module.exports = { router }
