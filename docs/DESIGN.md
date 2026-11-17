# 设计说明：为什么 v2 这样做

v1 的问题不是功能少，而是**只有惩罚没有反馈**：
- 番茄结束后界面悄悄回到"未开始"，没有任何历史记录；
- 主界面常驻一个红色 🆘 按钮；
- "定时计划"整套功能其实没有运行。

v2 围绕学生的一天来设计，形成一个循环：

```
今日计划（这一轮做什么） → 专注 → 一句话复盘 → 看到进度（目标环 / 热力图 / 连续天数） → 明天继续
```

## 研究结论与对应设计

| 结论 | 设计 | 来源 |
|---|---|---|
| 记录并看见自己的进度能明显提高达成率 | 热力图、今日目标环、科目统计 | [Harkin et al. 2016](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) |
| 进步原则：有意义的小进展是最强的动力，挫折的影响大于进展 | 每个番茄结束给一张小结卡；中途停止也按实际分钟计入，用灰色而不是红色表示 | [Amabile & Kramer](https://www.amanet.org/articles/the-worth-of-small-wins-teresa-amabile-and-steven-kramer-on-the-progress-principle/) |
| 目标梯度：越接近目标越努力 | 目标环；提示"再专注 N 分钟达成今日目标" | [Goal-gradient](https://www.renascence.io/behavioral-biases/goal-gradient-effect) |
| 执行意图（"在 X 时做 Y"）有效，但效果中等 | 今日计划，开始前选择"这一轮做什么" | [Implementation intentions](https://www.thebehavioralscientist.com/glossary/implementation-intentions) |
| 习惯形成的中位数约 66 天，偶尔漏一天不影响 | 连续天数允许休息日，不因一天中断就清零 | [Lally 2010](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit) |
| 连续记录中断后，人的投入会下降，提供修复机会可以缓解 | 宽容规则；中断后的文案是"欢迎回来"，不是"你失去了 N 天" | [Silverman & Barasch 2023](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions) |
| GitHub 去掉连续计数后，周末"凑数"行为减少 | 热力图本身是主角，连续天数只做小徽章 | [Moldon et al. 2020](https://arxiv.org/abs/2006.02371) |
| 事先约定的外在奖励会削弱内在动机，提供信息的反馈会增强 | 不做金币、商店、排行榜 | [Deci, Koestner & Ryan 1999](https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf)、[Mekler et al. 2017](https://glassmanlab.seas.harvard.edu/annotated_works/mekler17.pdf) |
| 游戏化做过头会引发焦虑和刷分 | 不做积分；所有提醒只给正向信息 | [Hadi Mogavi et al. 2022](https://arxiv.org/pdf/2203.16175) |
| 定时休息比自主休息更少疲劳 | 保留强制休息，休息时长可调 | [Biwer et al. 2023](https://pubmed.ncbi.nlm.nih.gov/36859717/) |

**明确不做：**
- 积分、金币、排行榜；
- 用"树死了 / 你将失去 X 天"之类的损失框架；
- 随机掉落奖励；
- 监控屏幕来给"专注质量"打分。

## 数据

所有数据只保存在本机，路径为：
- macOS：`~/Library/Application Support/pomodoro-focus/`
- Windows：`%APPDATA%\pomodoro-focus\`

| 文件 | 内容 |
|---|---|
| `config.json` | 设置 |
| `history.json` | 每个工作阶段一条记录（完成的，或中途结束且已专注 ≥ 1 分钟的） |
| `planner.json` | 今日计划 |
| `session.json` | 进行中的会话，用于重启后恢复 |

格式见 [API.md](API.md)。

## 平台差异

| 能力 | macOS | Windows |
|---|---|---|
| 计时、统计、计划 | ✅ | ✅ |
| App 拦截 | ✅ 按 Info.plist 的进程名匹配 | ✅ 按 exe 名匹配（开始菜单快捷方式 + 常见中文应用别名） |
| 系统级网站屏蔽（hosts） | ✅ 每次开始专注输入一次管理员密码 | ✅ 每次开始专注确认一次 UAC |
| 浏览器内实时拦截 | Chrome / Safari 扩展 | Chrome / Edge 扩展 |
| App 图标 | ✅ | 显示首字母头像 |

**安全说明：**
- v1 会把 `/etc/hosts` 改成所有用户可写（646）。v2 改为 `root:admin 664`。
- Windows 上会给当前用户授予 hosts 的修改权限，这样结束专注时不用再弹一次 UAC。
