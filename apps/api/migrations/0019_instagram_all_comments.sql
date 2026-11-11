SET LOCAL lock_timeout = '5s';
-- 0280: 모든 댓글 모드와 같은 사람·같은 canonical 게시물 최초 발송 기회 1회.
-- 추가 열·표는 앱 revert 뒤에도 남깁니다. 기존 delivery의 90일 보존은 바꾸지 않습니다.
ALTER TABLE instagram_dm_rules ADD COLUMN match_all_comments boolean NOT NULL DEFAULT false;
ALTER TABLE instagram_dm_rules DROP CONSTRAINT instagram_dm_rules_keyword_check;
ALTER TABLE instagram_dm_rules ADD CONSTRAINT instagram_dm_rules_keyword_check
  CHECK (char_length(keyword) <= 30 AND (match_all_comments OR char_length(keyword) >= 1));

-- 연결·규칙 FK 없음: 해제·재연결·보관/재생성·90일 보존 작업에서도 유지합니다.
-- 원문 없이 계정·규칙의 canonical ig_media_id·HMAC만 저장. Meta 삭제 콜백에서 같은 txn으로 파기합니다.
CREATE TABLE instagram_dm_recipients (
  ig_user_id text NOT NULL,
  scope_key text NOT NULL,
  commenter_hash bytea NOT NULL CHECK (octet_length(commenter_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ig_user_id, scope_key, commenter_hash)
);

INSERT INTO instagram_dm_recipients (ig_user_id, scope_key, commenter_hash, created_at)
SELECT c.ig_user_id, r.ig_media_id, d.commenter_hash, min(d.created_at)
FROM instagram_dm_deliveries d
JOIN instagram_dm_rules r ON r.id = d.rule_id AND r.connection_id = d.connection_id
JOIN instagram_connections c ON c.id = d.connection_id
WHERE d.status IN ('pending', 'sending', 'sent', 'unknown')
GROUP BY c.ig_user_id, r.ig_media_id, d.commenter_hash
ORDER BY c.ig_user_id, r.ig_media_id, d.commenter_hash
ON CONFLICT DO NOTHING;
