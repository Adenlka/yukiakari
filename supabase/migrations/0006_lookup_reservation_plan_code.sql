-- supabase/migrations/0006_lookup_reservation_plan_code.sql
--
-- 用途:体验审查报告(第二轮)第六节发现的问题——预约查询结果里的房型名称
-- 显示未翻译的原始日文(如"離れ 特別室「淡雪（あわゆき）」"),而购物车/
-- 预约完成页同一个房型显示的是已翻译的"離館 特別室「淡雪」"。根因:
-- lookup_reservation() 只返回 plan_name(数据库里的 name_ja 原始日语字段),
-- web/reserve/booking_lookup.js 直接把这个值展示出来,从没接入 ykT() 翻译。
--
-- 修复方式:在返回的每行明细里额外带上 plan_code(即 plans.code,例如
-- 'villa'/'viewbath'/'modern'/'standard'),前端拿到 code 后去 i18n 字典查
-- `reserve.plan.<code>.title` 对应当前语言的房型名称——这正是 reserve.js/
-- booking_info.js 购物车环节已经在用的同一套翻译 key,查询结果因此能和
-- 购物车/完成页保持一致。查不到时(例如日帰りプラン,这几个的标题目前
-- 站内还没有多语言版本,是另一个已知的、超出本次修复范围的历史遗留问题)
-- 回退到原始 name_ja,不会显示空白。
--
-- 除了新增 plan_code 这一个字段外,函数体其余部分与 0002_rls_policies.sql
-- 里的原始版本完全一致,用 create or replace function 覆盖,不改变函数签名、
-- 鉴权方式(security definer)、grant 权限,不需要额外的迁移动作。

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
        'plan_code',    p.code,
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
