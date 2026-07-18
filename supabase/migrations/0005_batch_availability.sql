-- 0005_batch_availability.sql
--
-- 【⚠️ 全局约束】0001~0003 已在真实 Supabase 项目执行过,禁止修改;
-- 0004(本轮同批新增)修的是 plans 数据,这个文件是本轮第二个新迁移,
-- 只新增函数,不改动任何已上线的表结构或历史函数。
--
-- 用途:修复 web/reserve/reserve.js 日历渲染的 N+1 请求问题。
-- 原来 computeDateStatus() 对日历网格里每一天 × 每个 plan 各发一次
-- get_availability() RPC,一个月网格 35~42 格 × 4 个房型 ≈ 140 次独立
-- HTTP 请求(DevTools 实测单页 188 requests)。这里新增一个批量版本,
-- 一次请求返回"若干个 plan × 一段日期区间"的全部剩余库存,前端只需要
-- 每次翻月发一次请求,结果存进内存缓存。
--
-- 不改动、不废弃原 get_availability(p_plan_id, p_date):
-- submit_reservation()(0002迁移)内部仍然逐日调用它做提交时的最终库存
-- 校验,那里本来就只查"这一次提交涉及的具体日期区间",调用次数是
-- O(住宿晚数)量级(最多30晚,见严重②的上限校验),不是 O(日历格数)量级,
-- 没有 N+1 问题,不需要跟着改。两个函数各司其职:get_availability 服务
-- "单个 plan 单一天"的精确校验场景,get_availability_range 服务"日历
-- 展示"这种批量读场景。
--
-- 权限模型与 get_availability 保持一致(0001迁移):security definer +
-- set search_path = public,不额外写 grant/revoke,沿用 get_availability
-- 那样依赖 Postgres 对新建函数的默认 PUBLIC EXECUTE 权限——这个函数和
-- get_availability 一样,只返回聚合后的整数库存,不 select * 任何一行
-- 顾客数据或预约明细,给 PUBLIC 执行权限不引入数据泄露面。

create or replace function get_availability_range(
    p_plan_ids uuid[],
    p_start    date,
    p_end      date
)
returns table(plan_id uuid, occ_date date, remaining int)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as plan_id,
    d::date as occ_date,
    p.total_units - coalesce(sum(ri.room_count), 0) as remaining
  from plans p
  cross join generate_series(p_start::timestamp, (p_end - 1)::timestamp, interval '1 day') as d
  left join reservation_items ri
    on ri.plan_id = p.id
    and ri.checkin_date <= d::date
    and ri.checkout_date > d::date
    and ri.reservation_id in (
      select id from reservations where status <> 'cancelled'
    )
  where p.id = any(p_plan_ids)
  group by p.id, p.total_units, d
  order by p.id, d;
$$;
comment on function get_availability_range(uuid[], date, date) is
    '批量版 get_availability():一次返回多个 plan 在 [p_start, p_end) 半开区间(含 p_start,不含 p_end)内每一天的剩余库存,供前端日历一次性拉取整月数据,避免逐天逐 plan 发请求造成的 N+1 问题。计算口径与 get_availability 完全一致(total_units 减去未取消预约占用的 room_count 之和),只是把"单个 plan 单一天"换成了"多个 plan × 一段日期区间"的批量聚合,两者对同一个 (plan_id, date) 组合应当返回相同的 remaining 值。security definer 原因与 get_availability 相同:reservation_items 表的 RLS 不对 anon 开放 SELECT,不加 DEFINER 权限时 anon 调用会因为看不到任何一行库存占用数据而恒定返回 total_units(永远显示满库存)。若 p_plan_ids 为空数组,返回空结果集(不报错)。若 p_end <= p_start,同样返回空结果集(generate_series 的区间为空)。';
