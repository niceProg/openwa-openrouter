import { ref } from 'vue'
import { useAuth } from './auth'

export interface AdminUser {
  id: string
  email: string
  email_verified: boolean
  status: string
  is_admin: boolean
  created_at: string
  api_key: string | null
}

export interface SystemSettings {
  openrouterBaseUrl: string
  hasOpenrouterKey: boolean
  openrouterKeyMasked: string
  allowedModels: string[]
}

// adminToken (hasil unlock passphrase) — sessionStorage agar hilang saat tab ditutup.
const adminToken = ref<string>(sessionStorage.getItem('owa.adminToken') ?? '')

function setAdminToken(t: string) {
  adminToken.value = t
  if (t) sessionStorage.setItem('owa.adminToken', t)
  else sessionStorage.removeItem('owa.adminToken')
}

async function adminRequest<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { token } = useAuth()
  const headers: Record<string, string> = { Authorization: `Bearer ${token.value}` }
  if (adminToken.value) headers['X-Admin-Token'] = adminToken.value
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`/api/admin${path}`, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = text
  }
  if (!res.ok) {
    // Token admin kedaluwarsa → reset agar UI minta unlock lagi.
    if (res.status === 401 && path !== '/unlock') setAdminToken('')
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as Record<string, unknown>).message)
        : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as T
}

export function useAdmin() {
  return {
    adminToken,
    isUnlocked: () => !!adminToken.value,
    setAdminToken,
    async unlock(passphrase: string) {
      const r = await adminRequest<{ adminToken: string }>('/unlock', { body: { passphrase } })
      setAdminToken(r.adminToken)
      return r
    },
    listUsers: () => adminRequest<{ users: AdminUser[] }>('/users'),
    approve: (id: string) => adminRequest<{ apiKey: string }>(`/users/${id}/approve`, { body: {} }),
    reject: (id: string) => adminRequest(`/users/${id}/reject`, { body: {} }),
    regenerateKey: (id: string) =>
      adminRequest<{ apiKey: string }>(`/users/${id}/api-key/regenerate`, { body: {} }),
    revokeKey: (id: string) => adminRequest(`/users/${id}/api-key/revoke`, { body: {} }),
    getSettings: () => adminRequest<SystemSettings>('/settings'),
    saveSettings: (b: { openrouterApiKey?: string; openrouterBaseUrl?: string }) =>
      adminRequest('/settings', { body: b }),
    addModel: (model: string) =>
      adminRequest<{ allowedModels: string[] }>('/models', { body: { model } }),
    removeModel: (model: string) =>
      adminRequest<{ allowedModels: string[] }>('/models', { method: 'DELETE', body: { model } }),
    openrouterModels: () => adminRequest<{ models: string[] }>('/openrouter-models'),
  }
}
