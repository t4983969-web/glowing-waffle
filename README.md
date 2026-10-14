# 心语手机（个人版）

一个可以自己换 API、自己写角色和世界书、带小手机界面的聊天 App。纯前端实现，用 Capacitor 打包成 Android APK。

## 功能

- **小手机界面**：主屏幕、信息、通讯录、世界书、设置，带状态栏和返回导航
- **OpenAI 格式接口**：在「设置」里直接填 Base URL、API Key、模型名，不用改代码
- **角色档案**：名字、头像（emoji 或图片）、开场白，以及性别、年龄、MBTI、职业、外貌、性格、说话风格、经历、与用户的关系等字段
- **世界书**：
  - 常驻条目：每次都注入
  - 关键词条目：关键词出现在最近对话里才注入
  - 可设为全局，也可只属于某个角色
- **记忆**：保留最近 N 条原始消息，较早的内容自动压缩成摘要
- **主动消息**：聊天页点 📩，让角色主动发一条消息
- **备份与导入**：所有数据是一段 JSON，可以复制保存，也可以在另一台设备导入

## 目录结构

```
mengxin-app/
├── www/
│   ├── index.html     # 小手机界面外壳和样式
│   └── app.js         # 全部逻辑：存储、对话、世界书、页面
├── capacitor.config.json
├── package.json
└── .github/workflows/build-apk.yml   # 云端自动打包 APK
```

## 方案 A：不用电脑装环境，直接用 GitHub 打包 APK（推荐）

1. 在 GitHub 新建一个仓库，把 `mengxin-app/` 整个目录推上去（`main` 分支）。
2. 打开仓库的 **Actions** 页，选 **Build APK**，点 **Run workflow**。
3. 等几分钟跑完，在本次运行的 **Artifacts** 里下载 `app-debug.zip`，解压得到 `app-debug.apk`。
4. 把 APK 传到安卓手机，允许"安装未知来源应用"后安装。

以后改了 `www/` 里的代码，推送到 main 就会自动重新打包。

## 方案 B：本地打包

需要 Node.js 18+、JDK 17、Android Studio（含 Android SDK）。

```bash
cd mengxin-app
npm install
npm run setup          # 第一次生成 android/ 目录
npx cap sync android   # 每次改完 www/ 后执行
```

然后用 Android Studio 打开 `android/` 目录，点 Build → Build APK(s)；或者命令行：

```bash
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 第一次使用

1. 打开 App → 设置 → 填写接口信息：
   - DeepSeek：`https://api.deepseek.com/v1`，模型 `deepseek-chat`
   - OpenAI：`https://api.openai.com/v1`，模型 `gpt-4o-mini`
   - 其他 OpenAI 兼容服务：填它们给的 Base URL 和模型名
2. 点「测试连接」，显示"连接成功"即可。
3. 通讯录 → + 新建，写你的角色。
4. 世界书 → + 新建，写背景设定。
5. 信息里找到角色开始聊天。

## 注意事项

- **API Key 保存在手机本地**，不会上传到其他服务器。但 APK 是个人自用的，不要把带有你 Key 的备份文件发给别人。
- **CORS**：打包成 APK 后，`capacitor.config.json` 里开启的 CapacitorHttp 会走原生网络，不受浏览器跨域限制。直接在电脑浏览器里打开 `www/index.html` 时，有些接口可能会被跨域拦截。
- **Temperature**：部分模型（比如某些推理模型）不支持自定义这个参数，设置里清空即可。
- **版本号与签名**：当前是 debug 包，个人安装没问题。如果要上架应用商店，需要另外生成正式签名。
- **合规**：如果把它开放给其他人使用，需要注意内容审核和未成年人保护。

## 后续可以加的功能

- 朋友圈（让角色根据人设定时发动态）
- 流式输出（逐字显示回复）
- 图片头像和聊天背景的本地持久化优化
- 长期记忆换成向量检索
