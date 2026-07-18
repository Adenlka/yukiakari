-- 0004_align_plan_data.sql
--
-- 【⚠️ 全局约束】0001~0003 已在真实 Supabase 项目执行过,禁止修改。
-- 0001 迁移种子数据里 4 个房型的 base_price / total_units 当初标注为
-- "占位,待确认"(见 0001_init_schema.sql 179~182行注释),一直没有跟
-- 网页文案(reserve.js 的 PLAN_STATIC_CONTENT/房型详情页)核对过,这轮
-- 核对后发现价格和房间数都对不上。用 update 按 code 精确修正,不做
-- drop/recreate,不影响已经指向这些 plan.id 的历史 reservation_items。
--
-- capacity 四项已核对与网页「定員」一致,不用动;extra_guest_rate 网页
-- 没有展示对应文案,保持原值不动,只改 base_price 和 total_units 这两列。

-- villa(離れ 特別室「淡雪」):22800 → 48000,房间数 2 → 2(不变,仍写一遍
-- 便于核对,update 本身是幂等的)
update plans set base_price = 48000, total_units = 2 where code = 'villa';

-- viewbath(展望風呂付客室「風花」):19800 → 32000,房间数 3 → 5
update plans set base_price = 32000, total_units = 5 where code = 'viewbath';

-- modern(モダン和洋室「月明」):15500 → 28000,房间数 4 → 8
update plans set base_price = 28000, total_units = 8 where code = 'modern';

-- standard(本館 スタンダード和室):11000 → 20000,房间数 5 → 12
update plans set base_price = 20000, total_units = 12 where code = 'standard';

comment on column plans.base_price is '客室基准价格(住宿档)/单价(日帰り档),单位日元。2026-07-18 起以网页文案(reserve.js PLAN_STATIC_CONTENT / 各房型详情页)为准,0001迁移里的原始种子值是未核对的占位数字,见 0004 迁移。';
comment on column plans.total_units is '该房型可售房间总数,用于 get_availability()/get_availability_range() 计算剩余库存。2026-07-18 起以网页文案为准,见 0004 迁移。';
