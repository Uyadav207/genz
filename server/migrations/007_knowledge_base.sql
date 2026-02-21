-- ============================================================
-- GenZ: Knowledge Base — pgvector-powered RAG for custom agents
-- Run after 006_chats_agent_id.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Knowledge base documents (one row per uploaded file)
CREATE TABLE IF NOT EXISTS public.agent_knowledge_docs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    file_path   TEXT,                       -- Supabase Storage path (nullable for text-only)
    file_size   BIGINT DEFAULT 0,
    file_hash   TEXT,                       -- SHA-256 for dedup
    chunk_count INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'processing',  -- 'processing', 'ready', 'failed'
    error_msg   TEXT,                       -- error detail if status = 'failed'
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_docs_agent_id ON public.agent_knowledge_docs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_docs_user_id ON public.agent_knowledge_docs(user_id);

-- 3. Knowledge base chunks (one row per text chunk with its embedding)
CREATE TABLE IF NOT EXISTS public.agent_knowledge_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id      UUID NOT NULL REFERENCES public.agent_knowledge_docs(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL,               -- denormalized for fast filtered search
    chunk_index INTEGER NOT NULL,            -- order within the document
    content     TEXT NOT NULL,
    page_num    INTEGER,                     -- approximate source page (nullable)
    embedding   vector(768),                 -- text-embedding-004 outputs 768 dimensions
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_chunks_agent_id ON public.agent_knowledge_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_chunks_doc_id ON public.agent_knowledge_chunks(doc_id);

-- IVFFlat index for fast similarity search
-- Note: requires at least 100 rows to be effective; for small datasets, exact search is used
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_chunks_embedding
    ON public.agent_knowledge_chunks
    USING hnsw (embedding vector_cosine_ops);

-- 4. RLS for agent_knowledge_docs
ALTER TABLE public.agent_knowledge_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own knowledge docs" ON public.agent_knowledge_docs;
CREATE POLICY "Users can view own knowledge docs"
    ON public.agent_knowledge_docs FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own knowledge docs" ON public.agent_knowledge_docs;
CREATE POLICY "Users can insert own knowledge docs"
    ON public.agent_knowledge_docs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own knowledge docs" ON public.agent_knowledge_docs;
CREATE POLICY "Users can update own knowledge docs"
    ON public.agent_knowledge_docs FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own knowledge docs" ON public.agent_knowledge_docs;
CREATE POLICY "Users can delete own knowledge docs"
    ON public.agent_knowledge_docs FOR DELETE
    USING (auth.uid() = user_id);

-- 5. RLS for agent_knowledge_chunks
ALTER TABLE public.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view knowledge chunks of own agents" ON public.agent_knowledge_chunks;
CREATE POLICY "Users can view knowledge chunks of own agents"
    ON public.agent_knowledge_chunks FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert knowledge chunks for own agents" ON public.agent_knowledge_chunks;
CREATE POLICY "Users can insert knowledge chunks for own agents"
    ON public.agent_knowledge_chunks FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete knowledge chunks of own agents" ON public.agent_knowledge_chunks;
CREATE POLICY "Users can delete knowledge chunks of own agents"
    ON public.agent_knowledge_chunks FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND user_id = auth.uid())
    );

-- 6. RPC function for vector similarity search
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
    p_agent_id UUID,
    p_query_vec vector(768),
    p_top_k INTEGER DEFAULT 5,
    p_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    content TEXT,
    file_name TEXT,
    chunk_index INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.content,
        d.file_name,
        c.chunk_index,
        1 - (c.embedding <=> p_query_vec) AS similarity
    FROM public.agent_knowledge_chunks c
    JOIN public.agent_knowledge_docs d ON d.id = c.doc_id
    WHERE c.agent_id = p_agent_id
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> p_query_vec) >= p_threshold
    ORDER BY c.embedding <=> p_query_vec
    LIMIT p_top_k;
END;
$$;

-- 7. Storage bucket for knowledge docs (create manually in Supabase Dashboard if needed)
--    - Name: agent-knowledge
--    - Public: false
--    - Or via SQL: INSERT INTO storage.buckets (id, name, public) VALUES ('agent-knowledge', 'agent-knowledge', false) ON CONFLICT DO NOTHING;
