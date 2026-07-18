// supabase/functions/send-contact-email/index.ts
//
// 用途:contact.html 提交联系表单后,前端调用 submit-contact-message Edge
// Function(限流后再调 submit_contact_message() SECURITY DEFINER 函数写入
// contact_messages——anon 对该表本身已无直接 INSERT 权限,见
// supabase/migrations/0002_rls_policies.sql,这就是需求文档确认的"双写"
// 方案里"写库"的那一半)。写入成功后,由 Supabase Dashboard → Database →
// Webhooks 配置的 Database Webhook 自动 POST 到本函数(Table =
// contact_messages,Events = INSERT),本函数再调用 Resend API 发一封通知
// 邮件给旅馆方,完成"双写"的另一半。
//
// 【重要-密钥隔离】RESEND_API_KEY 只在本函数的环境变量里配置(Supabase
// Dashboard → Edge Functions → send-contact-email → Secrets),绝不出现在
// web/ 前端代码、config.js 或 Git 仓库中 —— 这是这个函数存在的核心安全边界,
// 不与 Supabase 的 anon key / service_role key 混用同一套配置位置。
//
// 【重要-端点鉴权】Edge Function 默认是公网可访问的 HTTPS 端点,如果不做
// 鉴权,任何人都能直接 POST 数据过来触发发信,拿别人的邮箱刷 Resend 额度或
// 发骚扰邮件(而且这类调用完全绕开了 contact_messages 落库,不会留下任何
// 痕迹让管理员知道)。这里用一个共享密钥(WEBHOOK_SECRET)校验请求确实来自
// 配置好的 Database Webhook:
//   Supabase Dashboard → Database → Webhooks → 新建/编辑该 webhook →
//   HTTP Headers 里加一行 `x-webhook-secret: <与本函数环境变量
//   WEBHOOK_SECRET 一致的值>`。本函数收到请求后校验这个 header,对不上就
//   直接拒绝,不区分"没带这个头"还是"带了但值不对"。
//
// 【真实感提升轮 · 邮件收发件地址配置】收发件地址不再硬编码占位值,改成
// 读 MAIL_FROM / MAIL_TO 两个环境变量。当前项目还没有自有域名,MAIL_FROM
// 暂时用 Resend 提供的测试发信地址 onboarding@resend.dev——这个地址只能
// 发往"注册 Resend 账号时用的那个邮箱",发给其它收件人会被 Resend 拒绝,
// 这是 Resend 对未验证域名的限制,不是本函数的 bug。等旅馆方将来有了自己
// 的域名,在 Resend 后台完成域名验证(加 DNS 记录证明域名所有权)后,就可以
// 把 MAIL_FROM 换成正式的发信地址(比如 notify@真实域名),不需要改代码,
// 只需要改 Supabase Secrets 里的环境变量值。
//
// 部署前需要在 Supabase Dashboard 配置的四个 Secrets:
//   RESEND_API_KEY   Resend 的 API Key
//   WEBHOOK_SECRET   自己生成一个随机字符串,同时填进上面的 Webhook Header 里
//   MAIL_FROM        发件地址,当前阶段填 Resend 测试地址(如 onboarding@resend.dev)
//   MAIL_TO          旅馆方实际收件邮箱,支持逗号分隔多个地址

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

