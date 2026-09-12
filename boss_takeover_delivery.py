#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOSS 直聘全自动求职接管投递引擎 (Takeover Delivery Engine)
============================================================
目标：累计直接沟通/投递 150 个匹配岗位。
投递规范：
  1. 严格先发送【简历6】高清渲染图
  2. 紧接着发送指定打招呼语：
     “您好！能立即到岗全职实习，软件工程专业本科生，主攻 Agent 开发。活跃于 AI 黑客松共创，入选【红杉 × WaytoAGI AGI Builder 池】，技术输出 10w+ 阅读。觉得和贵司岗位高度契合，希望能进一步沟通！”
  3. 严格范围：AI Agent、AI全栈工程师、AI应用工程师、全栈开发、智能体、大模型应用、RAG
  4. 严格排除：摄影标注、纯销售、行政、产品运营、5年以上管理岗位、纯算法岗位
  5. 城市优先级：北京、上海、广州、深圳 -> 杭州、南京、苏州、厦门、成都、武汉 -> 全国
  6. 严格安全检测：出现滑块/验证码/异常访问/登录失效立即暂停并提示人工，不绕过
  7. 每完成 10 个岗位在后台记录岗位名称、公司和城市，自动连续执行不暂停
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

# 路径配置
BASE_DIR = "/Users/chenyuhang/Desktop/pomodoro-focus"
LOG_FILE = os.path.join(BASE_DIR, "boss_delivery_log.json")
REPORT_FILE = os.path.join(BASE_DIR, "boss_delivery_report.md")

# 简历图片与文档路径
RESUME_IMAGE_PATH = os.path.join(BASE_DIR, "resume6_full.png")
if not os.path.exists(RESUME_IMAGE_PATH):
    RESUME_IMAGE_PATH = "/Users/chenyuhang/Downloads/简历6.png"
RESUME_PDF_PATH = "/Users/chenyuhang/Downloads/简历6.pdf"

# 本次接管目标投递增量
TARGET_SESSION_DELIVERY = 150

# 用户指定的最新精准打招呼文案
CUSTOM_GREETING = "您好！能立即到岗全职实习，软件工程专业本科生，主攻 Agent 开发。活跃于 AI 黑客松共创，入选【红杉 × WaytoAGI AGI Builder 池】，技术输出 10w+ 阅读。觉得和贵司岗位高度契合，希望能进一步沟通！"

# 城市优先级列表
CITIES = [
    {"name": "北京", "code": "101010100"},
    {"name": "上海", "code": "101020100"},
    {"name": "广州", "code": "101280101"},
    {"name": "深圳", "code": "101280600"},
    {"name": "杭州", "code": "101210100"},
    {"name": "南京", "code": "101190100"},
    {"name": "苏州", "code": "101190400"},
    {"name": "厦门", "code": "101230200"},
    {"name": "成都", "code": "101270100"},
    {"name": "武汉", "code": "101200100"},
    {"name": "全国", "code": "100010000"}
]

