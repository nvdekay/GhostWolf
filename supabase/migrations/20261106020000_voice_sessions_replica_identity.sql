-- Realtime DELETE events need the complete previous row so room-scoped
-- subscribers can remove a departed voice participant immediately.
alter table public.voice_sessions replica identity full;
