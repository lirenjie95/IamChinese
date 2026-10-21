"""从那张「我爱国无罪」的截图里裁出人像，做成仓库的 logo。

输入：assets/wujing-i-am-chinese.webp（原始截图，350×273，单帧）
输出：
  assets/logo.png            512×512 主 logo（圆形人像 + 环形描边 + 题字）
  assets/logo-mark.png       532×532 只有圆章、透明背景（放深色/浅色底都好用）
  assets/logo-horizontal.png 1200×360 横版锁定组合（圆章 + 字标），README 头图
  assets/favicon.ico         16/32/48/64 多尺寸，浏览器标签用

眼部做了马赛克：梗留着，清晰人像不跟着仓库到处传。改 EYE_BOX / EYE_BLOCK 可调。

裁剪参数是量出来写死的，不靠自动检测：脸在 (170, 100) 附近，取边长 210 的正方形，
取景框略偏上，让头顶留白比下巴多一点——证件照式居中最难看。

用法：python assets/make_logo.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "wujing-i-am-chinese.webp"

# 取景：源图 350×273。脸中心 ≈ (170, 100)，边长 210 的方形，纵向贴到 0（顶部本来就被裁了）
CROP_SIZE = 210
CROP_LEFT = 65
CROP_TOP = 0

# 打码区：裁后坐标系（210×210）里眉骨到下眼睑，横向覆盖两只眼
EYE_BOX = (54, 68, 174, 130)
EYE_BLOCK = 14              # 马赛克块边长（裁后像素），越小越能认出眼睛

# ico 专用：区域更大、块更粗。16px 的图标塞不下细节，索性让它一眼就是「打了码」
ICON_BOX = (0, 0, 210, 210)
ICON_BLOCK = 22

BG = (16, 17, 20)          # 近黑，别用纯黑：纯黑在投影里会糊成一块
RING = (200, 16, 46)       # 中国红
INK = (245, 245, 245)      # 题字
SUBTLE = (150, 152, 158)   # 次要说明

FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_REGULAR = "C:/Windows/Fonts/msyh.ttc"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def circular(portrait: Image.Image, diameter: int, ring_width: int,
             vignette: bool = True) -> Image.Image:
    """把方形人像裁成圆章：内部圆 + 一圈描边，外部透明。

    圆内压一层很轻的暗角：原图背景是爆炸火光，不压的话人和字都被背景抢走。
    `vignette=False` 给 ico 用——16px 的图标经不起压暗，压完只剩一块深色。
    """
    size = diameter + ring_width * 2
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = portrait.resize((diameter, diameter), Image.LANCZOS).convert("RGBA")

    if vignette:
        # 暗角：径向渐变当遮罩，边缘往黑里压，中心不动
        falloff = Image.radial_gradient("L").resize((diameter, diameter), Image.LANCZOS)
        shade = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
        shade.putalpha(falloff.point(lambda value: int(value * 0.55)))
        inner = Image.alpha_composite(inner, shade)

    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, diameter - 1, diameter - 1), fill=255)
    canvas.paste(inner, (ring_width, ring_width), mask)

    ring = ImageDraw.Draw(canvas)
    ring.ellipse(
        (0, 0, size - 1, size - 1),
        outline=(*RING, 255),
        width=ring_width,
    )
    return canvas


def composited_mark(portrait: Image.Image) -> Image.Image:
    """512×512 主 logo：圆章 + 下方题字。"""
    canvas = Image.new("RGB", (512, 512), BG)
    mark = circular(portrait, 344, 8)
    canvas.paste(mark, ((512 - mark.width) // 2, 18), mark)

    draw = ImageDraw.Draw(canvas)
    caption = load_font(FONT_BOLD, 54)
    latin = load_font(FONT_REGULAR, 22)

    text = "我爱国无罪"
    box = draw.textbbox((0, 0), text, font=caption)
    draw.text(((512 - (box[2] - box[0])) / 2 - box[0], 398), text, font=caption, fill=INK)

    # 字标压一行小字，字母之间手动加空格，免得挤在一起
    wordmark = "I A M  C H I N E S E"
    box = draw.textbbox((0, 0), wordmark, font=latin)
    draw.text(((512 - (box[2] - box[0])) / 2 - box[0], 474), wordmark, font=latin, fill=SUBTLE)
    return canvas


def horizontal(portrait: Image.Image) -> Image.Image:
    """1200×360 横版：左边圆章，右边两行字。README 顶部用这张。"""
    canvas = Image.new("RGB", (1200, 360), BG)
    mark = circular(portrait, 280, 7)
    canvas.paste(mark, (48, (360 - mark.height) // 2), mark)

    draw = ImageDraw.Draw(canvas)
    title = load_font(FONT_BOLD, 92)
    sub = load_font(FONT_REGULAR, 34)

    draw.text((392, 84), "我爱国无罪", font=title, fill=INK)
    draw.text((398, 236), "IamChinese · 一套把人设当工程做的小工具", font=sub, fill=SUBTLE)
    return canvas


def mosaic(portrait: Image.Image, box: tuple[int, int, int, int] = EYE_BOX,
           block: int = EYE_BLOCK) -> Image.Image:
    """把指定区域打成马赛克：粗网格像素化，边缘不留清晰轮廓。

    box 是裁后坐标系的 (left, top, right, bottom)，block 是块边长（像素）。
    """
    canvas = portrait.copy()
    left, top, right, bottom = box
    width = right - left
    height = bottom - top
    cols = max(1, width // block)
    rows = max(1, height // block)

    patch = portrait.crop(box)
    # 先缩到「块」大小再放大回去，NEAREST 才不会被插值成一片糊
    patch = patch.resize((cols, rows), Image.BOX)
    patch = patch.resize((width, height), Image.NEAREST)
    canvas.paste(patch, (left, top))
    return canvas


def favicon(portrait: Image.Image) -> Image.Image:
    """ico 专用构图：圆章吃满整格，不放题字。

    16px 只有 16 个像素宽，一行中文缩到那儿就是噪点；红环 + 马赛克脸反而认得出来。
    """
    canvas = Image.new("RGB", (512, 512), BG)
    mark = circular(portrait, 464, 24, vignette=False)
    canvas.paste(mark, ((512 - mark.width) // 2, (512 - mark.height) // 2), mark)
    return canvas


def main() -> None:
    source = Image.open(SRC).convert("RGB")
    portrait = source.crop(
        (CROP_LEFT, CROP_TOP, CROP_LEFT + CROP_SIZE, CROP_TOP + CROP_SIZE)
    )
    portrait = mosaic(portrait)

    mark = composited_mark(portrait)
    mark.save(HERE / "logo.png")

    # 圆章单独存一份透明的：README 里的小尺寸或深色主题都靠它
    circular(portrait, 512, 10).save(HERE / "logo-mark.png")

    horizontal(portrait).save(HERE / "logo-horizontal.png")

    # ico 最宽只有 64px，14 的块缩到那个尺寸就糊回去了：先按更粗的块再打一遍，
    # 缩到 16px 时剩下的仍然是方格子，而不是一张能认出五官的小脸。
    # 也正因为小，ico 不放题字——16px 下那四字只是一排噪点，不如让圆章占满整格。
    icon_portrait = mosaic(portrait, ICON_BOX, ICON_BLOCK)
    favicon(icon_portrait).save(
        HERE / "favicon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128)],
    )

    for name in ("logo.png", "logo-mark.png", "logo-horizontal.png", "favicon.ico"):
        path = HERE / name
        print(f"{name}: {path.stat().st_size} 字节")


if __name__ == "__main__":
    main()
