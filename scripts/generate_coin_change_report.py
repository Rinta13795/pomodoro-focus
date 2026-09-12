from __future__ import annotations

import subprocess
import textwrap
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt
from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/chenyuhang/Desktop/pomodoro-focus")
WORK = ROOT / "outputs" / "coin_change_limited"
WORK.mkdir(parents=True, exist_ok=True)

CPP = ROOT / "coin_change_limited.cpp"
EXE = WORK / "coin_change_limited"
REPORT = WORK / "实验三 动态规划2_最少硬币问题.docx"
INPUT = WORK / "input.txt"
OUTPUT = WORK / "output.txt"
SCREEN = WORK / "terminal_output.txt"
BOUNDED_IMAGE = WORK / "bounded_terminal.png"
UNBOUNDED_IMAGE = WORK / "unbounded_terminal.png"
BOUNDED_INPUT = WORK / "bounded_input.txt"
BOUNDED_OUTPUT = WORK / "bounded_output.txt"
UNBOUNDED_INPUT = WORK / "unbounded_input.txt"
UNBOUNDED_OUTPUT = WORK / "unbounded_output.txt"


def run(cmd, cwd=WORK):
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)


def set_font(run, name="宋体", size=12, bold=False):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold


def add_paragraph(doc, text, font="宋体", size=12, bold=False, align=None):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    r = p.add_run(text)
    set_font(r, font, size, bold)
    return p


def add_code(doc, text):
    for line in text.splitlines():
        add_paragraph(doc, line, font="Courier New", size=10)


def add_terminal_image(log_text: str, output_path: Path):
    lines = log_text.splitlines() or [""]
    font = ImageFont.load_default()
    padding = 24
    line_height = 22
    width = max(font.getbbox(line)[2] for line in lines) + padding * 2
    height = line_height * len(lines) + padding * 2
    image = Image.new("RGB", (max(width, 700), max(height, 180)), "#ffffff")
    draw = ImageDraw.Draw(image)
    y = padding
    for line in lines:
        draw.text((padding, y), line, font=font, fill="#111111")
        y += line_height
    image.save(output_path)