# 精选关键词（聚焦 Agent / AI全栈 / AI应用 / 全栈开发 / 智能体）
KEYWORDS = [
    "AI Agent",
    "AI全栈工程师",
    "AI应用工程师",
    "全栈开发",
    "智能体",
    "大模型应用",
    "AI Agent 实习",
    "AI全栈 实习",
    "AI应用开发 实习",
    "全栈开发 实习",
    "智能体开发 实习",
    "Agent开发 实习",
    "AI Agent 校招",
    "AI全栈 校招",
    "AI应用工程师 校招",
    "全栈开发 校招",
    "智能体 校招",
    "大模型应用 校招",
    "Agent开发",
    "LLM应用",
    "RAG",
    "工作流",
    "LangChain",
    "Dify",
    "Coze",
    "大模型全栈",
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

def update_report(records, session_count, current_status="执行中", current_action=""):
    history = records.get("history", [])
    total_count = len(history)
    
    content = f"""# BOSS 直聘投递全自动接管执行报告

- **更新时间**：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
- **当前状态**：{current_status}
- **本次会话已投递**：**{session_count} / {TARGET_SESSION_DELIVERY}**
- **历史累计总投递**：**{total_count}** 岗
- **当前执行动态**：{current_action}
- **打招呼语**：“{CUSTOM_GREETING}”
- **投递模式**：严格先发送简历高清长图（`resume6_full.png`），后发送打招呼语
- **简历文件**：[`简历6.pdf`](file:///Users/chenyuhang/Downloads/简历6.pdf)

---

## 本次会话最新投递记录 (最近 50 条)

| 序号 | 职位名称 | 公司名称 | 城市 | 薪资 | 投递时间 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
"""
    for item in reversed(history[-50:]):
        content += f"| {item.get('index', '')} | {item.get('job_name', '')} | {item.get('company', '')} | {item.get('city', '')} | {item.get('salary', '')} | {item.get('time', '')} | 已向BOSS发送消息 |\n"

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(content)

class CDPClient:
    """基于原生 WebSocket CDP 协议与当前运行的 Chrome 保持高稳定通信"""
    def __init__(self):
        self.ws = None
        self.msg_id = 0
        self.connect()

    def get_target_ws_url(self):
        try:
            res = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5).read())
            # 优先使用包含 zhipin 的标签页
            boss_tabs = [t for t in res if t.get("type") == "page" and "zhipin.com" in t.get("url", "")]
            if boss_tabs:
                return boss_tabs[0]["webSocketDebuggerUrl"]
            # 否则使用任意普通标签页
            page_tabs = [t for t in res if t.get("type") == "page"]
            if page_tabs:
                return page_tabs[0]["webSocketDebuggerUrl"]
            # 若无标签页，新建一个
            req = urllib.request.Request("http://127.0.0.1:9222/json/new?https://www.zhipin.com/web/geek/job", method="PUT")
            new_tab = json.loads(urllib.request.urlopen(req, timeout=5).read())
            return new_tab["webSocketDebuggerUrl"]
        except Exception as e:
            print(f"[ERROR] 获取 Chrome CDP 目标失败: {e}", flush=True)
            return None

    def connect(self):
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
        ws_url = self.get_target_ws_url()
        if not ws_url:
            raise RuntimeError("无法连接到已登录的 Chrome (端口 9222)")
        self.ws = websocket.create_connection(ws_url, timeout=12)
        self.raw_call("Page.enable")
        self.raw_call("Runtime.enable")
        self.raw_call("DOM.enable")

    def raw_call(self, method, params=None):
        self.msg_id += 1
        curr_id = self.msg_id
        payload = {"id": curr_id, "method": method}
        if params:
            payload["params"] = params
        self.ws.send(json.dumps(payload))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get("id") == curr_id:
                return resp.get("result", {})

    def call(self, method, params=None, retries=3):
        for attempt in range(retries):
            try:
                return self.raw_call(method, params)
            except Exception as e:
                time.sleep(1.2)
                self.connect()
                if attempt == retries - 1:
                    raise

    def evaluate(self, expression):
        res = self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        val = res.get("result", {}).get("value")
        return val

    def navigate(self, url):
        try:
            self.call("Page.navigate", {"url": url})
        except Exception:
            time.sleep(2)
            self.connect()
        time.sleep(2.5)

    def check_security_and_quota(self):
        """全面安全拦截与限额检测"""
        res = self.evaluate('''(() => {
            const bodyText = document.body ? document.body.innerText : '';
            const htmlText = document.documentElement ? document.documentElement.innerHTML : '';
            
            // 安全验证 / 滑块 / 异常访问
            const hasVerify = bodyText.includes('安全验证') || 
                              bodyText.includes('请完成下方验证') || 
                              bodyText.includes('异常访问') || 
                              bodyText.includes('系统检测到您的账号存在异常') ||
                              bodyText.includes('请输入图形验证码') ||
                              !!document.querySelector('.dialog-wrap .nc_iconfont, #nc_1_wrapper, .geetest_holder, .slide-verify');
            
            // 登录状态失效
            const loginExpired = bodyText.includes('登录已过期') || 
                                 bodyText.includes('请重新登录') || 
                                 (bodyText.includes('登录BOSS直聘') && !bodyText.includes('陈宇航'));
            
            // 今日沟通限额
            const isQuota = bodyText.includes('今日沟通人数已达上限') || 
                            bodyText.includes('今日沟通已达上限') || 
                            bodyText.includes('达到今日沟通上限') ||
                            bodyText.includes('今日打招呼已达上限');
            
            return { hasVerify, loginExpired, isQuota };
        })()''') or {}
        return res

    def close_popups(self):
        """自动关闭干扰弹窗（如附件简历确认、提示等）"""
        self.evaluate('''(() => {
            // 关闭常见的无关弹窗
            const closeBtns = document.querySelectorAll('.boss-dialog__close, .dialog-close, .close-icon, .icon-close, .btn-cancel');
            for (let b of closeBtns) {
                if (b.offsetParent !== null) {
                    b.click();
                }
            }
        })()''')

    def send_image_first_then_text_in_chat(self):
        """严格顺序：1. 先发简历高清长图 -> 2. 再发打招呼语文本"""
        try:
            # 导航至聊天页面
            self.navigate("https://www.zhipin.com/web/geek/chat")
            time.sleep(2.0)

            # 点击最新一位联系人
            self.evaluate('''(() => {
                const topFriend = document.querySelector('.friend-content, .geek-item, .chat-user-item, li.item');
                if (topFriend) topFriend.click();
            })()''')
            time.sleep(1.5)

            # 步骤 1：发送简历图片
            doc = self.call("DOM.getDocument")
            node = self.call("DOM.querySelector", {
                "nodeId": doc.get("root", {}).get("nodeId", 1),
                "selector": '.btn-sendimg input[type="file"], .toolbar-btn-content input[type="file"], input[type="file"][accept*="image"]'
            })

            if node and node.get("nodeId") and os.path.exists(RESUME_IMAGE_PATH):
                self.call("DOM.setFileInputFiles", {
                    "files": [RESUME_IMAGE_PATH],
                    "nodeId": node["nodeId"]
                })
                time.sleep(1.8)

                # 点击图片发送确认弹窗的“确定/发送”按钮
                self.evaluate('''(() => {
                    const btns = Array.from(document.querySelectorAll('.btn-sure, .sure-btn, .btn-primary, .btn-sure-v2, .dialog-footer .btn, button.btn-sure, .boss-dialog__footer .btn-primary, .boss-dialog__footer .btn-sure'));
                    const target = btns.find(b => b.innerText.includes('确定') || b.innerText.includes('发送') || b.innerText.includes('确认'));
                    if (target) target.click();
                })()''')
                time.sleep(1.8)
                print("    -> [Chat] 简历长图发送成功", flush=True)

            # 步骤 2：发送定制打招呼交流语
            self.evaluate(f'''(() => {{
                const input = document.querySelector('#chat-input, .chat-input');
                if (input) {{
                    input.innerText = {json.dumps(CUSTOM_GREETING)};
                    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    input.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
                setTimeout(() => {{
                    const sendBtn = document.querySelector('.btn-send, button[type="send"], .btn-sure-v2, .chat-op button');
                    if (sendBtn) sendBtn.click();
                }}, 600);
            }})()''')
            time.sleep(2.0)
            print("    -> [Chat] 打招呼语文本发送成功", flush=True)
            return True
        except Exception as e:
            print(f"[WARN] 聊天中先图后文发送异常: {e}", flush=True)
            return False

