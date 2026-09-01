-- Переписать localhost URL медиа → относительные /uploads/...
-- Запуск на VPS:
--   docker exec -i miraflores_db psql -U miraflores -d miraflores \
--     < /opt/miraflores/deploy/scripts/fix-localhost-urls.sql

BEGIN;

CREATE OR REPLACE FUNCTION miraflores_fix_dev_upload_url(u text)
RETURNS text AS $$
BEGIN
  IF u IS NULL OR btrim(u) = '' THEN
    RETURN u;
  END IF;
  RETURN regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(u,
          '^https?://127\.0\.0\.1:3001', '', 'i'),
        '^https?://localhost:3001', '', 'i'),
      '^https?://127\.0\.0\.1:8000', '', 'i'),
    '^https?://localhost:8000', '', 'i');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Программа благодарности
UPDATE "GratitudeGiftTier"
SET "imageUrl" = miraflores_fix_dev_upload_url("imageUrl")
WHERE "imageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

-- Товары / галерея
UPDATE "ProductImage" SET url = miraflores_fix_dev_upload_url(url)
WHERE url ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "Product" SET "ogImageUrl" = miraflores_fix_dev_upload_url("ogImageUrl")
WHERE "ogImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "ProductVariantShade" SET "imageUrl" = miraflores_fix_dev_upload_url("imageUrl")
WHERE "imageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

-- Главная / hero
UPDATE "HeroSlide" SET "imageUrl" = miraflores_fix_dev_upload_url("imageUrl")
WHERE "imageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "HeroSlide" SET "mobileImageUrl" = miraflores_fix_dev_upload_url("mobileImageUrl")
WHERE "mobileImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "HomepageSet" SET "imageUrl" = miraflores_fix_dev_upload_url("imageUrl")
WHERE "imageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

-- Категории / теги / коллекции
UPDATE "Category" SET "coverImageUrl" = miraflores_fix_dev_upload_url("coverImageUrl")
WHERE "coverImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "CatalogTag" SET "coverImageUrl" = miraflores_fix_dev_upload_url("coverImageUrl")
WHERE "coverImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "CatalogTagImage" SET url = miraflores_fix_dev_upload_url(url)
WHERE url ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "Collection" SET "coverImageUrl" = miraflores_fix_dev_upload_url("coverImageUrl")
WHERE "coverImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "Collection" SET "productPreviewUrl" = miraflores_fix_dev_upload_url("productPreviewUrl")
WHERE "productPreviewUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "ProductSet" SET "coverImageUrl" = miraflores_fix_dev_upload_url("coverImageUrl")
WHERE "coverImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

-- CMS / блог
UPDATE "BlogPost" SET "coverUrl" = miraflores_fix_dev_upload_url("coverUrl")
WHERE "coverUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "BlogPost" SET "ogImageUrl" = miraflores_fix_dev_upload_url("ogImageUrl")
WHERE "ogImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

-- Отзывы / квиз / SEO / staff
UPDATE "ProductReview" SET "image1Url" = miraflores_fix_dev_upload_url("image1Url")
WHERE "image1Url" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "ProductReview" SET "image2Url" = miraflores_fix_dev_upload_url("image2Url")
WHERE "image2Url" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "QuizContentEntry" SET "mediaUrl" = miraflores_fix_dev_upload_url("mediaUrl")
WHERE "mediaUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "SiteSettings" SET "defaultOgImageUrl" = miraflores_fix_dev_upload_url("defaultOgImageUrl")
WHERE "defaultOgImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "SiteSettings" SET "homeOgImageUrl" = miraflores_fix_dev_upload_url("homeOgImageUrl")
WHERE "homeOgImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

UPDATE "User" SET "staffAvatarUrl" = miraflores_fix_dev_upload_url("staffAvatarUrl")
WHERE "staffAvatarUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)';

DO $$
DECLARE leftover int;
BEGIN
  SELECT COUNT(*) INTO leftover FROM (
    SELECT "imageUrl" FROM "GratitudeGiftTier" WHERE "imageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)'
    UNION ALL SELECT url FROM "ProductImage" WHERE url ~* '(127\.0\.0\.1|localhost):(3001|8000)'
    UNION ALL SELECT "mediaUrl" FROM "QuizContentEntry" WHERE "mediaUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)'
    UNION ALL SELECT "coverImageUrl" FROM "Category" WHERE "coverImageUrl" ~* '(127\.0\.0\.1|localhost):(3001|8000)'
  ) t;
  IF leftover > 0 THEN
    RAISE WARNING 'Осталось % строк с localhost URL', leftover;
  END IF;
END $$;

DROP FUNCTION miraflores_fix_dev_upload_url(text);

COMMIT;
