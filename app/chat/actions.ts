"use server";

import { revalidatePath } from "next/cache";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication } from "@/lib/applications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyTable } from "@/lib/table";

export type ChatState = { error?: string } | undefined;

// 단체방 메시지 보내기: 내가 확정된 테이블의 단체방인지 서버에서 확인한 뒤, 내 이름으로 일반 메시지만 저장한다.
export async function sendMessage(roomId: string, _: ChatState, formData: FormData): Promise<ChatState> {
  const { supabase, profile } = await requireParticipant();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return undefined;
  if (body.length > 500) return { error: "메시지는 500자까지 보낼 수 있어요." };
  const app = await getLatestApplication(supabase, profile.id);
  const table = app && app.match_status === "CONFIRMED" ? await getMyTable(app.id, profile.id) : null;
  if (!table || table.roomId !== roomId) return { error: "이 단체방에 메시지를 보낼 수 없어요." };
  const { error } = await createAdminClient()
    .from("chat_messages").insert({ room_id: roomId, sender_profile_id: profile.id, kind: "USER", body });
  if (error) return { error: "메시지를 보내지 못했어요." };
  revalidatePath("/chat");
  return undefined;
}
