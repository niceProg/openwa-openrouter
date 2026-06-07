// Pengaturan sistem (DB) + multi-provider AI + daftar model + generator API key.
const crypto = require('node:crypto')
const { query } = require('./db')

async function getSetting(key) {
  const r = await query('SELECT value FROM system_settings WHERE key=$1', [key])
  return r.rows.length ? r.rows[0].value : null
}
async function setSetting(key, value) {
  await query(
    'INSERT INTO system_settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
    [key, value],
  )
}

// Provider AI (OpenAI-compatible). Nilai awal dari env, ditimpa dari DB.
const providers = {
  openrouter: {
    baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseKey: 'openrouter_base_url',
    keyKey: 'openrouter_api_key',
  },
  google: {
    baseUrl: (process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
    apiKey: process.env.GOOGLE_API_KEY || '',
    baseKey: 'google_base_url',
    keyKey: 'google_api_key',
  },
}

async function loadProviders() {
  for (const p of Object.values(providers)) {
    const b = await getSetting(p.baseKey)
    const k = await getSetting(p.keyKey)
    if (b) p.baseUrl = b.replace(/\/$/, '')
    if (k) p.apiKey = k
  }
}

async function setProvider(name, { apiKey, baseUrl } = {}) {
  const p = providers[name]
  if (!p) return
  if (typeof baseUrl === 'string' && baseUrl.trim()) {
    p.baseUrl = baseUrl.trim().replace(/\/$/, '')
    await setSetting(p.baseKey, p.baseUrl)
  }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    p.apiKey = apiKey.trim()
    await setSetting(p.keyKey, p.apiKey)
  }
}

// Tentukan provider (base/key) untuk sebuah model dari daftar allowed_models.
async function resolveProvider(model) {
  const r = await query('SELECT provider FROM allowed_models WHERE model=$1', [model])
  const name = providers[r.rows[0]?.provider] ? r.rows[0].provider : 'openrouter'
  return { provider: name, baseUrl: providers[name].baseUrl, apiKey: providers[name].apiKey }
}

const maskKey = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}` : '')
function providersPublic() {
  const out = {}
  for (const [name, p] of Object.entries(providers)) {
    out[name] = { baseUrl: p.baseUrl, hasKey: !!p.apiKey, keyMasked: maskKey(p.apiKey) }
  }
  return out
}

async function listAllowedModels() {
  const r = await query('SELECT model, provider FROM allowed_models ORDER BY provider, model')
  return r.rows // [{ model, provider }]
}
async function addAllowedModel(model, provider) {
  const p = providers[provider] ? provider : 'openrouter'
  await query(
    'INSERT INTO allowed_models(model, provider) VALUES ($1,$2) ON CONFLICT (model) DO UPDATE SET provider=EXCLUDED.provider',
    [model, p],
  )
}
async function removeAllowedModel(model) {
  await query('DELETE FROM allowed_models WHERE model=$1', [model])
}

const genApiKey = () => 'owa_' + crypto.randomBytes(16).toString('hex')

module.exports = {
  getSetting,
  setSetting,
  providers,
  loadProviders,
  setProvider,
  resolveProvider,
  providersPublic,
  listAllowedModels,
  addAllowedModel,
  removeAllowedModel,
  genApiKey,
  maskKey,
}
