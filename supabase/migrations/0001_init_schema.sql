-- 0001_init_schema.sql
--
-- 用途:落实 docs/yukiakari_设计方案_v1.md 第一节表结构设计,建立预约系统
-- 核心表(plans / plan_extras / plan_available_extras / reservations /
-- reservation_items / reservation_item_extras)+ get_availability() 库存
-- 查询函数(方案A:实时计算,不建物化库存表,理由见设计方案 1.3)。
--
-- 另外补充了设计方案第一节 SQL 代码块本身没有列出、但第三/七节已经决定要建的
-- 两张表:admin_profiles(管理员角色标记,3.2)、contact_messages(联系表单
-- 落库,7.1)。这两张不在设计方案 1.2 的建表语句里,是角色3实现阶段按其他章节
-- 决定补齐的,写在这里方便一次性建完整套 schema,已在变更记录里注明这处补充。
--
-- 种子数据(plans/plan_extras/plan_available_extras 的初始行)取自现有前端
-- `web/reserve/reserve.js`(planDetailsByRoom / daytripPlans / extraOptions)
-- 和 `web/reserve/reserve.html`(data-plan-price/title),是真实存在的业务
-- 数据,不是瞎编的占位内容 —— 唯一例外是 total_units(每日总可售数量),这项
-- 前端从未真实实现过(现状是伪随机数生成可用性),设计方案与本次任务卡都明确
-- 这是等 Aden 确认的占位值,已用注释在下方逐行标注。

create extension if not exists "pgcrypto"; -- gen_random_uuid() 需要

-- ============================================================
-- 商品目录:客室 + 日帰りプラン统一管理
-- ============================================================
create table plans (
    id               uuid primary key default gen_random_uuid(),
    code             text unique not null,        -- 'villa' / 'viewbath' / 'modern' / 'standard' / 'daytrip-relax' / 'daytrip-sauna' / 'daytrip-private'
    plan_type        text not null check (plan_type in ('room', 'daytrip')),
    name_ja          text not null,
    description_ja   text,
    capacity         smallint not null,            -- 单间/单场次最大人数
    base_guests      smallint not null default 2,  -- 基础价格含几人
    base_price       integer not null,             -- 日元整数,不用小数(日元无辅助货币单位)
    extra_guest_rate integer not null default 0,   -- 超出 base_guests 每人加收(每泊)
    unit_label       text,                          -- '1室 / 1泊' 等展示用文案
    total_units      smallint not null default 1,   -- 【占位,待Aden确认真实值】每日总可售数量,demo默认值见下方 insert
    sort_order       smallint not null default 0,
    is_active        boolean not null default true,
    created_at       timestamptz not null default now()
);
comment on column plans.total_units is '占位值,不代表真实库存,上线前必须由 Aden 确认真实的每日总可售数量再更新。';

-- 追加选项目录(对应现有 reserve.js 里 extraOptions 六项)
create table plan_extras (
    id           uuid primary key default gen_random_uuid(),
    code         text unique not null,             -- 'dinnerUpgrade' / 'privateBath' / 'loungeAccess' / 'lateCheckout' / 'daytripAllAccess' / 'daytripMealUpgrade'
    name_ja      text not null,
    price        integer not null,
    charge_unit  text not null check (charge_unit in ('guest', 'room')),
    per_night    boolean not null default false,
    created_at   timestamptz not null default now()
);

-- 哪些追加选项对哪些 plan 开放(对应 reserve.js 里 planDetailsByRoom.extras / daytripPlans.extras 数组)
create table plan_available_extras (
    plan_id   uuid not null references plans(id) on delete cascade,
    extra_id  uuid not null references plan_extras(id) on delete restrict,
    primary key (plan_id, extra_id)
);

-- ============================================================
-- 预约主表(一次提交 = 一个顾客的一张订单)
-- ============================================================
create table reservations (
    id               uuid primary key default gen_random_uuid(),
    code             text unique not null,         -- 对客展示的预约码,查询用
    guest_name       text not null,
    guest_kana       text,
    guest_email      text not null,
    guest_phone      text not null,
    guest_address    text,                          -- GDPR建议改选填,见需求文档第五节,本表已设为可空
    arrival_time     text,
    special_requests text,
    payment_method   text not null default 'onsite' check (payment_method in ('onsite', 'bank_transfer')),
    status           text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
    total_price      integer not null default 0,    -- 服务端计算写入(submit_reservation函数),禁止信任前端传值,见0002迁移安全说明
    locale           text,
    created_at       timestamptz not null default now(),
    cancelled_at     timestamptz
);
comment on column reservations.total_price is '由 submit_reservation() 数据库函数服务端计算写入,前端提交的价格数字仅供展示参考,不会被信任写入此字段。';

