<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useOpenWa, type AiConfig, type AiHealth } from '../lib/openwa'

const { aiConfig, setAiConfig, aiModels, aiHealth } = useOpenWa()

const cfg = ref<AiConfig | null>(null)
const health = ref<AiHealth | null>(null)
const models = ref<string[]>([])
const modelInput = ref('')
const keyInput = ref('')
const saving = ref(false)
const error = ref('')
const ok = ref('')

// Beberapa model umum sebagai saran cepat (selain daftar penuh dari OpenRouter).
const SUGGESTED = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'openai/gpt-4o-mini',
  'qwen/qwen-2.5-72b-instruct',
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-chat',
]

// Gabungan saran + daftar dari API (unik), untuk datalist.
const modelOptions = computed(() => Array.from(new Set([...SUGGESTED, ...models.value])))

async function load() {
  error.value = ''
  try {
    cfg.value = await aiConfig()
    modelInput.value = cfg.value.model
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  loadHealth()
}

async function loadHealth() {
  try {
    health.value = await aiHealth()
  } catch {
    health.value = null
  }
}

async function loadModels() {
  try {
    models.value = (await aiModels()).models
  } catch {
    models.value = []
  }
}

async function save() {
  error.value = ''
  ok.value = ''
  saving.value = true
  try {
    const body: { model?: string; apiKey?: string } = {}
    if (modelInput.value.trim()) body.model = modelInput.value.trim()
    if (keyInput.value.trim()) body.apiKey = keyInput.value.trim()
    cfg.value = await setAiConfig(body)
    keyInput.value = ''
    modelInput.value = cfg.value.model
    ok.value = 'Tersimpan ✓'
    await loadHealth()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
  loadModels()
})
</script>

<template>
  <section class="card">
    <h2>Pengaturan AI (OpenRouter)</h2>

    <p v-if="health" class="ai-status" :class="{ bad: !health.running || !health.hasModel }">
      <template v-if="health.running && health.hasModel">🤖 AI siap — model {{ health.model }}</template>
      <template v-else-if="health.running && !health.hasModel">
        ⚠️ Model {{ health.model }} tidak ditemukan di OpenRouter
      </template>
      <template v-else>⚠️ AI belum siap ({{ health.reason }})</template>
    </p>

    <form @submit.prevent="save">
      <label class="field">
        Model OpenRouter
        <input v-model="modelInput" list="ai-models" type="text" placeholder="mis. openai/gpt-4o-mini" />
        <datalist id="ai-models">
          <option v-for="m in modelOptions" :key="m" :value="m" />
        </datalist>
        <small class="hint">{{ models.length }} model tersedia dari OpenRouter</small>
      </label>

      <label class="field">
        API Key OpenRouter
        <input
          v-model="keyInput"
          type="password"
          autocomplete="off"
          :placeholder="cfg?.hasKey ? `tersimpan: ${cfg.keyMasked} (kosongkan = tetap)` : 'sk-or-...'"
        />
        <small class="hint">Kosongkan untuk mempertahankan key yang sudah ada.</small>
      </label>

      <div class="row">
        <button type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan' }}</button>
        <button type="button" class="ghost" :disabled="saving" @click="loadModels">Muat ulang model</button>
        <span v-if="ok" class="ok-text">{{ ok }}</span>
      </div>
    </form>

    <p v-if="error" class="error" role="status">{{ error }}</p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 520px;
  padding: 1.75rem;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 12px;
}

h2 {
  margin: 0;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.9rem;
}

input {
  font: inherit;
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
  white-space: nowrap;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.ghost {
  background-color: #6b7280;
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
