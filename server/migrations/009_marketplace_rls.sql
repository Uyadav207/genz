-- ============================================================
-- GenZ: Marketplace RLS policies
-- Run after 008_marketplace_listings.sql. Safe to re-run.
-- ============================================================

-- Listings: anyone can read active; only owner can insert/update/delete
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active listings" ON public.marketplace_listings;
CREATE POLICY "Anyone can view active listings"
    ON public.marketplace_listings FOR SELECT
    USING (status = 'active' OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own listings" ON public.marketplace_listings;
CREATE POLICY "Users can insert own listings"
    ON public.marketplace_listings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own listings" ON public.marketplace_listings;
CREATE POLICY "Users can update own listings"
    ON public.marketplace_listings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own listings" ON public.marketplace_listings;
CREATE POLICY "Users can delete own listings"
    ON public.marketplace_listings FOR DELETE
    USING (auth.uid() = user_id);

-- Downloads: users see only their own rows; insert via backend (service role)
ALTER TABLE public.marketplace_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own downloads" ON public.marketplace_downloads;
CREATE POLICY "Users can view own downloads"
    ON public.marketplace_downloads FOR SELECT
    USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for marketplace_downloads: only backend (service role) can write.
-- Clients only read their own rows via SELECT policy above.
