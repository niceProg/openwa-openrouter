# AI Chat (OpenRouter)

Aplikasi chat AI ditenagai [OpenRouter](https://openrouter.ai) (API cloud
OpenAI-compatible). UI + API disajikan dari **satu server Node.js** (tanpa dependency,
tanpa framework, tanpa database). Balasan AI muncul **streaming token demi token**.

Tujuan: jadi otak AI untuk menjawab pesan WhatsApp yang masuk (lihat bagian
[Integrasi WhatsApp](#integrasi-whatsapp)).

## Prasyarat: OpenRouter API key

Daftar di [openrouter.ai](https://openrouter.ai), buat API key di
[openrouter.ai/keys](https://openrouter.ai/keys), lalu set ke environment:

```bash
export OPENROUTER_API_KEY=sk-or-...
```

> **Model:** default `meta-llama/llama-3.3-70b-instruct:free` — gratis dan lumayan
> untuk Bahasa Indonesia, tapi punya rate-limit dan kadang tidak tersedia. Untuk
> keandalan lebih, ganti `AI_MODEL` ke model murah seperti `openai/gpt-4o-mini`
> atau `qwen/qwen-2.5-72b-instruct`.

## Menjalankan (satu perintah)

```bash
cd openrouterChat
OPENROUTER_API_KEY=sk-or-... npm start
```

Lalu buka **http://localhost:8787** di browser.

Tidak ada `npm install` — nol dependency, cukup Node.js ≥ 18.

## Konfigurasi (via env)

| Env                   | Default                                  | Keterangan                       |
| --------------------- | ---------------------------------------- | -------------------------------- |
| `PORT`                | `8787`                                   | Port UI + API                    |
| `OPENROUTER_API_KEY`  | (wajib)                                  | API key dari openrouter.ai/keys  |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1`           | Base URL OpenRouter              |
| `AI_MODEL`            | `meta-llama/llama-3.3-70b-instruct:free` | Model yang dipakai               |
| `SYSTEM_PROMPT`       | (asisten WA ringkas)                     | Instruksi sistem untuk AI        |

Contoh: `OPENROUTER_API_KEY=sk-or-... AI_MODEL=openai/gpt-4o-mini PORT=9000 npm start`

## Struktur

```
openrouterChat/
├── server.js          # server Node (static + proxy streaming ke OpenRouter)
├── package.json       # tanpa dependency, script "start"
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js         # UI chat + parsing stream SSE
└── README.md
```

## API

| Method | Path           | Keterangan                                       |
| ------ | -------------- | ------------------------------------------------ |
| GET    | `/api/health`  | status OpenRouter + apakah model tersedia        |
| GET    | `/api/history` | riwayat percakapan (di memori)                   |
| POST   | `/api/reset`   | kosongkan riwayat                                |
| POST   | `/api/chat`    | `{ message }` → balasan streaming (SSE)          |

## Penanganan error

- **API key belum diset / tidak valid (401)** → banner peringatan + pesan jelas di chat.
- **Model tidak ditemukan** → "Model ... tidak ditemukan di OpenRouter. Periksa AI_MODEL".
- **Rate limit (429)** → "Coba model lain atau tunggu".
- **Koneksi terputus saat streaming** → pesan error muncul sebagai gelembung.

## Integrasi WhatsApp

Backend WA (folder `../backend`) bisa meneruskan pesan masuk ke sini lewat
`POST /api/chat`, lalu mengirim balasannya kembali via `send-text`. Endpoint chat
sudah siap dipakai program; integrasi otomatis bisa ditambahkan berikutnya.
