<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useOpenWa, type MyAi } from '../lib/openwa'

const { myAi, setMyAi } = useOpenWa()

const cfg = ref<MyAi | null>(null)
const model = ref('')
const saving = ref(false)
const error = ref('')
const ok = ref('')

async function load() {
  error.value = ''
  try {
    cfg.value = await myAi()
    model.value = cfg.value.model
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function save() {
  error.value = ''
  ok.value = ''
  saving.value = true
  try {
    const r = await setMyAi(model.value)
    model.value = r.model
    if (cfg.value) cfg.value.model = r.model
    ok.value = 'Tersimpan ✓'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="card">
    <h2>Pengaturan AI</h2>

    <p v-if="cfg && !cfg.systemReady" class="ai-status bad">
      ⚠️ AI sistem belum dikonfigurasi admin.
    </p>
    <p v-else-if="cfg && cfg.model" class="ai-status">🤖 Model aktif: {{ cfg.model }}</p>
    <p v-else-if="cfg" class="ai-status bad">Belum memilih model AI.</p>

    <label class="field">
      Model AI (disediakan admin)
      <select v-model="model" :disabled="!cfg?.allowedModels.length">
        <option value="" disabled>
          {{ cfg?.allowedModels.length ? 'Pilih model…' : 'Belum ada model dari admin' }}
        </option>
        <option v-for="m in cfg?.allowedModels || []" :key="m.model" :value="m.model">
          {{ m.model }} ({{ m.provider }})
        </option>
      </select>
      <small class="hint">Hubungi admin bila model yang kamu butuhkan belum tersedia.</small>
    </label>

    <div class="row">
      <button type="button" :disabled="saving || !model" @click="save">
        {{ saving ? 'Menyimpan…' : 'Simpan' }}
      </button>
      <span v-if="ok" class="ok-text">{{ ok }}</span>
    </div>

    <p v-if="error" class="error" role="status">{{ error }}</p>
  </section>
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

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.9rem;
}

select {
  font: inherit;
  padding: 0.55rem 0.7rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
}

select:focus {
  outline: none;
  border-color: #42b883;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

button {
  padding: 0.5rem 0.9rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #42b883;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  font-weight: 400;
  opacity: 0.7;
  font-size: 0.8rem;
}

.ai-status {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  font-size: 0.85rem;
  background: rgba(16, 163, 127, 0.12);
  color: #0d8c6d;
}

.ai-status.bad {
  background: rgba(255, 193, 7, 0.18);
  color: #9a7b00;
}

.ok-text {
  color: #2c8c63;
  font-weight: 600;
  font-size: 0.9rem;
}

.error {
  margin: 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.15);
  color: #c92a3a;
  font-size: 0.9rem;
}
</style>
