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

## Cloudflare Tunnel

生产环境复用已有的 `lumi` 命名 Tunnel，不创建第二条 Tunnel：

```powershell
cloudflared tunnel login
cloudflared tunnel route dns lumi lumiai.asia
cloudflared tunnel route dns lumi www.lumiai.asia
```

复制 `cloudflare/config.example.yml` 到 `%USERPROFILE%\.cloudflared\config.yml`，填写 Tunnel UUID 和凭据路径后运行：

```powershell
.\scripts\start-tunnel.ps1
```

Tunnel 只指向官网端口 `80`，不要指向 LumiCore 后端端口，也不要把 Cloudflare 凭据提交到 Git。

## 官方服务入口

官网通过 `site-config.js` 集中配置官方服务链接：

- API 调用说明：<https://zhuan.huaczy.com/console/help>
- 充值控制台：<https://zhuan.huaczy.com/console/recharge>

OpenAI 兼容 SDK 的 Base URL 应填写 `https://zhuan.huaczy.com/v1`；`/api/v1` 仅用于平台登录、充值和其他业务接口。

## 修改 GitHub 入口

源码仓库、反馈链接和官方服务入口集中在 `site-config.js`。官网只提供源码与官方控制台链接，不公开未经完整验收的安装包。

## 许可证

站点代码采用 AGPL-3.0-only，与 LumiCore 主程序保持一致。Lumi、LumiCore 名称及视觉标识归浙江灵序科技有限公司所有。
