<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAuth } from './lib/auth'
import AuthView from './components/AuthView.vue'
import AdminView from './components/AdminView.vue'
import ConnectionBar from './components/ConnectionBar.vue'
import SessionPanel from './components/SessionPanel.vue'
import AiSettingsPanel from './components/AiSettingsPanel.vue'
import SendMessage from './components/SendMessage.vue'
import InboxPanel from './components/InboxPanel.vue'

const { user, fetchMe, logout } = useAuth()
const sessionId = ref('')
const loadingMe = ref(true)
const view = ref<'panel' | 'admin'>('panel')

// Saat user (admin) baru ter-set — login atau reload — default ke tab Admin.
watch(user, (u, prev) => {
  if (u?.isAdmin && !prev) view.value = 'admin'
})

onMounted(async () => {
  await fetchMe()
  loadingMe.value = false
})
</script>

<template>
  <header>
    <img class="logo" src="./assets/logo.svg" alt="Vue logo" width="44" height="44" />
    <div class="brand">
      <h1>OpenWA Sender</h1>
      <p class="tagline">Kelola session WhatsApp &amp; auto-reply AI (OpenRouter)</p>
    </div>
    <div v-if="user" class="account">
      <nav v-if="user.isAdmin" class="tabs">
        <button :class="{ active: view === 'panel' }" @click="view = 'panel'">Panel</button>
        <button :class="{ active: view === 'admin' }" @click="view = 'admin'">Admin</button>
      </nav>
      <span class="email">{{ user.email }}</span>
      <span v-if="user.isAdmin" class="badge admin">ADMIN</span>
      <span v-else class="badge" :class="user.status">{{ user.status }}</span>
      <button class="logout" @click="logout">Keluar</button>
    </div>
  </header>

  <main v-if="loadingMe" class="center"><p>Memuat…</p></main>

  <AuthView v-else-if="!user" />

  <main v-else-if="user.isAdmin && view === 'admin'">
    <AdminView />
  </main>

  <main v-else>
    <ConnectionBar />
    <div class="panels">
      <div class="col">
        <SessionPanel @select="sessionId = $event" />
        <AiSettingsPanel />
      </div>
      <div class="col">
        <SendMessage v-model:session-id="sessionId" />
        <InboxPanel :session-id="sessionId" />
      </div>
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

.brand {
  min-width: 0;
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

.account {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  margin-right: 0.4rem;
}

.tabs button {
  padding: 0.35rem 0.8rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.tabs button.active {
  background: #42b883;
  color: #fff;
  border-color: transparent;
}

.email {
  font-size: 0.88rem;
  font-weight: 600;
}

.badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  text-transform: uppercase;
  background: rgba(255, 193, 7, 0.22);
  color: #9a7b00;
}

.badge.approved {
  background: rgba(66, 184, 131, 0.2);
  color: #2c8c63;
}

.badge.admin {
  background: rgba(16, 163, 127, 0.2);
  color: #0d8c6d;
}

.logout {
  padding: 0.4rem 0.8rem;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.center {
  text-align: center;
  opacity: 0.7;
}

main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panels {
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
  .panels {
    grid-template-columns: 1fr;
  }
}
</style>
