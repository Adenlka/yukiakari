// supabase/functions/lookup-reservation/index.ts
//
// 用途:预约查询的 HTTP 入口,调用数据库函数 lookup_reservation(code, phone)
// (SECURITY DEFINER,见 supabase/migrations/0002_rls_policies.sql)做精确
// 匹配。无论是预约码错、手机号错、还是两个都错,数据库函数和本函数都统一
// 返回同一句"未找到"提示,不区分具体是哪个字段不对,防止被用来逐位暴力
// 试探哪个字段猜对了。
//
// 密钥说明:同 submit-reservation,只用 SUPABASE_ANON_KEY(平台自动注入),
// 不使用 service_role key。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 10; // 查询接口比提交接口更容易被用来暴力枚举,窗口内次数略放宽但仍要限
const RATE_WINDOW_SECONDS = 60;

const NOT_FOUND_MESSAGE = "未找到符合条件的预约,请确认预约码与手机号";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { data: allowed, error: rlError } = await supabase.rpc(
    "check_rate_limit",
    {
      p_bucket: `lookup-reservation:${clientIp}`,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    },
  );

  if (rlError) {
    console.error("check_rate_limit RPC error:", rlError);
    return jsonResponse({ error: "服务暂时不可用,请稍后重试" }, 503);
  }
  if (!allowed) {
    // 命中限流本身也不额外解释原因,和"查无结果"用不同的状态码(429 vs 404)
    // 是可以接受的 —— 429 只说明"你请求太频繁",不透露任何预约数据的信息。
    return jsonResponse({ error: "请求过于频繁,请稍后再试" }, 429);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "请求格式不正确" }, 400);
  }

  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";

  if (!code || !phone) {
    // 缺参数也走同一条"未找到"提示,不单独说明缺了哪个字段
    return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404);
  }

  const { data, error } = await supabase.rpc("lookup_reservation", {
    p_code: code,
    p_phone: phone,
  });

  if (error) {
    // 这里理论上不会走到业务错误分支(lookup_reservation 找不到时返回 null
    // 而不是抛异常),真正抛错的只会是未预期的数据库问题,统一给通用提示
    console.error("lookup_reservation RPC error:", error);
    return jsonResponse({ error: "查询失败,请稍后重试" }, 500);
  }

  if (!data) {
    return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404);
  }

  return jsonResponse({ data });
});
