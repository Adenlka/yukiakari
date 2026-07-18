#!/usr/bin/env node
// scripts/generate-config.js
//
// 用途:Vercel 构建阶段执行(见根目录 vercel.json 的 buildCommand),把
// Vercel 项目环境变量里配置的 SUPABASE_URL / SUPABASE_ANON_KEY 写进
// web/config.js,供 assets/js/supabase-client.js 在浏览器端读取。
// 依据 docs/yukiakari_设计方案_v1.md 第六节方案A(极简构建脚本,不引入
// 框架/构建工具链)。
//
// 【安全说明】这里写进 config.js 的 anon key 本来就设计为可以出现在前端
// (受 RLS 保护,详见设计方案第六节的密钥分级说明),不是需要保密的密钥;
// 真正不能出现在这里、也不能出现在这个脚本任何地方的是
// SUPABASE_SERVICE_ROLE_KEY —— 那个只配置在 Supabase Edge Functions 的
// 环境变量里,和 Vercel 项目环境变量是两个完全独立的配置位置,本脚本
// 完全不读取、不接触 service_role key。
//
// 本地想验证这套流程怎么跑(不需要真实 Supabase 项目也能验证"流程本身
// 能不能正确生成 config.js"):
//   SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=fake-anon-key-for-local-test node scripts/generate-config.js
// 生成完之后直接打开 web/ 下的页面,预约/联系表单会因为是假值而请求失败
// (这是预期行为),但可以确认 config.js 被正确写入、脚本本身没有语法或
// 路径错误——等 Aden 建好真实 Supabase 项目后,把真实值配进 Vercel 项目的
// Environment Variables 里,部署时会自动生成真实可用的 config.js,不需要
// 再手动改这个脚本。

const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  // 不让构建失败退出非0——config.js 会被写成空字符串占位,这和现有
  // reserve.js/contact.js/admin-guard.js 等页面脚本已经实现的 fail-safe
  // 行为一致(window.supabaseClient 初始化失败时给出明确提示并中止,不会
  // 报错泄露内部信息,只是相关功能不可用)。这里只在构建日志里打印警告,
  // 方便部署后排查"为什么网站预约/联系表单/管理后台都用不了"。
  console.warn(
    '[generate-config] 警告:未检测到 SUPABASE_URL / SUPABASE_ANON_KEY 环境变量,' +
    'config.js 将写入空字符串占位,网站的 Supabase 相关功能(预约/联系表单/管理后台)' +
    '会在浏览器端初始化失败。请在 Vercel 项目设置 → Environment Variables 里配置这两个' +
    '变量后重新部署。'
  );
}

const outputPath = path.join(__dirname, '..', 'web', 'config.js');

const content = `// web/config.js —— 本文件由 scripts/generate-config.js 在构建时自动生成,
// 不要手动编辑,也不要提交进 Git(见根级 .gitignore 的 web/config.js 一行)。
// 本地开发需要真实值时,可以手动跑:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/generate-config.js
// 或者直接编辑这个文件本身(反正不会被提交),两种方式都行。

window.SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(supabaseAnonKey)};
`;

fs.writeFileSync(outputPath, content, 'utf8');
console.log(
  `[generate-config] 已写入 ${outputPath}` +
  `(SUPABASE_URL ${supabaseUrl ? '已配置' : '为空,见上方警告'})`
);
