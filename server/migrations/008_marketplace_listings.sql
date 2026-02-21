-- ============================================================
-- GenZ: Marketplace — listings and downloads
-- Run after 007_knowledge_base.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Listings
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    summary         TEXT DEFAULT '',
    category        TEXT DEFAULT '',
    price_cents     INTEGER DEFAULT 0 NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    featured        BOOLEAN DEFAULT false NOT NULL,
    cover_image_url TEXT,
    download_count  INTEGER DEFAULT 0 NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_user_id    ON public.marketplace_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_agent_id   ON public.marketplace_listings(agent_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status     ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category   ON public.marketplace_listings(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_created_at ON public.marketplace_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_download_count ON public.marketplace_listings(download_count DESC);

-- One active listing per agent (optional; uncomment if desired)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_listings_one_active_per_agent
--     ON public.marketplace_listings(agent_id) WHERE (status = 'active');

-- 2. Downloads (who downloaded which listing)
CREATE TABLE IF NOT EXISTS public.marketplace_downloads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_listing_id ON public.marketplace_downloads(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_user_id    ON public.marketplace_downloads(user_id);

-- 3. updated_at trigger for marketplace_listings
DROP TRIGGER IF EXISTS on_marketplace_listing_updated ON public.marketplace_listings;
CREATE TRIGGER on_marketplace_listing_updated
    BEFORE UPDATE ON public.marketplace_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
