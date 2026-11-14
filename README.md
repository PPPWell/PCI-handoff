# 中意公馆网站交接

这份仓库用于从零部署中意公馆网站。它包含中文、意大利语和英语页面、内容和图片、登录与领券接口、商家核销及平台管理后台。数据库迁移位于 `supabase/migrations/`，环境变量清单位于 `.env.example`。

新部署从空数据库开始。现有顾客账号、优惠券、核销记录、商家权限、正式域名和服务密钥需要另行交接。下面的步骤使用接手方自己的 GitHub、Supabase 和 Vercel 账号，以及一个独立的网址。

## 1. 取得代码并在本机预览

在 GitHub 点击 **Fork**，将仓库复制到你自己的账号。若要在私有仓库维护，从本仓库克隆代码，再推送到自己名下一个空的私有仓库。后续在 Vercel 导入你自己名下的仓库。

使用 Node.js 22 或更新版本及 pnpm 11.22.0。在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:3000/zh/。本地预览可以直接浏览公开页面。登录、领券和核销需要以下服务配置。

## 2. 新建 Supabase 并初始化数据库

1. 在 Supabase Dashboard 创建一个新项目，记下项目的 **Project Ref**。准备 Supabase CLI 和新项目的数据库密码。
2. 在仓库根目录执行以下命令，把 `YOUR_NEW_PROJECT_REF` 换成新项目的 Project Ref。确认预演列出的迁移指向你的新项目，再执行最后一条命令。

   ```sh
   supabase login
   supabase link --project-ref YOUR_NEW_PROJECT_REF
   supabase db push --dry-run
   supabase db push
   ```

3. 在 Dashboard 取出新项目的 **Project URL**、以 `sb_publishable_` 开头的 **Publishable key** 和以 `sb_secret_` 开头的 **Secret key**。它们对应下节的三个变量。
4. 在 **Authentication → Email Templates** 把 **Magic Link** 邮件正文替换为 `supabase/templates/sign-in.html`，保留模板里的 `{{ .Token }}`。将邮件验证码设为 **6 位、600 秒有效期**。拿到 Vercel 测试网址后，在 **Authentication → URL Configuration** 填入测试网址作为 Site URL，并按需添加允许的重定向地址。
5. 配置 Supabase Auth 的自定义 SMTP，例如 Resend SMTP。Supabase 默认邮件只发给项目团队成员，适合先用团队邮箱试收。顾客和店员要用自己的邮箱收验证码时，需要配置自定义 SMTP。

参考 [Supabase CLI 部署迁移](https://supabase.com/docs/guides/local-development/cli-workflows) 和 [Supabase Auth 自定义 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。

## 3. 在 Vercel 部署

在 Vercel 选择 **Add New → Project**，导入自己名下的 GitHub 仓库。框架选 **Next.js**，根目录保持仓库根目录，构建命令为 `pnpm build`。先用新项目分配的 `.vercel.app` 地址验收。

在项目的 **Settings → Environment Variables** 填写以下变量。若先完成了首次部署，补齐变量后重新部署；要在 Vercel Preview 环境测试时，也要给该环境配置对应变量。

| 变量 | 填什么 |
| --- | --- |
| `CONTENT_MODE` | `published`，用实际发布模式验收。 |
| `SITE_ORIGIN` | 新网站完整的 HTTPS 源地址，例如 `https://your-project.vercel.app`，只含协议和主机名。 |
| `SUPABASE_URL` | 新 Supabase 项目的 Project URL。 |
| `SUPABASE_PUBLISHABLE_KEY` | 同一项目的 Publishable key。 |
| `SUPABASE_SECRET_KEY` | 同一项目的 Secret key，仅在服务端使用。 |
| `AUTH_EMAIL_ENABLED` | `true`，开启邮件验证码登录。 |
| `VOUCHER_ENCRYPTION_KEY_ID` | 新站使用 `primary`。 |
| `VOUCHER_ENCRYPTION_KEY` | 在自己电脑运行 `openssl rand -hex 32` 生成的 64 位十六进制字符串。 |
| `CRON_SECRET` | 再独立运行一次 `openssl rand -hex 32`，用于保护 Vercel 定时任务。 |

真实密钥填在 Vercel 设置或被 Git 忽略的本机 `.env.local`。`.env.example` 有其他可选项，包括 Resend 领券通知、R2 图片、PostHog、预付券与商家报表。邮件验证码使用 Supabase Auth 的 SMTP 配置，领券通知是另一项独立开关。`vercel.json` 包含券维护和到期提醒两个定时任务，启用前确认本项目连接的是预期数据库。Vercel Hobby 仅供个人非商业用途。

## 4. 开通管理员、商家和优惠活动

1. 在测试网站打开 `/zh/account/`，用预定的管理员邮箱完成一次验证码登录。
2. 在**新 Supabase 项目**的 **SQL Editor** 运行下面的 SQL。把示例邮箱换成刚完成登录的邮箱。角色授予已验证的账号，执行后应返回该用户的 ID。

   ```sql
   insert into pci_private.platform_members (user_id, role)
   select id, 'admin'
   from auth.users
   where lower(email) = lower('admin@example.com')
     and email_confirmed_at is not null
   on conflict (user_id) do update set role = excluded.role
   returning user_id;
   ```

3. 用这个账号访问 `/zh/account/admin/`。从页面列出的套餐开通测试优惠活动，填入店主邮箱。店主使用该邮箱从 `/it/merchant/login/` 登录，确认能进入商家端。用另一个邮箱测试顾客领券，再用商家端测试扫码或短码核销。

## 5. 验收与切换

上线前在测试网址逐项确认：

- `/zh/`、`/it/`、`/en/` 能打开，页面的图片和字体正常。
- 顾客和店主分别收到验证码，顾客能领券并打开券页面，店主能核销，同一张券重复提交不会重复核销。
- 管理员能查看和维护活动，普通顾客无法访问管理后台。
- 如启用邮件提醒，核对 Vercel 定时任务、邮件发件人和数据库指向。

如果要沿用正式域名，验收后由域名管理员安排切换，同时更新 Vercel 的 `SITE_ORIGIN` 和 Supabase Auth 的 Site URL。若还要保留现有账号和券记录，应先另行交接生产 Supabase 项目或迁移数据，并通过安全渠道交接原券加密密钥、密钥 ID 和旧密钥映射。公开仓库只存可发布文件。

## 常用位置

| 路径 | 用途 |
| --- | --- |
| `src/` | 页面、商家端、后台和服务端接口 |
| `content/` | 三语内容、商家及优惠活动资料 |
| `public/` | 网站图片、字体、安装和离线资源，部分资源的许可资料在其中 |
| `docs/design-system/tokens.json` | 构建样式及邮件模板的设计参数 |
| `supabase/migrations/` | 数据库结构、权限和业务函数 |
| `supabase/templates/sign-in.html` | 验证码邮件模板 |
| `.env.example` | 环境变量与功能开关 |
