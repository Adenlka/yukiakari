// 占位文件:联系表单邮件通知 Edge Function(send-contact-email/index.ts)
//
// 【本轮新确认】联系表单改为"双写"方案:提交时既写入 contact_messages 表
// (供 admin/contact-messages.html 后台查看),也通过本函数转发一封邮件通知,
// 与设计方案 docs/yukiakari_设计方案_v1.md 第七节最初建议的"只写库不发邮件"
// 不同 —— 该节建议是角色2给出的默认推荐,本轮已与 Aden 对齐改为双写,
// 差异原因见 docs/yukiakari_变更记录.md。
//
// 用途:contact.html 提交后,由前端先写入 contact_messages 表,再调用本函数
// 发送邮件通知(不阻塞主流程;写库失败与发信失败分别处理,发信失败不影响
// 留言已成功落库)。
//
// 【重要-密钥隔离】邮件服务商(如 Resend/SendGrid)的 API Key 只允许配置在
// 本 Edge Function 的环境变量里,绝不能出现在 web/ 前端代码、config.js 或
// Git 仓库中 —— 这是本函数存在的核心安全边界,不与 anon key 混用同一套配置。
//
// 实现阶段(角色3下一步)再补:
// - 选定邮件服务商 SDK/HTTP API
// - 输入校验与转义(防止留言内容被用于邮件头注入等)
// - 简单限流,防止被用来刷发信配额
// - 错误信息不暴露堆栈/密钥细节

// TODO(角色3下一阶段): 实现联系表单邮件转发逻辑
