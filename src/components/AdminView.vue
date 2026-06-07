<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdmin, type AdminUser, type SystemSettings } from '../lib/admin'

const admin = useAdmin()

const unlocked = ref(admin.isUnlocked())
const passphrase = ref('')
const error = ref('')
const info = ref('')

const users = ref<AdminUser[]>([])
const settings = ref<SystemSettings | null>(null)
const orModels = ref<string[]>([])
const newModel = ref('')

// form pengaturan sistem
const baseUrl = ref('')
const apiKey = ref('')

function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  error.value = msg
  if (/terkunci/i.test(msg)) unlocked.value = false
}

async function unlock() {
  error.value = ''
  try {
    await admin.unlock(passphrase.value)
    passphrase.value = ''
    unlocked.value = true
    await loadAll()
  } catch (e) {
    fail(e)
  }
}

async function loadAll() {
  error.value = ''
  try {
    users.value = (await admin.listUsers()).users
    settings.value = await admin.getSettings()
    baseUrl.value = settings.value.openrouterBaseUrl
  } catch (e) {
    fail(e)
  }
}

const pendingCount = computed(() => users.value.filter((u) => u.status === 'pending').length)

async function approve(u: AdminUser) {
  try {
    await admin.approve(u.id)
    info.value = `Disetujui: ${u.email}`
    await loadAll()
  } catch (e) {
    fail(e)
  }
}
async function reject(u: AdminUser) {
  try {
    await admin.reject(u.id)
    await loadAll()
  } catch (e) {
    fail(e)
  }
}
async function regen(u: AdminUser) {
  try {
    await admin.regenerateKey(u.id)
    await loadAll()
  } catch (e) {
    fail(e)
  }
}
async function revoke(u: AdminUser) {
  try {
    await admin.revokeKey(u.id)
    await loadAll()
  } catch (e) {
    fail(e)
  }
}

async function saveSettings() {
  error.value = ''
  info.value = ''
  try {
    await admin.saveSettings({ openrouterBaseUrl: baseUrl.value, openrouterApiKey: apiKey.value || undefined })
    apiKey.value = ''
    info.value = 'Pengaturan sistem tersimpan.'
    settings.value = await admin.getSettings()
  } catch (e) {
    fail(e)
  }
}

async function loadOrModels() {
  try {
    orModels.value = (await admin.openrouterModels()).models
  } catch (e) {
    fail(e)
  }
}
async function addModel() {
  if (!newModel.value.trim()) return
  try {
    const r = await admin.addModel(newModel.value.trim())
    if (settings.value) settings.value.allowedModels = r.allowedModels
    newModel.value = ''
  } catch (e) {
    fail(e)
  }
}
async function removeModel(m: string) {
  try {
    const r = await admin.removeModel(m)
    if (settings.value) settings.value.allowedModels = r.allowedModels
  } catch (e) {
    fail(e)
  }
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
  info.value = 'API key disalin.'
}

onMounted(() => {
  if (unlocked.value) loadAll()
})
</script>

