# 贡献指南

感谢你愿意参与 Omni Router 的开发。

## 开发流程

1. Fork 本仓库。
2. 创建功能分支：
   ```bash
   git checkout -b feat/your-feature
   ```
3. 修改代码并补充/更新测试。
4. 运行测试：
   ```bash
   npm test
   ```
5. 提交信息使用 Conventional Commits：
   - `feat: ...`
   - `fix: ...`
   - `refactor: ...`
   - `docs: ...`
   - `test: ...`
6. 推送并提交 Pull Request。

## 代码规范

- 保持插件“精炼、简洁、高效”。
- 不引入不必要的依赖。
- 修改 `src/omni-router.mjs` 时同步更新测试和文档。
