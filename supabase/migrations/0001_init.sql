-- 우연한 식탁 초기 스키마
-- 근거: 시스템_설계.md 4장, PRD 12장(상태값)·13장(데이터 항목)
-- Supabase SQL Editor에 통째로 붙여 넣어 실행한다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 상태값 (PRD 12장: 신청·결제·매칭·참석 상태를 분리해 저장)
-- ---------------------------------------------------------------
create type application_status as enum ('DRAFT', 'SUBMITTED', 'CANCELED');
create type payment_status as enum (
  'PENDING', 'PAID', 'FAILED', 'REFUND_AVAILABLE',
  'REFUND_REQUESTED', 'REFUND_PROCESSING', 'REFUNDED', 'REFUND_FAILED'
);
create type match_status as enum (
  'WAITING', 'MATCHING', 'REALLOCATING', 'CONFIRMED',
  'ALTERNATIVE_OFFERED', 'TRANSFERRED', 'NO_MATCH', 'EXCEPTION'
);
create type attendance_status as enum (
  'SCHEDULED', 'ATTENDED', 'CANCELED_EARLY', 'CANCELED_LATE', 'NO_SHOW'
);
create type pass_type as enum ('SINGLE', 'MEMBERSHIP_1M', 'MEMBERSHIP_3M', 'MEMBERSHIP_6M');

-- 운영 지역: 서울 4개 (MVP 6장)
create domain region_code as text
  check (value in ('hongdae', 'jamsil', 'gangnam', 'euljiro'));

-- ---------------------------------------------------------------
-- 사용자·프로필
-- ---------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  phone text,
  birth_year int check (birth_year between 1940 and 2010),
  gender text check (gender in ('F', 'M')),
  job text,
  mbti text check (mbti ~ '^[EI][NS][TF][JP]$'),
  interests text[] not null default '{}',
  self_traits text[] not null default '{}',
  wanted_traits text[] not null default '{}',
  price_ranges text[] not null default '{}',
  food_restrictions text,
  consented_at timestamptz,
  role text not null default 'participant' check (role in ('participant', 'admin')),
  restriction_level int not null default 0 check (restriction_level between 0 and 3), -- 0 없음 1 경고 2 기간 제한 3 영구 제한
  restricted_until timestamptz,
  notify_other_region text, -- 다른 지역 오픈 알림 (2단계 선택 기능)
  seed_key text unique,     -- 가상 데이터 출처 (xlsx 행 번호)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 회차·신청
-- ---------------------------------------------------------------
create table event_slots (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  start_time time not null,
  region region_code not null,
  capacity int not null check (capacity > 0),
  apply_deadline timestamptz not null, -- 행사 직전 화요일 24:00 (KST)
  match_at timestamptz not null,       -- 자동 매칭 실행 시각 (기본: apply_deadline과 같음)
  status text not null default 'OPEN' check (status in ('OPEN', 'MATCHING', 'MATCHED', 'CLOSED')),
  created_at timestamptz not null default now(),
  unique (event_date, start_time, region)
);
create index on event_slots (match_at);

create table passes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  type pass_type not null,
  price int not null,
  valid_until date,                -- 멤버십 만료일
  extension_weeks int not null default 0, -- 매칭 실패로 늘어난 주 수
  stored boolean not null default false,  -- 1회권 보관
  created_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  pass_id uuid references passes (id),
  application_status application_status not null default 'DRAFT',
  payment_status payment_status not null default 'PENDING',
  match_status match_status not null default 'WAITING',
  attendance_status attendance_status,
  reallocation_count int not null default 0,
  placement_reason text,
  confirmed_slot_id uuid references event_slots (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on applications (match_status, payment_status);

-- 참가자가 고른 날짜×지역 조합 (회차 후보)
create table application_slots (
  application_id uuid not null references applications (id) on delete cascade,
  slot_id uuid not null references event_slots (id) on delete cascade,
  primary key (application_id, slot_id)
);

-- ---------------------------------------------------------------
-- 결제 (모의)
-- ---------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references applications (id) on delete cascade,
  amount int not null,
  status payment_status not null default 'PENDING',
  refunded_amount int,
  refunded_at timestamptz,
  idempotency_key text unique, -- 중복 승인·중복 환불 방지 (PRD 7.3)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 매칭
-- ---------------------------------------------------------------
create table matching_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'GLOBAL' check (scope in ('GLOBAL', 'SLOT')),
  slot_id uuid references event_slots (id) on delete cascade,
  w_age int not null default 25,
  w_gender int not null default 22,
  w_mbti int not null default 18,
  w_interest int not null default 15,
  w_wanted int not null default 10,
  w_new_people int not null default 10,
  min_score int not null default 55,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);
