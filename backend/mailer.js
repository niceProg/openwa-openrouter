// Pengiriman email via SMTP (nodemailer). Dipakai untuk kode OTP verifikasi.
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE) === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
})

// MAIL_DISABLE=1 → jangan kirim email beneran (untuk dev/test), cukup log.
const DISABLED = process.env.MAIL_DISABLE === '1'

async function sendOtp(to, code, purpose = 'verify') {
  const reset = purpose === 'reset'
  const subject = reset ? 'Kode reset password OpenWA' : 'Kode verifikasi OpenWA'
  const intro = reset ? 'Kode reset password OpenWA kamu:' : 'Kode verifikasi OpenWA kamu:'
  const foot = reset
    ? 'Berlaku 10 menit. Abaikan email ini jika kamu tidak meminta reset password.'
    : 'Berlaku 10 menit. Abaikan email ini jika kamu tidak mendaftar.'
  if (DISABLED) {
    console.log(`[mail:disabled] OTP(${purpose}) untuk ${to} = ${code}`)
    return
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `${intro} ${code}\n${foot}`,
    html:
      `<p>${intro}</p>` +
      `<p style="font-size:1.6em;font-weight:700;letter-spacing:3px">${code}</p>` +
      `<p>${foot}</p>`,
  })
}

module.exports = { transporter, sendOtp }