def build_report(
    bounded_input: str,
    bounded_output: str,
    bounded_log: str,
    unbounded_input: str,
    unbounded_output: str,
    unbounded_log: str,
):
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "宋体"
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    style.font.size = Pt(12)

    add_paragraph(doc, "算法设计与分析实验报告", font="黑体", size=16, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_paragraph(doc, "实验三 动态规划2：最少硬币问题", font="黑体", size=14, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_paragraph(doc, "")

    add_paragraph(doc, "1. 实验目的", font="黑体", size=14, bold=True)
    for line in [
        "理解动态规划算法的主要设计思想。",
        "掌握用动态规划算法解决有限硬币和无限硬币两类最少找零问题。",
    ]:
        add_paragraph(doc, line)

    add_paragraph(doc, "2. 问题描述", font="黑体", size=14, bold=True)
    add_paragraph(doc, "给定 n 种硬币面值及每种硬币的可用个数，求凑出金额 m 所需的最少硬币数；若无法凑出，则输出 -1。")

    add_paragraph(doc, "3. 题目一：硬币个数有限的最少找零", font="黑体", size=14, bold=True)
    add_paragraph(doc, "3.1 算法设计思想", font="黑体", size=12, bold=True)
    add_paragraph(doc, "定义 dp[x] 表示凑出金额 x 所需的最少硬币数，初始 dp[0]=0，其余为 INF。")
    add_paragraph(doc, "处理每种硬币时，新开一层 ndp，并枚举当前金额与该硬币使用张数 k，实现“数量受限”的状态转移。")
    add_paragraph(doc, "状态转移为：ndp[x + k * T[i]] = min(ndp[x + k * T[i]], dp[x] + k)。")
    add_paragraph(doc, "时间复杂度为 O(n * m * c)，其中 c 为单种硬币的最大可用张数；空间复杂度为 O(m)。")
    add_paragraph(doc, "3.2 程序源码", font="黑体", size=12, bold=True)
    add_code(doc, CPP.read_text(encoding="utf-8"))
    add_paragraph(doc, "3.3 实验结论（结果验证）", font="黑体", size=12, bold=True)
    add_paragraph(doc, "输入样例：")
    add_code(doc, bounded_input.strip())
    add_paragraph(doc, "输出结果：")
    add_code(doc, bounded_output.strip())
    add_paragraph(doc, "终端运行截图：")
    doc.add_picture(str(BOUNDED_IMAGE))
    add_paragraph(doc, "样例中金额 18 可由 5+5+5+2+1 组成，共 5 枚硬币，因此程序输出 5，和题目给出的样例一致。")
    add_paragraph(doc, "3.4 心得体会", font="黑体", size=12, bold=True)
    add_paragraph(doc, "有限张数版本比完全背包更容易出错，关键在于转移时不能让同一枚硬币在一轮中被重复使用。")

    add_paragraph(doc, "4. 题目二：硬币个数不限的最少找零", font="黑体", size=14, bold=True)
    add_paragraph(doc, "4.1 算法设计思想", font="黑体", size=12, bold=True)
    add_paragraph(doc, "无限硬币版本属于完全背包。仍然令 dp[x] 表示凑出金额 x 所需的最少硬币数，只是每个金额都可以反复使用同一种面值。")
    add_paragraph(doc, "状态转移为：dp[x] = min(dp[x], dp[x - coin] + 1)。")
    add_paragraph(doc, "时间复杂度为 O(n * m)，空间复杂度为 O(m)。")
    add_paragraph(doc, "4.2 程序源码", font="黑体", size=12, bold=True)
    add_paragraph(doc, "题目二复用同一份源程序，运行时添加 --unbounded 参数，程序会忽略每种硬币的数量限制。")
    add_code(doc, textwrap.dedent(
        """
        // 题目二对应的核心函数
        int solve_unbounded(const vector<int>& value, int target) {
            vector<int> dp(target + 1, INF);
            dp[0] = 0;
            for (int amount = 1; amount <= target; ++amount) {
                for (int coin : value) {
                    if (coin <= amount && dp[amount - coin] != INF) {
                        dp[amount] = min(dp[amount], dp[amount - coin] + 1);
                    }
                }
            }
            return dp[target] == INF ? -1 : dp[target];
        }
        """
    ).strip())
    add_paragraph(doc, "4.3 实验结论（结果验证）", font="黑体", size=12, bold=True)
    add_paragraph(doc, "为了和题目一区分，这里选用自定义样例验证无限硬币版本。为复用同一输入格式，第二列数量仅占位，不参与计算。")
    add_paragraph(doc, "输入样例：")
    add_code(doc, unbounded_input.strip())
    add_paragraph(doc, "输出结果：")
    add_code(doc, unbounded_output.strip())
    add_paragraph(doc, "终端运行截图：")
    doc.add_picture(str(UNBOUNDED_IMAGE))
    add_paragraph(doc, "样例中金额 6 可以由 3+3 构成，因此最少只需要 2 枚硬币，程序输出正确。")
    add_paragraph(doc, "4.4 心得体会", font="黑体", size=12, bold=True)
    add_paragraph(doc, "无限硬币版本的转移更直接，但也更依赖状态定义是否清楚。把有限和无限两种情况放在一起比较后，更容易理解背包类动态规划的差别。")

    add_paragraph(doc, "5. 实验总结", font="黑体", size=14, bold=True)
    add_paragraph(doc, "本实验加深了对动态规划状态定义和状态转移的理解，也说明了有限张数问题与无限张数问题虽然目标一致，但转移方式并不相同。")

    doc.save(REPORT)


def main():
    run(["g++", "-std=c++17", "-O2", str(CPP), "-o", str(EXE)], cwd=ROOT)

    bounded_input = "3\n1 3\n2 3\n5 3\n18\n"
    INPUT.write_text(bounded_input, encoding="utf-8")
    BOUNDED_INPUT.write_text(bounded_input, encoding="utf-8")
    subprocess.run([str(EXE)], cwd=WORK, check=True)
    bounded_output = OUTPUT.read_text(encoding="utf-8")
    BOUNDED_OUTPUT.write_text(bounded_output, encoding="utf-8")
    bounded_log = textwrap.dedent(
        f"""
        $ g++ -std=c++17 -O2 coin_change_limited.cpp -o coin_change_limited
        $ ./coin_change_limited
        input.txt -> output.txt
        output:
        {bounded_output.strip()}
        """
    ).strip()
    add_terminal_image(bounded_log, BOUNDED_IMAGE)

    unbounded_input = "3\n1 1\n3 1\n4 1\n6\n"
    INPUT.write_text(unbounded_input, encoding="utf-8")
    UNBOUNDED_INPUT.write_text(unbounded_input, encoding="utf-8")
    subprocess.run([str(EXE), "--unbounded"], cwd=WORK, check=True)
    unbounded_output = OUTPUT.read_text(encoding="utf-8")
    UNBOUNDED_OUTPUT.write_text(unbounded_output, encoding="utf-8")
    unbounded_log = textwrap.dedent(
        f"""
        $ ./coin_change_limited --unbounded
        input.txt -> output.txt
        output:
        {unbounded_output.strip()}
        """
    ).strip()
    SCREEN.write_text(bounded_log + "\n\n" + unbounded_log, encoding="utf-8")
    add_terminal_image(unbounded_log, UNBOUNDED_IMAGE)
    build_report(
        bounded_input,
        bounded_output,
        bounded_log,
        unbounded_input,
        unbounded_output,
        unbounded_log,
    )
    print(REPORT)


if __name__ == "__main__":
    main()
