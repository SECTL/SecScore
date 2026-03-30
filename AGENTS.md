# AGENTS 协作规范

## 代码规范

- 所有代码必须符合 Rust 语言规范。
- 所有代码跑`pnpm run typecheck` or `cargo typecheck` 必须通过。

## 提交与推送要求

- 每次代码修改后，除非用户说明进行一次 Git 提交（commit）并推送（git push）否则不进行。
- 用户只说 `cp` 时，表示执行一次 Git 提交（commit）并推送（git push）。
- 提交信息必须使用中文。
- 提交信息必须遵循 Conventional Commits 规范，格式示例：`feat: 新增登录页表单校验`、`fix: 修复导出报告空指针问题`。
- 每次提交完成后，必须将对应提交推送到远端仓库（`git push`）。
