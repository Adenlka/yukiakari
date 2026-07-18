// supabase/functions/submit-reservation/index.ts
//
// 用途:预约提交的 HTTP 入口。真正的"服务端重算价格 + 校验库存 + 写入三张
// 预约表"逻辑在数据库函数 submit_reservation()(SECURITY DEFINER,见
// supabase/migrations/0002_rls_policies.sql)里完成 —— 这样即使有人绕过本
// Edge Function 直接调用 RPC,安全性依然成立,不依赖这一层前置校验。
// 本函数只负责三件事:CORS/请求方法处理、IP 频率限制、把数据库报错转成
// 不泄露内部细节的提示(business 校验错误例外,见下方 error.code 分支)。
//
// 密钥说明:本函数只使用 SUPABASE_ANON_KEY(Supabase 平台自动注入的默认环境
// 变量,不需要手动配置),不使用 service_role key —— submit_reservation()
// 本身已经是 SECURITY DEFINER,这一层不需要再叠加一次更高权限的 key,少一个
// 密钥暴露的风险点。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 5; // 每个 IP 每个窗口最多提交次数
const RATE_WINDOW_SECONDS = 60; // 窗口长度(秒)
const MAX_ITEMS = 10; // 与 0002 迁移里 submit_reservation() 的上限保持一致(防止超大 payload)

// 【安全修复 · 安全审查报告中危问题⑤】CORS 不再硬编码 "*",改成读取
// ALLOWED_ORIGIN 环境变量(Supabase Dashboard → Edge Functions → Secrets,
// 和 SUPABASE_URL 配置在同一个地方)。说明:这个函数用的是公开的 anon
// key、不依赖 Cookie 做身份凭证,CORS 并不是这里唯一或最主要的防线——任何
// 人本来就能绕开浏览器直接用 curl/脚本调用,真正的防线是限流和 RLS/RPC
// 内部校验。CORS 收紧的价值在于防止第三方网站在访客毫不知情的浏览器里
// 静默发起大量请求(把访客当"肉鸡"消耗限流配额、干扰真实用户提交)。
// 本地开发/尚未配置该变量时退回 "*"(不阻塞调试),并打印警告提醒部署前
// 记得配置,避免生产环境忘记收紧。
const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
if (!allowedOrigin) {
  console.warn(
    "[submit-reservation] 未配置 ALLOWED_ORIGIN 环境变量,CORS 暂时退回 \"*\"。" +
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

  // x-forwarded-for 的第一个 IP 做限流 key(Supabase Edge Runtime 会注入该头)
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { data: allowed, error: rlError } = await supabase.rpc(
    "check_rate_limit",
    {
      p_bucket: `submit-reservation:${clientIp}`,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    },
  );

  if (rlError) {
    // 限流检查本身出错时选择保守拒绝,而不是放行,避免限流机制故障时被绕过刷单
    console.error("check_rate_limit RPC error:", rlError);
    return jsonResponse({ error: "服务暂时不可用,请稍后重试" }, 503);
  }
  if (!allowed) {
    return jsonResponse({ error: "请求过于频繁,请稍后再试" }, 429);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "请求格式不正确" }, 400);
  }

  const items = payload.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return jsonResponse({ error: "预约明细数量不合法" }, 400);
  }

  const { data, error } = await supabase.rpc("submit_reservation", {
    p_guest_name: payload.guest_name,
    p_guest_kana: payload.guest_kana ?? null,
    p_guest_email: payload.guest_email,
    p_guest_phone: payload.guest_phone,
    p_guest_address: payload.guest_address ?? null,
    p_arrival_time: payload.arrival_time ?? null,
    p_special_requests: payload.special_requests ?? null,
    p_payment_method: payload.payment_method ?? "onsite",
    p_locale: payload.locale ?? null,
    p_items: items,
  });

  if (error) {
    console.error("submit_reservation RPC error:", error);
    // submit_reservation() 内部把"业务校验错误"(errcode YK001)和"未预期的
    // 数据库错误"(errcode P0001,已被数据库函数统一替换成通用提示)分开处理,
    // 两种情况传到这里的 error.message 都已经是不含表名/字段名的安全文案,
    // 可以直接透传给前端。
    return jsonResponse({ error: error.message || "预约提交失败,请稍后重试" }, 400);
  }

  return jsonResponse({ data });
});
