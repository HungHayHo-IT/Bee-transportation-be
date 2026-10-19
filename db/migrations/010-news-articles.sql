-- 010 — Tin tức. Admin quản CRUD ở BeeOps, landing đọc bản đã published.
--
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/010-news-articles.sql
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS news_articles (
  id                serial PRIMARY KEY,
  -- Dùng cho URL public /news/:slug. Không đổi slug sau khi published tránh vỡ SEO.
  slug              text UNIQUE NOT NULL,
  title             text NOT NULL,
  excerpt           text,
  body              text NOT NULL DEFAULT '',
  cover_image_url   text,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
  -- Ghi tại thời điểm bấm publish, không phải khi tạo. Cho phép NULL để bài
  -- draft không lộn xộn thứ tự.
  published_at      timestamptz,
  created_by        int REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_articles_public_idx
  ON news_articles (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS news_articles_status_idx
  ON news_articles (status, updated_at DESC);

COMMIT;
