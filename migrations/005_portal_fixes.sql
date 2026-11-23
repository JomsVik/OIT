ALTER TABLE tickets ADD COLUMN completion_details TEXT NOT NULL DEFAULT '';
ALTER TABLE ticket_comments ADD COLUMN is_completion INTEGER NOT NULL DEFAULT 0 CHECK(is_completion IN (0,1));
-- The previous client posted completion text immediately before closing a ticket.
UPDATE ticket_comments SET is_completion=1, is_public=0 WHERE id IN (
 SELECT (SELECT c.id FROM ticket_comments c JOIN admins a ON a.id=c.admin_id
         WHERE c.ticket_id=t.id AND a.full_name=t.executor_name
           AND (julianday(t.completed_at)-julianday(c.created_at))*86400 BETWEEN 0 AND 10
         ORDER BY c.id DESC LIMIT 1)
 FROM tickets t WHERE t.status=1 AND t.completed_at IS NOT NULL
);
UPDATE tickets SET completion_details=coalesce((SELECT c.comment_text FROM ticket_comments c
 WHERE c.ticket_id=tickets.id AND c.is_completion=1 ORDER BY c.id DESC LIMIT 1),'');
ALTER TABLE cartridges ADD COLUMN archived_at TEXT;
CREATE TABLE inventory_monitors (
 id INTEGER PRIMARY KEY, inventory_number TEXT NOT NULL UNIQUE, manufacturer TEXT,
 model TEXT, serial_number TEXT, diagonal TEXT, resolution TEXT, connection_type TEXT,
 responsible TEXT, location TEXT, comment TEXT
);
