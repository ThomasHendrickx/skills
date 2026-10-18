"""Render <workdir>/page.html to a 1080p30 MP4 and add sound.wav. Usage: export.py <workdir> <name>  ->  <workdir>/<name>.mp4
Run it alone: on a small machine the voice or speech models running alongside starve it. Stops if the fonts did not load."""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright

wd, name = sys.argv[1], sys.argv[2]
FPS = 30
DUR = json.load(open(os.path.join(wd, "scenario.json"), encoding="utf-8"))["timeline"]["dur"]
silent = os.path.join(wd, "video_silent.mp4")
CSS = """html,body{margin:0!important;padding:0!important;background:#f6f8fb!important}:root{padding:0!important}
.wrap{max-width:none!important;padding:0!important;gap:0!important;display:block!important}.top,.ctrl,.chapters{display:none!important}
.stage{width:1920px!important;height:1080px!important;border:0!important;border-radius:0!important}"""
FONTS = """(async()=>{await document.fonts.load('700 20px "Bricolage Grotesque"');await document.fonts.load('600 14px "IBM Plex Sans"');
const L=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family);return L.some(x=>x.includes('Bricolage'))&&L.some(x=>x.includes('Plex Sans'))})()"""

async def main():
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        await pg.goto("file://" + os.path.abspath(os.path.join(wd, "page.html")), wait_until="domcontentloaded", timeout=120000)
        await pg.evaluate("Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,30000))])")
        assert await pg.evaluate(FONTS), "fonts did not load: check network access to fonts.googleapis.com"
        await pg.add_style_tag(content=CSS); await pg.wait_for_timeout(800)
        await pg.evaluate("window.dispatchEvent(new Event('resize'))"); await pg.wait_for_timeout(300)
        st = pg.locator("#stage"); n = int(FPS * DUR)
        for i in range(n + 1):
            await pg.evaluate(f"window.__seek({i / FPS})")
            ff.stdin.write(await st.screenshot(type="jpeg", quality=94))
            if i % 300 == 0: print("frame", i, "of", n, flush=True)
        await b.close()
    ff.stdin.close(); ff.wait()
    out = os.path.join(wd, name + ".mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", os.path.join(wd, "sound.wav"), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    print("done", out, flush=True)

asyncio.run(main())
