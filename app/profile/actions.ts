"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  INTERESTS, MAX_BIRTH_YEAR, MIN_BIRTH_YEAR, PRICE_RANGES, SELF_TRAITS, WANTED_TRAITS,
} from "@/lib/options";

export type ProfileValues = {
  name: string;
  phone: string;
  birth_year: string;
  gender: string;
  job: string;
  mbti: string; // 네 글자 또는 빈 문자열
  interests: string[];
  self_traits: string[];
  wanted_traits: string[];
  price_ranges: string[];
  food_restrictions: string;
  consent_privacy: boolean;
  consent_policy: boolean;
};

export type ProfileState = { error?: string; values?: ProfileValues } | undefined;

const pick = (fd: FormData, key: string, allowed: readonly string[]) =>
  fd.getAll(key).map(String).filter((v) => allowed.includes(v));

function read(fd: FormData): ProfileValues {
  const axes = [0, 1, 2, 3].map((i) => String(fd.get(`mbti${i}`) ?? ""));
  return {
    name: String(fd.get("name") ?? "").trim(),
    phone: String(fd.get("phone") ?? "").trim(),
    birth_year: String(fd.get("birth_year") ?? "").trim(),
    gender: String(fd.get("gender") ?? ""),
    job: String(fd.get("job") ?? "").trim(),
    mbti: axes.every((a) => a) ? axes.join("") : "",
    interests: pick(fd, "interests", INTERESTS),
    self_traits: pick(fd, "self_traits", SELF_TRAITS),
    wanted_traits: pick(fd, "wanted_traits", WANTED_TRAITS),
    price_ranges: pick(fd, "price_ranges", PRICE_RANGES),
    food_restrictions: String(fd.get("food_restrictions") ?? "").trim(),
    consent_privacy: fd.get("consent_privacy") === "on",
    consent_policy: fd.get("consent_policy") === "on",
  };
}

// 신청 전에 매칭에 필요한 정보가 빠지지 않았는지 확인한다 (PRD 계정·프로필 요구사항)
function validate(v: ProfileValues): string | null {
  if (!v.name || v.name.length > 20) return "이름을 20자 이내로 입력해 주세요.";
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(v.phone)) return "연락처를 010-0000-0000 형식으로 입력해 주세요.";
  const year = Number(v.birth_year);
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR)
    return `출생연도를 확인해 주세요. 만 19세 이상(${MAX_BIRTH_YEAR}년생까지) 참여할 수 있어요.`;
  if (v.gender !== "F" && v.gender !== "M") return "성별을 골라 주세요.";
  if (!v.job || v.job.length > 30) return "직업을 30자 이내로 입력해 주세요.";
  if (v.interests.length === 0) return "요즘 관심사를 하나 이상 골라 주세요.";
  if (v.self_traits.length === 0) return "나는 어떤 사람인지 하나 이상 골라 주세요.";
  if (v.wanted_traits.length === 0) return "만나고 싶은 사람을 하나 이상 골라 주세요.";
  if (v.price_ranges.length === 0) return "희망 식사 가격대를 하나 이상 골라 주세요.";
  if (v.food_restrictions.length > 100) return "못 먹는 음식은 100자 이내로 적어 주세요.";
  if (!v.consent_privacy || !v.consent_policy) return "필수 동의 항목에 모두 동의해 주세요.";
  return null;
}

export async function saveProfile(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase, user, profile } = await requireProfile();
  if (profile?.role === "admin") redirect("/admin");

  const v = read(formData);
  const error = validate(v);
  if (error) return { error, values: v };

  const row = {
    name: v.name,
    phone: v.phone.replace(/^(\d{3})-?(\d{3,4})-?(\d{4})$/, "$1-$2-$3"),
    birth_year: Number(v.birth_year),
    gender: v.gender,
    job: v.job,
    mbti: v.mbti || null,
    interests: v.interests,
    self_traits: v.self_traits,
    wanted_traits: v.wanted_traits,
    price_ranges: v.price_ranges,
    food_restrictions: v.food_restrictions || null,
    consented_at: profile?.consented_at ?? new Date().toISOString(),
  };

  // 본인 행만 쓸 수 있도록 RLS가 적용된 사용자 권한으로 저장한다
  const { error: dbError } = profile
    ? await supabase.from("profiles").update(row).eq("id", profile.id)
    : await supabase.from("profiles").insert({ ...row, user_id: user.id });
  if (dbError) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.", values: v };

  redirect(profile ? "/profile?saved=1" : "/apply");
}
