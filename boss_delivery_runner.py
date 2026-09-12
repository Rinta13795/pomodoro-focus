#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOSS 直聘自动化投递与简历直发引擎（最新版：先图后文）
- 投递顺序严格遵守：1. 先发简历图片 -> 2. 再发交流语
- 打招呼文案：能立即到岗，一周5天，软件工程专业本科生，有Agent开发经验，觉得和贵公司岗位匹配，希望进一步交流。
- 简历文件：/Users/chenyuhang/Downloads/简历1.pdf 渲染版 /Users/chenyuhang/Desktop/pomodoro-focus/resume1_page-1.png
- 严格锁定：AI Agent、智能体、RAG、大模型应用、AI工作流、AI全栈（纯算法岗位全面排除）
- 目标：持续投递至 250 份或达当日平台上限
"""

import sys
import os
import json
import time
import random
import urllib.parse
from datetime import datetime
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(line_buffering=True)

LOG_FILE = "/Users/chenyuhang/Desktop/pomodoro-focus/boss_delivery_log.json"
REPORT_FILE = "/Users/chenyuhang/Desktop/pomodoro-focus/boss_delivery_report.md"
ANTI_DETECT_PATH = "/Users/chenyuhang/Desktop/get_jobs/src/main/resources/anti-detection.js"
RESUME_PDF_PATH = "/Users/chenyuhang/Downloads/简历1.pdf"
RESUME_IMAGE_PATH = "/Users/chenyuhang/Desktop/pomodoro-focus/resume1_page-1.png"

TARGET_COUNT = 250  # 目标 250 个岗位

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

# 严格聚焦 Agent、AI应用、RAG、工作流、提示词等方向
KEYWORDS = [
    "AI Agent",
    "智能体",
    "RAG",
    "大模型应用",
    "Agent开发",
    "LLM应用",
    "提示词工程",
    "AI全栈",
    "大模型工作流",
    "AI应用开发",
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
    
    content = f"""# BOSS 直聘投递执行实时报告（最新先图后文版）

