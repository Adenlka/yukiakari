-- 0002_rls_policies.sql
--
-- 用途:落实 docs/yukiakari_设计方案_v1.md 第三节 3.3 RLS 策略要点 +
-- submit_reservation() / lookup_reservation() 两个 SECURITY DEFINER 函数。
--
-- 核心安全逻辑(第三节已讲清楚原理,这里按原理落地):
-- - reservations 系列表不给 anon 直接 INSERT/SELECT,统一走这两个
--   SECURITY DEFINER 函数,函数内部做真正的业务校验与服务端重算,绕过 RLS
--   完成写入/查询,前端只能通过函数暴露的"最小必要接口"操作数据。
-- - plans/plan_extras/plan_available_extras 只读开放给 anon,写操作只留给
--   service_role(不给任何前端角色 UPDATE/INSERT/DELETE 权限)。
-- - contact_messages 只给 anon INSERT,不给 SELECT(留言只有管理员能看)。
-- - admin 判定统一用 "authenticated 且在 admin_profiles 里有记录" 这条件。

-- ============================================================
-- 启用 RLS(所有业务表全部开启,默认拒绝,再逐条加白名单策略)
-- ============================================================
alter table plans enable row level security;
alter table plan_extras enable row level security;
alter table plan_available_extras enable row level security;
alter table reservations enable row level security;
alter table reservation_items enable row level security;
alter table reservation_item_extras enable row level security;
alter table contact_messages enable row level security;
alter table admin_profiles enable row level security;

-- ============================================================
-- plans / plan_extras / plan_available_extras:anon + authenticated 只读
-- 写权限不给任何策略 —— 只有 service_role(天然绕过RLS)能写,
-- 管理员改房型价格走 Supabase Studio 或专门的管理端 Edge Function。
-- ============================================================
create policy "public can read plans" on plans
    for select
    to anon, authenticated
    using (true);

create policy "public can read plan_extras" on plan_extras
    for select
    to anon, authenticated
    using (true);

create policy "public can read plan_available_extras" on plan_available_extras
    for select
    to anon, authenticated
    using (true);

-- ============================================================
-- reservations:anon 不给任何策略(默认拒绝读写)。
-- authenticated 且是管理员:可 SELECT 全部,只能 UPDATE status/cancelled_at
-- 两个字段(用 REVOKE/GRANT 做列级限制,配合 RLS 的行级限制)。
-- ============================================================
create policy "admin can select all reservations" on reservations
    for select
    to authenticated
    using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));

create policy "admin can update reservation status" on reservations
    for update
    to authenticated
    using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()))
    with check (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));

-- 列级限制:即使命中上面的 RLS 策略,authenticated 角色也只能改这两列,
-- 不能改 guest_email/total_price 等其他字段(防止管理端被入侵后串改订单金额)。
revoke update on reservations from authenticated;
grant update (status, cancelled_at) on reservations to authenticated;

-- ============================================================
-- reservation_items / reservation_item_extras:anon 不给任何策略。
-- 管理员只需要 SELECT(查看订单明细),不需要 UPDATE。
-- ============================================================
create policy "admin can select reservation_items" on reservation_items
    for select
    to authenticated
    using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));

create policy "admin can select reservation_item_extras" on reservation_item_extras
    for select
    to authenticated
    using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));

-- ============================================================
-- contact_messages:anon 只能 INSERT(不能 SELECT/UPDATE/DELETE),
-- 管理员可以 SELECT 全部 + UPDATE status(标记已读)。
-- ============================================================
create policy "anon can submit contact message" on contact_messages
    for insert
    to anon
    with check (true);

create policy "admin can select contact_messages" on contact_messages
    for select
    to authenticated
    using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));

create policy "admin can update contact_message status" on contact_messages
    for update
    to authenticated
    using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()))
    with check (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));

revoke update on contact_messages from authenticated;
grant update (status) on contact_messages to authenticated;

