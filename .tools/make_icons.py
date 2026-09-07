# -*- coding: utf-8 -*-
"""生成 MOTE跑团日历 PWA 图标（线性极简风格，象牙白底）
用法: python .tools/make_icons.py
"""
import os
from PIL import Image, ImageDraw

BASE = 512
BG    = (255, 253, 248, 255)
INK   = (44, 40, 32, 255)
GOLD  = (139, 122, 84, 255)
GOLDL = (201, 185, 143, 255)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def draw(size, maskable=False):
    ss = 4                      # 超采样倍数
    w = size * ss
    s = w / float(BASE)

    if maskable:
        k, off = 0.74, (1 - 0.74) / 2 * BASE
    else:
        k, off = 1.0, 0.0

    def tx(v):  # 坐标
        return (v * k + off) * s

    def tw(v):  # 长度/半径
        return v * k * s

    img = Image.new('RGBA', (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        d.rectangle([0, 0, w, w], fill=BG)
    else:
        d.rounded_rectangle([0, 0, w - 1, w - 1], radius=int(104 * s), fill=BG)

    # 日历外框
    d.rounded_rectangle(
        [tx(128), tx(118), tx(384), tx(402)],
        radius=int(30 * k * s), outline=INK, width=int(tw(20))
    )
    # 顶部分隔线
    d.line([(tx(128), tx(198)), (tx(384), tx(198))], fill=INK, width=int(tw(20)))

    # 顶部挂耳（圆头线段）
    for ax in (180, 332):
        d.line([(tx(ax), tx(86)), (tx(ax), tx(142))], fill=INK, width=int(tw(20)))
        r = tw(10)
        d.ellipse([tx(ax) - r, tx(86) - r, tx(ax) + r, tx(86) + r], fill=INK)
        d.ellipse([tx(ax) - r, tx(142) - r, tx(ax) + r, tx(142) + r], fill=INK)

    # 骰子点
    for cx, cy, r, c in [
        (218, 266, 21, GOLD),
        (218, 334, 21, GOLD),
        (294, 300, 21, GOLD),
        (294, 368, 21, GOLDL),
    ]:
        rr = tw(r)
        d.ellipse([tx(cx) - rr, tx(cy) - rr, tx(cx) + rr, tx(cy) + rr], fill=c)

    return img.resize((size, size), Image.LANCZOS)


def main():
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-192.png', 192, True),
        ('icon-maskable-512.png', 512, True),
    ]
    for name, size, mask in targets:
        p = os.path.abspath(os.path.join(OUT, name))
        draw(size, mask).save(p, 'PNG')
        print('written', p, os.path.getsize(p), 'bytes')


if __name__ == '__main__':
    main()
