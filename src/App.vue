<script setup lang="ts">
import { ref } from 'vue'
import SessionPanel from './components/SessionPanel.vue'
import AiSettingsPanel from './components/AiSettingsPanel.vue'
import SendMessage from './components/SendMessage.vue'
import InboxPanel from './components/InboxPanel.vue'

const sessionId = ref('')
</script>

<template>
  <header>
    <img class="logo" src="./assets/logo.svg" alt="Vue logo" width="44" height="44" />
    <div>
      <h1>OpenWA Sender</h1>
      <p class="tagline">Kelola session WhatsApp &amp; auto-reply AI (OpenRouter)</p>
    </div>
  </header>

  <main>
    <div class="col">
      <SessionPanel @select="sessionId = $event" />
      <SendMessage v-model:session-id="sessionId" />
    </div>
    <div class="col">
      <AiSettingsPanel />
      <InboxPanel :session-id="sessionId" />
    </div>
  </main>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.logo {
  flex-shrink: 0;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.1;
}

.tagline {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  opacity: 0.65;
}

/* Dua kolom independen: tiap kolom menumpuk kartunya sendiri,
   jadi tinggi kartu tetangga tidak saling mengunci (tidak ada celah ragged). */
main {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

@media (max-width: 860px) {
  main {
    grid-template-columns: 1fr;
  }
}
</style>
