"""Mobile Chromium → local workerd → SQLite Durable Object → Mock; no cloud account."""
import concurrent.futures
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def run_preview(directory):
    for name in ("worker", "docs"):
        shutil.copytree(ROOT / name, directory / name)
    shutil.copyfile(ROOT / "wrangler.toml", directory / "wrangler.toml")
    token = secrets.token_urlsafe(32)
    (directory / ".dev.vars").write_text("TEST_ACCESS_TOKEN=" + token)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = str(sock.getsockname()[1])
    url = "http://127.0.0.1:" + port
    env = {**os.environ, "WRANGLER_SEND_METRICS": "false", "CI": "1",
           "XDG_CONFIG_HOME": str(directory / "config"), "WRANGLER_LOG_PATH": str(directory / "logs")}
    with (directory / "startup.log").open("w") as log:
        process = subprocess.Popen([ROOT / "node_modules/.bin/wrangler", "dev", "--local",
                                    "--ip", "127.0.0.1", "--port", port, "--inspector-port", "0"],
                                   cwd=directory, env=env, stdout=log, stderr=log, start_new_session=True)
    try:
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError((directory / "startup.log").read_text().replace(token, "[redacted]")[-5000:])
            try:
                with urllib.request.urlopen(url, timeout=1):
                    break
            except OSError:
                time.sleep(0.25)
        else:
            raise RuntimeError("Local Worker startup timed out")
        exercise(url, token)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=15)


def exercise(url, token):
    def post(access, data):
        req = urllib.request.Request(url + "/api/chat", data=json.dumps(data).encode(),
                                     headers={"Content-Type":"application/json", "Authorization":"Bearer " + access})
        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                return res.status
        except urllib.error.HTTPError as e:
            return e.code

    sample = {"mode":"qa", "history":[], "question":"Hello?"}
    assert post("incorrect", sample) == 401
    assert post(token, {**sample, "model":"custom"}) == 400

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
        context = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True,
                                      permissions=["clipboard-read","clipboard-write"])
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)
        page.get_by_role("button", name="中文", exact=True).click()
        page.locator('[data-source="ai"]').click()
        page.locator("#test-pass").fill(token)
        question = page.locator("#question")
        replies = page.locator("#thread .msg:not(.user) .answer")
        for width in (320, 390):
            page.set_viewport_size({"width":width, "height":844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        for mode in ("qa", "press", "crisis"):
            page.locator(f'[data-mode="{mode}"]').click()
            question.fill("蓝杯子在哪里？")
            page.locator(".send").click()
            expect(replies).to_have_count(2)
            question.fill("还记得我刚才问了什么吗？")
            page.locator(".send").click()
            expect(replies.last).to_contain_text("蓝杯子在哪里？")
            expect(replies).to_have_count(3)
        # Hold a single outgoing request to observe loading, then finish it in another mode.
        held = []
        page.route("**/api/chat", lambda route: held.append(route))
        question.fill("A delayed question")
        page.locator(".send").click()
        expect(page.locator(".send")).to_be_disabled()
        expect(page.locator("#ai-state")).to_contain_text("等待回复")
        page.locator('[data-mode="press"]').click()
        expect(replies).to_have_count(3)
        held[0].continue_()
        page.unroute("**/api/chat")
        page.locator('[data-mode="crisis"]').click()
        expect(replies).to_have_count(4)
        page.locator('[data-mode="press"]').click()
        expect(replies).to_have_count(3)
        for lang in ("both", "en", "zh"):
            page.locator(f'[data-lang="{lang}"]').click()
            page.locator("#copyBtn").click()
            clip = page.evaluate("navigator.clipboard.readText()")
            assert ("Mock reply" in clip) == (lang != "zh")
            assert ("模拟回复" in clip) == (lang != "en")
            assert ("Even the paperwork remembers" in clip) == (lang != "zh")
            assert ("连文件都记得" in clip) == (lang != "en")
            assert ("所有回答均为虚构" in clip) == (lang != "en")
        page.evaluate("navigator.serviceWorker.ready")
        page.wait_for_function("!!navigator.serviceWorker.controller")
        context.set_offline(True)
        question.fill("再问一次")
        page.locator(".send").click()
        expect(page.locator("#retry")).to_be_visible()
        page.locator('[data-source="offline"]').click()
        question.fill("午饭呢？")
        page.locator(".send").click()
        expect(replies).to_have_count(2)
        page.locator('[data-source="ai"]').click()
        context.set_offline(False)
        page.locator("#retry").click()
        expect(replies).to_have_count(4)
        expect(page.locator("#thread .user")).to_have_count(3)
        context.set_offline(True)
        page.reload()
        expect(page.locator('[data-source="offline"]')).to_have_attribute("aria-pressed","true")
        page.locator("#prompts button").first.click()
        expect(replies).to_have_count(2)
        expect(page.locator("#test-pass")).to_have_value("")
        assert not errors, errors
        browser.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        statuses = list(pool.map(lambda _: post(token,sample),range(14)))
    assert 429 in statuses and set(statuses) <= {200,429}, statuses
    print("PASS: workerd, SQLite quota, 3 modes × 2 turns, languages, clipboard, network loss, "
          "retry without duplicate turns, offline PWA reload, access and concurrent throttling.")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="trumpgpt-v2-") as tmp:
        run_preview(Path(tmp))