- **更新时间**：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
- **当前状态**：{current_status}
- **已成功沟通岗位数**：{count} / {TARGET_COUNT}
- **打招呼文案**：“{CUSTOM_GREETING}”
- **投递顺序**：先发送简历图片，后发送打招呼文本
- **简历文件**：[`简历1.pdf`](file:///Users/chenyuhang/Downloads/简历1.pdf) 及高清渲染图

## 最近完成的投递明细

| 序号 | 职位名称 | 公司名称 | 城市 | 薪资 | 投递时间 |
| :--- | :--- | :--- | :--- | :--- | :--- |
"""
    for item in reversed(history[-100:]):
        content += f"| {item.get('index', '')} | {item.get('job_name', '')} | {item.get('company', '')} | {item.get('city', '')} | {item.get('salary', '')} | {item.get('time', '')} |\n"

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(content)

def check_security(page):
    """检测页面是否存在验证码、滑块或异常拦截"""
    try:
        sec_info = page.evaluate('''() => {
            const bodyText = document.body ? document.body.innerText : '';
            const hasVerifyText = bodyText.includes('安全验证') || 
                                  bodyText.includes('请完成下方验证') || 
                                  bodyText.includes('异常访问') || 
                                  bodyText.includes('访问受限') ||
                                  bodyText.includes('环境异常');
            const hasSlider = !!document.querySelector('.geetest_slider, .nc_wrapper, .verify-bar, .slider, #captcha');
            const isLoginExpired = bodyText.includes('登录已过期') || bodyText.includes('请重新登录');
            return {
                blocked: hasVerifyText || hasSlider || isLoginExpired,
                reason: hasVerifyText ? '安全验证/异常访问拦截' : (hasSlider ? '滑块/验证码' : (isLoginExpired ? '登录失效' : ''))
            };
        }''')
        return sec_info
    except Exception:
        return {"blocked": False, "reason": ""}

def check_quota_limit(page):
    """检测是否达到每日沟通上限"""
    try:
        quota_info = page.evaluate('''() => {
            const bodyText = document.body ? document.body.innerText : '';
            const isQuota = bodyText.includes('今日沟通人数已达上限') || 
                            bodyText.includes('今日沟通已达上限') || 
                            bodyText.includes('今日打招呼次数已达上限') || 
                            bodyText.includes('今日沟通次数已达上限') ||
                            bodyText.includes('达到今日沟通上限');
            return isQuota;
        }''')
        return quota_info
    except Exception:
        return False

def is_target_job(job_name, company, tags_text, desc_text=""):
    """多维度规则过滤（严格排除纯算法，严格锁定 Agent / AI应用 / RAG）"""
    job_lower = job_name.lower()
    full_text = f"{job_name} {tags_text} {desc_text}".lower()
    
    # 1. 负向排除关键词
    general_exclude = [
        "摄影", "美学标注", "图片标注", "语音标注", "数据标注", "标注员", "标注专家", "审核员",
        "纯销售", "电话销售", "电销", "地推", "客服", "前台", "行政", "文员", "文秘",
        "保洁", "保安", "司机", "厨师", "餐饮", "主播", "带货", "剪辑师",
        "短视频运营", "电商运营", "跨境电商", "纯运营",
        "5-10年", "10年以上", "5年以上", "十年以上", "总监", "部门经理", "副总裁", "vp"
    ]
    for kw in general_exclude:
        if kw in job_lower:
            return False, f"排除通用非匹配词: {kw}"
        if kw in ["5-10年", "10年以上", "5年以上"] and kw in tags_text:
            return False, f"经验要求过高: {kw}"
        if kw in ["摄影", "数据标注", "销售", "行政", "客服"] and kw in company.lower():
            return False, f"公司类型排除: {kw}"

    # 2. 算法专项排除规则
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

    # 3. 正向目标核心词
    focus_keywords = [
        "agent", "智能体", "rag", "大模型应用", "ai应用", "llm应用", "提示词", "prompt",
        "工作流", "workflow", "langchain", "dify", "coze", "微调", "embedding", "知识库",
        "ai全栈", "aigc开发", "大模型全栈", "大模型开发"
    ]
    
    matched = [kw for kw in focus_keywords if kw in job_lower or (kw in full_text and any(k in job_lower for k in ["agent", "智能体", "rag", "应用", "全栈", "工作流", "实习", "开发", "工程师"]))]
    if not matched:
        return False, "未匹配到 Agent/AI应用/RAG 等目标技术方向"
        
    return True, f"匹配: {', '.join(matched[:3])}"

def get_valid_boss_page(context):
    """获取或恢复可用的 Boss 页面句柄"""
    for p in context.pages:
        try:
            if not p.is_closed() and "zhipin.com" in p.url:
                return p
        except Exception:
            pass
    try:
        new_p = context.new_page()
        return new_p
    except Exception:
        return None

def send_chat_message_and_resume(page):
    """
    在聊天界面中：先发简历图片，再发交流语
    """
    try:
        # 步骤 1：先上传并发送简历图片
        file_input = page.query_selector('input[type="file"][accept*="image"], .btn-sendimg input[type="file"], input[type="file"]')
        if file_input and os.path.exists(RESUME_IMAGE_PATH):
            file_input.set_input_files(RESUME_IMAGE_PATH)
            time.sleep(1.5)
            page.evaluate('''() => {
                const btn = document.querySelector('.dialog-wrap .sure-btn, .image-preview .btn-sure, .dialog-layer .btn-sure, button.btn-primary');
                if (btn) btn.click();
            }''')
            time.sleep(1.5)
            
        # 步骤 2：再输入并发送用户指定的交流语
        page.evaluate('''(msg) => {
            const input = document.querySelector('#chat-input, .chat-input, div[contenteditable="true"]');
            if (input) {
                input.innerText = msg;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }''', CUSTOM_GREETING)
        time.sleep(0.8)
        
        page.evaluate('''() => {
            const sendBtn = document.querySelector('.btn-send, button[type="send"], .chat-op button');
            if (sendBtn) sendBtn.click();
        }''')
        time.sleep(1.2)
        return True
    except Exception as e:
        print(f"[WARN] 发送图片/交流语异常: {e}", flush=True)
        return False

def run_delivery():
    records = load_records()
    communicated_set = set(records.get("communicated_keys", []))
    history = records.get("history", [])
    
    success_count = len(history)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 启动投递引擎（先图后文模式） | 累计已沟通: {success_count} / {TARGET_COUNT}", flush=True)
    
    anti_detect = ""
    if os.path.exists(ANTI_DETECT_PATH):
        with open(ANTI_DETECT_PATH, "r", encoding="utf-8") as f:
            anti_detect = f.read()

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        except Exception as e:
            print(f"[ERROR] 无法连接到 Chrome CDP 端口 9222: {e}", flush=True)
            return
            
        context = browser.contexts[0]
        if anti_detect:
            context.add_init_script(anti_detect)
            
        page = get_valid_boss_page(context)
        page.set_default_timeout(25000)
        
        for city in CITIES:
            city_name = city["name"]
            city_code = city["code"]
            
            for keyword in KEYWORDS:
                if success_count >= TARGET_COUNT:
                    print(f"[SUCCESS] 已达到目标投递数 {TARGET_COUNT}！任务圆满完成。", flush=True)
                    update_report(records, current_status=f"已达成目标 {TARGET_COUNT} 个岗位")
                    return

                search_url = f"https://www.zhipin.com/web/geek/job?query={urllib.parse.quote(keyword)}&city={city_code}"
                print(f"\n==========================================", flush=True)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] 切换城市: 【{city_name}】 | 关键词: 【{keyword}】", flush=True)
                print(f"==========================================", flush=True)
                
                try:
                    page = get_valid_boss_page(context)
                    page.goto(search_url, wait_until="domcontentloaded")
                    time.sleep(random.uniform(2.5, 3.5))
                except Exception as e:
                    print(f"[WARN] 页面加载重试: {e}", flush=True)
                    time.sleep(2)
                    page = get_valid_boss_page(context)

                sec = check_security(page)
                if sec["blocked"]:
                    print(f"\n[SECURITY ALERT] 检测到安全拦截: {sec['reason']}！立即暂停投递！", flush=True)
                    update_report(records, current_status=f"暂停：检测到 {sec['reason']}")
                    return

                for scroll_idx in range(4):
                    try:
                        page.evaluate('''() => {
                            const list = document.querySelector('.job-list-box, .page-jobs-main, ul.job-list-box');
                            if (list) list.scrollTop = list.scrollHeight;
                            window.scrollTo(0, document.body.scrollHeight);
                        }''')
                        time.sleep(random.uniform(1.2, 1.8))
                    except Exception:
                        pass

                try:
                    cards_count = page.evaluate('() => document.querySelectorAll("li.job-card-box").length')
                except Exception:
                    cards_count = 0

                print(f"[{datetime.now().strftime('%H:%M:%S')}] 当前页面解析出 {cards_count} 个岗位卡片", flush=True)
                if cards_count == 0:
                    continue

                for i in range(cards_count):
                    if success_count >= TARGET_COUNT:
                        break

                    sec = check_security(page)
                    if sec["blocked"]:
                        print(f"\n[SECURITY ALERT] 检测到安全拦截: {sec['reason']}！立即暂停投递！", flush=True)
                        update_report(records, current_status=f"暂停：检测到 {sec['reason']}")
                        return

                    if check_quota_limit(page):
                        print(f"\n[QUOTA REACHED] 今日平台打招呼/沟通次数已达上限！优雅停止。", flush=True)
                        update_report(records, current_status="已达今日平台沟通上限")
                        return

                    try:
                        card_info = page.evaluate('''(idx) => {
                            const cards = document.querySelectorAll('li.job-card-box');
                            const c = cards[idx];
                            if (!c) return null;
                            const jobName = c.querySelector('.job-name')?.innerText || '';
                            const salary = c.querySelector('.salary, .job-salary')?.innerText || '';
                            const company = c.querySelector('.company-name a, .boss-name')?.innerText || '';
                            const location = c.querySelector('.company-location')?.innerText || '';
                            const tags = Array.from(c.querySelectorAll('.tag-list li')).map(t => t.innerText).join(' ');
                            const link = c.querySelector('a.job-card-left, a.job-name')?.getAttribute('href') || '';
                            return { jobName, salary, company, location, tags, link };
                        }''', i)
                    except Exception as e:
                        continue

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

                    try:
                        page.evaluate('''(idx) => {
                            const cards = document.querySelectorAll('li.job-card-box');
                            if (cards[idx]) {
                                cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                cards[idx].click();
                            }
                        }''', i)
                        time.sleep(random.uniform(1.5, 2.2))
                    except Exception as e:
                        continue

                    try:
                        detail_info = page.evaluate('''() => {
                            const btn = document.querySelector('a.op-btn.op-btn-chat');
                            const desc = document.querySelector('.job-detail-box, .job-detail-section')?.innerText || '';
                            return {
                                btnExists: !!btn,
                                btnText: btn ? btn.innerText.trim() : '',
                                desc: desc.slice(0, 500)
                            };
                        }''')
                    except Exception as e:
                        continue

                    if not detail_info or not detail_info.get("btnExists"):
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

                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 正在发起沟通 -> 【{company}】 {job_name} ({location} | {salary})", flush=True)
                    try:
                        page.evaluate('''() => {
                            const btn = document.querySelector('a.op-btn.op-btn-chat');
                            if (btn) btn.click();
                        }''')
                        time.sleep(random.uniform(2.0, 2.8))
                    except Exception as e:
                        continue

                    sec = check_security(page)
                    if sec["blocked"]:
                        print(f"\n[SECURITY ALERT] 点击后出现安全验证: {sec['reason']}！立即暂停！", flush=True)
                        update_report(records, current_status=f"暂停：检测到 {sec['reason']}")
                        return

                    # 点击“继续沟通”进入聊天对话框
                    try:
                        page.evaluate('''() => {
                            const sureBtn = document.querySelector('.greet-boss-dialog .sure-btn');
                            if (sureBtn) sureBtn.click();
                        }''')
                        time.sleep(random.uniform(1.8, 2.5))
                    except Exception:
                        pass

                    # 严格先发图片，再发交流语
                    send_chat_message_and_resume(page)

                    # 关闭弹窗或返回页面列表
                    try:
                        page.evaluate('''() => {
                            const closeBtn = document.querySelector('.greet-boss-dialog .cancel-btn, .greet-boss-dialog .close, .greet-boss-dialog .icon-close, .dialog-wrap .cancel-btn, .dialog-wrap .close');
                            if (closeBtn) closeBtn.click();
                        }''')
                    except Exception:
                        pass

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

                    print(f"  >>> [进度: {success_count}/{TARGET_COUNT}] 成功投递 (先图后文): 【{company}】{job_name} ({location})", flush=True)

                    if success_count % 10 == 0:
                        print(f"\n---------------------------------------------", flush=True)
                        print(f"★ 阶段达成: 已累计成功沟通并发送简历 {success_count} 个岗位！", flush=True)
                        print(f"---------------------------------------------\n", flush=True)
                        update_report(records, current_status=f"已完成 {success_count} 个岗位，继续执行中")

                    time.sleep(random.uniform(2.8, 4.8))

    update_report(records, current_status="已完成执行")
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 自动化投递任务结束！累计沟通数: {success_count}", flush=True)

if __name__ == "__main__":
    run_delivery()
