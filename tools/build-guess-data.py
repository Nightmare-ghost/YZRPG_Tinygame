#!/usr/bin/env python3
"""把 data/guessdata.xlsx 转换成 js/guess-data.js。

用法：
    python tools/build-guess-data.py

规则：
- 读取第一张工作表；
- 按“名称”去重，保留第一次出现的那一行；
- 列顺序：序号 / 名称 / 种族 / 世界 / CG个数 / 性别 / 多形态 / 啪呼啪呼技能 / 胸部大小
- “啪呼啪呼技能”只是内部编码，不进入竞猜的七个属性；
- 生成 YZ.guessData，游戏与名称数据库都会读取它。
"""
from pathlib import Path
from openpyxl import load_workbook
import json

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "guessdata.xlsx"
OUT = ROOT / "js" / "guess-data.js"


def num(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def main():
    wb = load_workbook(SRC, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    items, seen = [], set()
    for row in rows:
        if not row or row[1] is None:
            continue
        name = str(row[1]).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        items.append({
            "id": "g%d" % (len(items) + 1),
            "name": name,
            "race": str(row[2]).strip() if row[2] is not None else "",
            "world": str(row[3]).strip() if row[3] is not None else "",
            "cg": num(row[4]),
            "gender": str(row[5]).strip() if row[5] is not None else "",
            "forms": num(row[6], 1),
            "bust": num(row[8], 1),
        })
    js = (
        "/* 自动生成：data/guessdata.xlsx（按名称去重，共 %d 位） */\n"
        "window.YZ = window.YZ || {};\n"
        "YZ.guessData = %s;\n"
        "YZ.guessMeta = %s;\n"
        % (
            len(items),
            json.dumps(items, ensure_ascii=False, indent=1),
            json.dumps({"total": len(items), "source": "data/guessdata.xlsx"}, ensure_ascii=False),
        )
    )
    OUT.write_text(js, encoding="utf-8")
    print("wrote", OUT, "items", len(items))


if __name__ == "__main__":
    main()
