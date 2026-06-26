<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toChatId, useOpenWa, type Group } from '../lib/openwa'

type Status = 'idle' | 'sending' | 'success' | 'error'

// sessionId dikontrol parent (diisi dari tombol "Pakai" di SessionPanel).
const sessionId = defineModel<string>('sessionId', { default: '' })

const { sendText, listGroups } = useOpenWa()

const mode = ref<'number' | 'group'>('number')
const phone = ref('')
const text = ref('')
const status = ref<Status>('idle')
const message = ref('')

// Target grup (notifikasi ke grup): chatId berakhiran @g.us.
const groups = ref<Group[]>([])
const groupId = ref('')
const groupsLoading = ref(false)
const groupsError = ref('')

const chatIdPreview = computed(() => (phone.value ? toChatId(phone.value) : '—'))
const targetChatId = computed(() =>
  mode.value === 'group' ? groupId.value : phone.value ? toChatId(phone.value) : '',
)
const canSend = computed(() => !!sessionId.value && !!targetChatId.value && !!text.value.trim())

async function loadGroups() {
  if (!sessionId.value) {
    groupsError.value = 'Pilih session dulu (tombol "Pakai").'
    return
  }
  groupsLoading.value = true
  groupsError.value = ''
  try {
    groups.value = await listGroups(sessionId.value)
    if (!groups.value.length) groupsError.value = 'Tidak ada grup pada session ini.'
  } catch (err) {
    groupsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    groupsLoading.value = false
  }
}

// Muat grup otomatis saat pertama kali pindah ke mode "Grup".
watch(mode, (m) => {
  if (m === 'group' && !groups.value.length && sessionId.value) loadGroups()
})

async function send() {
  const chatId = targetChatId.value
  if (!sessionId.value || !chatId || !text.value) {
    status.value = 'error'
    message.value = 'Session, tujuan, dan pesan wajib diisi.'
    return
  }

  status.value = 'sending'
  message.value = ''

  try {
    await sendText(sessionId.value, chatId, text.value)
    status.value = 'success'
    message.value = `Pesan terkirim ke ${chatId}.`
    text.value = ''
  } catch (err) {
    status.value = 'error'
    message.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <form class="card" @submit.prevent="send">
    <h2>Kirim Pesan WhatsApp</h2>
    <p class="hint">via OpenWA gateway (proxy ke <code>localhost:2785</code>)</p>

    <label>
      Session ID
      <input v-model.trim="sessionId" type="text" placeholder='pilih lewat tombol "Pakai"' />
      <small v-if="sessionId">Mengirim sebagai session <code>{{ sessionId }}</code></small>
      <small v-else class="warn">Belum ada session — klik "Pakai" di panel Session.</small>
    </label>

    <div class="target">
      <span class="target-label">Tujuan</span>
      <div class="seg" role="tablist">
        <button type="button" :class="{ active: mode === 'number' }" @click="mode = 'number'">Nomor</button>
        <button type="button" :class="{ active: mode === 'group' }" @click="mode = 'group'">Grup</button>
      </div>
    </div>

    <label v-if="mode === 'number'">
      Nomor Tujuan
      <input v-model.trim="phone" type="tel" placeholder="0812xxxx atau 62812xxxx" />
      <small>chatId: <code>{{ chatIdPreview }}</code></small>
    </label>

    <label v-else>
      Grup Tujuan
      <select v-model="groupId" :disabled="groupsLoading">
        <option value="">{{ groupsLoading ? 'Memuat grup…' : '— pilih grup —' }}</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">
          {{ g.name }}{{ g.participants != null ? ` (${g.participants})` : '' }}
        </option>
      </select>
      <small v-if="groupId">chatId grup: <code>{{ groupId }}</code></small>
      <small v-if="groupsError" class="warn">{{ groupsError }}</small>
      <button type="button" class="link" :disabled="groupsLoading || !sessionId" @click="loadGroups">↻ muat ulang grup</button>
    </label>

    <label>
      Pesan
      <textarea v-model="text" rows="4" placeholder="Tulis pesan..."></textarea>
    </label>

    <p v-if="!sessionId" class="note warn">Pilih session lewat tombol "Pakai".</p>

    <button type="submit" :disabled="status === 'sending' || !canSend">
      {{ status === 'sending' ? 'Mengirim...' : 'Kirim' }}
    </button>

    <p v-if="message" class="result" :class="status" role="status">{{ message }}</p>
  </form>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  padding: 1.75rem;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 12px;
}

h2 {
  margin: 0;
}

.hint {
  margin: -0.75rem 0 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.9rem;
}

input,
textarea,
select {
  font: inherit;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: #42b883;
}

.target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.target-label {
  font-weight: 600;
  font-size: 0.9rem;
}

.seg {
  display: inline-flex;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  overflow: hidden;
}

.seg button {
  padding: 0.4rem 0.9rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}

.seg button.active {
  background-color: #42b883;
  color: #fff;
}

.link {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: #42b883;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.link:disabled {
  opacity: 0.5;
}

small {
  font-weight: 400;
  opacity: 0.7;
}

small.warn {
  opacity: 1;
  color: #9a7b00;
}

.note {
  margin: 0;
  font-size: 0.85rem;
}

.note.warn {
  color: #9a7b00;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

button {
  padding: 0.7rem 1.2rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #42b883;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result {
  margin: 0;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.9rem;
}

.result.success {
  background: rgba(66, 184, 131, 0.15);
  color: #2c8c63;
}

.result.error {
  background: rgba(220, 53, 69, 0.15);
  color: #c92a3a;
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
