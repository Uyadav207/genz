-- ============================================================
-- GenZ: agents (custom agents) and agent_skills
-- Run after 004_chat_attachments.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Agents: custom agents only (built-ins stay in code)
CREATE TABLE IF NOT EXISTS public.agents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    instruction TEXT DEFAULT '',
    icon_name   TEXT DEFAULT 'bot',
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);

-- 2. Agent skills: enabled skills per custom agent
CREATE TABLE IF NOT EXISTS public.agent_skills (
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL,
    PRIMARY KEY (agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent_id ON public.agent_skills(agent_id);

-- 3. RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agents" ON public.agents;
CREATE POLICY "Users can view own agents"
    ON public.agents FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own agents" ON public.agents;
CREATE POLICY "Users can insert own agents"
    ON public.agents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own agents" ON public.agents;
CREATE POLICY "Users can update own agents"
    ON public.agents FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own agents" ON public.agents;
CREATE POLICY "Users can delete own agents"
    ON public.agents FOR DELETE
    USING (auth.uid() = user_id);

-- Agent skills: users can only access skills for agents they own
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view agent_skills of own agents" ON public.agent_skills;
CREATE POLICY "Users can view agent_skills of own agents"
    ON public.agent_skills FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert agent_skills for own agents" ON public.agent_skills;
CREATE POLICY "Users can insert agent_skills for own agents"
    ON public.agent_skills FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete agent_skills of own agents" ON public.agent_skills;
CREATE POLICY "Users can delete agent_skills of own agents"
    ON public.agent_skills FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND user_id = auth.uid())
    );
