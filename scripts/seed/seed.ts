/**
 * 시드 데이터 적재 (시스템_설계.md 6장)
 *
 * 실행: npm run seed
 * 필요한 환경 변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_TEST_PASSWORD
 *
 * 하는 일
 * 1. 다가오는 목요일 3주 × 서울 4개 지역 회차 생성 (19:30, 신청 마감·매칭 = 직전 화요일 24:00 KST)
 * 2. 지역별 가상 식당 3곳과 회차 날짜별 수용 인원
 * 3. 우연한식탁_가상데이터.xlsx 응답 291명 → 프로필·이용권·신청·모의 결제(전원 결제 완료)
 * 4. 테스트 계정: 운영자 1, 참가자 3 (참가자는 가상 참가자 3명과 연결)
 *
 * 이미 시드가 들어가 있으면 중단한다. 다시 넣으려면 Supabase에서 테이블을 비운 뒤 실행한다.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type SeedApplicant = {
  seed_key: string;
  name: string;
  birth_year: number;
  gender: "F" | "M";
  mbti: string | null;
  interests: string[];
  self_traits: string[];
  wanted_traits: string[];
  price_ranges: string[];
  food_restrictions: string | null;
  regions: string[];
  date_choice_count: number;
  pass_type: "SINGLE" | "MEMBERSHIP_1M";
};

const REGIONS = ["hongdae", "jamsil", "gangnam", "euljiro"] as const;
const REGION_LABEL: Record<string, string> = { hongdae: "홍대", jamsil: "잠실", gangnam: "강남", euljiro: "을지로" };
const PRICE = { SINGLE: 9900, MEMBERSHIP_1M: 35000 } as const;
const WEEKS = 3;
const START_TIME = "19:30";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`환경 변수 ${name}가 필요합니다.`);
  return v;
}

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data as T;
}

// 오늘(KST) 이후 다가오는 목요일 n개 (YYYY-MM-DD)
function upcomingThursdays(n: number): string[] {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const d = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  const add = ((4 - d.getUTCDay() + 7) % 7) || 7; // 다음 목요일 (오늘이 목요일이면 다음 주)
  d.setUTCDate(d.getUTCDate() + add);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// 행사 직전 화요일 24:00 KST = 수요일 00:00 KST
function deadlineFor(eventDate: string): string {
  const d = new Date(`${eventDate}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

async function main() {
  const existing = must(await supabase.from("profiles").select("id").not("seed_key", "is", null).limit(1), "시드 확인");
  if (existing.length > 0) {
    console.log("이미 시드 데이터가 있습니다. 중단합니다.");
    return;
  }

  const file = JSON.parse(readFileSync(join(process.cwd(), "data/seed/applicants.json"), "utf8"));
  const applicants: SeedApplicant[] = file.applicants;
  const dates = upcomingThursdays(WEEKS);

  // 1. 회차
  const slotRows = dates.flatMap((date) =>
    REGIONS.map((region) => ({
      event_date: date,
      start_time: START_TIME,
      region,
      capacity: 36,
      apply_deadline: deadlineFor(date),
      match_at: deadlineFor(date),
    })),
  );
  const slots = must(await supabase.from("event_slots").insert(slotRows).select("id, event_date, region"), "회차 생성");
  const slotId = (date: string, region: string) => slots.find((s) => s.event_date === date && s.region === region)!.id;

  // 2. 가상 식당
  const venueRows = REGIONS.flatMap((region, ri) =>
    ["A", "B", "C"].map((k, ki) => ({
      name: `[가상] ${REGION_LABEL[region]} 식당 ${k}`,
      region,
      address: `[가상 주소] 서울 ${REGION_LABEL[region]} ${ki + 1}`,
      map_url: null,
      price_range: ki === 2 ? "3만 원 이상" : "2~3만 원",
      rating: [4.7, 4.5, 4.2][ki] - ri * 0.05,
    })),
  );
  const venues = must(await supabase.from("venues").insert(venueRows).select("id"), "식당 생성");
  const availability = venues.flatMap((v) =>
    dates.map((date) => ({ venue_id: v.id, slot_date: date, start_time: START_TIME, capacity: 18 })),
  );
  must(await supabase.from("venue_availability").insert(availability).select("id"), "식당 수용 인원 생성");

  // 3. 가상 참가자
  const profiles = must(
    await supabase
      .from("profiles")
      .insert(
        applicants.map((a) => ({
          seed_key: a.seed_key,
          name: a.name,
          birth_year: a.birth_year,
          gender: a.gender,
          mbti: a.mbti,
          interests: a.interests,
          self_traits: a.self_traits,
          wanted_traits: a.wanted_traits,
          price_ranges: a.price_ranges,
          food_restrictions: a.food_restrictions,
          consented_at: new Date().toISOString(),
        })),
      )
      .select("id, seed_key"),
    "프로필 생성",
  );
  const profileId = new Map(profiles.map((p) => [p.seed_key, p.id]));

  const validUntil = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);
  const passes = must(
    await supabase
      .from("passes")
      .insert(
        applicants.map((a) => ({
          profile_id: profileId.get(a.seed_key),
          type: a.pass_type,
          price: PRICE[a.pass_type],
          valid_until: a.pass_type === "SINGLE" ? null : validUntil,
        })),
      )
      .select("id, profile_id"),
    "이용권 생성",
  );
  const passByProfile = new Map(passes.map((p) => [p.profile_id, p.id]));

  const apps = must(
    await supabase
      .from("applications")
      .insert(
        applicants.map((a) => {
          const pid = profileId.get(a.seed_key)!;
          return {
            profile_id: pid,
            pass_id: passByProfile.get(pid),
            application_status: "SUBMITTED",
            payment_status: "PAID",
            match_status: "WAITING",
          };
        }),
      )
      .select("id, profile_id"),
    "신청 생성",
  );
  const appByProfile = new Map(apps.map((a) => [a.profile_id, a.id]));

  // 원래 고른 날짜 수만큼 다가오는 주를 앞에서부터 배정 (원본 날짜는 지난 날짜라 그대로 쓸 수 없다)
  const appSlots = applicants.flatMap((a) => {
    const appId = appByProfile.get(profileId.get(a.seed_key)!)!;
    return dates.slice(0, a.date_choice_count).flatMap((date) =>
      a.regions.map((region) => ({ application_id: appId, slot_id: slotId(date, region) })),
    );
  });
  for (let i = 0; i < appSlots.length; i += 500) {
    must(await supabase.from("application_slots").insert(appSlots.slice(i, i + 500)).select("application_id"), "회차 후보 생성");
  }

  must(
    await supabase
      .from("payments")
      .insert(
        applicants.map((a) => {
          const pid = profileId.get(a.seed_key)!;
          const appId = appByProfile.get(pid)!;
          return { application_id: appId, amount: PRICE[a.pass_type], status: "PAID", idempotency_key: `seed-${appId}` };
        }),
      )
      .select("id"),
    "모의 결제 생성",
  );

  // 4. 테스트 계정
  const password = env("SEED_TEST_PASSWORD");
  async function createUser(email: string) {
    const res = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (res.error) throw new Error(`계정 생성 실패(${email}): ${res.error.message}`);
    return res.data.user.id;
  }
  const adminUserId = await createUser("admin@test.local");
  must(await supabase.from("profiles").insert({ user_id: adminUserId, name: "운영자", role: "admin" }).select("id"), "운영자 프로필");

  for (let i = 0; i < 3; i++) {
    const uid = await createUser(`participant${i + 1}@test.local`);
    must(
      await supabase.from("profiles").update({ user_id: uid }).eq("seed_key", applicants[i].seed_key).select("id"),
      "테스트 참가자 연결",
    );
  }

  console.log(`완료: 회차 ${slots.length}, 식당 ${venues.length}, 가상 참가자 ${profiles.length}, 회차 후보 ${appSlots.length}`);
  console.log(`회차 날짜: ${dates.join(", ")}`);
  console.log("테스트 계정: admin@test.local, participant1~3@test.local (비밀번호: SEED_TEST_PASSWORD)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
