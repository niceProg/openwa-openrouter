// Autentikasi: registrasi, verifikasi OTP email, login (JWT), middleware.
const crypto = require('node:crypto')
const express = require('express')
const jwt = require('jsonwebtoken')
const { query } = require('./db')
const { sendOtp } = require('./mailer')

const { JWT_SECRET, ADMIN_EMAIL } = require('./config')
const OTP_TTL_MIN = 10
const OTP_MAX_ATTEMPTS = 5
const OTP_DEBUG = process.env.OTP_DEBUG === '1'

// Rate limit sederhana per-IP (in-memory) untuk endpoint auth.
const rlHits = new Map()
function rateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown'
    const now = Date.now()
    const e = rlHits.get(ip)
    if (!e || now - e.start > 60000) {
      rlHits.set(ip, { start: now, n: 1 })
      return next()
    }
    if (++e.n > maxPerMin) {
      return res.status(429).json({ message: 'Terlalu banyak permintaan, coba lagi nanti.' })
    }
    next()
  }
}

// --- password hashing (scrypt, tanpa dependency native) ---
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const dk = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `scrypt$${salt}$${dk}`
}
function verifyPassword(pw, stored) {
  try {
    const [scheme, salt, dk] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const test = crypto.scryptSync(pw, salt, 64).toString('hex')
    const a = Buffer.from(dk, 'hex')
    const b = Buffer.from(test, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex')
const genCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0')

function signToken(u) {
  return jwt.sign({ uid: u.id, email: u.email, isAdmin: u.is_admin }, JWT_SECRET, { expiresIn: '7d' })
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    status: u.status,
    isAdmin: u.is_admin,
    emailVerified: u.email_verified,
  }
}

async function issueOtp(email) {
  // Batalkan OTP lama yang belum dipakai → hanya satu kode aktif (perkecil brute-force).
  await query("UPDATE email_otps SET consumed=TRUE WHERE email=$1 AND purpose='verify' AND consumed=FALSE", [email])
  const code = genCode()
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60000)
  await query('INSERT INTO email_otps(email, code_hash, purpose, expires_at) VALUES ($1,$2,$3,$4)', [
    email,
    hashCode(code),
    'verify',
    expires,
  ])
  if (OTP_DEBUG) console.log(`[otp] ${email} = ${code}`)
  await sendOtp(email, code)
}

// --- middleware: butuh JWT user yang valid ---
function authRequired(req, res, next) {
  const h = req.get('Authorization') || ''
  const tok = h.startsWith('Bearer ') ? h.slice(7) : ''
  try {
    req.user = jwt.verify(tok, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa' })
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const router = express.Router()
router.use(rateLimit(60)) // maks 60 req/menit per IP untuk semua endpoint auth

router.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Email tidak valid' })
  if (password.length < 8) return res.status(400).json({ message: 'Password minimal 8 karakter' })

  const existing = await query('SELECT id, email_verified FROM users WHERE email=$1', [email])
  if (existing.rows.length) {
    if (existing.rows[0].email_verified) return res.status(409).json({ message: 'Email sudah terdaftar' })
    // Belum verifikasi → set ulang password + kirim OTP. OTP ke inbox asli,
    // jadi hanya pemilik email yang bisa menuntaskan (cegah squatting akun).
    await query('UPDATE users SET password_hash=$1 WHERE email=$2', [hashPassword(password), email])
    await issueOtp(email)
    return res.json({ ok: true, message: 'Akun belum terverifikasi — password diperbarui & OTP dikirim ulang.' })
  }

  const isAdmin = !!ADMIN_EMAIL && email === ADMIN_EMAIL
  const status = isAdmin ? 'approved' : 'pending'
  await query('INSERT INTO users(email, password_hash, is_admin, status) VALUES ($1,$2,$3,$4)', [
    email,
    hashPassword(password),
    isAdmin,
    status,
  ])
  await issueOtp(email)
  res.json({ ok: true, message: 'Registrasi berhasil — cek email untuk kode OTP.' })
})

router.post('/resend-otp', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const r = await query('SELECT id, email_verified FROM users WHERE email=$1', [email])
  if (!r.rows.length) return res.status(404).json({ message: 'Email belum terdaftar' })
  if (r.rows[0].email_verified) return res.status(400).json({ message: 'Email sudah terverifikasi' })
  await issueOtp(email)
  res.json({ ok: true, message: 'OTP dikirim ulang.' })
})

router.post('/verify-otp', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const code = String(req.body?.code || '').trim()
  const r = await query(
    `SELECT id, code_hash, attempts FROM email_otps
     WHERE email=$1 AND purpose='verify' AND consumed=FALSE AND expires_at > now()
     ORDER BY id DESC LIMIT 1`,
    [email],
  )
  const row = r.rows[0]
  if (!row) return res.status(400).json({ message: 'Kode salah atau kedaluwarsa' })
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await query('UPDATE email_otps SET consumed=TRUE WHERE id=$1', [row.id])
    return res.status(429).json({ message: 'Terlalu banyak percobaan. Minta kode baru.' })
  }
  if (row.code_hash !== hashCode(code)) {
    await query('UPDATE email_otps SET attempts=attempts+1 WHERE id=$1', [row.id])
    return res.status(400).json({ message: 'Kode salah atau kedaluwarsa' })
  }
  await query('UPDATE email_otps SET consumed=TRUE WHERE id=$1', [row.id])
  await query('UPDATE users SET email_verified=TRUE WHERE email=$1', [email])
  res.json({ ok: true, message: 'Email terverifikasi. Silakan login.' })
})

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const r = await query('SELECT * FROM users WHERE email=$1', [email])
  const u = r.rows[0]
  if (!u || !verifyPassword(password, u.password_hash)) {
    return res.status(401).json({ message: 'Email atau password salah' })
  }
  if (!u.email_verified) return res.status(403).json({ message: 'Email belum diverifikasi', needVerify: true })
  res.json({ token: signToken(u), user: publicUser(u) })
})

router.get('/me', authRequired, async (req, res) => {
  const r = await query('SELECT * FROM users WHERE id=$1', [req.user.uid])
  if (!r.rows.length) return res.status(401).json({ message: 'User tidak ditemukan' })
  const u = r.rows[0]
  const k = await query('SELECT key FROM api_keys WHERE user_id=$1 AND active=TRUE ORDER BY id DESC LIMIT 1', [u.id])
  res.json({ user: { ...publicUser(u), apiKey: k.rows[0]?.key || null, aiModel: u.ai_model || null } })
})

module.exports = { router, authRequired, signToken, publicUser, ADMIN_EMAIL }