const RATE_LIMIT = 20; // 一小时内最多发信次数,防止异常情况下被反复触发刷邮件配额
const RATE_WINDOW_SECONDS = 3600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 极简 HTML 转义,防止把留言内容原样拼进邮件 HTML 时被用来做内容注入
// (比如留言里塞 <script> 或伪造的邮件正文结构)
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ContactMessageRecord {
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  message?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---------- 端点鉴权:必须带对共享密钥,否则一律拒绝 ----------
  // 【安全修复 · 安全审查报告中危问题⑥】原来用 `!==` 做字符串比较,逐字符
  // 比较、遇到第一个不相等字符就提前退出,理论上存在时序侧信道(响应时间
  // 的细微差异可以被用来逐字符猜出密钥)。改用 Deno 标准库的
  // timingSafeEqual 做常量时间比较,不管密钥对不对,比较耗时基本一致。
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(providedSecret);
  const expectedBytes = encoder.encode(webhookSecret ?? "");
  // 长度不一致时 timingSafeEqual 本身无法比较等长以外的输入,这里先判等长
  // 再做常量时间比较;泄露的只是"密钥长度是否碰巧一致"这个极弱信号,不影响
  // 实际安全性(密钥本身没有被泄露,也不会被这一步逐字符区分出来)。
  const isSecretValid = Boolean(webhookSecret) &&
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes);
  if (!isSecretValid) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY 未配置,请在 Supabase Dashboard 的 Edge Function Secrets 里设置");
    return jsonResponse({ error: "服务未正确配置" }, 500);
  }

  // ---------- 收发件地址:改读环境变量,不再硬编码 ----------
  // 未配置时不能让函数直接崩溃或抛 500——留言这条数据本身已经在
  // submit-contact-message 那一步落库成功了,本函数只是"锦上添花"的邮件
  // 通知,配置缺失只应该导致"这封通知邮件发不出去",不应该影响任何已经
  // 完成的数据写入,也不应该让 Supabase Database Webhook 因为收到非 2xx
  // 响应而反复重试。这里打明确的错误日志方便排查,然后直接优雅降级返回
  // sent:false,和下面邮件发送失败/异常时的处理方式保持一致。
  const mailFrom = Deno.env.get("MAIL_FROM");
  const mailToRaw = Deno.env.get("MAIL_TO");
  if (!mailFrom || !mailToRaw) {
    console.error(
      "MAIL_FROM 或 MAIL_TO 未配置,跳过发信(留言已落库,不受影响)。" +
        "请在 Supabase Dashboard → Edge Functions → send-contact-email → Secrets 里配置这两个变量。",
    );
    return jsonResponse({ sent: false, reason: "mail_env_not_configured" }, 200);
  }
  // MAIL_TO 支持逗号分隔多个收件地址,去空格 + 过滤空字符串
  const mailTo = mailToRaw.split(",").map((addr) => addr.trim()).filter(Boolean);
  if (!mailTo.length) {
    console.error("MAIL_TO 配置内容解析后为空(可能是纯逗号/空格),跳过发信");
    return jsonResponse({ sent: false, reason: "mail_env_not_configured" }, 200);
  }

  let payload: { record?: ContactMessageRecord };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "请求格式不正确" }, 400);
  }

  const record = payload.record;
  if (!record) {
    return jsonResponse({ error: "缺少留言数据" }, 400);
  }

  // ---------- 频率限制:用 anon key 调用 check_rate_limit()(SECURITY DEFINER,
  // 不需要 service_role 权限)----------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: allowed, error: rlError } = await supabase.rpc(
    "check_rate_limit",
    {
      p_bucket: "send-contact-email:global",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    },
  );

  if (rlError) {
    console.error("check_rate_limit RPC error:", rlError);
    // 限流检查故障时,选择跳过发信但仍返回200 —— 留言本身已经落库成功,
    // 这里失败不应该让 Supabase Webhook 判定为失败而反复重试发信。
    return jsonResponse({ sent: false, reason: "rate_limit_check_failed" }, 200);
  }
  if (!allowed) {
    return jsonResponse({ sent: false, reason: "rate_limited" }, 200);
  }

  const name = typeof record.guest_name === "string" ? record.guest_name : "";
  const email = typeof record.guest_email === "string" ? record.guest_email : "";
  const phone = typeof record.guest_phone === "string" ? record.guest_phone : "";
  const message = typeof record.message === "string" ? record.message : "";

  try {
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `yukiakari Contact Form <${mailFrom}>`,
        to: mailTo,
        reply_to: email || undefined,
        subject: `新的联系表单留言 - ${escapeHtml(name || "匿名")}`,
        html: `<p><strong>姓名:</strong>${escapeHtml(name)}</p>
<p><strong>邮箱:</strong>${escapeHtml(email)}</p>
<p><strong>电话:</strong>${escapeHtml(phone || "(未填写)")}</p>
<p><strong>留言:</strong></p>
<p>${escapeHtml(message)}</p>`,
      }),
    });

    if (!resendResp.ok) {
      // 不把 Resend 返回的原始错误体转发给任何客户端(本函数只被 Webhook
      // 调用,不面向前端用户,这里只记日志供排查)
      console.error("Resend API error:", resendResp.status, await resendResp.text());
      // 邮件发送失败不影响留言已落库的事实,返回200且不触发 Supabase Webhook
      // 的失败重试(避免同一条留言被重复尝试发信)
      return jsonResponse({ sent: false }, 200);
    }
  } catch (err) {
    console.error("发送邮件异常:", err);
    return jsonResponse({ sent: false }, 200);
  }

  return jsonResponse({ sent: true }, 200);
});
