#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/subset-fonts.py —— 自托管 Noto Serif JP 字体子集化脚本

【背景】
Google Fonts 把 Noto Serif JP 拆成约120个 unicode-range 子集分发,浏览器为了
覆盖全部可能出现的字符,一次性下载了 71 个文件共 3.09MB——但全站实际用到的
字符只有一小部分。这个脚本扫描全站会被渲染出来的文字,只把"真正用得到的
字符"打包进两个自托管的 woff2 文件(400、600 两档字重),体积从 3MB+ 级别
降到几百KB级别。

【⚠️ 非常重要:必须在站点文案变更后重新运行这个脚本】
这个字体文件是"扫描当前文案生成"的,不是通用字体。以下任何情况发生后,
必须重新运行一遍 `python3 scripts/subset-fonts.py`,否则新增的文字会因为
不在子集里而被浏览器兜底成系统衬线字体(不会报错、不会白屏,但字形会跟
标题/正文其它文字不一致):
  - 新增/修改了任何页面的可见文案(包括 alt/placeholder/aria-label 等)
  - 新增/修改了 i18n-data.js 或 i18n-extra-*.js 里任意语言的翻译文本
  - 新增/修改了 reserve.js / booking_*.js 里硬编码的日语营销文案
    (PLAN_STATIC_CONTENT / DAYTRIP_STATIC_CONTENT 等)
  - 新增了新的页面文件
顾客在联系表单/预约信息里手动输入的生僻字/姓名用字不受这个字体子集覆盖,
会兜底显示成系统衬线字体——这是可以接受的行为,不需要为了覆盖任意可能输入
的生僻字而打包一个几MB的完整字库,那样就失去子集化的意义了。

【扫描范围说明:比任务描述里"assets/js/i18n*.js"更宽】
除了 i18n-data.js / i18n-extra-*.js 这些翻译字典文件,reserve.js /
booking_info.js / booking_complete.js / booking_lookup.js / contact.js /
script.js / supabase-client.js 里也有不少直接硬编码渲染到页面上的日语文案
(比如 reserve.js 里各房型的营销介绍文字、各种提示语的兜底文案)。这些字符
一样会经由 body{font-family:var(--font-jp)} 用到这个自托管字体,如果只扫
i18n*.js 会漏掉这部分,导致预约页/联系表单出现"部分文字字体不一致"的肉眼
可见问题。所以这个脚本扫描 web/assets/js/ 和 web/reserve/ 下除 admin/ 之外
的全部 .js 文件,以及 web/ 下除 admin/ 之外的全部 .html 文件。
admin/ 后台管理面板不在扫描范围内——它用的是完全独立的系统字体栈
(--admin-font,见 admin.css),不依赖这个自托管字体,不需要参与子集化。

用法:
    python3 scripts/subset-fonts.py

依赖:
    pip install fonttools brotli --break-system-packages

需要提前把源字体放在(这两个文件约 24.5MB/份,故意不提交进 Git,见
.gitignore 里 scripts/font-src/ 这一条的注释):
    scripts/font-src/NotoSerifCJKjp-Regular.otf   (对应 400 字重)
    scripts/font-src/NotoSerifCJKjp-SemiBold.otf  (对应 600 字重)

源字体来自 Noto Serif CJK(Google/Adobe 联合发布的开源 CJK 衬线字体项目,
Noto Serif JP 就是从这个项目切出来的日语单语言版本,字形设计完全一致),
遵循 SIL Open Font License 1.1,允许自由子集化与自托管分发。

获取方式(在 Debian/Ubuntu 环境下,不需要 root 权限):
    cd /tmp
    apt-get download fonts-noto-cjk fonts-noto-cjk-extra
    dpkg-deb -x fonts-noto-cjk_*.deb noto-extract/
    dpkg-deb -x fonts-noto-cjk-extra_*.deb noto-extra-extract/
    python3 -c "
from fontTools.ttLib import TTCollection
TTCollection('noto-extract/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc').fonts[0].save('NotoSerifCJKjp-Regular.otf')
TTCollection('noto-extra-extract/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc').fonts[0].save('NotoSerifCJKjp-SemiBold.otf')
"
    # fonts[0] 是 TTC 集合文件里的第一个子字体,即 "Noto Serif CJK JP"
    # (集合里还打包了 KR/SC/TC/HK 等其它语言区域切法,不需要)
    # 生成的两个 .otf 挪到 scripts/font-src/ 目录下即可。
如果不方便用 apt,也可以直接从 Google Fonts 官方 GitHub 仓库
(github.com/googlefonts/noto-cjk)下载对应的 Regular/SemiBold OTF。
"""

import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
FONT_SRC_DIR = Path(__file__).resolve().parent / "font-src"
FONT_OUT_DIR = WEB / "assets" / "fonts"

SOURCES = {
    "400": FONT_SRC_DIR / "NotoSerifCJKjp-Regular.otf",
    "600": FONT_SRC_DIR / "NotoSerifCJKjp-SemiBold.otf",
}

# ---------- 第一步:收集要扫描的文件 ----------

def collect_html_files():
    files = []
    for p in WEB.rglob("*.html"):
        if "admin" in p.parts:
            continue
        files.append(p)
    return sorted(files)


def collect_js_files():
    files = []
    js_dir = WEB / "assets" / "js"
    for p in js_dir.glob("*.js"):
        files.append(p)
    for p in (WEB / "reserve").glob("*.js"):
        files.append(p)
    return sorted(files)


# ---------- 第二步:从文件里提取"会被渲染出来的文字" ----------

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.S | re.I)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_RENDER_ATTR_RE = re.compile(
    r"""(?:alt|placeholder|title|aria-label|value)\s*=\s*"([^"]*)"|"""
    r"""(?:alt|placeholder|title|aria-label|value)\s*=\s*'([^']*)'"""
)


