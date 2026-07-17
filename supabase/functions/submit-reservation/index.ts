// 占位文件:提交预约 Edge Function(submit-reservation/index.ts)
//
// 用途:对应 docs/yukiakari_设计方案_v1.md 第三节 —— 前端不能直接 INSERT
// reservations 相关表(购物车总价由前端算出,直接开放 INSERT 权限会被
// 篡改总价)。这个函数接收"选了什么房型/日期/人数/追加项",内部重新按
// plans/plan_extras 当前价格计算 total_price、校验 get_availability()
// 是否够、再写入 reservations / reservation_items / reservation_item_extras
// 三张表。
//
// 安全要点(实现阶段务必遵守):
// - 服务端重新计算价格,不信任前端传入的金额
// - 参数化查询 / 使用 Supabase 官方 SDK,不手拼 SQL 字符串
// - 建议加简单的 IP 限流,防止被用来暴力刷单
// - 错误信息不暴露堆栈/SQL 细节
//
// 密钥:如需绕过 RLS 使用 service_role key,只能通过本函数的环境变量读取,
// 绝不能出现在 web/ 前端代码或 Git 仓库里。

// TODO(角色3下一阶段): 实现提交预约逻辑
