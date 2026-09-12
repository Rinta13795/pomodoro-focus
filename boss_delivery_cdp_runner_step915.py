#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOSS 直聘自动化极速投递引擎（校招/应届/实习专版 - 严格先图后文）
- 目标定位：100% 聚焦【校招/应届生/实习/在校生】岗位（experience=108 过滤 + 排除社招高年限）
- 投递流程（严格先图后文）：
  1. 点击岗位“立即沟通”建立会话
  2. 自动进入聊天控制台，对该沟通对象【第一步：先发送简历图片】
  3. 紧接着【第二步：发送定制交流语】
- 打招呼文案：能立即到岗，一周5天，软件工程专业本科生，有Agent开发经验，觉得和贵公司岗位匹配，希望进一步交流。
- 简历图片：/Users/chenyuhang/Desktop/pomodoro-focus/resume1_page-1.png
- 简历PDF：/Users/chenyuhang/Downloads/简历1.pdf
- 严格锁定：AI Agent、智能体、RAG、大模型应用、AI工作流、AI全栈（纯算法岗位全面排除）
- 目标：累计投递 650 份
"""

import sys
import os
import json
import time
import random
import urllib.parse
import urllib.request
import websocket
from datetime import datetime

sys.stdout.reconfigure(line_buffering=True)

LOG_FILE = "/Users/chenyuhang/Desktop/pomodoro-focus/boss_delivery_log.json"
REPORT_FILE = "/Users/chenyuhang/Desktop/pomodoro-focus/boss_delivery_report.md"
ANTI_DETECT_PATH = "/Users/chenyuhang/Desktop/get_jobs/src/main/resources/anti-detection.js"
RESUME_IMAGE_PATH = "/Users/chenyuhang/Desktop/pomodoro-focus/resume1_page-1.png"

TARGET_COUNT = 650  # 目标累积投递 650 个岗位

# 用户指定的最新精准打招呼文案
CUSTOM_GREETING = "能立即到岗，一周5天，软件工程专业本科生，有Agent开发经验，觉得和贵公司岗位匹配，希望进一步交流。"

CITIES = [
    {"name": "北京", "code": "101010100"},
    {"name": "上海", "code": "101020100"},
    {"name": "深圳", "code": "101280600"},
    {"name": "广州", "code": "101280101"},
    {"name": "杭州", "code": "101210100"},
    {"name": "南京", "code": "101190100"},
    {"name": "苏州", "code": "101190400"},
    {"name": "厦门", "code": "101230200"},
    {"name": "成都", "code": "101270100"},
    {"name": "武汉", "code": "101200100"},
    {"name": "全国", "code": "100010000"}
]

# 校招专版关键词
KEYWORDS = [
    "AI Agent 校招",
    "智能体 校招",
    "大模型应用 校招",
    "AI全栈 校招",
    "RAG 校招",
    "AI Agent 实习",
    "智能体 实习",
    "大模型应用 实习",
    "提示词工程 校招",
    "大模型工作流 校招",
    "AI应用 实习",
    "AI Agent",
    "智能体",
    "RAG",
    "大模型应用",
    "AI全栈",
    "Agent开发",
    "LLM应用",
    "LangChain",
    "Dify",
    "Coze",
    "知识库RAG"
]

def load_records():
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"history": [], "communicated_keys": []}
    return {"history": [], "communicated_keys": []}

def save_records(records):
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

def update_report(records, current_status="执行中"):
    history = records.get("history", [])
    count = len(history)
    
    content = f"""# BOSS 直聘投递执行实时报告（校招/应届/实习专版 - 严格先图后文）

