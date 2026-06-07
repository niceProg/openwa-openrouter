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

async function sendOtp(to, code) {
  if (DISABLED) {
    console.log(`[mail:disabled] OTP untuk ${to} = ${code}`)
    return
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Kode verifikasi OpenWA',
    text: `Kode verifikasi kamu: ${code}\nBerlaku 10 menit. Abaikan email ini jika kamu tidak mendaftar.`,
    html:
      `<p>Kode verifikasi OpenWA kamu:</p>` +
      `<p style="font-size:1.6em;font-weight:700;letter-spacing:3px">${code}</p>` +
      `<p>Berlaku 10 menit. Abaikan email ini jika kamu tidak mendaftar.</p>`,
  })
}

module.exports = { transporter, sendOtp }