create unique index matching_settings_global on matching_settings (scope) where scope = 'GLOBAL';

create table match_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique, -- 같은 실행 묶음은 한 번만 (PRD 7.3)
  match_at timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  candidate_count int,
  created_count int,
  split_merge_count int,
  reallocated_count int,
  confirmed_count int,
  failed_count int,
  failure_summary jsonb,
  algorithm_version text not null,
  settings_snapshot jsonb not null,
  triggered_by text not null check (triggered_by in ('CRON', 'ADMIN'))
);

-- ---------------------------------------------------------------
-- 식당
-- ---------------------------------------------------------------
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region region_code not null,
  address text,
  map_url text,
  price_range text,
  rating numeric(2, 1),
  created_at timestamptz not null default now()
);

create table venue_availability (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  slot_date date not null,
  start_time time not null,
  capacity int not null,
  reservation_status text not null default 'AVAILABLE'
    check (reservation_status in ('AVAILABLE', 'RESERVED', 'CLOSED'))
);

create table dining_tables (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid references match_runs (id),
  slot_id uuid not null references event_slots (id),
  size int not null check (size between 1 and 6),
  scores jsonb,
  total_score numeric(5, 2),
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'DISSOLVED', 'EXCEPTION')),
  confirmed_at timestamptz,
  venue_availability_id uuid unique references venue_availability (id),
  reallocation_log jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table table_members (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references dining_tables (id) on delete cascade,
  application_id uuid not null references applications (id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
-- 한 신청은 동시에 한 테이블에만 (PRD 7.4)
create unique index table_members_one_active on table_members (application_id) where active;

-- ---------------------------------------------------------------
-- 채팅·알림
-- ---------------------------------------------------------------
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null unique references dining_tables (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms (id) on delete cascade,
  sender_profile_id uuid references profiles (id),
  kind text not null check (kind in ('NOTICE', 'REMINDER', 'CONTENT', 'USER')),
  body text not null,
  delivery_status text not null default 'SENT' check (delivery_status in ('SCHEDULED', 'SENT', 'FAILED')),
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  template_key text not null,
  title text not null,
  body text not null,
  link text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  delivery_status text not null default 'SCHEDULED' check (delivery_status in ('SCHEDULED', 'SENT', 'FAILED')),
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on notifications (profile_id, created_at desc);

-- ---------------------------------------------------------------
-- 매칭 실패 해결·예외
-- ---------------------------------------------------------------
create table match_resolutions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references applications (id) on delete cascade,
  recommended_slot_ids uuid[] not null default '{}',
  choice text check (choice in ('TRANSFER', 'STORE', 'REFUND', 'EXTEND')),
  status text not null default 'PENDING' check (status in ('PENDING', 'DONE')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table exception_cases (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'PAYMENT_ERROR', 'DATA_MISSING', 'CONDITION_CONFLICT',
    'VENUE_SHORTAGE', 'DELIVERY_FAILED', 'REFUND_FAILED'
  )),
  application_id uuid references applications (id),
  table_id uuid references dining_tables (id),
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  action_note text,
  resolved_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------
-- 피드백·안전
-- ---------------------------------------------------------------
create table feedbacks (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references dining_tables (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  mood int check (mood between 1 and 5),
  conversation int check (conversation between 1 and 5),
  venue int check (venue between 1 and 5),
  rejoin_intent int check (rejoin_intent between 1 and 5),
  recommend_intent int check (recommend_intent between 1 and 5),
  created_at timestamptz not null default now(),
  unique (table_id, profile_id)
);

-- 사람별 선호: 상대에게 공개하지 않는다 (FDB-04)
create table person_preferences (
  id uuid primary key default gen_random_uuid(),
  from_profile uuid not null references profiles (id) on delete cascade,
  to_profile uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('WANT_AGAIN', 'AVOID')),
  table_id uuid references dining_tables (id),
  created_at timestamptz not null default now(),
  unique (from_profile, to_profile, kind),
  check (from_profile <> to_profile)
);

create table user_blocks (
  blocker uuid not null references profiles (id) on delete cascade,
  blocked uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references profiles (id),
  reported uuid not null references profiles (id),
  table_id uuid references dining_tables (id),
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'REVIEWED')),
  action text check (action in ('NONE', 'WARNING', 'SUSPEND', 'BAN')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- ---------------------------------------------------------------
-- 상태 변경 이력 (PRD 16장)
-- ---------------------------------------------------------------
create table status_history (
  id bigserial primary key,
  entity text not null,
  entity_id uuid not null,
  field text not null,
  from_value text,
  to_value text,
  actor text not null check (actor in ('SYSTEM', 'ADMIN', 'PARTICIPANT')),
  actor_profile_id uuid references profiles (id),
  reason text,
  created_at timestamptz not null default now()
);
create index on status_history (entity, entity_id);

-- applications의 updated_at 자동 갱신
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger applications_touch before update on applications
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------
-- 권한 (RLS)
-- 참가자는 자기 행만, 운영자는 전체. 매칭·환불 같은 시스템 작업은 서버의 service role로 실행(RLS 우회).
-- ---------------------------------------------------------------
create function my_profile_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

create function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin')
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'event_slots', 'passes', 'applications', 'application_slots', 'payments',
    'matching_settings', 'match_runs', 'venues', 'venue_availability', 'dining_tables',
    'table_members', 'chat_rooms', 'chat_messages', 'notifications', 'match_resolutions',
    'exception_cases', 'feedbacks', 'person_preferences', 'user_blocks', 'safety_reports',
    'status_history'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- 본인 프로필
create policy own_select on profiles for select using (user_id = auth.uid());
create policy own_insert on profiles for insert with check (user_id = auth.uid() and role = 'participant');
create policy own_update on profiles for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = 'participant');

-- 누구나 읽는 공개 정보
create policy read_slots on event_slots for select using (auth.role() = 'authenticated');
create policy read_venues on venues for select using (auth.role() = 'authenticated');

-- 본인 소유 데이터
create policy own_rows on passes for select using (profile_id = my_profile_id());
create policy own_rows on applications for select using (profile_id = my_profile_id());
create policy own_rows on application_slots for select
  using (application_id in (select id from applications where profile_id = my_profile_id()));
create policy own_rows on payments for select
  using (application_id in (select id from applications where profile_id = my_profile_id()));
create policy own_rows on match_resolutions for select
  using (application_id in (select id from applications where profile_id = my_profile_id()));
create policy own_rows on notifications for select using (profile_id = my_profile_id());
create policy own_read_mark on notifications for update using (profile_id = my_profile_id());

-- 내가 속한 테이블과 단체방
create policy member_tables on dining_tables for select using (
  id in (select tm.table_id from table_members tm join applications a on a.id = tm.application_id
         where a.profile_id = my_profile_id() and tm.active)
);
create policy member_rooms on chat_rooms for select using (
  table_id in (select tm.table_id from table_members tm join applications a on a.id = tm.application_id
               where a.profile_id = my_profile_id() and tm.active)
);
create policy member_messages_read on chat_messages for select using (
  room_id in (select r.id from chat_rooms r join table_members tm on tm.table_id = r.table_id
              join applications a on a.id = tm.application_id
              where a.profile_id = my_profile_id() and tm.active)
);
create policy member_messages_write on chat_messages for insert with check (
  kind = 'USER' and sender_profile_id = my_profile_id() and
  room_id in (select r.id from chat_rooms r join table_members tm on tm.table_id = r.table_id
              join applications a on a.id = tm.application_id
              where a.profile_id = my_profile_id() and tm.active)
);

-- 피드백·선호·차단·신고: 본인이 쓰고 본인 것만 본다 (상대에게 비공개)
create policy own_rows on feedbacks for all using (profile_id = my_profile_id()) with check (profile_id = my_profile_id());
create policy own_rows on person_preferences for all using (from_profile = my_profile_id()) with check (from_profile = my_profile_id());
create policy own_rows on user_blocks for all using (blocker = my_profile_id()) with check (blocker = my_profile_id());
create policy own_insert on safety_reports for insert with check (reporter = my_profile_id());
create policy own_select on safety_reports for select using (reporter = my_profile_id());

-- 같은 테이블 참가자에게 보여 줄 제한된 소개 (INF-06): 이름과 공개 가능한 성향만
create view table_peers with (security_invoker = false) as
  select tm.table_id, p.id as profile_id, p.name, p.interests, p.self_traits
  from table_members tm
  join applications a on a.id = tm.application_id
  join profiles p on p.id = a.profile_id
  where tm.active
    and tm.table_id in (select tm2.table_id from table_members tm2
                        join applications a2 on a2.id = tm2.application_id
                        where a2.profile_id = my_profile_id() and tm2.active);

-- 기본 매칭 설정 (MVP 5장 초기값)
insert into matching_settings (scope) values ('GLOBAL');
