-- ============================================================
-- GenZ: optional rich data on messages (web search sources, places, images)
-- Run after 002_chats_and_messages.sql. Safe to re-run (idempotent).
-- ============================================================

-- Add extra JSONB for sources/places/images (and future attachments).
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT NULL;

COMMENT ON COLUMN public.messages.extra IS 'Optional payload: { "sources": [], "places": [], "images": [] } for web search / research messages';
