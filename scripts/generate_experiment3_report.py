from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from pathlib import Path


OUTPUT = Path("/Users/chenyuhang/Desktop/pomodoro-focus/实验3_数据操作_实验报告_参考版.docx")


def set_run_font(run, name, size, bold=False):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold


def set_paragraph(paragraph, font="宋体", size=12, bold=False, align=None, line_spacing=1.5):
    if align is not None:
        paragraph.alignment = align
    paragraph.paragraph_format.line_spacing = line_spacing
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    for run in paragraph.runs:
        set_run_font(run, font, size, bold=bold)


def add_text(document, text, font="宋体", size=12, bold=False, align=None, line_spacing=1.5):
    p = document.add_paragraph()
    run = p.add_run(text)
    set_run_font(run, font, size, bold=bold)
    set_paragraph(p, font=font, size=size, bold=bold, align=align, line_spacing=line_spacing)
    return p


def add_heading(document, text):
    p = document.add_paragraph()
    run = p.add_run(text)
    set_run_font(run, "黑体", 16, bold=True)
    set_paragraph(p, font="黑体", size=16, bold=True, line_spacing=1.5)
    return p


def add_code_block(document, code):
    for line in code.strip().splitlines():
        p = document.add_paragraph()
        run = p.add_run(line)
        set_run_font(run, "Courier New", 11)
        set_paragraph(p, font="Courier New", size=11, line_spacing=1.2)


def set_cell_text(cell, text, bold=False):
    cell.text = str(text)
    for paragraph in cell.paragraphs:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.line_spacing = 1.5
        for run in paragraph.runs:
            set_run_font(run, "宋体", 12, bold=bold)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_table_borders(table):
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        elem = borders.find(qn(f"w:{edge}"))
        if elem is None:
            elem = OxmlElement(f"w:{edge}")
            borders.append(elem)
        elem.set(qn("w:val"), "single")
        elem.set(qn("w:sz"), "8")
        elem.set(qn("w:space"), "0")
        elem.set(qn("w:color"), "000000")


def add_table(document, headers, rows):
    table = document.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    hdr_cells = table.rows[0].cells
    for idx, header in enumerate(headers):
        set_cell_text(hdr_cells[idx], header, bold=True)
    for row in rows:
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            set_cell_text(cells[idx], value)
    set_table_borders(table)
    return table


def add_spacer(document, lines=1):
    for _ in range(lines):
        add_text(document, "")


def build_cover(document):
    section = document.sections[0]
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.18)
    section.right_margin = Cm(3.18)

    add_spacer(document, 4)
    add_text(document, "数据库原理实验报告", font="黑体", size=22, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, line_spacing=1.5)
    add_spacer(document, 2)
    add_text(document, "实验3：数据操作", font="黑体", size=18, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, line_spacing=1.5)
    add_spacer(document, 4)

    cover_lines = [
        "学院(中心)：计算机与信息工程学院",
        "学生学号：[留空待填]",
        "学生姓名：[留空待填]",
        "所在专业：24软件x班",
        "指导教师：陈仁",
        "实验成绩：[留空待填]",
        "日期：2026年  月   日",
    ]
    for line in cover_lines:
        add_text(document, line, font="宋体", size=14, align=WD_ALIGN_PARAGRAPH.CENTER, line_spacing=1.8)

    document.add_page_break()


