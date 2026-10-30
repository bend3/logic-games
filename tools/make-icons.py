"""Renders icons/icon-192.png and icons/icon-512.png (same design as icon.svg) with no dependencies."""
import struct
import zlib
from pathlib import Path

BG = (0x0A, 0x66, 0xC2)
QUADS = [(0xBB, 0xA3, 0xE2), (0xFF, 0xC9, 0x92), (0x96, 0xBE, 0xFF), (0xB3, 0xDF, 0xA0)]
INK = (0x1D, 0x1D, 0x1D)
# Coordinates in the 512 design space (see icon.svg)
CROWN = [(156, 336), (140, 208), (206, 254), (256, 170), (306, 254), (372, 208), (356, 336)]
BASE = (156, 350, 356, 372)


def inside(poly, x, y):
    hit = False
    j = len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def color_at(x, y):
    if inside(CROWN, x, y) or (BASE[0] <= x <= BASE[2] and BASE[1] <= y <= BASE[3]):
        return INK
    if 96 <= x < 416 and 96 <= y < 416:
        return QUADS[(x >= 256) + 2 * (y >= 256)]
    return BG


def render(size, ss=3):
    scale = 512 / size
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = color_at((px + (sx + 0.5) / ss) * scale, (py + (sy + 0.5) / ss) * scale)
                    for k in range(3):
                        acc[k] += c[k]
            row += bytes(v // (ss * ss) for v in acc)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


out = Path(__file__).resolve().parent.parent / "icons"
for size in (192, 512):
    (out / f"icon-{size}.png").write_bytes(render(size))
    print(f"wrote icon-{size}.png")
