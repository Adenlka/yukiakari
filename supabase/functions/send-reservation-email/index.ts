// supabase/functions/send-reservation-email/index.ts
//
// 用途:顾客在 reserve/booking_info.html 提交预约成功后(前端调用
// submit-reservation Edge Function → submit_reservation() SECURITY DEFINER
// 函数落库,见 supabase/migrations/0002_rls_policies.sql),由 Supabase
// Dashboard → Database → Webhooks 配置的 Database Webhook 自动 POST 到本
// 函数(Table = reservations,Events = INSERT),本函数调用 Resend API 给
// 顾客发一封预约确认邮件。整体结构复用 send-contact-email 已验证的模式
// (Webhook 触发 + 共享密钥鉴权 + 失败一律返回200),两个函数的差异见下方
// 【与 send-contact-email 的关键差异】。
//
// 【重要-端点鉴权】和 send-contact-email 一样,用共享密钥 WEBHOOK_SECRET
// 校验请求确实来自配置好的 Database Webhook,防止任何人绕过正常下单流程
// 直接 POST 数据触发发信(拿别人的邮箱刷 Resend 额度,或者伪造预约数据
// 发骚扰邮件)。Dashboard 配置步骤:
//   Supabase Dashboard → Database → Webhooks → 新建 Webhook
//     Table: reservations   Events: Insert
//     Type: HTTP Request → URL 填本函数的部署地址
//     HTTP Headers 加一行 `x-webhook-secret: <与本函数环境变量 WEBHOOK_SECRET 一致的值>`
//   (WEBHOOK_SECRET 这个环境变量可以和 send-contact-email 共用同一个值,
//   也可以分开设置两个不同的密钥,安全性上没有区别,分开设置只是多一层
//   "换一个密钥不影响另一个 Webhook"的隔离,按 Aden 自己的偏好决定即可)
//
// 【与 send-contact-email 的关键差异①·收件人】send-contact-email 的收件人
// 是固定的旅馆方地址(MAIL_TO),这里收件人是顾客自己填写的 guest_email——
// 沿用 MAIL_FROM 环境变量做发件地址,但不使用 MAIL_TO 作为收件人。MAIL_TO
// 如果配置了,只用作 reply_to(顾客直接回复这封确认邮件时,回信会进旅馆
// 收件箱,方便顾客追加提问);不配置也不影响发信,只是回信会退回发件地址。
//
// 【与 send-contact-email 的关键差异②·为什么用 service_role key 而不是
// anon key】submit-reservation/lookup-reservation 两个面向浏览器的函数
// 刻意不用 service_role key(见各自文件头注释),因为它们是公网前端能直接
// 调用的端点,一旦被绕过校验滥用,service_role 权限会造成更大的破坏面。
// 本函数不一样:它不是给浏览器调用的,唯一的调用方是 Supabase 自己的
// Database Webhook 系统,且已经在最前面做了 WEBHOOK_SECRET 校验——校验
// 通过之后,函数需要读取 reservations 关联的 reservation_items + plans
// 明细(房型名称/日期/人数/金额),而这几张表的 RLS 策略只对 admin 开放
// SELECT(见 0002_rls_policies.sql),anon key 读不到。与其为了这一个内部
// 用途新增一个只暴露"按 id 查明细"的 SECURITY DEFINER 函数(还要考虑
// UUID 被枚举的问题),不如直接在这个已经过鉴权、且从不面向浏览器暴露的
// 函数内部使用 service_role key——这正是 service_role key 设计出来要覆盖
// 的场景(受信任的后端到后端调用),见 scripts/generate-config.js 里"这个
// key 只配置在 Edge Functions"的说明。
//
// 【与 send-contact-email 的关键差异③·total_price 不能信任 Webhook payload】
// submit_reservation() 里先 INSERT reservations(此时 total_price 硬编码为
// 0),再循环写入 reservation_items 并逐行计算金额,最后才用 UPDATE 把算出
// 来的总额写回 reservations.total_price。Database Webhook 的 INSERT 事件
// 捕获的是"INSERT 语句执行那一刻"的行快照,不会包含同一个函数里后续这条
// UPDATE 的结果——也就是说如果直接读 Webhook payload 里的 record.total_price,
// 拿到的永远是 0。本函数不信任 payload 里的业务字段(只用 payload.record.id
// 定位是哪一笔预约),鉴权通过后用 service_role key 重新查一次 reservations
// 的当前状态——这时事务已经提交完毕(Webhook 的 HTTP 调用是提交后才异步
// 触发的),查到的 total_price 一定是最终值。
//
// 【已知限制·Resend 测试域名】项目目前没有自有域名,MAIL_FROM 暂时只能用
// Resend 提供的测试发信地址 onboarding@resend.dev——这个地址的限制比
// send-contact-email 场景更明显:Resend 规定测试地址只能发往"注册 Resend
// 账号时用的那个邮箱",而这里的收件人是顾客自己填的任意邮箱,大概率不等于
// 那个注册邮箱,发送会被 Resend 直接拒绝(这不是本函数的 bug,是 Resend
// 对未验证域名的强制限制)。也就是说:在旅馆方完成自有域名的 Resend 验证
// 之前,这个"顾客确认邮件"功能在真实环境里基本不会成功投递给真实顾客,
// 只能发给 Resend 账号自己的注册邮箱做测试。上线前必须提醒 Aden 这一点,
// 已同步写进本轮变更记录的"遗留问题"。
//
// 部署前需要在 Supabase Dashboard 配置的 Secrets(前两个通常已经因为
// send-contact-email 配置过,可直接复用):
//   RESEND_API_KEY   Resend 的 API Key(和 send-contact-email 共用同一个)
//   WEBHOOK_SECRET   共享密钥,填进上面 Webhook 的 Header 里
//   MAIL_FROM        发件地址(和 send-contact-email 共用同一个环境变量)
//   MAIL_TO          可选,旅馆方收件邮箱,配置了会作为本函数发信的 reply_to

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