<template>
  <!-- GATE: buka kunci dengan passphrase -->
  <section v-if="!unlocked" class="card lock">
    <h2>Area Admin Terkunci</h2>
    <p class="hint">Masukkan passphrase admin untuk mengelola user &amp; sistem.</p>
    <form @submit.prevent="unlock">
      <input v-model="passphrase" type="password" placeholder="ADMIN_PASSPHRASE" autocomplete="off" />
      <button type="submit">Buka</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </section>

  <template v-else>
    <!-- KELOLA USER -->
    <section class="card">
      <div class="head">
        <h2>Kelola User</h2>
        <span v-if="pendingCount" class="pill warn">{{ pendingCount }} menunggu</span>
        <button type="button" class="ghost" @click="loadAll">Muat ulang</button>
      </div>

      <div class="tablewrap">
        <table>
          <thead>
            <tr><th>Email</th><th>Status</th><th>API Key</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>
                {{ u.email }}
                <span v-if="u.is_admin" class="pill admin">admin</span>
                <span v-if="!u.email_verified" class="pill warn">belum verif</span>
              </td>
              <td><span class="pill" :class="u.status">{{ u.status }}</span></td>
              <td class="key">
                <template v-if="u.api_key">
                  <code>{{ u.api_key.slice(0, 12) }}…</code>
                  <button type="button" class="link" @click="copy(u.api_key!)">salin</button>
                </template>
                <span v-else class="muted">—</span>
              </td>
              <td class="actions">
                <button v-if="u.status !== 'approved'" type="button" @click="approve(u)">Setujui</button>
                <button v-if="u.status !== 'rejected' && !u.is_admin" type="button" class="danger" @click="reject(u)">Tolak</button>
                <button v-if="u.api_key" type="button" class="ghost" @click="regen(u)">Rotate</button>
                <button v-if="u.api_key" type="button" class="ghost" @click="revoke(u)">Cabut</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- PENGATURAN SISTEM -->
    <section class="card">
      <h2>Pengaturan Sistem (OpenRouter)</h2>
      <label class="field">
        Base URL
        <input v-model="baseUrl" type="text" placeholder="https://openrouter.ai/api/v1" />
      </label>
      <label class="field">
        API Key OpenRouter (sistem)
        <input
          v-model="apiKey"
          type="password"
          autocomplete="off"
          :placeholder="settings?.hasOpenrouterKey ? `tersimpan: ${settings.openrouterKeyMasked} (kosongkan = tetap)` : 'sk-or-...'"
        />
      </label>
      <button type="button" @click="saveSettings">Simpan Pengaturan</button>

      <h3>Daftar Model untuk User</h3>
      <p class="hint">Model di sini yang boleh dipilih user di Pengaturan AI.</p>
      <ul v-if="settings?.allowedModels.length" class="models">
        <li v-for="m in settings.allowedModels" :key="m">
          <code>{{ m }}</code>
          <button type="button" class="link danger" @click="removeModel(m)">hapus</button>
        </li>
      </ul>
      <p v-else class="muted">Belum ada model. Tambahkan di bawah.</p>

      <div class="addmodel">
        <input v-model="newModel" list="or-models" type="text" placeholder="mis. openai/gpt-4o-mini" />
        <datalist id="or-models"><option v-for="m in orModels" :key="m" :value="m" /></datalist>
        <button type="button" @click="addModel">Tambah</button>
        <button type="button" class="ghost" @click="loadOrModels">Muat daftar OpenRouter</button>
      </div>
    </section>

    <p v-if="error" class="error" role="status">{{ error }}</p>
    <p v-if="info" class="ok" role="status">{{ info }}</p>
  </template>
</template>

<style scoped>
.card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.75rem;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.lock {
  max-width: 420px;
  margin: 2rem auto;
}

h2 {
  margin: 0;
}

h3 {
  margin: 0.5rem 0 0;
}

.head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.head .ghost {
  margin-left: auto;
}

form {
  display: flex;
  gap: 0.5rem;
}

input {
  font: inherit;
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.7rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

input:focus {
  outline: none;
  border-color: #42b883;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.9rem;
}

button {
  padding: 0.45rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #42b883;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

button.ghost {
  background: transparent;
  border-color: rgba(128, 128, 128, 0.4);
  color: inherit;
}

button.danger {
  background-color: #c92a3a;
}

button.link {
  background: none;
  border: none;
  padding: 0 0.25rem;
  color: #42b883;
  cursor: pointer;
  font-size: 0.82rem;
}

button.link.danger {
  color: #c92a3a;
}

.tablewrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
  vertical-align: middle;
}

td.actions {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

td.actions button {
  padding: 0.3rem 0.6rem;
  font-size: 0.82rem;
}

.pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  margin-left: 0.35rem;
  background: rgba(255, 193, 7, 0.22);
  color: #9a7b00;
}

.pill.approved {
  background: rgba(66, 184, 131, 0.2);
  color: #2c8c63;
}

.pill.rejected {
  background: rgba(220, 53, 69, 0.18);
  color: #c92a3a;
}

.pill.admin {
  background: rgba(16, 163, 127, 0.2);
  color: #0d8c6d;
}

.models {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.models li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.addmodel {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.addmodel input {
  flex: 1;
  min-width: 200px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
}

.muted {
  opacity: 0.6;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.7;
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
