-- 0003_rate_limits.sql
--
-- 【超出原始骨架范围的补充迁移】上一轮任务卡搭建骨架时,只规划了 0001(建表)
-- 和 0002(RLS策略)两个占位文件。本轮任务卡要求"三个 Edge Function 都加
-- 基础频率限制",设计方案 3.3 也建议"用 Supabase Edge Function + 简单的 IP
-- 计数"。计数状态需要落在数据库里才能在不同 Edge Function 实例间共享(Edge
-- Function 本身是无状态、多实例的,函数内存里的计数器在冷启动/多实例场景下
-- 不可靠),所以新增这个 0003 迁移,已在变更记录里说明这处超出原计划范围的
-- 增补。
--
-- 用途:固定窗口限流计数表 + check_rate_limit() SECURITY DEFINER 函数。
-- 之所以做成 SECURITY DEFINER 函数而不是直接开表给 anon 读写:
-- - 避免 anon 能直接读到全局限流计数(不算敏感,但没必要开放)
-- - 避免 anon 能直接往表里塞任意数据把这张表刷爆
-- 函数本身只做"计数 + 判断是否超限",不触碰任何顾客数据,anon 可以安全调用。

create table rate_limits (
    bucket_key    text not null,        -- 形如 'submit-reservation:203.0.113.5'
    window_start  timestamptz not null, -- 固定窗口起点(按 p_window_seconds 取整)
    request_count integer not null default 1,
    primary key (bucket_key, window_start)
);
comment on table rate_limits is '固定窗口限流计数表,仅供 check_rate_limit() 函数内部读写,不直接对任何前端角色开放访问。';

alter table rate_limits enable row level security;
-- 故意不给 anon/authenticated 任何策略:这张表只能通过下面的 SECURITY DEFINER
-- 函数间接访问,直接 SELECT/INSERT/UPDATE/DELETE 一律被 RLS 拒绝。

create or replace function check_rate_limit(
    p_bucket         text,
    p_limit          integer,
    p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_window timestamptz;
    v_count  integer;
begin
    if p_bucket is null or btrim(p_bucket) = '' or p_limit is null or p_window_seconds is null or p_window_seconds <= 0 then
        -- 参数不合法时保守拒绝(视为"已超限"),不让调用方绕过限流检查
        return false;
    end if;

    v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

    insert into rate_limits (bucket_key, window_start, request_count)
    values (p_bucket, v_window, 1)
    on conflict (bucket_key, window_start)
    do update set request_count = rate_limits.request_count + 1
    returning request_count into v_count;

    -- 顺手清理远早于当前窗口的旧记录,避免表无限增长。demo 量级下这个简单的
    -- "每次调用顺带清理"策略就够用,不需要额外的定时任务/pg_cron。
    delete from rate_limits where window_start < now() - (p_window_seconds || ' seconds')::interval * 5;

    return v_count <= p_limit;
end;
$$;
comment on function check_rate_limit(text, integer, integer) is '简单固定窗口限流:同一个 bucket_key 在 p_window_seconds 秒内最多允许 p_limit 次调用,超过返回 false。供三个 Edge Function 在处理请求前先调用一次。';

revoke all on function check_rate_limit(text, integer, integer) from public;
grant execute on function check_rate_limit(text, integer, integer) to anon, authenticated, service_role;
