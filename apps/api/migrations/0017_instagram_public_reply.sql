-- Instagram 댓글 공개 답글(대댓글) 지원
ALTER TABLE instagram_dm_rules
  ADD COLUMN IF NOT EXISTS reply_message TEXT NULL;

ALTER TABLE instagram_dm_deliveries
  ADD COLUMN IF NOT EXISTS reply_comment_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS reply_status TEXT NOT NULL DEFAULT 'skipped';
