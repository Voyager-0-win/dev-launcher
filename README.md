# DevLauncher

一个 Windows 优先的键盘驱动项目目录启动器。双击 `start.bat`，通过方向键浏览工作区，并用 VS Code 打开项目。

## 要求

- Windows 10/11
- Node.js 18 或更高版本
- VS Code 已安装
- 在终端中可使用 `code` 命令（或在 `config.json` 中修改 `openWithCodeCommand`）

## 启动

1. 解压整个文件夹。
2. 编辑根目录下的 `config.json`，将 `workspaces` 改成你的大工作目录。
3. 双击 `start.bat`。程序退出或启动失败时，窗口会停留并显示提示，不会立即闪退。

也可以在该目录执行：

```bash
npm start
```

## 按键

- `↑` / `↓`：切换选中项
- `Enter` 或 `→`：进入选中目录；在工作区列表中进入工作区
- `←`：返回上一级；在工作区根目录返回工作区列表
- `Space`：用 VS Code 打开选中的目录；如果当前目录没有子目录，则打开当前目录
- `Ctrl+C`：退出

## 配置示例

```json
{
  "workspaces": [
    "D:\\Code",
    "D:\\University",
    "D:\\Experiments"
  ],
  "showHiddenDirectories": false,
  "openWithCodeCommand": "code"
}
```

- `workspaces`：工作区根目录列表，只保留当前机器上存在的目录。
- `showHiddenDirectories`：是否显示名称以 `.` 开头的目录。
- `openWithCodeCommand`：启动 VS Code 的命令。通常使用 `code`。

## 说明

- 本版本不需要安装 npm 依赖。
- 程序只列出目录，不列出普通文件。
- 导航限制在选定工作区内部，不提供向工作区之外任意路径跳转的功能。
- 目前是 Node.js 源码版本。要获得无需安装 Node.js 的单文件 `.exe`，需要额外打包并在目标 Windows 环境验证。
