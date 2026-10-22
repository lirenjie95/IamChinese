#!/usr/bin/env python3
"""用 OpenCV 的真解码器验一遍二维码：自己编的码到底能不能被读出来。

为什么需要这一步：`test/qr.test.mjs` 只能验结构（定位图案、格式信息、尺寸），
验不了「扫描器认不认」。真正读得出来才算数，所以这里把编码器打通的结果丢回
OpenCV 的 QRCodeDetector 里解，解开且内容一字节不差才算过。

需要 numpy + opencv-python（本机已有）。这是开发期校验，不参与 npm 包运行时。

用法：
    python scripts/verify-qr.py                 # 12 条边界用例：6 版本 × M/Q 两级
    python scripts/verify-qr.py --png qr.png --expect https://example.com/
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2

PLUGIN = Path(__file__).resolve().parent.parent

# 与 scripts/lib/qr.js 的 BYTE_CAPACITY 保持一致：正好塞满最能暴露分块/填充的问题
CAPACITY = {
    'M': [0, 14, 26, 42, 62, 84, 106],
    'Q': [0, 11, 20, 32, 46, 60, 74],
}


def decode(png):
    image = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise SystemExit(f'读不了图片：{png}')
    text, _points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    return text


def boundary_cases():
    cases = []
    for ecc in ('M', 'Q'):
        for version in range(1, 7):
            length = CAPACITY[ecc][version]
            text = 'https://ex.com/'
            index = 0
            while len(text) < length:
                text += str(index % 10)
                index += 1
            cases.append({'ecc': ecc, 'version': version, 'text': text[:length]})
    return cases


def run_matrix(workdir):
    cases = boundary_cases()
    generator = workdir / 'gen.mjs'
    generator.write_text(
        'import { writeFileSync } from "node:fs"\n'
        f'import {{ encode, toPng }} from {json.dumps((PLUGIN / "scripts/lib/qr.js").as_uri())}\n'
        f'const cases = {json.dumps(cases, ensure_ascii=False)}\n'
        'cases.forEach((c, i) => {\n'
        '  const qr = encode(c.text, { ecc: c.ecc, version: c.version })\n'
        f'  writeFileSync({json.dumps(str(workdir))} + "/qr" + i + ".png", toPng(qr, {{ scale: 6, quiet: 4 }}))\n'
        '})\n',
        encoding='utf-8',
    )
    result = subprocess.run(['node', str(generator)], capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(result.stdout, result.stderr)
        raise SystemExit('生成失败')

    passed = 0
    for index, case in enumerate(cases):
        text = decode(workdir / f'qr{index}.png')
        ok = text == case['text']
        passed += ok
        detail = '' if ok else f' -> 解出 {text!r}'
        print(f"{'PASS' if ok else 'FAIL'} {case['ecc']} v{case['version']} "
              f"{len(case['text'])} 字节{detail}")
    print(f'\n{passed}/{len(cases)} 解出来了')
    return passed == len(cases)


def main():
    parser = argparse.ArgumentParser(description='用 OpenCV 验二维码能不能扫出来')
    parser.add_argument('--png', help='只验指定的 PNG')
    parser.add_argument('--expect', help='该 PNG 应该解出的内容')
    args = parser.parse_args()

    if args.png:
        text = decode(Path(args.png))
        if args.expect is None:
            print(repr(text))
            return 0
        ok = text == args.expect
        print(('PASS' if ok else 'FAIL'), repr(text), '应为', repr(args.expect))
        return 0 if ok else 1

    with tempfile.TemporaryDirectory() as tmp:
        return 0 if run_matrix(Path(tmp)) else 1


if __name__ == '__main__':
    sys.exit(main())
