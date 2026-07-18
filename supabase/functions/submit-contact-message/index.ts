// supabase/functions/submit-contact-message/index.ts
//
// 用途:联系表单(web/contact.html)提交的唯一入口。
//
// 【安全修复 · 安全审查报告中危问题④】contact_messages 表的 RLS 策略是
// `for insert to anon with check (true)`——无条件允许插入,之前 contact.js
// 是前端直接 `supabase.from('contact_messages').insert(...)`,这意味着
// 任何脚本都能绕开页面,拿公开的 anon key 直接对 PostgREST 的
// /rest/v1/contact_messages 发起批量 POST,完全没有频率限制,可以无限量
// 灌库(存储膨胀 + 管理后台一次性全量拉取会被拖慢)。
// 修复方式:把 insert 这一步从前端直接调用改成经过这个 Edge Function,
// 提交前先调用 check_rate_limit() RPC(supabase/migrations/0003_rate_limits.sql
// 里已有的通用限流函数,与 submit-reservation/lookup-reservation 用的是
// 同一个函数),用 IP 做限流 key。
//
// 密钥说明:和 submit-reservation/lookup-reservation 一样,本函数只使用
// SUPABASE_ANON_KEY,不使用 service_role key —— contact_messages 的 RLS
// 本身已经允许 anon INSERT,这里不需要绕过 RLS 的更高权限。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 5; // 每个 IP 每个窗口最多提交次数
const RATE_WINDOW_SECONDS = 300; // 窗口长度:5分钟。联系表单不像预约那样需要频繁重试,窗口比 submit-reservation 长一些足够挡住脚本刷单。

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // 部署时按实际前端域名收紧,和 submit-reservation/lookup-reservation 保持一致处理
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ContactMessagePayload {
  guest_name?: unknown;
  guest_kana?: unknown;
  guest_email?: unknown;
  guest_phone?: unknown;
  message?: unknown;
  privacy_agreed?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // x-forwarded-for 的第一个 IP 做限流 key,与其它两个 Edge Function 写法一致
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { data: allowed, error: rlError } = await supabase.rpc(
    "check_rate_limit",
    {
      p_bucket: `submit-contact-message:${clientIp}`,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    },
  );

  if (rlError) {
    console.error("check_rate_limit RPC error:", rlError);
    return jsonResponse({ error: "服务暂时不可用,请稍后重试" }, 503);
  }
  if (!allowed) {
    return jsonResponse({ error: "送信が集中しています。しばらくしてから再度お試しください。" }, 429);
  }

  let payload: ContactMessagePayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "请求格式不正确" }, 400);
  }

  // ---------- 基础输入校验(前端体验层之外的第二道防线,不信任前端传来的任何字段) ----------
  const guestName = typeof payload.guest_name === "string" ? payload.guest_name.trim() : "";
  const guestKana = typeof payload.guest_kana === "string" ? payload.guest_kana.trim() : null;
  const guestEmail = typeof payload.guest_email === "string" ? payload.guest_email.trim() : "";
  const guestPhone = typeof payload.guest_phone === "string" && payload.guest_phone.trim()
    ? payload.guest_phone.trim()
    : null;
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const privacyAgreed = payload.privacy_agreed === true;

  if (!guestName || !guestEmail || !message) {
    return jsonResponse({ error: "必須項目が入力されていません。" }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
    return jsonResponse({ error: "メールアドレスの形式が正しくありません。" }, 400);
  }

  const { error } = await supabase.from("contact_messages").insert({
    guest_name: guestName,
    guest_kana: guestKana,
    guest_email: guestEmail,
    guest_phone: guestPhone,
    message,
    privacy_agreed: privacyAgreed,
  });

  if (error) {
    // 不把原始 PostgREST/数据库报错(可能带表名/字段名)透传给前端,统一
    // 替换成通用提示,原始错误只记日志供排查(安全底线:错误信息不暴露
    // 堆栈/SQL/路径)。
    console.error("contact_messages insert error:", error);
    return jsonResponse({ error: "送信に失敗しました。しばらくしてから再度お試しください。" }, 500);
  }

  return jsonResponse({ ok: true });
});
