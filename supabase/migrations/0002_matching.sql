-- 0002 자동 매칭 실행에 맞춘 조정 (10/19)
-- Supabase SQL Editor에 통째로 붙여 넣어 실행한다. 여러 번 실행해도 안전하다.

-- 1) 한 식당의 같은 시간 수용 인원(예: 18명)에 여러 테이블(6명 × 3)을 배정할 수 있게 한다.
--    초기 스키마는 수용 인원 1건당 테이블 1개만 허용했다.
alter table dining_tables drop constraint if exists dining_tables_venue_availability_id_key;
create index if not exists dining_tables_venue_availability_idx on dining_tables (venue_availability_id);

-- 2) 테이블 번호 (예약명·단체방 이름에 쓴다: "우연한 식탁 3번 테이블")
alter table dining_tables add column if not exists table_no int;

-- 3) 매칭 실행 기록에서 이번 실행이 다룬 회차를 바로 찾을 수 있게 한다
alter table match_runs add column if not exists slot_ids uuid[] not null default '{}';