def extract_html_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    raw = _COMMENT_RE.sub(" ", raw)
    attr_vals = []
    for m in _RENDER_ATTR_RE.finditer(raw):
        attr_vals.append(m.group(1) or m.group(2) or "")
    no_script_style = _SCRIPT_STYLE_RE.sub(" ", raw)
    body_text = _TAG_RE.sub(" ", no_script_style)
    return body_text + " " + " ".join(attr_vals)


_JS_STRING_RE = re.compile(
    r'"((?:[^"\\]|\\.)*)"|' r"'((?:[^'\\]|\\.)*)'|" r"`((?:[^`\\]|\\.)*)`", re.S
)


def extract_js_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    parts = []
    for m in _JS_STRING_RE.finditer(raw):
        parts.append(m.group(1) or m.group(2) or m.group(3) or "")
    return " ".join(parts)


# ---------- 第三步:按字符类别过滤 ----------
# 策略:收集扫描到的全部非空白字符,只排除"这个自托管字体本来就覆盖不到、
# 排除了也不会造成体验倒退"的类别(韩文谚文——Noto Serif JP 从来没有韩文
# 字形,今天用 Google Fonts 版本时韩文本来就是靠 CSS font-family 里的
# serif 兜底渲染,子集化后行为不变)以及控制字符/私有区字符。
# 其余出现过的字符(基本拉丁字母数字符号、平假名、片假名、CJK汉字、
# 全角标点、常见货币/度量符号等)一律保留,不做"是否常用"的主观判断。

def is_hangul(ch: str) -> bool:
    cp = ord(ch)
    return (
        0xAC00 <= cp <= 0xD7A3  # Hangul syllables
        or 0x1100 <= cp <= 0x11FF  # Hangul Jamo
        or 0x3130 <= cp <= 0x318F  # Hangul Compatibility Jamo
        or 0xA960 <= cp <= 0xA97F
        or 0xD7B0 <= cp <= 0xD7FF
    )


def should_keep(ch: str) -> bool:
    if ch.isspace():
        return False
    cp = ord(ch)
    if cp < 0x20:  # 控制字符
        return False
    if is_hangul(ch):
        return False
    cat = unicodedata.category(ch)
    if cat in ("Co", "Cn", "Cs"):  # 私有区/未分配/代理项
        return False
    return True


def build_charset() -> str:
    texts = []
    for f in collect_html_files():
        texts.append(extract_html_text(f))
    for f in collect_js_files():
        texts.append(extract_js_text(f))
    full_text = "\n".join(texts)
    chars = sorted(set(ch for ch in full_text if should_keep(ch)))
    return "".join(chars)


# ---------- 第四步:调用 pyftsubset 生成 woff2 ----------

def run_pyftsubset(src: Path, out_path: Path, charset: str):
    unicodes = ",".join(f"U+{ord(c):04X}" for c in charset)
    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(src),
        f"--unicodes={unicodes}",
        f"--output-file={out_path}",
        "--flavor=woff2",
        # 网页正文用不到印刷排版才需要的 hint/GSUB/GPOS/垂直书写/JIS变体切换等
        # OpenType 高级特性,统统丢弃——这是把单个子集文件从900KB+压到300KB级别
        # 的关键(实测:不丢这些表,一个900KB;丢了之后一个310KB左右)。
        "--no-hinting",
        "--layout-features=",
        "--drop-tables+=GSUB,GPOS,BASE,JSTF,DSIG,STAT,MATH",
        "--desubroutinize",
        "--glyph-names=",
    ]
    subprocess.run(cmd, check=True)


def main():
    if not FONT_SRC_DIR.exists():
        print(f"[错误] 源字体目录不存在:{FONT_SRC_DIR}")
        print("请先把 NotoSerifCJKjp-Regular.otf / NotoSerifCJKjp-SemiBold.otf 放进去。")
        sys.exit(1)

    for weight, src in SOURCES.items():
        if not src.exists():
            print(f"[错误] 缺少源字体文件:{src}")
            sys.exit(1)

    charset = build_charset()
    print(f"扫描完成,共 {len(charset)} 个唯一字符需要打进子集。")

    FONT_OUT_DIR.mkdir(parents=True, exist_ok=True)
    charset_dump = FONT_OUT_DIR / "charset.txt"
    charset_dump.write_text(charset, encoding="utf-8")
    print(f"字符清单已写入 {charset_dump}(供人工比对/下次增量参考)。")

    for weight, src in SOURCES.items():
        out_path = FONT_OUT_DIR / f"noto-serif-jp-subset-{weight}.woff2"
        print(f"正在生成 {out_path.name} ...")
        run_pyftsubset(src, out_path, charset)
        size_kb = out_path.stat().st_size / 1024
        print(f"  完成,{size_kb:.1f} KB")

    print("全部完成。记得同时确认 OFL.txt 还在 web/assets/fonts/ 目录里。")


if __name__ == "__main__":
    main()