-- 预约明细行(购物车里的每个 plan 一行)
create table reservation_items (
    id              uuid primary key default gen_random_uuid(),
    reservation_id  uuid not null references reservations(id) on delete cascade,
    plan_id         uuid not null references plans(id) on delete restrict,
    checkin_date    date not null,
    checkout_date   date not null,                  -- 日帰り类 = checkin_date
    nights          smallint not null default 0,
    guests          smallint not null,
    room_count      smallint not null default 1,
    unit_price      integer not null,                -- 提交时 plans.base_price 的快照,防止后续改价影响历史订单
    line_total      integer not null,                -- 含该行 base+追加选项+服务费+税(算法见0002迁移 submit_reservation 注释)
    daytrip_options jsonb                             -- 日帰り专属的スパ/餐食子选项,结构灵活用jsonb,不单独建表
);

-- 明细行内勾选的追加选项
create table reservation_item_extras (
    id                     uuid primary key default gen_random_uuid(),
    reservation_item_id    uuid not null references reservation_items(id) on delete cascade,
    extra_id               uuid not null references plan_extras(id) on delete restrict,
    quantity               smallint not null default 1,
    unit_price             integer not null,          -- 快照
    line_total             integer not null            -- 快照(不含服务费/税,服务费与税统一在 reservation_items.line_total 里体现)
);

-- ============================================================
-- 联系表单留言(补充建表,依据设计方案第七节 1.3 决定 + 需求文档 1.3 字段清单)
-- ============================================================
create table contact_messages (
    id              uuid primary key default gen_random_uuid(),
    guest_name      text not null,
    guest_kana      text,
    guest_email     text not null,
    guest_phone     text,                             -- 需求文档标注为选填
    message         text not null,
    privacy_agreed  boolean not null default false,
    status          text not null default 'unread' check (status in ('unread', 'read')),
    created_at      timestamptz not null default now()
);

-- ============================================================
-- 管理员角色标记表(补充建表,依据设计方案 3.2)
-- ============================================================
create table admin_profiles (
    user_id      uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role         text not null default 'staff' check (role in ('staff', 'owner')),
    created_at   timestamptz not null default now()
);
comment on table admin_profiles is '管理员账号本身通过 Supabase Auth 创建(线下操作/Studio加,不开放自助注册接口),这张表只做角色标记,配合 RLS 判断谁是管理员。';

-- ============================================================
-- 索引(对应设计方案第一节索引表)
-- ============================================================
create index reservation_items_plan_dates_idx on reservation_items (plan_id, checkin_date, checkout_date);
create index reservation_items_reservation_idx on reservation_items (reservation_id);
create index reservations_guest_phone_idx on reservations (guest_phone);
create index reservation_item_extras_item_idx on reservation_item_extras (reservation_item_id);
create index contact_messages_created_idx on contact_messages (created_at desc);

