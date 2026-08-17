# LumiOS Website

LumiOS 官方网站的独立静态工程。它与 LumiOS 桌面客户端、后端、记忆数据库和用户密钥完全分离。

## 本机运行

```powershell
cd D:\LumiOS-Website
npm run check
npm start
```

网站只监听 `127.0.0.1:4173`，健康检查位于 `http://127.0.0.1:4173/healthz`。

## Cloudflare Tunnel

生产环境使用命名 Tunnel，不使用随机域名的 Quick Tunnel：

```powershell
cloudflared tunnel login
cloudflared tunnel create lumi-website
cloudflared tunnel route dns lumi-website lumiai.asia
cloudflared tunnel route dns lumi-website www.lumiai.asia
```

复制 `cloudflare/config.example.yml` 到 `%USERPROFILE%\.cloudflared\config.yml`，填写 Tunnel UUID 和凭据路径后运行：

```powershell
.\scripts\start-tunnel.ps1
```

Tunnel 只能指向官网端口 `4173`，不要指向 LumiOS 后端端口，也不要把 Cloudflare 凭据提交到 Git。

## 修改 GitHub 入口

仓库、下载和反馈链接集中在 `site-config.js`。旧仓库迁移后 GitHub 会重定向普通仓库链接；完成迁移后仍建议更新为最终的规范地址。

## 许可证

站点代码采用 AGPL-3.0-only，与 LumiOS 主程序保持一致。Lumi、LumiOS 名称及视觉标识归浙江灵序科技有限公司所有。
