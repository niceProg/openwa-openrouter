// Base URL backend. Kosong = same-origin (dev pakai proxy Vite).
// Produksi 2-domain: set VITE_API_BASE=https://api-openwa.yum-dev.com saat build.
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
