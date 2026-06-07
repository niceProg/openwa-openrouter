<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../lib/auth'

const { user } = useAuth()
const copied = ref(false)

function copy() {
  if (!user.value?.apiKey) return
  navigator.clipboard?.writeText(user.value.apiKey)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <section v-if="user" class="card">
    <h2>API Key Gateway Anda</h2>
    <p class="hint">
      Pakai key ini untuk mengirim WhatsApp dari sistem bisnismu (header <code>X-API-Key</code>).
      Jangan dibagikan ke publik.
    </p>
    <div class="keyrow">
      <code class="key">{{ user.apiKey || '— belum tersedia (menunggu persetujuan) —' }}</code>
      <button v-if="user.apiKey" type="button" @click="copy">{{ copied ? 'Tersalin ✓' : 'Salin' }}</button>
    </div>
    <p v-if="user.apiKey" class="hint">
      Contoh: <code>POST /api/sessions/&lt;id&gt;/messages/send-text</code> +
      header <code>X-API-Key: {{ user.apiKey.slice(0, 10) }}…</code>
    </p>
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

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.hint {
  margin: 0;
  font-size: 0.82rem;
  opacity: 0.7;
}
</style>
