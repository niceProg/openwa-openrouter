<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOpenWa } from '../lib/openwa'

// Satu-satunya tempat memasukkan API Key gateway (X-API-Key) untuk seluruh app.
const { apiKey, setApiKey } = useOpenWa()
const show = ref(false)
const connected = computed(() => apiKey.value.trim().length > 0)
</script>

<template>
  <section class="card setup">
    <div class="setup-row">
      <div class="head">
        <h2>Koneksi Gateway</h2>
        <span class="pill" :class="connected ? 'ok' : 'warn'">
          {{ connected ? '● Terhubung' : '○ Belum ada API Key' }}
        </span>
      </div>

      <label class="key">
        API Key Gateway
        <div class="key-input">
          <input
            :value="apiKey"
            :type="show ? 'text' : 'password'"
            placeholder="X-API-Key gateway"
            autocomplete="off"
            @input="setApiKey(($event.target as HTMLInputElement).value)"
          />
          <button type="button" class="ghost" @click="show = !show">
            {{ show ? 'Sembunyikan' : 'Tampilkan' }}
          </button>
        </div>
      </label>
    </div>

    <p class="hint">Masukkan API Key gateway sekali; dipakai untuk semua aksi di bawah.</p>
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

.setup-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

h2 {
  margin: 0;
  font-size: 1.15rem;
}

.pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  white-space: nowrap;
}

.pill.ok {
  background: rgba(66, 184, 131, 0.2);
  color: #2c8c63;
}

.pill.warn {
  background: rgba(255, 193, 7, 0.22);
  color: #9a7b00;
}

.key {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.9rem;
  flex: 1;
  min-width: 280px;
}

.key-input {
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

button.ghost {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.hint {
  margin: 0;
  font-size: 0.82rem;
  opacity: 0.65;
}

@media (max-width: 520px) {
  .setup-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
