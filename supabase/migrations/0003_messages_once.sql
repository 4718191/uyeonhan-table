-- 리마인드·대화 콘텐츠는 단체방마다 한 번만 (여러 경로에서 동시에 게시해도 중복 방지, PRD 7.3)
create unique index if not exists chat_messages_once_per_room
  on chat_messages (room_id, kind) where kind in ('REMINDER', 'CONTENT');
