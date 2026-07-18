// supabase/functions/submit-contact-message/index.ts
//
// 用途:联系表单(web/contact.html)提交的唯一入口。
//
// 【安全修复 · 安全审查报告中危问题④,本文件为返工后的版本】
// contact_messages 表原来的 RLS 策略是 `for insert to anon with check
// (true)`——无条件允许插入。第一轮修复只是加了这个 Edge Function 在写库
// 前做限流,但没有收紧那条 RLS 策略,导致限流可以被完全绕过:anon key 是
// 公开的,任何人都能跳过这个 Edge Function,直接拿 anon key 对 PostgREST
// 的 /rest/v1/contact_messages 发 INSERT 请求,那条策略依然会放行,这里的
// 限流形同虚设——这是角色4复查后指出的返工原因。
//
// 现在的修复:supabase/migrations/0002_rls_policies.sql 已经把
// `anon can submit contact message` 这条策略删掉,并 `revoke insert on
// contact_messages from anon`,anon 对表本身完全没有写权限了。写入唯一
// 入口改成 submit_contact_message()(SECURITY DEFINER 函数,和
// submit_reservation()/lookup_reservation() 同样的写法),这个 Edge
// Function 现在做的事情是:先过 check_rate_limit() 限流,通过后调用这个
// RPC——不管有没有人绕开本函数直接打 PostgREST,RLS 这一层本身就已经
// 挡死了,限流不再是唯一防线,是纵深防御的其中一层。
//
// 密钥说明:和 submit-reservation/lookup-reservation 一样,本函数只使用
// SUPABASE_ANON_KEY,不使用 service_role key —— submit_contact_message()
// 本身已经是 SECURITY DEFINER,这一层不需要再叠加一次更高权限的 key。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 5; // 每个 IP 每个窗口最多提交次数
const RATE_WINDOW_SECONDS = 300; // 窗口长度:5分钟。联系表单不像预约那样需要频繁重试,窗口比 submit-reservation 长一些足够挡住脚本刷单。

// 【安全修复 · 安全审查报告中危问题⑤】CORS 不再硬编码 "*",改成读取
// ALLOWED_ORIGIN 环境变量,和 submit-reservation/lookup-reservation 保持
// 一致处理(详见那两个文件里对应位置的注释)。本地开发/尚未配置该变量时
// 退回 "*",并打印警告提醒部署前记得配置。
const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
if (!allowedOrigin) {
  console.warn(
    "[submit-contact-message] 未配置 ALLOWED_ORIGIN 环境变量,CORS 暂时退回 \"*\"。" +
      "部署到生产环境前请在 Supabase Dashboard 配置这个变量为实际前端域名。",
  );
}
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin || "*",
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

  // anon 对 contact_messages 表本身已经没有 INSERT 权限(见
  // 0002_rls_policies.sql 的 revoke),唯一的写入路径就是这个 RPC。
  const { error } = await supabase.rpc("submit_contact_message", {
    p_guest_name: guestName,
    p_guest_kana: guestKana,
    p_guest_email: guestEmail,
    p_guest_phone: guestPhone,
    p_message: message,
    p_privacy_agreed: privacyAgreed,
  });

  if (error) {
    console.error("submit_contact_message RPC error:", error);
    // submit_contact_message() 内部把"业务校验错误"(errcode YK001)和
    // "未预期的数据库错误"(errcode P0001,已被函数统一替换成通用提示)
    // 分开处理,两种情况传到这里的 error.message 都已经是不含表名/字段名
    // 的安全文案,可以直接透传给前端,和 submit-reservation 的处理方式一致。
    return jsonResponse({ error: error.message || "送信に失敗しました。しばらくしてから再度お試しください。" }, 400);
  }

  return jsonResponse({ ok: true });
});
