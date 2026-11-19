# PTE Coach

60 天 PTE Academic 备考训练站，每天 4 小时，纯静态 HTML，部署在 GitHub Pages。

## 页面
| 页面 | 作用 |
|---|---|
| `index.html` 今日 | 当天 4 小时任务表、教练寄语、进度、**生成每日汇报** |
| `read.html` 阅读学词 | 原创学术短文，当天新词高亮；任何单词都可点开看释义、听发音、听例句、跟读；读完做理解题和填空题 |
| `words.html` 生词本 | 收藏的生词、记忆阶段、遗忘曲线、每日记忆报告 |
| `review.html` 记忆复习 | 间隔重复（1/2/4/7/15/30/60 天），按记忆阶段轮换 5 种题型：拼写 / 听音辨义 / 例句填空 / 例句听写 / 看词选义 |
| 任意页面 | 把单词拖到右下角生词本按钮（手机长按后拖）即可收藏，词表外的词自动查英文释义 |
| `drill.html` 题型训练 | WFD 听写、RS 复述、RA 朗读（浏览器语音识别）、SWT/WE 计时写作 |
| `guide.html` 题型指南 | 22 种题型、做法、模板 |
| `log.html` 复盘 | 教练每天的总结与调整 |

## 每日流程
1. 按首页任务练习，网站自动统计数据，存在浏览器 localStorage 里
2. 练完后在首页底部点“生成汇报”，复制发给 Claude
3. Claude 写当天复盘（`data/log.json`），生成第二天的任务（`data/days/dayNN.json`）和文章（`data/articles/dNN.json`），然后推送更新

## 数据格式（教练维护）
- `data/words.json`：1040 词（`w` 单词、`p` 音标、`t` 释义、`e`/`c` 例句及译文、`s` A=AWL / B=话题词）
- `data/days/index.json`：`current` 当前天数，`days` 已发布的天数
- `data/days/dayNN.json`：`newWords` 词表下标区间 [start, end)，`articles` 文章文件名，`tasks`、`drills`、`writing`
- `data/articles/dNN.json`：文章段落里用 `{{显示形式|原形}}` 标记目标词，`questions` 为单选题

## 本地预览
```
python -m http.server 8650
```
