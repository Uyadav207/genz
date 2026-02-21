-- ============================================================
-- GenZ: add agent_id to chats
-- Run after 005_agents_and_agent_skills.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Add agent_id column (NULL = legacy; UUID = custom agent; string = built-in id like 'genz', 'web')
ALTER TABLE public.chats
    ADD COLUMN IF NOT EXISTS agent_id TEXT DEFAULT 'genz';

-- 2. Backfill existing chats to genz
UPDATE public.chats SET agent_id = 'genz' WHERE agent_id IS NULL;

-- 3. Index for list-by-agent
CREATE INDEX IF NOT EXISTS idx_chats_user_agent ON public.chats(user_id, agent_id);
