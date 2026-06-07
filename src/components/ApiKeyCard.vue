<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '../lib/auth'
import { useOpenWa } from '../lib/openwa'

const { user } = useAuth()
const { regenerateMyKey } = useOpenWa()

const copied = ref(false)
const busy = ref(false)
const error = ref('')

const approved = computed(() => !!user.value && (user.value.isAdmin || user.value.status === 'approved'))

function copy() {
  if (!user.value?.apiKey) return
  navigator.clipboard?.writeText(user.value.apiKey)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function generate() {
  error.value = ''
  busy.value = true
  try {
    const r = await regenerateMyKey()
    if (user.value) user.value.apiKey = r.apiKey
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="user" class="card">
    <h2>API Key Gateway Anda</h2>
    <p class="hint">
      Pakai key ini untuk mengirim WhatsApp dari sistem bisnismu (header <code>X-API-Key</code>).
      Jangan dibagikan ke publik.
    </p>

    <!-- Sudah punya key -->
    <template v-if="user.apiKey">
      <div class="keyrow">
        <code class="key">{{ user.apiKey }}</code>
        <button type="button" @click="copy">{{ copied ? 'Tersalin ✓' : 'Salin' }}</button>
        <button type="button" class="ghost" :disabled="busy" @click="generate">
          {{ busy ? '...' : 'Buat ulang' }}
        </button>
      </div>
      <p class="hint">
        Contoh: <code>POST /api/sessions/&lt;id&gt;/messages/send-text</code> +
        header <code>X-API-Key: {{ user.apiKey.slice(0, 10) }}…</code>
      </p>
    </template>

    <!-- Approved tapi belum punya key -->
    <template v-else-if="approved">
      <div class="keyrow">
        <span class="muted">Belum ada API key.</span>
        <button type="button" :disabled="busy" @click="generate">
          {{ busy ? 'Membuat…' : 'Buat API Key' }}
        </button>
      </div>
    </template>

    <!-- Belum disetujui -->
    <template v-else>
      <code class="key muted">— belum tersedia (menunggu persetujuan admin) —</code>
    </template>

    <p v-if="error" class="error" role="status">{{ error }}</p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 1.5rem 1.75rem;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 12px;
}

h2 {
  margin: 0;
  font-size: 1.15rem;
}

.keyrow {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.key {
  flex: 1;
  min-width: 200px;
  padding: 0.55rem 0.7rem;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  word-break: break-all;
}

button {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #42b883;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button.ghost {
  background: transparent;
  border: 1px solid rgba(128, 128, 128, 0.4);
  color: inherit;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.muted {
  opacity: 0.6;
}

.hint {
  margin: 0;
  font-size: 0.82rem;
  opacity: 0.7;
}

.error {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.15);
  color: #c92a3a;
  font-size: 0.9rem;
}
</style>