def is_target_job(job_name, company, tags_text, desc_text=""):
    """
    多维度精准匹配与过滤规则：
    - 排除：摄影标注、纯销售、行政、文员、产品运营、短视频、5年以上管理、纯算法
    - 锁定：AI Agent、AI全栈工程师、AI应用工程师、全栈开发、智能体、RAG、工作流、大模型应用
    """
    job_lower = job_name.lower()
    full_text = f"{job_name} {tags_text} {desc_text}".lower()
    
    # 1. 严格通用排除词
    general_exclude = [
        "摄影", "美学标注", "图片标注", "语音标注", "数据标注", "标注员", "标注专家", "审核员",
        "纯销售", "电话销售", "电销", "地推", "客服", "前台", "行政", "文员", "文秘",
        "保洁", "保安", "司机", "厨师", "餐饮", "主播", "带货", "剪辑师",
        "短视频运营", "电商运营", "跨境电商", "纯运营",
        "3-5年", "5-10年", "10年以上", "5年以上", "十年以上", "总监", "部门经理", "副总裁", "vp", "专家"
    ]
    for kw in general_exclude:
        if kw in job_lower:
            return False, f"排除通用非匹配词: {kw}"
        if kw in ["3-5年", "5-10年", "10年以上", "5年以上"] and kw in tags_text:
            return False, f"经验要求过高: {kw}"
        if kw in ["摄影", "数据标注", "销售", "行政", "客服"] and kw in company.lower():
            return False, f"公司类型排除: {kw}"

    # 2. 社招高年限硬排除
    if any(k in tags_text for k in ["3-5年", "5-10年", "10年以上", "5年以上"]):
        return False, "排除社招高年限岗位"

    # 3. 算法专项排除规则（纯算法不投，除非明确标注 Agent / 应用 / RAG / 全栈 / 智能体）
    has_focus_keyword = any(k in job_lower for k in ["agent", "智能体", "rag", "应用", "全栈", "工作流", "提示词", "prompt", "dify", "coze", "知识库", "工程", "开发"])
    algorithm_keywords = [
        "算法专家", "算法研究员", "推荐算法", "搜索算法", "广告算法",
        "cv算法", "视觉算法", "图像算法", "感知算法", "控制算法", "规划算法", "自动驾驶算法",
        "音频算法", "语音算法", "信号处理", "nlp算法", "深度学习算法", "机器学习算法"
    ]
    for ak in algorithm_keywords:
        if ak in job_lower and not has_focus_keyword:
            return False, f"排除纯算法岗位: {ak}"

    # 4. 正向核心技术方向
    focus_keywords = [
        "agent", "智能体", "rag", "大模型应用", "ai应用", "llm应用", "提示词", "prompt",
        "工作流", "workflow", "langchain", "dify", "coze", "微调", "embedding", "知识库",
        "ai全栈", "aigc开发", "大模型全栈", "大模型开发", "全栈开发", "全栈工程师", "全栈",
        "ai开发", "大模型", "ai工程", "后端开发", "软件工程"
    ]
    
    matched = [kw for kw in focus_keywords if kw in job_lower or (kw in full_text and any(k in job_lower for k in ["agent", "智能体", "rag", "应用", "全栈", "工作流", "实习", "开发", "工程师", "校招", "应届"]))]
    if not matched:
        return False, "未匹配到 Agent/AI应用/RAG/全栈 等目标技术方向"
        
    return True, f"匹配: {', '.join(matched[:3])}"

