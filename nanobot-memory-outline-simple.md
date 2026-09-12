# Nanobot 记忆系统 · 文章提纲

---

## 一、背景

- 上一篇讲了 ReAct 循环：LLM + 工具 + 消息列表
- 遗留问题：对话越来越长，messages 列表撑爆上下文怎么办？
- 本篇聚焦 Nanobot 的记忆系统，看它如何解决这个问题

---

## 二、从一个问题出发

- 具体场景：用户对话 100 轮，token 超出上下文窗口
- 朴素方案的缺点：截断（丢信息）、全量存储（太贵）
- Nanobot 的思路：分层压缩，轻重分离

---

## 三、架构一览：四个文件，三个类

- 四个持久化文件：MEMORY.md、history.jsonl、SOUL.md、USER.md
- 三个核心类：MemoryStore（I/O）、Consolidator（实时压缩）、Dream（后台整合）
- 一张图说清楚分工：谁读、谁写、谁触发

---

## 四、Consolidator：实时压缩

- 触发条件：token 数超预算（`context_window_tokens - max_completion_tokens - 1024`）
- 做什么：把旧会话消息压缩成摘要，追加到 history.jsonl
- 关键细节：`pick_consolidation_boundary()` 如何选切割点
- 不做什么：不动 MEMORY.md，不更新长期记忆

---

## 五、Dream：后台整合

- 触发方式：Cron 定期运行，不阻塞主流程
- 两阶段：Phase 1 分析 history.jsonl → Phase 2 用 AgentRunner + 文件工具编辑 MEMORY.md
- 唯一能改 MEMORY.md 的机制
- 特色：git blame 年龄标注，给陈旧内容打 `← Nd` 标记

---

## 六、设计取舍

- 为什么用文件存储而不是向量库？
- Consolidator + Dream 分层的好处：实时低成本 vs 后台高质量
- 存在的问题：Dream 非实时，MEMORY.md 有延迟；文件并发写风险

---

## 七、总结 + Takeaway

- Consolidator = 工作记忆的 GC（垃圾回收）
- Dream = 睡眠期间的记忆巩固（对应人类睡眠中的记忆整合）
- 核心 Takeaway：
  1. 记忆系统的本质是上下文管理，不是数据库
  2. 轻重分离：实时路径不做重计算，重计算放后台
  3. Nanobot 选文件 + git，简单可审计，但不适合高并发场景
