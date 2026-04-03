-- OC-121: Multi-language Support Migration
-- Adds translation tables and language configuration

-- Create languages table for supported languages
CREATE TABLE IF NOT EXISTS "languages" (
  "code" VARCHAR(10) PRIMARY KEY NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "native_name" VARCHAR(100) NOT NULL,
  "direction" VARCHAR(3) NOT NULL DEFAULT 'ltr',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "display_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Insert default supported languages
INSERT INTO "languages" ("code", "name", "native_name", "direction", "is_default", "display_order") VALUES
  ('en', 'English', 'English', 'ltr', true, 0),
  ('es', 'Spanish', 'Español', 'ltr', false, 1),
  ('fr', 'French', 'Français', 'ltr', false, 2),
  ('de', 'German', 'Deutsch', 'ltr', false, 3),
  ('zh-CN', 'Chinese (Simplified)', '简体中文', 'ltr', false, 4),
  ('ja', 'Japanese', '日本語', 'ltr', false, 5),
  ('ko', 'Korean', '한국어', 'ltr', false, 6),
  ('ar', 'Arabic', 'العربية', 'rtl', false, 7),
  ('he', 'Hebrew', 'עברית', 'rtl', false, 8),
  ('pt', 'Portuguese', 'Português', 'ltr', false, 9),
  ('ru', 'Russian', 'Русский', 'ltr', false, 10);

-- Create article_translations table
CREATE TABLE IF NOT EXISTS "article_translations" (
  "id" SERIAL PRIMARY KEY,
  "article_id" INTEGER NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "title" VARCHAR(500) NOT NULL,
  "content" TEXT NOT NULL,
  "excerpt" TEXT,
  "slug" VARCHAR(255) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "translator_id" INTEGER REFERENCES "editors"("id") ON DELETE SET NULL,
  "reviewer_id" INTEGER REFERENCES "editors"("id") ON DELETE SET NULL,
  "quality_score" INTEGER DEFAULT 0,
  "view_count" INTEGER DEFAULT 0,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  "published_at" TIMESTAMP
);

-- Create indexes for article_translations
CREATE INDEX IF NOT EXISTS "article_translation_article_idx" ON "article_translations"("article_id");
CREATE INDEX IF NOT EXISTS "article_translation_language_idx" ON "article_translations"("language_code");
CREATE INDEX IF NOT EXISTS "article_translation_slug_idx" ON "article_translations"("slug");
CREATE INDEX IF NOT EXISTS "article_translation_status_idx" ON "article_translations"("status");
CREATE INDEX IF NOT EXISTS "article_translation_unique_idx" ON "article_translations"("article_id", "language_code");

-- Create category_translations table
CREATE TABLE IF NOT EXISTS "category_translations" (
  "id" SERIAL PRIMARY KEY,
  "category_id" INTEGER NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "slug" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for category_translations
CREATE INDEX IF NOT EXISTS "category_translation_category_idx" ON "category_translations"("category_id");
CREATE INDEX IF NOT EXISTS "category_translation_language_idx" ON "category_translations"("language_code");
CREATE INDEX IF NOT EXISTS "category_translation_slug_idx" ON "category_translations"("slug");
CREATE INDEX IF NOT EXISTS "category_translation_unique_idx" ON "category_translations"("category_id", "language_code");

-- Create tag_translations table
CREATE TABLE IF NOT EXISTS "tag_translations" (
  "id" SERIAL PRIMARY KEY,
  "tag_id" INTEGER NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for tag_translations
CREATE INDEX IF NOT EXISTS "tag_translation_tag_idx" ON "tag_translations"("tag_id");
CREATE INDEX IF NOT EXISTS "tag_translation_language_idx" ON "tag_translations"("language_code");
CREATE INDEX IF NOT EXISTS "tag_translation_slug_idx" ON "tag_translations"("slug");
CREATE INDEX IF NOT EXISTS "tag_translation_unique_idx" ON "tag_translations"("tag_id", "language_code");

-- Create ui_translations table for interface strings
CREATE TABLE IF NOT EXISTS "ui_translations" (
  "id" SERIAL PRIMARY KEY,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "key" VARCHAR(255) NOT NULL,
  "value" TEXT NOT NULL,
  "context" VARCHAR(100),
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "translator_id" INTEGER REFERENCES "editors"("id") ON DELETE SET NULL,
  "reviewer_id" INTEGER REFERENCES "editors"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for ui_translations
CREATE INDEX IF NOT EXISTS "ui_translation_language_idx" ON "ui_translations"("language_code");
CREATE INDEX IF NOT EXISTS "ui_translation_key_idx" ON "ui_translations"("key");
CREATE INDEX IF NOT EXISTS "ui_translation_unique_idx" ON "ui_translations"("language_code", "key");

-- Create translation_analytics table
CREATE TABLE IF NOT EXISTS "translation_analytics" (
  "id" SERIAL PRIMARY KEY,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "date" TIMESTAMP NOT NULL,
  "total_translations" INTEGER DEFAULT 0,
  "published_translations" INTEGER DEFAULT 0,
  "pending_review" INTEGER DEFAULT 0,
  "avg_quality_score" INTEGER,
  "total_views" INTEGER DEFAULT 0,
  "top_translators" JSONB,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for translation_analytics
CREATE INDEX IF NOT EXISTS "translation_analytics_language_idx" ON "translation_analytics"("language_code");
CREATE INDEX IF NOT EXISTS "translation_analytics_date_idx" ON "translation_analytics"("date");
CREATE INDEX IF NOT EXISTS "translation_analytics_unique_idx" ON "translation_analytics"("language_code", "date");

-- Create user_languages table for user preferences
CREATE TABLE IF NOT EXISTS "user_languages" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "is_preferred" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for user_languages
CREATE INDEX IF NOT EXISTS "user_language_user_idx" ON "user_languages"("user_id");
CREATE INDEX IF NOT EXISTS "user_language_language_idx" ON "user_languages"("language_code");
CREATE INDEX IF NOT EXISTS "user_language_unique_idx" ON "user_languages"("user_id", "language_code");

-- Create translation_editors table for managing translation roles
CREATE TABLE IF NOT EXISTS "translation_editors" (
  "id" SERIAL PRIMARY KEY,
  "editor_id" INTEGER NOT NULL REFERENCES "editors"("id") ON DELETE CASCADE,
  "language_code" VARCHAR(10) NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL DEFAULT 'translator',
  "translations_count" INTEGER DEFAULT 0,
  "reviews_count" INTEGER DEFAULT 0,
  "avg_quality_score" INTEGER,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for translation_editors
CREATE INDEX IF NOT EXISTS "translation_editor_editor_idx" ON "translation_editors"("editor_id");
CREATE INDEX IF NOT EXISTS "translation_editor_language_idx" ON "translation_editors"("language_code");
CREATE INDEX IF NOT EXISTS "translation_editor_unique_idx" ON "translation_editors"("editor_id", "language_code");

-- Add index for article_translations published_at for sorting
CREATE INDEX IF NOT EXISTS "article_translation_published_at_idx" ON "article_translations"("published_at");
