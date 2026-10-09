#!/usr/bin/env python3
"""Сборка видео: слайды + записи демо + озвучка + субтитры → final.mp4"""
import json, os, re, subprocess, sys, math

ROOT = os.path.dirname(os.path.abspath(__file__))
SEG = os.path.join(ROOT, 'seg'); os.makedirs(SEG, exist_ok=True)
FINAL = os.path.join(ROOT, 'final.mp4')
SRT = os.path.join(ROOT, 'final.srt')
FPS = 30

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(' '.join(cmd)); print(r.stderr[-3000:]); sys.exit(1)

def dur(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip())

COMMON_V = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', str(FPS)]
COMMON_A = ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2']

scenes = json.load(open(os.path.join(ROOT, 'script.json')))
timeline = []  # (start, end, text)
t = 0.0
seg_files = []

for s in scenes:
    narr = os.path.join(ROOT, 'tts', s['id'] + '.mp3')
    nd = dur(narr)
    out = os.path.join(SEG, s['id'] + '.mp4')
    if 'slide' in s:
        D = round(nd + 1.4, 2)
        vf = f"scale=1920:1080,fade=t=in:st=0:d=0.4,fade=t=out:st={D-0.4:.2f}:d=0.4,format=yuv420p"
        run(['ffmpeg', '-y', '-loop', '1', '-framerate', str(FPS), '-i', os.path.join(ROOT, 'slides', s['slide']),
             '-i', narr, '-filter_complex', f"[0:v]{vf}[v];[1:a]adelay=600|600,apad[a]", '-map', '[v]', '-map', '[a]',
             '-t', str(D), *COMMON_V, *COMMON_A, out])
        a_start = 0.6
    else:
        raw = os.path.join(ROOT, 'raw', s['demo'] + '.webm')
        marks = json.load(open(os.path.join(ROOT, 'raw', s['demo'] + '.json')))
        # 1) нормализуем: 30 fps, вырезаем ожидание ответа ИИ
        clip = os.path.join(SEG, s['demo'] + '_clip.mp4')
        sel = ''
        if 'ai_sent' in marks and 'ai_reply' in marks:
            a, b = marks['ai_sent'] + 2.5, marks['ai_reply'] - 0.8
            if b - a > 1.0:
                sel = f"select='not(between(t,{a:.2f},{b:.2f}))',setpts=N/{FPS}/TB,"
        run(['ffmpeg', '-y', '-i', raw, '-vf', f"{sel}scale=1920:1080,format=yuv420p", '-an', *COMMON_V, clip])
        cd = dur(clip)
        D = round(max(cd, nd + 1.2), 2)
        pad = max(0.0, D - cd)
        vf = f"tpad=stop_mode=clone:stop_duration={pad:.2f},fade=t=in:st=0:d=0.3,fade=t=out:st={D-0.3:.2f}:d=0.3"
        run(['ffmpeg', '-y', '-i', clip, '-i', narr, '-filter_complex', f"[0:v]{vf}[v];[1:a]adelay=400|400,apad[a]",
             '-map', '[v]', '-map', '[a]', '-t', str(D), *COMMON_V, *COMMON_A, out])
        a_start = 0.4
    # субтитры: предложения пропорционально длине
    sents = [x.strip() for x in re.split(r'(?<=[.!?])\s+', s['text']) if x.strip()]
    total = sum(len(x) for x in sents)
    cur = t + a_start
    for x in sents:
        d = nd * len(x) / total
        timeline.append((cur, cur + d - 0.05, x))
        cur += d
    seg_files.append(out)
    t += D
    print(f"{s['id']:10s} narr {nd:5.1f}s  seg {D:5.1f}s  → {t/60:4.1f} min")

def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); sec = x % 60
    return f"{h:d}:{m:02d}:{sec:05.2f}"

def chunks(text, limit=88):
    """Делит предложение на части до limit символов по запятым/двоеточиям."""
    if len(text) <= limit: return [text]
    parts, cur = [], ''
    for tok in re.split(r'(?<=[,;:])\s+', text):
        if cur and len(cur) + 1 + len(tok) > limit:
            parts.append(cur); cur = tok
        else:
            cur = (cur + ' ' + tok).strip()
    if cur: parts.append(cur)
    return parts

ASS = os.path.join(ROOT, 'final.ass')
with open(ASS, 'w') as f:
    f.write("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n")
    f.write("[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n")
    f.write("Style: Default,DejaVu Sans,38,&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,4,2,0,2,260,260,42,1\n\n")
    f.write("[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    for (a, b, x) in timeline:
        ps = chunks(x)
        total = sum(len(p) for p in ps)
        cur = a
        for p in ps:
            d = (b - a) * len(p) / total
            f.write(f"Dialogue: 0,{ts(cur)},{ts(cur + d - 0.04)},Default,,0,0,0,,{p}\n")
            cur += d

lst = os.path.join(SEG, 'list.txt')
with open(lst, 'w') as f:
    for p in seg_files: f.write(f"file '{p}'\n")
joined = os.path.join(SEG, 'joined.mp4')
run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', joined])

style = "FontName=DejaVu Sans,FontSize=19,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H66000000,BorderStyle=4,Outline=1,Shadow=0,MarginV=34,MarginL=120,MarginR=120,WrapStyle=0"
run(['ffmpeg', '-y', '-i', joined, '-vf', f"ass={ASS}", *COMMON_V, '-c:a', 'copy', '-movflags', '+faststart', FINAL])
print('FINAL', FINAL, f"{dur(FINAL)/60:.1f} min", os.path.getsize(FINAL) // 1024 // 1024, 'MB')
