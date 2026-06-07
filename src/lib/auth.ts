import { ref } from 'vue'

export interface AuthUser {
  id: string
  email: string
  status: string
  isAdmin: boolean
  emailVerified: boolean
}

// Token & user dibagikan lintas komponen + persist ke localStorage.
const token = ref<string>(localStorage.getItem('owa.token') ?? '')
const user = ref<AuthUser | null>(null)

async function authRequest<T = unknown>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token.value) headers['Authorization'] = `Bearer ${token.value}`

  const res = await fetch(`/api/auth${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = text
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as Record<string, unknown>).message)
        : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as T
}

export function useAuth() {
  function setToken(t: string) {
    token.value = t
    if (t) localStorage.setItem('owa.token', t)
    else localStorage.removeItem('owa.token')
  }

  return {
    token,
    user,
    register: (email: string, password: string) =>
      authRequest<{ ok: boolean; message: string }>('/register', { email, password }),
    verifyOtp: (email: string, code: string) =>
      authRequest<{ ok: boolean; message: string }>('/verify-otp', { email, code }),
    resendOtp: (email: string) =>
      authRequest<{ ok: boolean; message: string }>('/resend-otp', { email }),
    async login(email: string, password: string) {
      const r = await authRequest<{ token: string; user: AuthUser }>('/login', { email, password })
      setToken(r.token)
      user.value = r.user
      return r
    },
    async fetchMe() {
      if (!token.value) {
        user.value = null
        return null
      }
      try {
        const r = await authRequest<{ user: AuthUser }>('/me')
        user.value = r.user
        return r.user
      } catch {
        setToken('')
        user.value = null
        return null
      }
    },
    logout() {
      setToken('')
      user.value = null
    },
  }
}
