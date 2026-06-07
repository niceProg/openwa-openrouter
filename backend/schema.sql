-- Skema OpenWA SaaS (Postgres). Idempotent: aman dijalankan tiap boot.

CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key          TEXT UNIQUE NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS email_otps (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'verify',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

-- Pengaturan tingkat sistem (mis. OpenRouter key/base) — dikelola admin.
CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Daftar model yang boleh dipilih user (dikurasi admin).
CREATE TABLE IF NOT EXISTS allowed_models (
  id         BIGSERIAL PRIMARY KEY,
  model      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Model AI pilihan per user (dari daftar allowed_models). Fase 3.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_model TEXT;

-- Hitung percobaan salah OTP untuk anti brute-force.
ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
