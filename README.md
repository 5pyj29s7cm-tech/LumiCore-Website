# LumiCore Website

LumiCore 官方网站的独立静态源码树。它与 LumiCore 桌面客户端、后端、记忆数据库和用户密钥分离，本机目录和 GitHub 远程都保持为独立仓库。

官网沿用原官网的信息架构，保留智能宿主计划、全息载体、分布式心智、多模态产品、核心愿景与生态内容；LumiCore 开源仓库作为补充入口，不替代原有产品内容。多模态产品数据静态保存在站点内，不依赖 LumiCore 应用后端。

## 本机运行

```powershell
cd D:\LumiCore-Website
npm run check
npm start
```

本地预览默认监听 `127.0.0.1:4173`。正式服务通过
`scripts/start-production.ps1` 监听 `127.0.0.1:80`，健康检查位于
`http://127.0.0.1:80/healthz`。

生产启动脚本会拒绝网站目录中的 `.cloudflared` 残留，并将请求日志写入
`%ProgramData%\LumiCore\website\logs\access.jsonl`。日志目录只允许管理员和系统账户访问；
每个文件最多 5 MiB，保留当前文件与 6 个轮转文件。日志记录时间、方法、路径、状态码、耗时、
Cloudflare Ray ID 和请求完成情况，不记录查询参数、Cookie、认证头或请求正文。
本地预览默认不写日志；需要时可将 `LUMI_SITE_LOG_DIR` 设置为网站目录之外的位置。

静态服务只公开首页、前端脚本和样式、站点索引及允许类型的 `assets/` 文件，
其他路径返回 `404`。`npm run check` 包含真实私有文件、编码路径、Windows 路径、
目录链接和日志隔离的安全回归测试。不要用直接公开仓库根目录的通用文件服务器替换 `server.mjs`。

## Cloudflare Tunnel

生产环境复用已有的 `lumi` 命名 Tunnel，不创建第二条 Tunnel：

```powershell
cloudflared tunnel login
cloudflared tunnel route dns lumi lumiai.asia
cloudflared tunnel route dns lumi www.lumiai.asia
```

生产配置使用 `%ProgramData%\LumiCore\cloudflared\lumi.yml`，该目录仅允许管理员和系统账户访问。已有部署直接运行：

```powershell
.\scripts\start-tunnel.ps1
```

新部署可将 `cloudflare/config.example.yml` 复制到上述生产配置路径，再填写 Tunnel UUID 和凭据文件的绝对路径。凭据必须保存在网站目录之外；自定义配置可通过 `-ConfigPath` 指定。远程管理的 Tunnel 还需在 Cloudflare 中核对正式域名路由。

Tunnel 只指向官网端口 `80`，不要指向 LumiCore 后端端口，也不要把 Cloudflare 凭据提交到 Git。凭据轮换后需更新运行服务的配置，并重载连接器；不能仅替换磁盘文件就认为旧连接已退出。

## 官方服务入口

官网通过 `site-config.js` 集中配置官方服务链接：

- API 调用说明：<https://zhuan.huaczy.com/console/help>
- 充值控制台：<https://zhuan.huaczy.com/console/recharge>

OpenAI 兼容 SDK 的 Base URL 应填写 `https://zhuan.huaczy.com/v1`；`/api/v1` 仅用于平台登录、充值和其他业务接口。

## 修改 GitHub 入口

源码仓库、反馈链接和官方服务入口集中在 `site-config.js`。官网只提供源码与官方控制台链接，不公开未经完整验收的安装包。

## 许可证

站点代码采用 AGPL-3.0-only，与 LumiCore 主程序保持一致。Lumi、LumiCore 名称及视觉标识归浙江灵序科技有限公司所有。
