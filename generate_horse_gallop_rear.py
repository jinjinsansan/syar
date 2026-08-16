from pathlib import Path

from PIL import Image, ImageDraw


W, H = 1760, 260
CELL_W = 220
GROUND_Y = 252
CENTER_X = 110

OUT = Path("horse-gallop-rear.png")

outline = (40, 24, 18, 255)
bay_dark = (83, 45, 25, 255)
bay_mid = (135, 73, 35, 255)
bay = (166, 91, 42, 255)
bay_light = (205, 126, 61, 255)
black = (18, 18, 20, 255)
black_hi = (43, 40, 40, 255)
blue_dark = (19, 62, 145, 255)
blue = (28, 112, 218, 255)
blue_light = (76, 164, 245, 255)
white = (236, 232, 218, 255)
white_shadow = (178, 174, 164, 255)
cloth = (238, 237, 225, 255)
cloth_shadow = (174, 170, 153, 255)
leather = (58, 32, 20, 255)

frames = [
    dict(body_y=96, rump_raise=5, tail=-10, rock=-5, legs=[(-34, 140, -50, 252, True), (30, 142, 50, 248, False), (-58, 124, -66, 230, False), (50, 124, 56, 238, False)]),
    dict(body_y=91, rump_raise=0, tail=-5, rock=-3, legs=[(-30, 138, -18, 252, True), (29, 140, 42, 238, False), (-52, 124, -46, 244, False), (48, 124, 58, 228, False)]),
    dict(body_y=86, rump_raise=-5, tail=0, rock=1, legs=[(-27, 138, -10, 248, False), (27, 138, 10, 252, True), (-50, 124, -35, 236, False), (46, 124, 36, 236, False)]),
    dict(body_y=80, rump_raise=-11, tail=7, rock=4, legs=[(-25, 136, -2, 252, True), (25, 136, 18, 244, False), (-48, 122, -22, 232, False), (45, 122, 28, 236, False)]),
    dict(body_y=94, rump_raise=4, tail=12, rock=2, legs=[(-30, 139, -44, 252, True), (30, 140, 37, 252, True), (-52, 124, -62, 232, False), (48, 124, 54, 236, False)]),
    dict(body_y=88, rump_raise=-2, tail=6, rock=-1, legs=[(-28, 137, -13, 252, True), (29, 138, 29, 244, False), (-52, 124, -40, 238, False), (48, 124, 48, 230, False)]),
    dict(body_y=83, rump_raise=-7, tail=-3, rock=-4, legs=[(-30, 136, -48, 242, False), (28, 136, 43, 240, False), (-51, 122, -60, 232, False), (47, 122, 52, 234, False)]),
    dict(body_y=92, rump_raise=2, tail=-12, rock=-2, legs=[(-34, 139, -44, 252, True), (30, 140, 45, 244, False), (-57, 124, -64, 234, False), (50, 124, 58, 236, False)]),
]


def rect(draw, xy, fill):
    draw.rectangle([int(v) for v in xy], fill=fill)


def poly(draw, pts, fill):
    draw.polygon([(int(x), int(y)) for x, y in pts], fill=fill)


def ellipse(draw, xy, fill):
    draw.ellipse([int(v) for v in xy], fill=fill)


def line(draw, x1, y1, x2, y2, width, fill):
    draw.line((int(x1), int(y1), int(x2), int(y2)), fill=fill, width=int(width))


def hoof(draw, x, y, planted):
    if planted:
        rect(draw, (x - 8, y - 5, x + 8, y), black)
        rect(draw, (x - 5, y - 8, x + 7, y - 4), black_hi)
    else:
        rect(draw, (x - 7, y - 4, x + 7, y + 2), black)
        rect(draw, (x - 4, y - 7, x + 6, y - 3), black_hi)


