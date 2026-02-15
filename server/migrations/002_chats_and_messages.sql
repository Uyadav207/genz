-- ============================================================
-- GenZ: chats and messages (conversations) per user
-- Run after 001_profiles.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Chats: one per conversation, owned by user
CREATE TABLE IF NOT EXISTS public.chats (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT 'New chat',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id    ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at  ON public.chats(updated_at DESC);

-- 2. Messages: user and assistant messages per chat
CREATE TABLE IF NOT EXISTS public.messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id    UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id    ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(chat_id, created_at);

-- 3. Function + trigger to update chats.updated_at when messages are added
CREATE OR REPLACE FUNCTION public.handle_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chats SET updated_at = now() WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_chat_updated_at();

-- 4. RLS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Chats: users see only their own
DROP POLICY IF EXISTS "Users can view own chats" ON public.chats;
CREATE POLICY "Users can view own chats"
    ON public.chats FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chats" ON public.chats;
CREATE POLICY "Users can insert own chats"
    ON public.chats FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;
CREATE POLICY "Users can update own chats"
    ON public.chats FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own chats" ON public.chats;
CREATE POLICY "Users can delete own chats"
    ON public.chats FOR DELETE
    USING (auth.uid() = user_id);

-- Messages: users can only access messages for their own chats
DROP POLICY IF EXISTS "Users can view messages of own chats" ON public.messages;
CREATE POLICY "Users can view messages of own chats"
    ON public.messages FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.chats WHERE id = chat_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert messages in own chats" ON public.messages;
CREATE POLICY "Users can insert messages in own chats"
    ON public.messages FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.chats WHERE id = chat_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update messages in own chats" ON public.messages;
CREATE POLICY "Users can update messages in own chats"
    ON public.messages FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.chats WHERE id = chat_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete messages in own chats" ON public.messages;
CREATE POLICY "Users can delete messages in own chats"
    ON public.messages FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.chats WHERE id = chat_id AND user_id = auth.uid())
    );
