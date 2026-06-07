// Konfigurasi sensitif terpusat + validasi FAIL-CLOSED.
// Menolak boot bila secret lemah/tak diset agar tidak diam-diam memakai default publik.
const JWT_SECRET = process.env.JWT_SECRET || ''
if (!JWT_SECRET || JWT_SECRET === 'dev-insecure-change-me' || JWT_SECRET.length < 16) {
  throw new Error(
    'JWT_SECRET wajib di-set ke nilai acak kuat (min 16 karakter). Buat: openssl rand -hex 32',
  )
}

const ADMIN_PASSPHRASE = process.env.ADMIN_PASSPHRASE || ''
if (!ADMIN_PASSPHRASE) {
  throw new Error('ADMIN_PASSPHRASE wajib di-set untuk membuka area admin.')
}

module.exports = {
  JWT_SECRET,
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSPHRASE,
}