def draw_leg(draw, ox, by, hx, hy, fx, fy, rear=True, planted=False):
    knee_x = ox + hx * 0.55 + fx * 0.45
    knee_y = by + hy * 0.45 + fy * 0.20
    line(draw, ox + hx, by + hy, ox + knee_x, knee_y, 17, outline)
    line(draw, ox + hx, by + hy, ox + knee_x, knee_y, 11, bay_mid if rear else bay_dark)
    line(draw, ox + knee_x, knee_y, ox + fx, fy - 6, 14, outline)
    line(draw, ox + knee_x, knee_y, ox + fx, fy - 6, 9, black)
    line(draw, ox + knee_x - 2, knee_y, ox + fx - 2, fy - 8, 3, black_hi)
    hoof(draw, ox + fx, fy, planted)


def draw_frame(draw, i, f):
    ox = i * CELL_W + CENTER_X
    by = f["body_y"]
    rump_cy = by + 38 + f["rump_raise"]

    for hx, hy, fx, fy, planted in f["legs"][2:]:
        draw_leg(draw, ox, by, hx, hy, fx, fy, rear=False, planted=planted)

    tx = ox + f["tail"]
    poly(draw, [(ox - 14, rump_cy + 18), (ox + 7, rump_cy + 16), (tx + 15, rump_cy + 88), (tx + 2, rump_cy + 118), (tx - 12, rump_cy + 90)], outline)
    poly(draw, [(ox - 8, rump_cy + 24), (ox + 4, rump_cy + 22), (tx + 8, rump_cy + 86), (tx, rump_cy + 108), (tx - 7, rump_cy + 84)], black)
    rect(draw, (tx - 2, rump_cy + 46, tx + 5, rump_cy + 92), black_hi)

    for hx, hy, fx, fy, planted in f["legs"][:2]:
        draw_leg(draw, ox, by, hx, hy, fx, fy, rear=True, planted=planted)

    ellipse(draw, (ox - 67, rump_cy - 46, ox + 64, rump_cy + 54), outline)
    ellipse(draw, (ox - 60, rump_cy - 39, ox + 58, rump_cy + 47), bay_mid)
    ellipse(draw, (ox - 50, rump_cy - 34, ox + 13, rump_cy + 38), bay)
    ellipse(draw, (ox - 4, rump_cy - 33, ox + 54, rump_cy + 42), bay_dark)
    ellipse(draw, (ox - 37, rump_cy - 33, ox + 7, rump_cy - 6), bay_light)
    ellipse(draw, (ox + 6, rump_cy - 24, ox + 42, rump_cy + 18), bay)
    rect(draw, (ox - 50, rump_cy + 18, ox + 48, rump_cy + 46), bay_dark)
    rect(draw, (ox - 3, rump_cy - 16, ox + 3, rump_cy + 43), bay_dark)
    rect(draw, (ox - 12, rump_cy + 28, ox + 22, rump_cy + 45), (64, 35, 23, 255))
    rect(draw, (ox - 47, rump_cy + 35, ox - 20, rump_cy + 45), bay_dark)
    rect(draw, (ox + 25, rump_cy + 30, ox + 48, rump_cy + 42), (59, 32, 22, 255))

    poly(draw, [(ox - 43, by + 5), (ox + 47, by + 2), (ox + 54, by + 79), (ox - 50, by + 83)], outline)
    poly(draw, [(ox - 36, by + 11), (ox + 42, by + 8), (ox + 47, by + 72), (ox - 43, by + 76)], bay_mid)
    poly(draw, [(ox + 38, by + 9), (ox + 58, by + 23), (ox + 55, by + 58), (ox + 37, by + 48)], bay_dark)
    rect(draw, (ox + 48, by + 15, ox + 61, by + 31), outline)
    rect(draw, (ox + 49, by + 17, ox + 58, by + 28), bay_dark)

    poly(draw, [(ox - 62, by + 55), (ox - 32, by + 45), (ox - 31, by + 99), (ox - 61, by + 92)], outline)
    poly(draw, [(ox + 30, by + 44), (ox + 65, by + 53), (ox + 63, by + 93), (ox + 30, by + 99)], outline)
    poly(draw, [(ox - 58, by + 58), (ox - 35, by + 51), (ox - 34, by + 92), (ox - 57, by + 86)], cloth)
    poly(draw, [(ox + 34, by + 50), (ox + 60, by + 57), (ox + 58, by + 87), (ox + 34, by + 93)], cloth_shadow)

    rock = f["rock"]
    saddle_y = by + 22
    poly(draw, [(ox - 36, saddle_y + 24), (ox + 39, saddle_y + 22), (ox + 31, saddle_y + 49), (ox - 33, saddle_y + 51)], outline)
    poly(draw, [(ox - 30, saddle_y + 27), (ox + 33, saddle_y + 25), (ox + 27, saddle_y + 44), (ox - 28, saddle_y + 46)], leather)

    torso_top = by - 45 + rock
    torso_bot = by + 30 + rock
    poly(draw, [(ox - 35, torso_top + 17), (ox + 29, torso_top + 14), (ox + 35, torso_bot), (ox - 30, torso_bot + 3)], outline)
    poly(draw, [(ox - 29, torso_top + 21), (ox + 24, torso_top + 18), (ox + 28, torso_bot - 5), (ox - 25, torso_bot - 2)], blue)
    rect(draw, (ox - 15, torso_top + 23, ox + 21, torso_top + 36), blue_light)
    rect(draw, (ox + 12, torso_top + 40, ox + 28, torso_bot - 6), blue_dark)
    line(draw, ox - 28, torso_top + 23, ox - 49, by + 29 + rock, 12, outline)
    line(draw, ox + 26, torso_top + 22, ox + 51, by + 26 + rock, 12, outline)
    line(draw, ox - 28, torso_top + 23, ox - 47, by + 27 + rock, 7, blue_dark)
    line(draw, ox + 26, torso_top + 22, ox + 49, by + 24 + rock, 7, blue_dark)

    ellipse(draw, (ox - 21, torso_top - 12, ox + 22, torso_top + 28), outline)
    ellipse(draw, (ox - 17, torso_top - 8, ox + 18, torso_top + 23), blue)
    rect(draw, (ox - 16, torso_top + 14, ox + 18, torso_top + 23), blue_dark)
    rect(draw, (ox - 2, torso_top - 8, ox + 6, torso_top + 21), blue_light)

    poly(draw, [(ox - 26, torso_bot - 1), (ox - 5, torso_bot + 1), (ox - 15, torso_bot + 48), (ox - 36, torso_bot + 47)], outline)
    poly(draw, [(ox + 4, torso_bot), (ox + 28, torso_bot - 2), (ox + 39, torso_bot + 42), (ox + 17, torso_bot + 45)], outline)
    poly(draw, [(ox - 22, torso_bot + 2), (ox - 8, torso_bot + 3), (ox - 17, torso_bot + 40), (ox - 31, torso_bot + 39)], white)
    poly(draw, [(ox + 8, torso_bot + 1), (ox + 23, torso_bot), (ox + 33, torso_bot + 36), (ox + 20, torso_bot + 39)], white_shadow)
    rect(draw, (ox - 39, torso_bot + 39, ox - 18, torso_bot + 50), black)
    rect(draw, (ox + 18, torso_bot + 36, ox + 42, torso_bot + 47), black)
    rect(draw, (ox - 39, torso_bot + 39, ox - 28, torso_bot + 43), black_hi)
    rect(draw, (ox + 20, torso_bot + 36, ox + 32, torso_bot + 40), black_hi)

    line(draw, ox - 55, rump_cy - 15, ox - 62, rump_cy + 34, 5, outline)
    line(draw, ox + 55, rump_cy - 17, ox + 60, rump_cy + 29, 5, outline)


def main():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i, frame in enumerate(frames):
        draw_frame(draw, i, frame)
    img.save(OUT)
    print(OUT.resolve())


if __name__ == "__main__":
    main()
