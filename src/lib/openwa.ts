import { useAuth } from './auth'
import { API_BASE } from './api'

// ---------------------------------------------------------------------------
// Fungsi murni (mudah diuji tanpa server)
// ---------------------------------------------------------------------------

/**
 * Ubah nomor lokal jadi chatId WhatsApp: 628xxx@c.us
 * - buang semua karakter non-digit
 * - awalan "0" -> "62"; "+62"/"62" tetap (setelah non-digit dibuang)
 */
export function toChatId(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  return `${digits}@c.us`
}

/**
 * Normalisasi respons OpenWA. Beberapa endpoint membungkus payload dalam
 * `{ success, data }`, sebagian mengembalikan objek mentah. Kembalikan `.data`
 * bila ada, selain itu body apa adanya.
 */
export function unwrap<T = unknown>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    return (json as { data: T }).data
  }
  return json as T
}

/**
 * Ambil data URL gambar QR dari berbagai bentuk respons yang mungkin:
 * `data.image`, `data.qr`, atau langsung `image` / `qr`.
 * Mengembalikan string kosong bila tidak ada.
 */
export function getQrImage(json: unknown): string {
  const d = unwrap<Record<string, unknown>>(json) ?? {}
  const candidate = d.image ?? d.qr ?? d.code
  return typeof candidate === 'string' ? candidate : ''
}

// ---------------------------------------------------------------------------
// Tipe
// ---------------------------------------------------------------------------

export type SessionStatus =
  | 'INITIALIZING'
  | 'SCAN_QR'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED'
  | string

export interface Session {
  id: string
  name?: string
  status: SessionStatus
  phoneNumber?: string
  aiEnabled?: boolean
}

// Konfigurasi AI per user: model pilihan + daftar model yang diizinkan admin.
export interface MyAi {
  model: string
  allowedModels: string[]
  systemReady: boolean
}

export interface InboxMessage {
  id: string
  sessionId: string
  from: string
  fromName?: string
  body: string
  type?: string
  hasMedia?: boolean
  outgoing?: boolean
  timestamp: number
}

/** Bangun URL SSE untuk inbox (auth via query karena EventSource tak bisa set header). */
export function buildEventsUrl(id: string, token: string): string {
  return `${API_BASE}/api/sessions/${encodeURIComponent(id)}/events?token=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Composable: wrapper fetch ke gateway (proxy /api), auth via JWT (Bearer).
// ---------------------------------------------------------------------------

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = useAuth()
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token.value) headers['Authorization'] = `Bearer ${token.value}`
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers })
  const text = await res.text()
  let json: unknown = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = text
  }

  if (!res.ok) {
    const detail =
      (json && typeof json === 'object' && 'message' in json
        ? String((json as Record<string, unknown>).message)
        : '') || text || res.statusText
    throw new Error(`HTTP ${res.status} — ${detail}`)
  }

  return unwrap<T>(json)
}

export function useOpenWa() {
  const { token } = useAuth()
  return {
    request,

    listSessions: () => request<Session[]>('/sessions'),
    listMessages: (id: string) =>
      request<InboxMessage[]>(`/sessions/${encodeURIComponent(id)}/messages`),
    eventsUrl: (id: string) => buildEventsUrl(id, token.value),
    createSession: (name: string) =>
      request<Session>('/sessions', { method: 'POST', body: JSON.stringify({ name }) }),
    getSession: (id: string) => request<Session>(`/sessions/${encodeURIComponent(id)}`),
    // QR butuh respons mentah agar getQrImage bisa cek beberapa bentuk field.
    getQr: (id: string) =>
      request<unknown>(`/sessions/${encodeURIComponent(id)}/qr`).then(getQrImage),
    deleteSession: (id: string) =>
      request<unknown>(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setAi: (id: string, enabled: boolean) =>
      request<{ id: string; aiEnabled: boolean }>(`/sessions/${encodeURIComponent(id)}/ai`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
    myAi: () => request<MyAi>('/me/ai'),
    setMyAi: (model: string) =>
      request<{ ok: boolean; model: string }>('/me/ai', { method: 'POST', body: JSON.stringify({ model }) }),
    sendText: (id: string, chatId: string, text: string) =>
      request<unknown>(`/sessions/${encodeURIComponent(id)}/messages/send-text`, {
        method: 'POST',
        body: JSON.stringify({ chatId, text }),
      }),
  }
}
