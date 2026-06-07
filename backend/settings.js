// Pengaturan tingkat sistem (DB) + daftar model + generator API key.
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

// Konfigurasi OpenRouter tingkat sistem (dikelola admin). Cache di memori,
// nilai awal dari env, ditimpa dari DB bila ada.
const aiSystem = {
  baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  apiKey: process.env.OPENROUTER_API_KEY || '',
}

async function loadAiSystem() {
  const b = await getSetting('openrouter_base_url')
  const k = await getSetting('openrouter_api_key')
  if (b) aiSystem.baseUrl = b.replace(/\/$/, '')
  if (k) aiSystem.apiKey = k
  return aiSystem
}

async function listAllowedModels() {
  const r = await query('SELECT model FROM allowed_models ORDER BY model')
  return r.rows.map((x) => x.model)
}
async function addAllowedModel(m) {
  await query('INSERT INTO allowed_models(model) VALUES ($1) ON CONFLICT (model) DO NOTHING', [m])
}
async function removeAllowedModel(m) {
  await query('DELETE FROM allowed_models WHERE model=$1', [m])
}

const genApiKey = () => 'owa_' + crypto.randomBytes(16).toString('hex')
const maskKey = (k) => (k ? `${k.slice(0, 8)}…${k.slice(-4)}` : '')

module.exports = {
  getSetting,
  setSetting,
  aiSystem,
  loadAiSystem,
  listAllowedModels,
  addAllowedModel,
  removeAllowedModel,
  genApiKey,
  maskKey,
}