-- ============================================================
-- 库存查询函数(方案A:实时计算,见设计方案 1.3)
-- ============================================================
-- 【安全修复 · 安全审查报告中危问题③】原先这个函数只声明 language sql
-- stable,没有 security definer,PostgREST 把它暴露成 RPC 给 anon 调用时
-- 就以 anon 身份执行——而 reservation_items 表的 RLS(见 0002 迁移)没有
-- 给 anon 任何 SELECT 策略,导致函数内部 left join reservation_items 这
-- 一步对 anon 而言永远查不到任何一行,coalesce(sum(...), 0) 恒为 0,函数
-- 返回值恒等于 total_units,前端日历因此"永远显示满库存",不是真的库存
-- 查询失败,而是被 RLS 静默过滤成了空结果。加 security definer 后函数以
-- 属主权限运行,能看到真实的 reservation_items 数据;这个函数只返回一个
-- 聚合后的整数(剩余数量),不暴露任何顾客个人信息或预约明细,加 DEFINER
-- 权限不引入新的数据泄露面。set search_path = public 与 submit_reservation
-- /lookup_reservation 保持一致写法,防止 search_path 劫持。
create or replace function get_availability(p_plan_id uuid, p_date date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select p.total_units - coalesce(sum(ri.room_count), 0)
  from plans p
  left join reservation_items ri
    on ri.plan_id = p.id
    and ri.checkin_date <= p_date and ri.checkout_date > p_date
    and ri.reservation_id in (select id from reservations where status <> 'cancelled')
  where p.id = p_plan_id
  group by p.total_units, p.id;
$$;
comment on function get_availability(uuid, date) is '实时计算某 plan 在某日期的剩余可售数量 = total_units - 未取消预约中占用的 room_count 之和。不建物化库存表,取消预约只需改 reservations.status,库存自动恢复。security definer:见上方安全修复说明,否则 anon 通过 RPC 调用时因 RLS 看不到 reservation_items 数据,永远返回满库存。';

-- ============================================================
-- 种子数据:客室 4 种(取自 reserve.js/reserve.html 真实数据)
-- ============================================================
insert into plans (code, plan_type, name_ja, capacity, base_guests, base_price, extra_guest_rate, unit_label, total_units, sort_order) values
    ('villa',    'room', '離れ 特別室「淡雪（あわゆき）」', 4, 2, 22800, 3000, '1室 / 1泊', 2, 1), -- total_units=2 占位,待确认
    ('viewbath', 'room', '展望風呂付客室「風花（かざはな）」', 3, 2, 19800, 2500, '1室 / 1泊', 3, 2), -- total_units=3 占位,待确认
    ('modern',   'room', 'モダン和洋室「月明（つきあかり）」', 4, 2, 15500, 2000, '1室 / 1泊', 4, 3), -- total_units=4 占位,待确认
    ('standard', 'room', '本館 スタンダード和室',            5, 2, 11000, 1600, '1室 / 1泊', 5, 4); -- total_units=5 占位,待确认

-- 种子数据:日帰りプラン 3 种(取自 reserve.js daytripPlans)
insert into plans (code, plan_type, name_ja, capacity, base_guests, base_price, extra_guest_rate, unit_label, total_units, sort_order) values
    ('daytrip-relax',   'daytrip', '日帰り温泉「雪灯り」プラン', 6, 1, 4800, 0, '1名 / 日帰り', 20, 5), -- total_units=20 占位,待确认
    ('daytrip-sauna',   'daytrip', 'サウナ集中「ととのい」プラン', 6, 1, 5400, 0, '1名 / 日帰り', 20, 6), -- total_units=20 占位,待确认
    ('daytrip-private', 'daytrip', '貸切風呂「灯」プラン',        4, 1, 7200, 0, '1名 / 日帰り', 20, 7); -- total_units=20 占位,待确认

-- 种子数据:追加选项 6 项(取自 reserve.js extraOptions)
insert into plan_extras (code, name_ja, price, charge_unit, per_night) values
    ('dinnerUpgrade',     '夕朝食アップグレード', 2000, 'guest', true),
    ('loungeAccess',      '雪見ラウンジ利用',     500,  'guest', false),
    ('privateBath',       '貸切風呂',            1600, 'room',  true),
    ('lateCheckout',      'レイトチェックアウト', 900,  'room',  false),
    ('daytripAllAccess',  '館内オールアクセス',   500,  'guest', false),
    ('daytripMealUpgrade','季節の昼食追加',       1000, 'guest', false);

-- 种子数据:plan 与可用追加选项的对应关系(取自 reserve.js 各 plan 的 extras 数组)
insert into plan_available_extras (plan_id, extra_id)
select p.id, e.id
from (values
    ('villa',    'dinnerUpgrade'),
    ('villa',    'privateBath'),
    ('villa',    'loungeAccess'),
    ('villa',    'lateCheckout'),
    ('viewbath', 'dinnerUpgrade'),
    ('viewbath', 'loungeAccess'),
    ('viewbath', 'lateCheckout'),
    ('modern',   'dinnerUpgrade'),
    ('modern',   'loungeAccess'),
    ('standard', 'dinnerUpgrade'),
    ('standard', 'loungeAccess'),
    ('daytrip-relax',   'daytripAllAccess'),
    ('daytrip-relax',   'daytripMealUpgrade'),
    ('daytrip-sauna',   'daytripAllAccess'),
    ('daytrip-sauna',   'daytripMealUpgrade'),
    ('daytrip-private', 'daytripAllAccess'),
    ('daytrip-private', 'daytripMealUpgrade')
) as mapping(plan_code, extra_code)
join plans p on p.code = mapping.plan_code
join plan_extras e on e.code = mapping.extra_code;
