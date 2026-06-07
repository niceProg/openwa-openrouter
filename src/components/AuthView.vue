<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../lib/auth'

const { register, verifyOtp, resendOtp, login } = useAuth()

type Mode = 'login' | 'register' | 'verify'
const mode = ref<Mode>('login')

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
    <section class="card">
      <h2>
        {{ mode === 'login' ? 'Masuk' : mode === 'register' ? 'Daftar Akun' : 'Verifikasi Email' }}
      </h2>

      <!-- LOGIN -->
      <form v-if="mode === 'login'" @submit.prevent="doLogin">
        <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="email@domain.com" /></label>
        <label>Password<input v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" /></label>
        <button type="submit" :disabled="busy">{{ busy ? 'Memproses…' : 'Masuk' }}</button>
        <p class="switch">Belum punya akun? <a href="#" @click.prevent="reset(); mode = 'register'">Daftar</a></p>
      </form>

      <!-- REGISTER -->
      <form v-else-if="mode === 'register'" @submit.prevent="doRegister">
        <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="email@domain.com" /></label>
        <label>Password<input v-model="password" type="password" autocomplete="new-password" placeholder="min. 8 karakter" /></label>
        <button type="submit" :disabled="busy">{{ busy ? 'Mengirim OTP…' : 'Daftar' }}</button>
        <p class="switch">Sudah punya akun? <a href="#" @click.prevent="reset(); mode = 'login'">Masuk</a></p>
      </form>

      <!-- VERIFY OTP -->
      <form v-else @submit.prevent="doVerify">
        <p class="hint">Kode OTP dikirim ke <strong>{{ email || 'email kamu' }}</strong>. Berlaku 10 menit.</p>
        <label>Email<input v-model.trim="email" type="email" placeholder="email@domain.com" /></label>
        <label>Kode OTP<input v-model.trim="code" inputmode="numeric" maxlength="6" placeholder="6 digit" /></label>
        <button type="submit" :disabled="busy">{{ busy ? 'Memeriksa…' : 'Verifikasi' }}</button>
        <p class="switch">
          Tidak menerima kode? <a href="#" @click.prevent="doResend">Kirim ulang</a> ·
          <a href="#" @click.prevent="reset(); mode = 'login'">Masuk</a>
        </p>
      </form>

      <p v-if="error" class="error" role="status">{{ error }}</p>
      <p v-if="info" class="ok" role="status">{{ info }}</p>
    </section>
  </main>
</template>

<style scoped>
.auth {
  display: flex;
  justify-content: center;
  padding-top: 2rem;
}

.card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2rem;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 12px;
}

h2 {
  margin: 0;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.9rem;
}

input {
  font: inherit;
  padding: 0.6rem 0.7rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

input:focus {
  outline: none;
  border-color: #42b883;
}

button {
  margin-top: 0.25rem;
  padding: 0.65rem 1rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #42b883;
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch {
  margin: 0;
  font-size: 0.88rem;
  opacity: 0.85;
}

.switch a {
  color: #42b883;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 0.88rem;
  opacity: 0.75;
}

.error {
  margin: 0;
  padding: 0.7rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.15);
  color: #c92a3a;
  font-size: 0.9rem;
}

.ok {
  margin: 0;
  padding: 0.7rem;
  border-radius: 8px;
  background: rgba(66, 184, 131, 0.15);
  color: #2c8c63;
  font-size: 0.9rem;
}
</style>