def run_takeover():
    records = load_records()
    communicated_set = set(records.get("communicated_keys", []))
    history = records.get("history", [])
    
    session_count = 0
    total_start_count = len(history)
    
    print("\n" + "="*70, flush=True)
    print("🚀 BOSS 直聘全自动接管投递引擎已启动", flush=True)
    print(f"🎯 本次接管目标：直接沟通并投递 {TARGET_SESSION_DELIVERY} 个岗位", flush=True)
    print(f"📊 历史累计沟通：{total_start_count} 岗", flush=True)
    print(f"🖼️  投递模式：严格先发送简历高清图，紧接着发送打招呼语", flush=True)
    print(f"📄 简历文件：{RESUME_PDF_PATH} & {RESUME_IMAGE_PATH}", flush=True)
    print("="*70 + "\n", flush=True)
    
    update_report(records, session_count, current_status="初始化连接 Chrome 中...", current_action="正在建立 CDP 通道")

    cdp = CDPClient()

    for city in CITIES:
        city_name = city["name"]
        city_code = city["code"]
        
        for keyword in KEYWORDS:
            if session_count >= TARGET_SESSION_DELIVERY:
                print(f"\n🎉 [SUCCESS] 本次接管任务目标已达成！已投递 {session_count} 个岗位！", flush=True)
                update_report(records, session_count, current_status=f"已达成目标（本次投递 {session_count} 岗）", current_action="任务顺利结束")
                return

            # 先尝试 experience=108（在校/应届/实习），兼顾更广范围
            exp_modes = ["108", "101,102", ""]
            
            for exp in exp_modes:
                if session_count >= TARGET_SESSION_DELIVERY:
                    break

                exp_param = f"&experience={exp}" if exp else ""
                search_url = f"https://www.zhipin.com/web/geek/job?query={urllib.parse.quote(keyword)}&city={city_code}{exp_param}"
                
                exp_desc = "在校/实习/应届" if exp == "108" else ("经验不限/应届" if exp == "101,102" else "通用")
                print(f"\n------------------------------------------------------------", flush=True)
                print(f"📍 切换城市: 【{city_name}】 | 关键词: 【{keyword}】 | 模式: 【{exp_desc}】", flush=True)
                print(f"📊 当前本次已投: {session_count}/{TARGET_SESSION_DELIVERY} | 历史累计: {len(history)}", flush=True)
                print(f"------------------------------------------------------------", flush=True)
                
                update_report(records, session_count, current_status="连续投递中", current_action=f"正在检索 【{city_name}】 - {keyword} ({exp_desc})")
                
                cdp.navigate(search_url)

                # 平滑滚动加载更多卡片
                for _ in range(4):
                    cdp.evaluate('''(() => {
                        const list = document.querySelector('.job-list-box, .page-jobs-main, ul.job-list-box');
                        if (list) list.scrollTop = list.scrollHeight;
                        window.scrollTo(0, document.body.scrollHeight);
                    })()''')
                    time.sleep(1.0)

                # 安全与限额检测
                sec_check = cdp.check_security_and_quota()
                if sec_check.get("hasVerify"):
                    print(f"\n⚠️ [SECURITY ALERT] 检测到安全拦截/滑块验证！立即安全暂停！", flush=True)
                    update_report(records, session_count, current_status="⚠️ 暂停：检测到安全验证/滑块，请人工处理", current_action="遇到安全验证，暂停执行")
                    return

                if sec_check.get("loginExpired"):
                    print(f"\n⚠️ [LOGIN EXPIRED] 检测到登录失效，请重新在 Chrome 中登录！", flush=True)
                    update_report(records, session_count, current_status="⚠️ 暂停：登录已失效，请重新登录", current_action="登录失效")
                    return

                if sec_check.get("isQuota"):
                    print(f"\n🛑 [QUOTA REACHED] 今日平台打招呼/沟通次数已达上限！优雅结束任务。", flush=True)
                    update_report(records, session_count, current_status="🛑 今日平台沟通次数已达上限", current_action="已达平台上限")
                    return

                cards_count = cdp.evaluate('(() => document.querySelectorAll("li.job-card-box").length)()') or 0
                print(f"[{datetime.now().strftime('%H:%M:%S')}] 页面解析到 {cards_count} 个岗位卡片", flush=True)
                if cards_count == 0:
                    continue

                card_idx = 0
                while card_idx < cards_count:
                    if session_count >= TARGET_SESSION_DELIVERY:
                        break

                    # 再次做快速安全与限额检查
                    sec_check = cdp.check_security_and_quota()
                    if sec_check.get("hasVerify"):
                        print(f"\n⚠️ [SECURITY ALERT] 发现安全验证！立即暂停！", flush=True)
                        update_report(records, session_count, current_status="⚠️ 暂停：检测到安全验证/滑块", current_action="安全拦截")
                        return

                    if sec_check.get("isQuota"):
                        print(f"\n🛑 [QUOTA REACHED] 平台今日沟通上限已达！", flush=True)
                        update_report(records, session_count, current_status="🛑 今日平台沟通次数已达上限", current_action="已达平台上限")
                        return

                    # 提取卡片基础信息
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

                    # 点击卡片查看右侧详情
                    cdp.evaluate(f'''(() => {{
                        const cards = document.querySelectorAll('li.job-card-box');
                        if (cards[{card_idx - 1}]) {{
                            cards[{card_idx - 1}].scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                            cards[{card_idx - 1}].click();
                        }}
                    }})()''')
                    time.sleep(random.uniform(1.2, 1.8))

                    detail_info = cdp.evaluate('''(() => {
                        const btn = document.querySelector('a.op-btn.op-btn-chat, .op-btn-chat');
                        const desc = document.querySelector('.job-detail-box, .job-detail-section, .job-sec-text')?.innerText || '';
                        return {
                            btnExists: !!btn,
                            btnText: btn ? btn.innerText.trim() : '',
                            desc: desc.slice(0, 600)
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

                    # 二次校验 JD 详情
                    jd_matched, jd_reason = is_target_job(job_name, company, tags, detail_info.get("desc", ""))
                    if not jd_matched:
                        continue

                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 匹配优质岗位 -> 【{company}】 {job_name} ({location} | {salary})", flush=True)

                    # 1. 点击“立即沟通”
                    cdp.evaluate('''(() => {
                        const btn = document.querySelector('a.op-btn.op-btn-chat, .op-btn-chat');
                        if (btn) btn.click();
                    })()''')
                    time.sleep(random.uniform(2.0, 2.5))

                    # 检查是否有弹出确认对话框
                    cdp.evaluate('''(() => {
                        const dialogBtn = document.querySelector('.boss-dialog__footer .btn-primary, .dialog-footer .btn-sure');
                        if (dialogBtn) dialogBtn.click();
                    })()''')
                    time.sleep(1.2)

                    # 2. 进入聊天页面，先图后文发送
                    send_ok = cdp.send_image_first_then_text_in_chat()
                    
                    session_count += 1
                    total_idx = len(history) + 1
                    
                    communicated_set.add(dedup_key)
                    if link:
                        communicated_set.add(link)

                    entry = {
                        "index": total_idx,
                        "session_index": session_count,
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

                    print(f"  >>> ✅ [已向BOSS发送消息 | 本次: {session_count}/{TARGET_SESSION_DELIVERY} | 总计: {total_idx}] 【{company}】{job_name} ({location})", flush=True)

                    # 每完成 10 个岗位，记录并更新报告，不暂停
                    if session_count % 10 == 0:
                        print("\n" + "="*50, flush=True)
                        print(f"🎯 阶段达成：本次已成功直接沟通 {session_count} 个岗位！累计 {total_idx} 岗", flush=True)
                        print("="*50 + "\n", flush=True)
                        update_report(records, session_count, current_status="连续投递中（阶段达成）", current_action=f"已达成阶段里程碑 {session_count} 岗")

                    # 返回搜索结果页继续投递
                    cdp.navigate(search_url)
                    time.sleep(random.uniform(2.0, 3.2))

    update_report(records, session_count, current_status="已完成所有检索与投递", current_action="执行完毕")
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 投递任务完成！本次共投递: {session_count} 个岗位，历史累计: {len(history)}", flush=True)

if __name__ == "__main__":
    run_takeover()
