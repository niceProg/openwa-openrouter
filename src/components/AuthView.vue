<script setup lang="ts">
import { computed, ref } from 'vue'
import { motion, AnimatePresence } from 'motion-v'
import { useAuth } from '../lib/auth'

const { register, verifyOtp, resendOtp, forgotPassword, resetPassword, login } = useAuth()

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset'
const mode = ref<Mode>('login')

const TITLES: Record<Mode, string> = {
  login: 'Selamat datang',
  register: 'Buat akun',
  verify: 'Verifikasi email',
  forgot: 'Lupa password',
  reset: 'Reset password',
}
const SUBTITLES: Record<Mode, string> = {
  login: 'Masuk untuk kelola session WhatsApp & auto-reply AI.',
  register: 'Daftar — verifikasi lewat kode yang dikirim ke email.',
  verify: 'Masukkan kode 6 digit yang dikirim ke emailmu.',
  forgot: 'Kami kirim kode reset ke email akunmu.',
  reset: 'Masukkan kode reset dan password barumu.',
}
const title = computed(() => TITLES[mode.value])
const subtitle = computed(() => SUBTITLES[mode.value])

const email = ref('')
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const info = ref('')

function reset(msg = '') {
  error.value = ''
  info.value = msg
}

async function doRegister() {
  reset()
  busy.value = true
  try {
    const r = await register(email.value.trim(), password.value)
    mode.value = 'verify'
    info.value = r.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function doVerify() {
  reset()
  busy.value = true
  try {
    await verifyOtp(email.value.trim(), code.value.trim())
    mode.value = 'login'
    info.value = 'Email terverifikasi. Silakan login.'
    code.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function doResend() {
  reset()
  try {
    const r = await resendOtp(email.value.trim())
    info.value = r.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function doForgot() {
  reset()
  busy.value = true
  try {
    const r = await forgotPassword(email.value.trim())
    mode.value = 'reset'
    info.value = r.message
    code.value = ''
    password.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function doReset() {
  reset()
  busy.value = true
  try {
    const r = await resetPassword(email.value.trim(), code.value.trim(), password.value)
    mode.value = 'login'
    info.value = r.message
    code.value = ''
    password.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function doLogin() {
  reset()
  busy.value = true
  try {
    await login(email.value.trim(), password.value)
    // App.vue bereaksi otomatis karena `user` ref terisi.
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    error.value = msg
    if (/belum diverifikasi/i.test(msg)) mode.value = 'verify'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth">
    <motion.section
      class="card"
      :initial="{ opacity: 0, y: 24, scale: 0.98 }"
      :animate="{ opacity: 1, y: 0, scale: 1 }"
      :transition="{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }"
    >
      <div class="brand">
        <motion.span
          class="brand-badge"
          aria-hidden="true"
          :initial="{ scale: 0, rotate: -25 }"
          :animate="{ scale: 1, rotate: 0 }"
          :transition="{ type: 'spring', stiffness: 240, damping: 16, delay: 0.12 }"
        >
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path fill="currentColor" d="M12 3C6.5 3 2 6.94 2 11.8c0 2.3 1.02 4.4 2.7 5.96L4 21.5l3.96-1.2c1.2.5 2.6.78 4.04.78 5.5 0 10-3.94 10-8.78S17.5 3 12 3zm0 15.7c-1.3 0-2.55-.26-3.66-.74l-.4-.17-2.35.71.7-2.28-.2-.4A6.7 6.7 0 0 1 4.6 11.8C4.6 8.3 7.9 5.5 12 5.5s7.4 2.8 7.4 6.3-3.3 6.9-7.4 6.9z"/>
            <path fill="currentColor" d="M9.6 8.6c-.18-.4-.36-.41-.53-.42h-.45c-.16 0-.4.06-.62.29-.21.23-.8.78-.8 1.9s.82 2.2.94 2.36c.11.15 1.6 2.55 3.96 3.47 1.96.77 2.36.62 2.79.58.42-.04 1.37-.56 1.56-1.1.2-.54.2-1 .14-1.1-.06-.1-.2-.15-.43-.27-.23-.11-1.37-.68-1.58-.76-.21-.08-.37-.11-.53.12-.16.23-.6.76-.74.92-.13.15-.27.17-.5.06-.23-.12-.97-.36-1.85-1.14-.68-.61-1.14-1.36-1.28-1.59-.13-.23-.01-.35.1-.47.1-.1.23-.27.34-.4.11-.14.15-.23.23-.39.08-.15.04-.29-.02-.4-.06-.12-.5-1.27-.7-1.74z"/>
          </svg>
        </motion.span>
        <span class="wordmark">OpenWA</span>
      </div>

      <!-- Mode switch (login/register/verify/forgot/reset) crossfades+slides via Motion -->
      <AnimatePresence mode="wait" :initial="false">
        <motion.div
          :key="mode"
          class="screen"
          :initial="{ opacity: 0, x: 22 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: -22 }"
          :transition="{ duration: 0.24, ease: 'easeOut' }"
        >
          <h2 class="screen-title">{{ title }}</h2>
          <p class="screen-sub">{{ subtitle }}</p>

          <!-- LOGIN -->
          <form v-if="mode === 'login'" @submit.prevent="doLogin">
            <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="email@domain.com" /></label>
            <label>Password<input v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" /></label>
            <motion.button type="submit" :disabled="busy" :whileHover="{ scale: 1.02 }" :whilePress="{ scale: 0.97 }">{{ busy ? 'Memproses…' : 'Masuk' }}</motion.button>
            <p class="switch">
              <a href="#" @click.prevent="reset(); mode = 'forgot'">Lupa password?</a> ·
              Belum punya akun? <a href="#" @click.prevent="reset(); mode = 'register'">Daftar</a>
            </p>
          </form>

          <!-- REGISTER -->
          <form v-else-if="mode === 'register'" @submit.prevent="doRegister">
            <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="email@domain.com" /></label>
            <label>Password<input v-model="password" type="password" autocomplete="new-password" placeholder="min. 8 karakter" /></label>
            <motion.button type="submit" :disabled="busy" :whileHover="{ scale: 1.02 }" :whilePress="{ scale: 0.97 }">{{ busy ? 'Mengirim OTP…' : 'Daftar' }}</motion.button>
            <p class="switch">Sudah punya akun? <a href="#" @click.prevent="reset(); mode = 'login'">Masuk</a></p>
          </form>

          <!-- VERIFY OTP -->
          <form v-else-if="mode === 'verify'" @submit.prevent="doVerify">
            <p class="hint">Kode OTP dikirim ke <strong>{{ email || 'email kamu' }}</strong>. Berlaku 10 menit.</p>
            <label>Email<input v-model.trim="email" type="email" placeholder="email@domain.com" /></label>
            <label>Kode OTP<input v-model.trim="code" inputmode="numeric" maxlength="6" placeholder="6 digit" /></label>
            <motion.button type="submit" :disabled="busy" :whileHover="{ scale: 1.02 }" :whilePress="{ scale: 0.97 }">{{ busy ? 'Memeriksa…' : 'Verifikasi' }}</motion.button>
            <p class="switch">
              Tidak menerima kode? <a href="#" @click.prevent="doResend">Kirim ulang</a> ·
              <a href="#" @click.prevent="reset(); mode = 'login'">Masuk</a>
            </p>
          </form>

          <!-- FORGOT PASSWORD — minta kode reset -->
          <form v-else-if="mode === 'forgot'" @submit.prevent="doForgot">
            <p class="hint">Masukkan email akunmu. Kami kirim kode reset (berlaku 10 menit).</p>
            <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="email@domain.com" /></label>
            <motion.button type="submit" :disabled="busy" :whileHover="{ scale: 1.02 }" :whilePress="{ scale: 0.97 }">{{ busy ? 'Mengirim kode…' : 'Kirim kode reset' }}</motion.button>
            <p class="switch">Ingat password? <a href="#" @click.prevent="reset(); mode = 'login'">Masuk</a></p>
          </form>

          <!-- RESET PASSWORD — kode + password baru -->
          <form v-else-if="mode === 'reset'" @submit.prevent="doReset">
            <p class="hint">Kode reset dikirim ke <strong>{{ email || 'email kamu' }}</strong>. Berlaku 10 menit.</p>
            <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="email@domain.com" /></label>
            <label>Kode reset<input v-model.trim="code" inputmode="numeric" maxlength="6" placeholder="6 digit" /></label>
            <label>Password baru<input v-model="password" type="password" autocomplete="new-password" placeholder="min. 8 karakter" /></label>
            <motion.button type="submit" :disabled="busy" :whileHover="{ scale: 1.02 }" :whilePress="{ scale: 0.97 }">{{ busy ? 'Mereset…' : 'Reset password' }}</motion.button>
            <p class="switch">
              Tidak menerima kode? <a href="#" @click.prevent="doForgot">Kirim ulang</a> ·
              <a href="#" @click.prevent="reset(); mode = 'login'">Masuk</a>
            </p>
          </form>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        <motion.p v-if="error" key="err" class="error" role="status" :initial="{ opacity: 0, y: -6 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0 }">{{ error }}</motion.p>
      </AnimatePresence>
      <AnimatePresence>
        <motion.p v-if="info" key="info" class="ok" role="status" :initial="{ opacity: 0, y: -6 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0 }">{{ info }}</motion.p>
      </AnimatePresence>
    </motion.section>
  </main>
</template>

<style scoped>
.auth {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 6rem);
}

.card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2.25rem 2rem;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 18px;
  /* override the soft global card shadow with a subtle green glow */
  box-shadow: 0 14px 44px -16px rgba(31, 169, 113, 0.32), 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* motion.div wrapper per-mode — re-creates the card's column spacing for its content */
.screen {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── brand header ───────────────────────────── */
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
}

.brand-badge {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(135deg, #42b883, #1fa971);
  box-shadow: 0 8px 18px -6px rgba(31, 169, 113, 0.6);
}

.wordmark {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  opacity: 0.85;
}

.screen-title {
  margin: 0.35rem 0 0;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 700;
}

.screen-sub {
  margin: 0 0 0.3rem;
  text-align: center;
  font-size: 0.9rem;
  line-height: 1.45;
  opacity: 0.62;
}

/* ── forms ──────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.85rem;
}

input {
  font: inherit;
  padding: 0.7rem 0.85rem;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.05);
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

input::placeholder {
  opacity: 0.5;
}

input:focus {
  outline: none;
  border-color: #42b883;
  background: transparent;
  box-shadow: 0 0 0 3px rgba(66, 184, 131, 0.18);
}

button[type='submit'] {
  margin-top: 0.4rem;
  padding: 0.78rem 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #42b883, #1fa971);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 18px -8px rgba(31, 169, 113, 0.7);
  transition: transform 0.12s, box-shadow 0.2s, opacity 0.2s;
}

button[type='submit']:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px -10px rgba(31, 169, 113, 0.85);
}

button[type='submit']:active:not(:disabled) {
  transform: translateY(0);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch {
  margin: 0.2rem 0 0;
  text-align: center;
  font-size: 0.86rem;
  opacity: 0.85;
}

.switch a {
  color: #42b883;
  font-weight: 600;
  text-decoration: none;
}

.switch a:hover {
  text-decoration: underline;
}

.hint {
  margin: 0;
  padding: 0.6rem 0.8rem;
  font-size: 0.84rem;
  line-height: 1.45;
  border-radius: 10px;
  background: rgba(66, 184, 131, 0.1);
}

.error,
.ok {
  margin: 0;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  font-size: 0.88rem;
}

.error {
  background: rgba(220, 53, 69, 0.14);
  color: #c92a3a;
}

.ok {
  background: rgba(66, 184, 131, 0.16);
  color: #2c8c63;
}

@media (max-width: 480px) {
  .card {
    padding: 1.75rem 1.25rem;
    border-radius: 14px;
  }
  .screen-title {
    font-size: 1.35rem;
  }
}
</style>