const RATE_LIMIT = 20; // 一小时内最多发信次数,和 send-contact-email 保持一致的量级
const RATE_WINDOW_SECONDS = 3600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 极简 HTML 转义,防止把顾客填写的姓名等字段原样拼进邮件 HTML 时被用来做
// 内容注入(和 send-contact-email 的 escapeHtml 完全一致)
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 站点目前支持的 5 种语言(与 web/assets/js/i18n-data.js、
// booking_complete.html 语言切换按钮的 data-lang 保持一致)
const SUPPORTED_LOCALES = ["en", "ja", "ko", "zh-Hans", "zh-Hant"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function resolveLocale(raw: unknown): Locale {
  if (typeof raw === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) {
    return raw as Locale;
  }
  return "ja";
}

// 房型/日帰りプラン名称的多语言对照表。前 4 个(villa/viewbath/modern/
// standard)的译文直接照抄 web/assets/js/i18n-data.js 里 reserve.plan.*.title
// 的现有翻译,保持和网站展示一致;这份表和 i18n-data.js 是两份独立维护的
// 静态数据(Edge Function 运行在 Deno,无法在运行时读取前端的 JS 文件),
// 如果将来网站上的房型名称改了措辞,这里需要手动同步更新,已在此注释标注。
// 后 3 个(daytrip-*)是本轮新增的翻译——网站的日帰りプランのタイトルー
// 直只有日语(reserve.js 的 DAYTRIP_STATIC_CONTENT 硬编码),其它页面从未
// 提供过多语言版本,这是站点已有的既定限制,不在本轮任务范围内一并修正;
// 这里只是为了让确认邮件本身能完整支持 5 种语言,新增了这 3 个的翻译。
const PLAN_NAMES: Record<string, Record<Locale, string>> = {
  villa: {
    en: "Detached Villa “Awayuki”",
    ja: "離れ 特別室「淡雪」",
    ko: "별채 특실 “아와유키”",
    "zh-Hans": "离馆 特别室「淡雪」",
    "zh-Hant": "離館 特別室「淡雪」",
  },
  viewbath: {
    en: "View Bath Room “Kazahana”",
    ja: "展望風呂付客室「風花」",
    ko: "전망탕 객실 “카자하나”",
    "zh-Hans": "展望风吕客房「风花」",
    "zh-Hant": "展望風呂客房「風花」",
  },
  modern: {
    en: "Modern Jap.-Western “Tsukiakari”",
    ja: "モダン和洋室「月明」",
    ko: "모던 화양실 “츠키아카리”",
    "zh-Hans": "现代和洋室「月明」",
    "zh-Hant": "現代和洋室「月明」",
  },
  standard: {
    en: "Standard Japanese Room",
    ja: "本館 スタンダード和室",
    ko: "본관 스탠다드 다다미",
    "zh-Hans": "本馆 标准和室",
    "zh-Hant": "本館 標準和室",
  },
  "daytrip-relax": {
    en: "Day Trip Onsen “Yukiakari” Plan",
    ja: "日帰り温泉「雪灯り」プラン",
    ko: "당일 온천 ‘유키아카리’ 플랜",
    "zh-Hans": "日归温泉「雪灯り」方案",
    "zh-Hant": "日歸溫泉「雪燈り」方案",
  },
  "daytrip-sauna": {
    en: "Sauna Focus “Totonoi” Plan",
    ja: "サウナ集中「ととのい」プラン",
    ko: "사우나 집중 ‘토토노이’ 플랜",
    "zh-Hans": "桑拿专注「整备」方案",
    "zh-Hant": "桑拿專注「整備」方案",
  },
  "daytrip-private": {
    en: "Private Bath “Akari” Plan",
    ja: "貸切風呂「灯」プラン",
    ko: "대절탕 ‘아카리’ 플랜",
    "zh-Hans": "包场浴池「灯」方案",
    "zh-Hant": "包場浴池「燈」方案",
  },
};

// 邮件正文用到的文案,只覆盖这封邮件需要的 key(不是完整的站点 i18n 字典)
const EMAIL_I18N: Record<Locale, Record<string, string>> = {
  en: {
    subject: "Your yukiakari reservation confirmation - {code}",
    greeting: "Dear {name},",
    intro: "Thank you for your reservation at yukiakari. Here are your reservation details.",
    codeLabel: "Reservation code",
    totalLabel: "Total",
    paymentLabel: "Payment method",
    paymentOnsite: "Pay at check-in",
    paymentBankTransfer: "Bank transfer",
    itemsHeading: "Reservation details",
    itemsFallback: "Please check the full details via the link below.",
    guestsUnit: "guest(s)",
    roomsUnit: "room(s)",
    nightsUnit: "night(s)",
    daytripLabel: "Day trip",
    dateArrow: "to",
    lookupHeading: "View or manage your reservation",
    lookupCta: "View reservation details",
    lookupFallback: "Please use the reservation lookup page on our website with your reservation code and phone number.",
    footerNote: "This is an automated confirmation email. Please keep your reservation code for check-in and lookup.",
    footerReplyNote: "Reply to this email if you have any questions.",
  },
  ja: {
    subject: "【雪灯り】ご予約確認 - {code}",
    greeting: "{name} 様",
    intro: "この度は雪灯りにご予約いただき誠にありがとうございます。ご予約内容は以下の通りです。",
    codeLabel: "予約番号",
    totalLabel: "合計",
    paymentLabel: "お支払い方法",
    paymentOnsite: "現地決済",
    paymentBankTransfer: "銀行振込",
    itemsHeading: "ご予約内容",
    itemsFallback: "詳細は下記リンクよりご確認ください。",
    guestsUnit: "名",
    roomsUnit: "室",
    nightsUnit: "泊",
    daytripLabel: "日帰り",
    dateArrow: "〜",
    lookupHeading: "ご予約内容の照会・確認",
    lookupCta: "予約内容を照会する",
    lookupFallback: "予約番号とお電話番号にて、公式サイトの予約照会ページからご確認いただけます。",
    footerNote: "本メールは自動送信です。チェックインおよび照会の際は予約番号をお控えください。",
    footerReplyNote: "ご不明点がございましたら、本メールに直接ご返信ください。",
  },
  ko: {
    subject: "[유키아카리] 예약 확인 - {code}",
    greeting: "{name}님,",
    intro: "유키아카리를 예약해 주셔서 감사합니다. 예약 내용은 아래와 같습니다.",
    codeLabel: "예약번호",
    totalLabel: "합계",
    paymentLabel: "결제 방법",
    paymentOnsite: "현지 결제",
    paymentBankTransfer: "계좌 이체",
    itemsHeading: "예약 내용",
    itemsFallback: "자세한 내용은 아래 링크에서 확인해 주세요.",
    guestsUnit: "명",
    roomsUnit: "실",
    nightsUnit: "박",
    daytripLabel: "당일",
    dateArrow: "~",
    lookupHeading: "예약 조회 및 확인",
    lookupCta: "예약 내용 조회하기",
    lookupFallback: "예약번호와 전화번호로 공식 홈페이지의 예약 조회 페이지에서 확인하실 수 있습니다.",
    footerNote: "본 메일은 자동 발송되었습니다. 체크인 및 조회 시 예약번호가 필요하니 보관해 주세요.",
    footerReplyNote: "문의사항이 있으시면 본 메일에 직접 회신해 주세요.",
  },
  "zh-Hans": {
    subject: "【雪灯り】预约确认 - {code}",
    greeting: "尊敬的{name}：",
    intro: "感谢您预约雪灯り，预约内容如下。",
    codeLabel: "预约编号",
    totalLabel: "合计",
    paymentLabel: "付款方式",
    paymentOnsite: "现场付款",
    paymentBankTransfer: "银行转账",
    itemsHeading: "预约内容",
    itemsFallback: "详情请通过下方链接查询。",
    guestsUnit: "位",
    roomsUnit: "间",
    nightsUnit: "晚",
    daytripLabel: "日归",
    dateArrow: "至",
    lookupHeading: "查询与管理预约",
    lookupCta: "查看预约内容",
    lookupFallback: "请使用预约编号与电话号码，在官网的预约查询页面查询。",
    footerNote: "本邮件为系统自动发送。请妥善保存预约编号，用于入住登记与查询。",
    footerReplyNote: "如有疑问，可直接回复本邮件。",
  },
  "zh-Hant": {
    subject: "【雪燈り】預約確認 - {code}",
    greeting: "尊敬的{name}：",
    intro: "感謝您預約雪燈り，預約內容如下。",
    codeLabel: "預約編號",
    totalLabel: "合計",
    paymentLabel: "付款方式",
    paymentOnsite: "現場付款",
    paymentBankTransfer: "銀行轉帳",
    itemsHeading: "預約內容",
    itemsFallback: "詳情請透過下方連結查詢。",
    guestsUnit: "位",
    roomsUnit: "間",
    nightsUnit: "晚",
    daytripLabel: "日歸",
    dateArrow: "至",
    lookupHeading: "查詢與管理預約",
    lookupCta: "查看預約內容",
    lookupFallback: "請使用預約編號與電話號碼，在官網的預約查詢頁面查詢。",
    footerNote: "本郵件為系統自動發送。請妥善保存預約編號，用於入住登記與查詢。",
    footerReplyNote: "如有疑問，可直接回覆本郵件。",
  },
};

interface ReservationWebhookRecord {
  id?: string;
}

interface ReservationRow {
  id: string;
  code: string;
  guest_name: string;
  guest_email: string;
  payment_method: string;
  total_price: number;
  locale: string | null;
}

interface ReservationItemRow {
  checkin_date: string;
  checkout_date: string;
  nights: number;
  guests: number;
  room_count: number;
  line_total: number;
  plans: { code: string; name_ja: string } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---------- 端点鉴权(与 send-contact-email 完全相同的常量时间比较) ----------
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(providedSecret);
  const expectedBytes = encoder.encode(webhookSecret ?? "");
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

  const mailFrom = Deno.env.get("MAIL_FROM");
  if (!mailFrom) {
    console.error(
      "MAIL_FROM 未配置,跳过发信(预约已落库,不受影响)。" +
        "请在 Supabase Dashboard → Edge Functions → send-reservation-email → Secrets 里配置这个变量。",
    );
    return jsonResponse({ sent: false, reason: "mail_env_not_configured" }, 200);
  }
  // MAIL_TO 在这个函数里是可选的,只用作 reply_to(见文件头【关键差异①】说明)
  const mailToRaw = Deno.env.get("MAIL_TO");
  const replyTo = mailToRaw?.split(",").map((addr) => addr.trim()).filter(Boolean)[0];

  // 服务未正确配置(SUPABASE_URL/SERVICE_ROLE_KEY 缺失)理论上不会发生,
  // 这两个是 Supabase 平台给每个 Edge Function 自动注入的默认环境变量,
  // 这里仍然显式检查,避免万一缺失时抛出未处理异常、把内部报错暴露出去。
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未注入,无法查询预约明细");
    return jsonResponse({ sent: false, reason: "service_env_not_configured" }, 200);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  let payload: { record?: ReservationWebhookRecord };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "请求格式不正确" }, 400);
  }

  const reservationId = payload.record?.id;
  if (!reservationId) {
    return jsonResponse({ error: "缺少预约数据" }, 400);
  }

  // ---------- 频率限制:check_rate_limit() 已 grant 给 service_role(见
  // 0003_rate_limits.sql),用同一个 service_role client 调用即可 ----------
  const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
    p_bucket: "send-reservation-email:global",
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (rlError) {
    console.error("check_rate_limit RPC error:", rlError);
    return jsonResponse({ sent: false, reason: "rate_limit_check_failed" }, 200);
  }
  if (!allowed) {
    return jsonResponse({ sent: false, reason: "rate_limited" }, 200);
  }

  // ---------- 重新查询预约行(不信任 Webhook payload 里的 total_price,
  // 原因见文件头【关键差异③】)----------
  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .select("id, code, guest_name, guest_email, payment_method, total_price, locale")
    .eq("id", reservationId)
    .single<ReservationRow>();

  if (resError || !reservation) {
    console.error("查询预约行失败:", resError);
    return jsonResponse({ sent: false, reason: "reservation_not_found" }, 200);
  }
  if (!reservation.guest_email) {
    // 理论上不会发生(guest_email 在 reservations 表是 not null),仍做兜底
    console.error("预约行缺少 guest_email,跳过发信:", reservation.id);
    return jsonResponse({ sent: false, reason: "missing_guest_email" }, 200);
  }

  const { data: items, error: itemsError } = await supabase
    .from("reservation_items")
    .select("checkin_date, checkout_date, nights, guests, room_count, line_total, plans(code, name_ja)")
    .eq("reservation_id", reservation.id)
    .returns<ReservationItemRow[]>();

  if (itemsError) {
    // 明细查询失败不阻断发信——邮件退化成只含预约码/总价/查询链接,仍然
    // 比完全不发信有价值,顾客可以凭预约码+电话去查询页面看完整明细。
    console.error("查询预约明细失败(邮件将省略明细部分):", itemsError);
  }

  const locale = resolveLocale(reservation.locale);
  const t = EMAIL_I18N[locale];

  const guestName = escapeHtml(reservation.guest_name || "");
  const paymentLabel = reservation.payment_method === "bank_transfer" ? t.paymentBankTransfer : t.paymentOnsite;
  const totalLabel = `¥${Number(reservation.total_price || 0).toLocaleString("ja-JP")}`;

  const itemsHtml = (items && items.length > 0)
    ? items.map((item) => {
      const planCode = item.plans?.code || "";
      const planName = escapeHtml(PLAN_NAMES[planCode]?.[locale] || item.plans?.name_ja || "");
      const isDaytrip = item.nights === 0 || item.checkin_date === item.checkout_date;
      const dateText = isDaytrip
        ? `${t.daytripLabel} ${escapeHtml(item.checkin_date)}`
        : `${escapeHtml(item.checkin_date)} ${t.dateArrow} ${escapeHtml(item.checkout_date)}（${item.nights}${t.nightsUnit}）`;
      const lineTotal = `¥${Number(item.line_total || 0).toLocaleString("ja-JP")}`;
      return `<li style="margin-bottom:8px;">
  <strong>${planName}</strong><br>
  ${dateText}<br>
  ${item.guests}${t.guestsUnit} / ${item.room_count}${t.roomsUnit}<br>
  ${lineTotal}
</li>`;
    }).join("\n")
    : `<li>${escapeHtml(t.itemsFallback)}</li>`;

  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const lookupSectionHtml = allowedOrigin
    ? `<p><strong>${escapeHtml(t.lookupHeading)}</strong></p>
<p><a href="${allowedOrigin}/reserve/booking_lookup.html">${escapeHtml(t.lookupCta)}</a></p>`
    : `<p><strong>${escapeHtml(t.lookupHeading)}</strong></p>
<p>${escapeHtml(t.lookupFallback)}</p>`;

  const html = `<div style="font-family: sans-serif; line-height: 1.7; color: #222;">
<p>${t.greeting.replace("{name}", guestName)}</p>
<p>${escapeHtml(t.intro)}</p>
<p><strong>${escapeHtml(t.codeLabel)}：</strong>${escapeHtml(reservation.code)}</p>
<p><strong>${escapeHtml(t.paymentLabel)}：</strong>${escapeHtml(paymentLabel)}</p>
<p><strong>${escapeHtml(t.itemsHeading)}</strong></p>
<ul style="padding-left: 20px;">
${itemsHtml}
</ul>
<p><strong>${escapeHtml(t.totalLabel)}：</strong>${totalLabel}</p>
${lookupSectionHtml}
<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
<p style="font-size: 12px; color: #777;">${escapeHtml(t.footerNote)}</p>
<p style="font-size: 12px; color: #777;">${escapeHtml(t.footerReplyNote)}</p>
</div>`;

  const subject = t.subject.replace("{code}", reservation.code);

  try {
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `yukiakari <${mailFrom}>`,
        to: [reservation.guest_email],
        reply_to: replyTo || undefined,
        subject,
        html,
      }),
    });

    if (!resendResp.ok) {
      // 不把 Resend 原始报错转发出去(本函数只被 Webhook 调用,不面向前端),
      // 只记日志供排查;预约本身已落库成功,发信失败不影响这一点。
      console.error("Resend API error:", resendResp.status, await resendResp.text());
      return jsonResponse({ sent: false }, 200);
    }
  } catch (err) {
    console.error("发送邮件异常:", err);
    return jsonResponse({ sent: false }, 200);
  }

  return jsonResponse({ sent: true }, 200);
});