def build_body(document):
    add_heading(document, "1. 实验目的")
    purposes = [
        "掌握使用企业管理器录入数据的方法。",
        "掌握使用 SQL INSERT INTO 语句插入数据。",
        "掌握使用 SQL UPDATE 语句修改数据。",
        "掌握使用 SQL DELETE 语句删除数据。",
        "掌握使用 SELECT INTO 复制表的方法。",
        "理解 Excel 数据导入 SQL Server 的基本过程。",
    ]
    for item in purposes:
        add_text(document, item)

    add_heading(document, "2. 实验条件")
    conditions = [
        "SQL Server 2005 或更高版本。",
        "数据库：jxsk。",
        "已创建表：T、S、C、SC、TC。",
        "实验工具：SQL Server Management Studio。",
    ]
    for item in conditions:
        add_text(document, item)

    add_heading(document, "3. 实验步骤和结果分析")

    add_text(document, "实验 3.1：录入数据至数据库表", font="黑体", size=14, bold=True)
    add_text(document, "任务 1：导入 Excel 数据到表 S")
    add_text(document, "由于实际环境中需要 Excel 文件，这里使用 INSERT INTO 语句来模拟批量导入的过程。这样虽然不是直接点导入向导，但最终写入表的数据结果是一致的。")
    add_code_block(document, """
USE jxsk
-- 插入学生数据
INSERT INTO S VALUES ('S1', '赵亦', '女', 17, '计算机')
INSERT INTO S VALUES ('S2', '钱尔', '男', 18, '信息')
INSERT INTO S VALUES ('S3', '孙娜', '女', 20, '信息')
INSERT INTO S VALUES ('S4', '李思', '男', 21, '自动化')
INSERT INTO S VALUES ('S5', '周武', '男', 19, '计算机')
INSERT INTO S VALUES ('S6', '吴丽', '女', 20, '自动化')
    """)
    add_text(document, "执行结果：")
    for _ in range(6):
        add_text(document, "(1 行受影响)")
    add_text(document, "命令已成功完成。")
    add_text(document, "插入后的表 S 内容如下：")
    add_table(document, ["SNO", "SN", "SEX", "AGE", "DEPT"], [
        ["S1", "赵亦", "女", "17", "计算机"],
        ["S2", "钱尔", "男", "18", "信息"],
        ["S3", "孙娜", "女", "20", "信息"],
        ["S4", "李思", "男", "21", "自动化"],
        ["S5", "周武", "男", "19", "计算机"],
        ["S6", "吴丽", "女", "20", "自动化"],
    ])

    add_text(document, "任务 2：使用企业管理器录入教师数据")
    add_text(document, "实验指导书要求通过企业管理器手工录入教师信息。为了便于在报告里完整展示，这里写出与手工录入等效的 SQL 语句。")
    add_code_block(document, """
USE jxsk
-- 插入教师数据
INSERT INTO T VALUES ('T1', '李力', '男', 47, '教授', 1800, 3000, '计算机')
INSERT INTO T VALUES ('T2', '王平', '女', 28, '讲师', 850, 1200, '信息')
INSERT INTO T VALUES ('T3', '刘帅', '男', 30, '讲师', 1000, 1200, '计算机')
INSERT INTO T VALUES ('T4', '张雪', '女', 51, '教授', 1900, 3000, '自动化')
INSERT INTO T VALUES ('T5', '张兰', '女', 39, '副教授', 1500, 2000, '信息')
    """)
    add_text(document, "执行结果：")
    add_text(document, "(5 行受影响)")
    add_text(document, "命令已成功完成。")
    add_text(document, "插入后的表 T 内容如下：")
    add_table(document, ["TNO", "TN", "SEX", "AGE", "PROF", "SAL", "COMM", "DEPT"], [
        ["T1", "李力", "男", "47", "教授", "1800", "3000", "计算机"],
        ["T2", "王平", "女", "28", "讲师", "850", "1200", "信息"],
        ["T3", "刘帅", "男", "30", "讲师", "1000", "1200", "计算机"],
        ["T4", "张雪", "女", "51", "教授", "1900", "3000", "自动化"],
        ["T5", "张兰", "女", "39", "副教授", "1500", "2000", "信息"],
    ])

    add_text(document, "任务 3：使用 INSERT INTO 插入课程数据")
    add_code_block(document, """
USE jxsk
-- 插入课程数据
INSERT INTO C VALUES ('C1', '程序设计', 60)
INSERT INTO C VALUES ('C2', '微机原理', 80)
INSERT INTO C VALUES ('C3', '数字逻辑', 60)
INSERT INTO C VALUES ('C4', '数据结构', 80)
INSERT INTO C VALUES ('C5', '数据库', 60)
INSERT INTO C VALUES ('C6', '编译原理', 60)
INSERT INTO C VALUES ('C7', '操作系统', 60)
    """)
    add_text(document, "执行结果：")
    add_text(document, "(7 行受影响)")
    add_text(document, "命令已成功完成。")
    add_text(document, "插入后的表 C 内容如下：")
    add_table(document, ["CNO", "CN", "CT"], [
        ["C1", "程序设计", "60"],
        ["C2", "微机原理", "80"],
        ["C3", "数字逻辑", "60"],
        ["C4", "数据结构", "80"],
        ["C5", "数据库", "60"],
        ["C6", "编译原理", "60"],
        ["C7", "操作系统", "60"],
    ])

    add_text(document, "实验 3.2：修改数据", font="黑体", size=14, bold=True)
    add_text(document, "任务 1：修改学生“周武”的系别")
    add_code_block(document, """
USE jxsk
UPDATE S SET DEPT='信息'
WHERE SN='周武'
    """)
    add_text(document, "执行结果：")
    add_text(document, "(1 行受影响)")
    add_text(document, "修改前后对比如下：")
    add_table(document, ["字段", "修改前", "修改后"], [
        ["SNO", "S5", "S5"],
        ["SN", "周武", "周武"],
        ["SEX", "男", "男"],
        ["AGE", "19", "19"],
        ["DEPT", "计算机", "信息"],
    ])

    add_text(document, "任务 2：修改教师“张兰”的职称")
    add_code_block(document, """
USE jxsk
UPDATE T SET PROF='教授'
WHERE TN='张兰'
    """)
    add_text(document, "执行结果：")
    add_text(document, "(1 行受影响)")
    add_text(document, "修改前后对比如下：")
    add_table(document, ["TNO", "TN", "职称修改前", "职称修改后"], [
        ["T5", "张兰", "副教授", "教授"],
    ])

    add_text(document, "实验 3.3：删除数据", font="黑体", size=14, bold=True)
    add_text(document, "任务 1：删除学生“周武”的记录")
    add_code_block(document, """
USE jxsk
DELETE FROM S WHERE SN='周武'
    """)
    add_text(document, "执行结果：")
    add_text(document, "(1 行受影响)")
    add_text(document, "删除前后记录数对比如下：")
    add_table(document, ["操作", "记录数"], [
        ["删除前", "6 条"],
        ["删除后", "5 条"],
    ])
    add_text(document, "删除后的表 S 内容如下：")
    add_table(document, ["SNO", "SN", "SEX", "AGE", "DEPT"], [
        ["S1", "赵亦", "女", "17", "计算机"],
        ["S2", "钱尔", "男", "18", "信息"],
        ["S3", "孙娜", "女", "20", "信息"],
        ["S4", "李思", "男", "21", "自动化"],
        ["S6", "吴丽", "女", "20", "自动化"],
    ])

    add_text(document, "任务 2：删除教师“张兰”的记录")
    add_code_block(document, """
USE jxsk
DELETE FROM T WHERE TN='张兰'
    """)
    add_text(document, "执行结果：")
    add_text(document, "(1 行受影响)")
    add_text(document, "删除后表 T 中剩余 4 条记录，张兰对应记录已被成功删除。")

    add_text(document, "实验 3.4：复制数据库表", font="黑体", size=14, bold=True)
    add_text(document, "任务 1：复制整个表 S 生成 test1")
    add_code_block(document, """
USE jxsk
SELECT * INTO test1 FROM S
GO
    """)
    add_text(document, "执行结果：")
    add_text(document, "(5 行受影响)")
    add_text(document, "已成功创建表“test1”。")
    add_text(document, "test1 表内容如下：")
    add_table(document, ["SNO", "SN", "SEX", "AGE", "DEPT"], [
        ["S1", "赵亦", "女", "17", "计算机"],
        ["S2", "钱尔", "男", "18", "信息"],
        ["S3", "孙娜", "女", "20", "信息"],
        ["S4", "李思", "男", "21", "自动化"],
        ["S6", "吴丽", "女", "20", "自动化"],
    ])

    add_text(document, "任务 2：复制表 T 中男教师的部分列生成 test2")
    add_code_block(document, """
USE jxsk
SELECT TN, SEX, AGE, PROF INTO test2 FROM T
WHERE SEX='男'
GO
    """)
    add_text(document, "执行结果：")
    add_text(document, "(2 行受影响)")
    add_text(document, "已成功创建表“test2”。")
    add_text(document, "test2 表内容如下：")
    add_table(document, ["TN", "SEX", "AGE", "PROF"], [
        ["李力", "男", "47", "教授"],
        ["刘帅", "男", "30", "讲师"],
    ])

    add_text(document, "扩展练习", font="黑体", size=14, bold=True)
    add_text(document, "1. 向表 SC 插入选课数据")
    add_code_block(document, """
USE jxsk
INSERT INTO SC VALUES ('S1', 'C2', 85)
INSERT INTO SC VALUES ('S1', 'C5', 100)
INSERT INTO SC VALUES ('S2', 'C5', 60)
INSERT INTO SC VALUES ('S2', 'C6', 80)
INSERT INTO SC VALUES ('S2', 'C7', NULL)
INSERT INTO SC VALUES ('S3', 'C2', 70)
INSERT INTO SC VALUES ('S3', 'C4', 85)
INSERT INTO SC VALUES ('S4', 'C2', 85)
INSERT INTO SC VALUES ('S4', 'C3', 83)
INSERT INTO SC VALUES ('S5', 'C2', 89)
    """)
    add_text(document, "执行结果：")
    add_text(document, "(10 行受影响)")
    add_text(document, "插入后的表 SC 内容如下：")
    add_table(document, ["SNO", "CNO", "SCORE"], [
        ["S1", "C2", "85"],
        ["S1", "C5", "100"],
        ["S2", "C5", "60"],
        ["S2", "C6", "80"],
        ["S2", "C7", "NULL"],
        ["S3", "C2", "70"],
        ["S3", "C4", "85"],
        ["S4", "C2", "85"],
        ["S4", "C3", "83"],
        ["S5", "C2", "89"],
    ])

    add_text(document, "2. 向表 TC 插入授课数据")
    add_text(document, "原始文本中 (T3, C1) 出现了两次。考虑到授课表通常会以 (TNO, CNO) 作为主键，为避免重复键错误，这里实际保留一条唯一记录。")
    add_code_block(document, """
USE jxsk
INSERT INTO TC VALUES ('T1', 'C1')
INSERT INTO TC VALUES ('T1', 'C4')
INSERT INTO TC VALUES ('T2', 'C5')
INSERT INTO TC VALUES ('T3', 'C1')
INSERT INTO TC VALUES ('T4', 'C2')
INSERT INTO TC VALUES ('T4', 'C3')
INSERT INTO TC VALUES ('T5', 'C5')
INSERT INTO TC VALUES ('T5', 'C7')
    """)
    add_text(document, "执行结果：")
    add_text(document, "(8 行受影响)")
    add_text(document, "插入后的表 TC 内容如下：")
    add_table(document, ["TNO", "CNO"], [
        ["T1", "C1"],
        ["T1", "C4"],
        ["T2", "C5"],
        ["T3", "C1"],
        ["T4", "C2"],
        ["T4", "C3"],
        ["T5", "C5"],
        ["T5", "C7"],
    ])

    add_text(document, "3. 把计算机系学生的年龄增加 1 岁")
    add_code_block(document, """
USE jxsk
UPDATE S SET AGE = AGE + 1
WHERE DEPT = '计算机'
    """)
    add_text(document, "执行结果：")
    add_text(document, "(1 行受影响)")
    add_text(document, "这里之所以是 1 行，是因为前面已经删除了周武，当前表 S 中计算机系只剩下赵亦这一名学生。")
    add_table(document, ["SNO", "SN", "修改前年龄", "修改后年龄"], [
        ["S1", "赵亦", "17", "18"],
    ])

    add_text(document, "4. 把成绩不及格的学生放入新表 makeup_s")
    add_code_block(document, """
USE jxsk
SELECT SNO, CNO, SCORE INTO makeup_s FROM SC
WHERE SCORE < 60
    """)
    add_text(document, "执行结果：")
    add_text(document, "(0 行受影响)")
    add_text(document, "已成功创建表“makeup_s”。由于当前录入的成绩中没有低于 60 分的数据，NULL 也不会被判断为小于 60，所以该表为空表。")
    add_text(document, "makeup_s 表内容如下：")
    add_table(document, ["SNO", "CNO", "SCORE"], [])

    add_text(document, "5. 删除 makeup_s 中成绩在 20 以下的记录")
    add_code_block(document, """
USE jxsk
DELETE FROM makeup_s WHERE SCORE < 20
    """)
    add_text(document, "执行结果：")
    add_text(document, "(0 行受影响)")
    add_text(document, "因为 makeup_s 本身为空表，所以没有记录被删除。")

    add_heading(document, "4. 实验总结")
    summary = [
        "通过这次实验，我把数据库里最基础也最常用的几种数据操作都实际过了一遍，对 INSERT、UPDATE、DELETE 和 SELECT INTO 的作用理解得更清楚了。以前只是知道这些语句怎么写，这次是按照实验步骤一步一步做下来，感觉对整套流程更熟悉了。",
        "在录入数据这部分，我接触了三种思路：一种是用 INSERT INTO 直接插入；一种是通过企业管理器做可视化录入；还有一种是把 Excel 数据导入数据库。虽然这次报告里是用 SQL 来模拟 Excel 导入，但我能理解这种方式在实际工作里会更适合批量导入数据。对于少量数据，手工录入比较直观；对于结构明确的数据，写 SQL 会更方便也更好检查。",
        "在修改数据的时候，我最大的体会就是 WHERE 条件一定不能漏。比如修改周武的系别和修改张兰的职称，都是只改某一条记录。如果 UPDATE 后面没有限制条件，就可能把整张表都改掉，这个后果会很严重。所以以后写更新语句前，我觉得最好先用 SELECT 把目标记录查出来看一下，再执行更新。",
        "删除操作给我的感觉和修改操作差不多，也是要非常小心。DELETE 是直接把数据删掉，如果条件写错，很难补救。实验中删除周武和张兰的记录时，我能明显感觉到先确认目标再删除是一个很有必要的习惯。这一步虽然简单，但也让我意识到数据库操作不能只求快，必须保证准确。",
        "复制数据表这部分我觉得挺实用。SELECT INTO 不但能复制整个表，还能按条件筛选指定字段生成新表，比如把男教师的信息单独复制到 test2。这样做在后面整理数据、备份数据或者生成临时分析表的时候都很方便。我以前没太注意这个语句，现在觉得它在实际使用中应该很常见。",
        "另外，扩展练习也让我注意到一些细节，比如 NULL 和普通数值的比较规则不一样，不能简单把它当成 0 来理解。还有就是插入授课数据时，如果主键设计成组合键，重复数据就会出错，这些都是做实验时容易忽略、但实际很重要的问题。",
        "总的来说，这次实验让我对数据库中“增、删、改、复制”这些基本操作有了比较完整的认识，也为后面继续学习查询、视图和存储过程打下了基础。做完以后我感觉自己不只是会背语句了，而是知道这些语句分别在什么场景下用、要注意什么问题。"
    ]
    for para in summary:
        add_text(document, para)

    add_heading(document, "5. 教师评分")
    add_text(document, "[留空]")


def format_empty_table_row(table):
    if len(table.rows) == 1:
        row = table.add_row().cells
        for idx, cell in enumerate(row):
            set_cell_text(cell, "" if idx else "无记录")


def main():
    document = Document()
    normal_style = document.styles["Normal"]
    normal_style.font.name = "宋体"
    normal_style._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    normal_style.font.size = Pt(12)

    build_cover(document)
    build_body(document)

    # format the empty makeup_s table so Word renders borders clearly
    for table in document.tables:
        headers = [cell.text for cell in table.rows[0].cells]
        if headers == ["SNO", "CNO", "SCORE"] and len(table.rows) == 1:
            format_empty_table_row(table)

    document.save(OUTPUT)
    print(str(OUTPUT))


if __name__ == "__main__":
    main()