- **更新时间**：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
- **当前状态**：{current_status}
- **已成功沟通岗位数**：{count} / {TARGET_COUNT}
- **投递模式**：【校招 / 应届生 / 实习生专投】（严格先图后文）
- **打招呼文案**：“{CUSTOM_GREETING}”
- **简历文件**：[`简历1.pdf`](file:///Users/chenyuhang/Downloads/简历1.pdf) 及高清渲染图

## 最近完成的投递明细

| 序号 | 职位名称 | 公司名称 | 城市 | 薪资 | 投递时间 |
| :--- | :--- | :--- | :--- | :--- | :--- |
"""
    for item in reversed(history[-100:]):
        content += f"| {item.get('index', '')} | {item.get('job_name', '')} | {item.get('company', '')} | {item.get('city', '')} | {item.get('salary', '')} | {item.get('time', '')} |\n"

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(content)

class CDPClient:
    def __init__(self):
        self.ws = None
        self.msg_id = 0
        self.connect()

    def connect(self):
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass

        res = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
        boss_tabs = [t for t in res if "zhipin" in t.get("url", "")]
        if not boss_tabs:
            req = urllib.request.Request("http://127.0.0.1:9222/json/new?https://www.zhipin.com/web/geek/job?query=AI%20Agent&city=101010100&experience=108", method="PUT")
            boss_tab = json.loads(urllib.request.urlopen(req).read())
        else:
            boss_tab = boss_tabs[0]

        self.ws_url = boss_tab["webSocketDebuggerUrl"]
        self.ws = websocket.create_connection(self.ws_url, timeout=10)
        self.call("Page.enable")
        self.call("Runtime.enable")
        self.call("DOM.enable")

    def call(self, method, params=None):
        self.msg_id += 1
        payload = {"id": self.msg_id, "method": method}
        if params:
            payload["params"] = params
        try:
            self.ws.send(json.dumps(payload))
            while True:
                resp = json.loads(self.ws.recv())
                if resp.get("id") == self.msg_id:
                    return resp.get("result", {})
        except Exception as e:
            self.connect()
            self.msg_id += 1
            payload["id"] = self.msg_id
            self.ws.send(json.dumps(payload))
            resp = json.loads(self.ws.recv())
            return resp.get("result", {})

    def evaluate(self, expression):
        res = self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        val = res.get("result", {}).get("value")
        return val

    def navigate(self, url):
        self.call("Page.navigate", {"url": url})
        time.sleep(2)
        for _ in range(8):
            cnt = self.evaluate('(() => document.querySelectorAll("li.job-card-box").length)()') or 0
            if cnt > 0:
                break
            time.sleep(1)

    def send_image_first_then_text_in_chat(self):
        """严格顺序：1. 先发简历图片 -> 2. 再发交流语"""
        try:
            self.call("Page.navigate", {"url": "https://www.zhipin.com/web/geek/chat"})
            time.sleep(2.5)

            # 点击最新联系人
            self.evaluate('''(() => {
                const topFriend = document.querySelector('.friend-content');
                if (topFriend) topFriend.click();
            })()''')
            time.sleep(1.5)

            # 步骤 1：先发简历图片
            doc = self.call("DOM.getDocument")
            node = self.call("DOM.querySelector", {
                "nodeId": doc.get("root", {}).get("nodeId", 1),
                "selector": '.btn-sendimg input[type="file"]'
            })

            if node and node.get("nodeId") and os.path.exists(RESUME_IMAGE_PATH):
                self.call("DOM.setFileInputFiles", {
                    "files": [RESUME_IMAGE_PATH],
                    "nodeId": node["nodeId"]
                })
                time.sleep(1.5)

                self.evaluate('''(() => {
                    const btns = Array.from(document.querySelectorAll('.btn-sure, .sure-btn, .btn-primary, .btn-sure-v2'));
                    const target = btns.find(b => b.innerText.includes('确定') || b.innerText.includes('发送') || b.innerText.includes('确认'));
                    if (target) target.click();
                })()''')
                time.sleep(1.8)

            # 步骤 2：后发交流语文本
            self.evaluate(f'''(() => {{
                const input = document.querySelector('#chat-input, .chat-input');
                if (input) {{
                    input.innerText = {json.dumps(CUSTOM_GREETING)};
                    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                }}
                setTimeout(() => {{
                    const sendBtn = document.querySelector('.btn-send, button[type="send"]');
                    if (sendBtn) sendBtn.click();
                }}, 500);
            }})()''')
            time.sleep(1.8)
            return True
        except Exception as e:
            print(f"[WARN] 聊天中先图后文发送异常: {e}", flush=True)
        return False

def is_target_job(job_name, company, tags_text, desc_text=""):
    """多维度规则过滤（严格排除纯算法、严格锁定校招/应届/实习、严格锁定 Agent / AI应用 / RAG）"""
    job_lower = job_name.lower()
    full_text = f"{job_name} {tags_text} {desc_text}".lower()
    
    # 1. 负向通用排除关键词
    general_exclude = [
        "摄影", "美学标注", "图片标注", "语音标注", "数据标注", "标注员", "标注专家", "审核员",
        "纯销售", "电话销售", "电销", "地推", "客服", "前台", "行政", "文员", "文秘",
        "保洁", "保安", "司机", "厨师", "餐饮", "主播", "带货", "剪辑师",
        "短视频运营", "电商运营", "跨境电商", "纯运营",
        "3-5年", "5-10年", "10年以上", "5年以上", "十年以上", "总监", "部门经理", "副总裁", "vp"
    ]
    for kw in general_exclude:
        if kw in job_lower:
            return False, f"排除通用非匹配词: {kw}"
        if kw in ["3-5年", "5-10年", "10年以上", "5年以上"] and kw in tags_text:
            return False, f"经验要求过高（非校招）: {kw}"
        if kw in ["摄影", "数据标注", "销售", "行政", "客服"] and kw in company.lower():
            return False, f"公司类型排除: {kw}"

    # 2. 社招高年限硬排除（确保校招/实习/应届/在校）
    if any(k in tags_text for k in ["3-5年", "5-10年", "10年以上", "5年以上"]):
        return False, "排除社招高年限岗位"

    # 3. 算法专项排除规则（纯算法不投，除非具体涉及 Agent / 应用 / RAG）
    has_focus_keyword = any(k in job_lower for k in ["agent", "智能体", "rag", "应用", "全栈", "工作流", "提示词", "prompt", "dify", "coze", "知识库"])
    
    algorithm_keywords = [
        "算法工程师", "算法实习生", "算法专家", "算法研究员", "推荐算法", "搜索算法", "广告算法",
        "cv算法", "视觉算法", "图像算法", "感知算法", "控制算法", "规划算法", "自动驾驶算法",
        "音频算法", "语音算法", "信号处理", "nlp算法", "深度学习算法", "机器学习算法", "算法开发"
    ]
    for ak in algorithm_keywords:
        if ak in job_lower and not has_focus_keyword:
            return False, f"排除纯算法岗位: {ak}"
            
    if "算法" in job_lower and not has_focus_keyword:
        return False, "排除纯算法岗位（未明确标注Agent/应用/RAG）"

    # 4. 正向目标核心词
    focus_keywords = [
        "agent", "智能体", "rag", "大模型应用", "ai应用", "llm应用", "提示词", "prompt",
        "工作流", "workflow", "langchain", "dify", "coze", "微调", "embedding", "知识库",
        "ai全栈", "aigc开发", "大模型全栈", "大模型开发"
    ]
    
    matched = [kw for kw in focus_keywords if kw in job_lower or (kw in full_text and any(k in job_lower for k in ["agent", "智能体", "rag", "应用", "全栈", "工作流", "实习", "开发", "工程师", "校招", "应届"]))]
    if not matched:
        return False, "未匹配到 Agent/AI应用/RAG 等目标技术方向"
        
    return True, f"匹配: {', '.join(matched[:3])}"

def run_delivery():
    records = load_records()
    communicated_set = set(records.get("communicated_keys", []))
    history = records.get("history", [])
    
    success_count = len(history)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 启动校招/应届专版投递引擎（严格先图后文） | 累计已沟通: {success_count} / {TARGET_COUNT}", flush=True)
    
    cdp = CDPClient()

    for city in CITIES:
        city_name = city["name"]
        city_code = city["code"]
        
        for keyword in KEYWORDS:
            if success_count >= TARGET_COUNT:
                print(f"[SUCCESS] 已达到目标投递数 {TARGET_COUNT}！任务圆满完成。", flush=True)
                update_report(records, current_status=f"已达成目标 {TARGET_COUNT} 个岗位")
                return

            # 加上 experience=108 参数，严格定向在校/应届/校招/实习
            search_url = f"https://www.zhipin.com/web/geek/job?query={urllib.parse.quote(keyword)}&city={city_code}&experience=108"
            print(f"\n==========================================", flush=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 切换城市: 【{city_name}】 | 关键词: 【{keyword}】 (校招/应届/实习)", flush=True)
            print(f"==========================================", flush=True)
            
            cdp.navigate(search_url)

            # 滚动加载
            for _ in range(4):
                cdp.evaluate('''(() => {
                    const list = document.querySelector('.job-list-box, .page-jobs-main, ul.job-list-box');
                    if (list) list.scrollTop = list.scrollHeight;
                    window.scrollTo(0, document.body.scrollHeight);
                })()''')
                time.sleep(1.2)

            cards_count = cdp.evaluate('(() => document.querySelectorAll("li.job-card-box").length)()') or 0
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 当前页面解析出 {cards_count} 个校招岗位卡片", flush=True)
            if cards_count == 0:
                continue

            card_idx = 0
            while card_idx < cards_count:
                if success_count >= TARGET_COUNT:
                    break

                sec_check = cdp.evaluate('''(() => {
                    const bodyText = document.body ? document.body.innerText : '';
                    const hasVerify = bodyText.includes('安全验证') || bodyText.includes('请完成下方验证') || bodyText.includes('异常访问');
                    const isQuota = bodyText.includes('今日沟通人数已达上限') || bodyText.includes('今日沟通已达上限') || bodyText.includes('达到今日沟通上限');
                    return { hasVerify, isQuota };
                })()''') or {}

                if sec_check.get("hasVerify"):
                    print(f"\n[SECURITY ALERT] 检测到安全拦截！立即暂停！", flush=True)
                    update_report(records, current_status="暂停：检测到安全验证")
                    return

                if sec_check.get("isQuota"):
                    print(f"\n[QUOTA REACHED] 今日平台打招呼/沟通次数已达上限！优雅停止。", flush=True)
                    update_report(records, current_status="已达今日平台沟通上限")
                    return

                card_info = cdp.evaluate(f'''(() => {{
                    const cards = document.querySelectorAll('li.job-card-box');
                    const c = cards[{card_idx}];
                    if (!c) return null;
                    const jobName = c.querySelector('.job-name')?.innerText || '';
                    const salary = c.querySelector('.salary, .job-salary')?.innerText || '';
                    const company = c.querySelector('.company-name a, .boss-name')?.innerText || '';
                    const location = c.querySelector('.company-location')?.innerText || '';
                    const tags = Array.from(c.querySelectorAll('.tag-list li')).map(t => t.innerText).join(' ');
                    const link = c.querySelector('a.job-card-left, a.job-name')?.getAttribute('href') || '';
                    return {{ jobName, salary, company, location, tags, link }};
                }})()''')

                card_idx += 1
                if not card_info or not card_info.get("jobName"):
                    continue

                job_name = card_info["jobName"].strip()
                company = card_info["company"].strip()
                salary = card_info["salary"].strip()
                location = card_info["location"].strip() or city_name
                tags = card_info["tags"].strip()
                link = card_info["link"].strip()

                dedup_key = f"{company}___{job_name}"
                if dedup_key in communicated_set or (link and link in communicated_set):
                    continue

                matched, reason = is_target_job(job_name, company, tags)
                if not matched:
                    continue

                # 点击卡片
                cdp.evaluate(f'''(() => {{
                    const cards = document.querySelectorAll('li.job-card-box');
                    if (cards[{card_idx - 1}]) {{
                        cards[{card_idx - 1}].scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                        cards[{card_idx - 1}].click();
                    }}
                }})()''')
                time.sleep(random.uniform(1.5, 2.0))

                detail_info = cdp.evaluate('''(() => {
                    const btn = document.querySelector('a.op-btn.op-btn-chat');
                    const desc = document.querySelector('.job-detail-box, .job-detail-section')?.innerText || '';
                    return {
                        btnExists: !!btn,
                        btnText: btn ? btn.innerText.trim() : '',
                        desc: desc.slice(0, 500)
                    };
                })()''') or {}

                if not detail_info.get("btnExists"):
                    continue

                btn_text = detail_info.get("btnText", "")
                if "继续沟通" in btn_text or "已沟通" in btn_text:
                    communicated_set.add(dedup_key)
                    if link:
                        communicated_set.add(link)
                    continue

                if "立即沟通" not in btn_text:
                    continue

                jd_matched, jd_reason = is_target_job(job_name, company, tags, detail_info.get("desc", ""))
                if not jd_matched:
                    continue

                print(f"[{datetime.now().strftime('%H:%M:%S')}] 正在发起校招沟通 -> 【{company}】 {job_name} ({location} | {salary})", flush=True)

                # 1. 点击“立即沟通”建立会话
                cdp.evaluate('''(() => {
                    const btn = document.querySelector('a.op-btn.op-btn-chat');
                    if (btn) btn.click();
                })()''')
                time.sleep(random.uniform(2.0, 2.5))

                # 2. 严格顺序：进入聊天窗口，先发图片，再发招呼语
                cdp.send_image_first_then_text_in_chat()

                success_count += 1
                communicated_set.add(dedup_key)
                if link:
                    communicated_set.add(link)

                entry = {
                    "index": success_count,
                    "job_name": job_name,
                    "company": company,
                    "city": location,
                    "salary": salary,
                    "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                history.append(entry)
                records["history"] = history
                records["communicated_keys"] = list(communicated_set)
                save_records(records)

                print(f"  >>> [进度: {success_count}/{TARGET_COUNT}] 成功校招投递 (严格先图后文): 【{company}】{job_name} ({location})", flush=True)

                if success_count % 10 == 0:
                    print(f"\n---------------------------------------------", flush=True)
                    print(f"★ 阶段达成: 已累计成功沟通并发送简历 {success_count} 个岗位！", flush=True)
                    print(f"---------------------------------------------\n", flush=True)
                    update_report(records, current_status=f"已完成 {success_count} 个岗位，继续执行中")

                # 返回岗位搜索列表继续投递
                cdp.navigate(search_url)
                time.sleep(random.uniform(2.0, 3.5))

    update_report(records, current_status="已完成执行")
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 自动化投递任务结束！累计沟通数: {success_count}", flush=True)

if __name__ == "__main__":
    run_delivery()