-- ============================================================
-- admin_profiles:只有 service_role 能写(线下/Studio操作加管理员),
-- 本人可以 SELECT 自己的记录(前端用来判断"我是不是管理员")。
-- ============================================================
create policy "self can select own admin_profile" on admin_profiles
    for select
    to authenticated
    using (user_id = auth.uid());

-- ============================================================
-- submit_reservation():提交预约的唯一入口
--
-- 为什么不能让前端直接 INSERT reservations/reservation_items:
-- 购物车总价(total_price)是前端 JS 用 reserve.js 里的 computePlanTotals()
-- 算出来的,如果直接开放 INSERT 权限,恶意用户改个 network 请求就能把价格
-- 改成 0 再提交。这个函数只接收"选了什么房型/日期/人数/追加项",内部重新
-- 按 plans/plan_extras 当前价格计算 total_price、用 get_availability() 校验
-- 库存是否够,再写入三张表 —— 函数以 SECURITY DEFINER 权限运行,可以绕过
-- anon 的 RLS 限制完成写入,但前端拿不到绕过 RLS 的能力,只能走这一个函数。
--
-- 价格计算规则照抄 web/reserve/reserve.js 的 computePlanTotals(),保持前端
-- 展示价与服务端实际入账价一致(否则用户会看到"提交前后价格对不上"的困惑):
--   base   = 客室:按人数分摊到各房间,每房 (base_price + max(0,该房人数-base_guests)*extra_guest_rate) * nights 之和
--            日帰り:base_price * guests
--   addOns = 勾选的追加选项 price * (room 或 guest 数量) * (per_night ? nights : 1) 之和
--            日帰り额外叠加:planAddonMap(relax=0/sauna=400/private=900) + mealAddonMap(none=0/light=400/lunch=900),按 guests 计
--   service = round((base+addOns) * 10%)
--   tax     = round((base+addOns+service) * 10%)
--   line_total = base + addOns + service + tax
-- ============================================================
create or replace function submit_reservation(
    p_guest_name       text,
    p_guest_kana       text,
    p_guest_email      text,
    p_guest_phone      text,
    p_guest_address    text,
    p_arrival_time     text,
    p_special_requests text,
    p_payment_method   text,
    p_locale           text,
    p_items            jsonb  -- [{plan_id, checkin_date, checkout_date, guests, room_count, extra_codes:[...], daytrip_options:{plan,meal}}]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_reservation_id uuid;
    v_code           text;
    v_total          integer := 0;
    v_item           jsonb;
    v_plan           plans%rowtype;
    v_item_id        uuid;
    v_checkin        date;
    v_checkout       date;
    v_nights         smallint;
    v_guests         smallint;
    v_room_count     smallint;
    v_base_total     integer;
    v_addons_total   integer;
    v_service        integer;
    v_tax            integer;
    v_line_total     integer;
    v_extra_row      plan_extras%rowtype;
    v_extra_amount   integer;
    v_plan_addon     integer;
    v_meal_addon     integer;
    v_available      integer;
    v_pending        integer;
    v_day            date;
    v_item_count     integer;
    -- 【安全修复 · 安全审查报告严重问题②】之前只校验了 checkout 晚于
    -- checkin、checkin 不早于今天,没有任何"最大跨度"上限。p_items 里的
    -- checkin/checkout 完全由前端提交决定,而这个函数对 anon 开放执行——
    -- 攻击者可以直接提交一个跨度极大的区间(比如 checkin=今天,
    -- checkout=若干年后),下面逐日校验库存的 while 循环就会跑几万次,
    -- 单次请求即可造成明显的数据库负载尖峰。这两个上限值堵住这个口子:
    v_max_nights       constant smallint := 30; -- 单次预约最大连续入住晚数
    v_max_advance      constant interval := interval '9 months'; -- 最大提前预订窗口,与前端 web/reserve/reserve.js 的 maxDate(今天+9个月)保持一致
    v_max_advance_date date;
begin
    -- ---------- 基础输入校验(不信任前端传来的任何字段) ----------
    if p_guest_name is null or btrim(p_guest_name) = '' then
        raise exception '缺少必填的顾客姓名' using errcode = 'YK001';
    end if;
    if p_guest_email is null or p_guest_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception '邮箱格式不正确' using errcode = 'YK001';
    end if;
    if p_guest_phone is null or btrim(p_guest_phone) = '' then
        raise exception '缺少必填的联系电话' using errcode = 'YK001';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception '预约明细格式不正确' using errcode = 'YK001';
    end if;
    v_item_count := jsonb_array_length(p_items);
    if v_item_count = 0 or v_item_count > 10 then
        raise exception '预约明细数量不合法' using errcode = 'YK001';
    end if;

    v_max_advance_date := current_date + v_max_advance;

    -- ---------- 前置校验:统一校验完所有 items 再进入下面真正写入/逐日查
    -- 库存的循环(安全审查报告严重问题②要求)----------
    -- 这一遍只做"廉价"的输入校验(商品是否存在、人数房间数是否合法、日期
    -- 区间是否在允许范围内),不做任何数据库写入,也不触发下面 O(天数) 的
    -- get_availability() 循环。这样即使 p_items 数组里排在后面的某一行本身
    -- 就不合法(比如跨度极大的日期区间),也会在这一遍就直接被拒绝,不会先
    -- 把前面几行开销更大的库存校验/价格计算跑完才发现要整单回滚——省下的是
    -- 已经被浪费掉的 CPU/IO,而不是数据一致性(数据一致性由函数整体在一个
    -- 事务里、任何 raise 都会回滚保证,这一点本身与本次修复无关)。
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        select * into v_plan from plans where id = (v_item->>'plan_id')::uuid and is_active;
        if not found then
            raise exception '所选商品不存在或已下架' using errcode = 'YK001';
        end if;

        v_guests := coalesce((v_item->>'guests')::smallint, 1);
        v_room_count := coalesce((v_item->>'room_count')::smallint, 1);
        if v_guests < 1 or v_room_count < 1 or v_room_count > 4 then
            -- room_count 上限对应前端 reserve.js 的 MAX_ROOMS = 4
            raise exception '人数或房间数不合法' using errcode = 'YK001';
        end if;
        if v_guests > v_plan.capacity * v_room_count then
            -- 安全审查报告中危问题⑦:人数不能超过该房型可容纳人数
            raise exception '入住人数超过该房型可容纳人数' using errcode = 'YK001';
        end if;

        v_checkin := (v_item->>'checkin_date')::date;
        if v_plan.plan_type = 'daytrip' then
            v_checkout := v_checkin;
            v_nights := 0;
        else
            v_checkout := (v_item->>'checkout_date')::date;
            v_nights := greatest(1, v_checkout - v_checkin);
            if v_checkout <= v_checkin then
                raise exception '退房日期必须晚于入住日期' using errcode = 'YK001';
            end if;
        end if;
        if v_checkin < current_date then
            raise exception '入住日期不能早于今天' using errcode = 'YK001';
        end if;
        if v_checkin > v_max_advance_date then
            raise exception '入住日期超出可预订范围(最多可提前预订约9个月)' using errcode = 'YK001';
        end if;
        if v_nights > v_max_nights then
            raise exception '单次预约的连续入住晚数不能超过 % 晚', v_max_nights using errcode = 'YK001';
        end if;
    end loop;

    -- 用于同一次提交内累加"待占用库存",避免同一笔订单里对同一 plan/日期
    -- 多次下单时,靠 get_availability() 单独判断反而漏掉互相之间的挤占。
    drop table if exists pg_temp._pending_consumption;
    create temporary table _pending_consumption (
        plan_id   uuid,
        occ_date  date,
        room_count smallint
    ) on commit drop;

    v_code := 'YK' || to_char(now(), 'YYMMDD') || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

    insert into reservations (
        code, guest_name, guest_kana, guest_email, guest_phone, guest_address,
        arrival_time, special_requests, payment_method, status, total_price, locale
    ) values (
        v_code, btrim(p_guest_name), p_guest_kana, btrim(p_guest_email), btrim(p_guest_phone), p_guest_address,
        p_arrival_time, p_special_requests,
        coalesce(nullif(p_payment_method, ''), 'onsite'),
        'confirmed', 0, p_locale
    ) returning id into v_reservation_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        -- ---------- 逐行读取 plan(存在性/人数/日期范围已在上面的前置校验
        -- 循环里确认过,这里 not found 理论上不会发生,只作并发下架的兜底,
        -- 不重复抛出已经检查过的业务错误)----------
        select * into v_plan from plans where id = (v_item->>'plan_id')::uuid and is_active;
        if not found then
            raise exception '所选商品不存在或已下架' using errcode = 'YK001';
        end if;

        v_guests := coalesce((v_item->>'guests')::smallint, 1);
        v_room_count := coalesce((v_item->>'room_count')::smallint, 1);

        v_checkin := (v_item->>'checkin_date')::date;
        if v_plan.plan_type = 'daytrip' then
            v_checkout := v_checkin;
            v_nights := 0;
        else
            v_checkout := (v_item->>'checkout_date')::date;
            v_nights := greatest(1, v_checkout - v_checkin);
        end if;

        -- ---------- 逐日校验库存(覆盖跨夜预约区间,日帰り只查当天) ----------
        v_day := v_checkin;
        while v_day < (case when v_plan.plan_type = 'daytrip' then v_checkin + 1 else v_checkout end) loop
            v_available := get_availability(v_plan.id, v_day);
            select coalesce(sum(room_count), 0) into v_pending
                from _pending_consumption where plan_id = v_plan.id and occ_date = v_day;
            if coalesce(v_available, 0) - v_pending < v_room_count then
                raise exception '所选日期库存不足,请重新选择日期或数量' using errcode = 'YK001';
            end if;
            insert into _pending_consumption values (v_plan.id, v_day, v_room_count);
            v_day := v_day + 1;
        end loop;

        -- ---------- 服务端重新计算价格(不信任前端传来的价格) ----------
        if v_plan.plan_type = 'daytrip' then
            v_base_total := v_plan.base_price * v_guests;

            v_plan_addon := case coalesce(v_item->'daytrip_options'->>'plan', '')
                when 'sauna' then 400
                when 'private' then 900
                else 0
            end;
            v_meal_addon := case coalesce(v_item->'daytrip_options'->>'meal', '')
                when 'light' then 400
                when 'lunch' then 900
                else 0
            end;
            v_base_total := v_base_total + (v_plan_addon + v_meal_addon) * v_guests;
        else
            -- 客室:人数按房间数平均分摊(与 reserve.js allocateGuests 的均分逻辑一致),
            -- 超出 base_guests 的部分按 extra_guest_rate 每晚每人加收
            v_base_total := 0;
            declare
                v_base_per_room smallint := v_guests / v_room_count;
                v_remainder     smallint := v_guests % v_room_count;
                v_room_idx      smallint;
                v_room_guests   smallint;
                v_extra_guests  smallint;
            begin
                for v_room_idx in 0 .. (v_room_count - 1) loop
                    v_room_guests := v_base_per_room + (case when v_room_idx < v_remainder then 1 else 0 end);
                    v_extra_guests := greatest(0, v_room_guests - v_plan.base_guests);
                    v_base_total := v_base_total
                        + v_plan.base_price * v_nights
                        + v_extra_guests * v_plan.extra_guest_rate * v_nights;
                end loop;
            end;
        end if;

        -- ---------- 追加选项(只认库里当前价格,不认前端传的价格) ----------
        v_addons_total := 0;
        insert into reservation_items (
            reservation_id, plan_id, checkin_date, checkout_date, nights, guests, room_count,
            unit_price, line_total, daytrip_options
        ) values (
            v_reservation_id, v_plan.id, v_checkin, v_checkout, v_nights, v_guests, v_room_count,
            v_plan.base_price, 0, v_item->'daytrip_options'
        ) returning id into v_item_id;

        for v_extra_row in
            select pe.*
            from plan_extras pe
            join plan_available_extras pae on pae.extra_id = pe.id and pae.plan_id = v_plan.id
            where pe.code in (
                select jsonb_array_elements_text(coalesce(v_item->'extra_codes', '[]'::jsonb))
            )
        loop
            v_extra_amount := v_extra_row.price
                * (case when v_extra_row.charge_unit = 'room' then v_room_count else v_guests end)
                * (case when v_extra_row.per_night then greatest(1, v_nights) else 1 end);

            insert into reservation_item_extras (
                reservation_item_id, extra_id, quantity, unit_price, line_total
            ) values (
                v_item_id, v_extra_row.id, 1, v_extra_row.price, v_extra_amount
            );

            v_addons_total := v_addons_total + v_extra_amount;
        end loop;

        -- ---------- 服务费10% + 税10%(与 reserve.js SERVICE_RATE/TAX_RATE 一致) ----------
        v_service := round((v_base_total + v_addons_total) * 0.1);
        v_tax := round((v_base_total + v_addons_total + v_service) * 0.1);
        v_line_total := v_base_total + v_addons_total + v_service + v_tax;

        update reservation_items set line_total = v_line_total where id = v_item_id;

        v_total := v_total + v_line_total;
    end loop;

    update reservations set total_price = v_total where id = v_reservation_id;

    return jsonb_build_object('code', v_code, 'total_price', v_total);
exception
    when sqlstate 'YK001' then
        -- 上面手动 raise 的业务校验错误(邮箱格式/库存不足等),消息本身是我们
        -- 自己写的中文提示,不含表名/字段名等内部细节,可以原样透传给调用方,
        -- 让用户知道具体是"库存不够"还是"邮箱格式不对",体验更好。
        raise;
    when others then
        -- 其它未预期的数据库错误(类型转换失败/约束冲突等)才会走到这里,这类
        -- 报错的原始 SQLERRM 可能带出字段名/表结构等内部细节,统一替换成通用
        -- 提示,不把原始报错返回给调用方(安全底线:错误信息不暴露堆栈/SQL/路径)。
        raise exception '预约提交失败,请检查所选日期与人数后重试' using errcode = 'P0001';
end;
$$;

revoke all on function submit_reservation(text, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function submit_reservation(text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

-- ============================================================
-- lookup_reservation():查询预约的唯一入口
--
-- 为什么不能让前端直接 SELECT reservations:哪怕加 WHERE 条件,本质上还是
-- 把整表暴露给客户端过滤,别人改改请求参数就能枚举出其他顾客的预约。这个
-- 函数内部做 code+phone 精确匹配,只返回需要展示的字段,匹配不到就返回
-- null,不透露"是code错还是手机号错"(防止被用来暴力试探哪个字段不对)。
-- ============================================================
create or replace function lookup_reservation(p_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_reservation reservations%rowtype;
    v_items       jsonb;
begin
    if p_code is null or btrim(p_code) = '' or p_phone is null or btrim(p_phone) = '' then
        return null; -- 缺参数也统一返回"未找到",不单独说明缺了哪个
    end if;

    select * into v_reservation
    from reservations
    where code = btrim(p_code) and guest_phone = btrim(p_phone);

    if not found then
        return null; -- 不区分是 code 错还是 phone 错
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'plan_name',    p.name_ja,
        'checkin_date', ri.checkin_date,
        'checkout_date', ri.checkout_date,
        'nights',       ri.nights,
        'guests',       ri.guests,
        'room_count',   ri.room_count,
        'line_total',   ri.line_total
    )), '[]'::jsonb) into v_items
    from reservation_items ri
    join plans p on p.id = ri.plan_id
    where ri.reservation_id = v_reservation.id;

    return jsonb_build_object(
        'code',             v_reservation.code,
        'status',           v_reservation.status,
        'guest_name',       v_reservation.guest_name,
        'arrival_time',     v_reservation.arrival_time,
        'special_requests', v_reservation.special_requests,
        'total_price',      v_reservation.total_price,
        'items',            v_items
    );
end;
$$;

revoke all on function lookup_reservation(text, text) from public;
grant execute on function lookup_reservation(text, text) to anon, authenticated;
