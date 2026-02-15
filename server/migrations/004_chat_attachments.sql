-- ============================================================
-- GenZ: chat_attachments — PDF/document uploads linked to chats
-- Run after 003_messages_extra.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Chat attachments: stores uploaded PDFs linked to a chat (chat_id nullable for upload-before-send)
CREATE TABLE IF NOT EXISTS public.chat_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id       UUID REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name     TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    file_size     BIGINT,
    extracted_text TEXT,
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_chat_id ON public.chat_attachments(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_user_id ON public.chat_attachments(user_id);

-- 2. RLS
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chat attachments" ON public.chat_attachments;
CREATE POLICY "Users can view own chat attachments"
    ON public.chat_attachments FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chat attachments" ON public.chat_attachments;
CREATE POLICY "Users can insert own chat attachments"
    ON public.chat_attachments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own chat attachments" ON public.chat_attachments;
CREATE POLICY "Users can delete own chat attachments"
    ON public.chat_attachments FOR DELETE
    USING (auth.uid() = user_id);

-- 3. Storage bucket: Create in Supabase Dashboard (Storage > New bucket)
--    - Name: chat-pdfs
--    - Public: optional (service role can access either way)
--    - Or via SQL: INSERT INTO storage.buckets (id, name, public) VALUES ('chat-pdfs', 'chat-pdfs', false);
