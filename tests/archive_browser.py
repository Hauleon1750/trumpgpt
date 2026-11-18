"""Optional browser regression. Run with Python Playwright and Chromium installed."""
import functools
import http.server
import re
import shutil
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def exercise(url):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which('chromium'))
        context = browser.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
        page = context.new_page()
        errors, outbound = [], []
        page.on('pageerror', lambda err: errors.append(str(err)))
        context.on('request', lambda req: outbound.append(req.url) if urlsplit(req.url).hostname != '127.0.0.1' else None)
        # Simulate a privacy blocker; external services aren't needed for the test.
        context.route('https://**', lambda route: route.abort())
        page.goto(url)
        page.locator('#prompts button').first.click()
        expect(page.locator('#thread .msg')).to_have_count(3)
        page.locator('a[href="./archives.html"]').click()
        expect(page.locator('#results article')).to_have_count(12)
        assert not outbound
        for width in (320, 375, 390, 412, 768):
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            for selector in ('#browse-tab','#ask-tab','#load-feed','.archive .choices button','#search','.source-link'):
                box = page.locator(selector).first.bounding_box()
                assert box['height'] >= 44, selector
        page.locator('#search').fill('真空')
        expect(page.locator('#results article')).to_have_count(1)
        expect(page.locator('#results')).to_contain_text('Mike Pence')
        expect(page.locator('#results .translation')).to_contain_text('中文译文')
        page.locator('#load-feed').click()
        expect(page.locator('#feed-box iframe')).to_have_count(1)
        page.wait_for_function("document.querySelector('#feed-box iframe') !== null")
        expect(page.locator('.dispatch-actions a')).to_have_attribute('href', 'https://x.com/WhiteHouse')
        page.wait_for_timeout(100)
        assert any(host.endswith('/widgets.js') for host in outbound), outbound
        page.locator('#load-feed').click()
        expect(page.locator('#feed-box iframe')).to_have_count(0)
        # Exercise consent and third-party rendering without depending on X availability.
        context.route('https://platform.x.com/widgets.js', lambda route: route.fulfill(
            content_type='application/javascript',
            body="document.querySelector('.twitter-timeline').after(document.createElement('iframe'))"))
        page.locator('#load-feed').click()
        expect(page.frame_locator('#feed-box iframe').locator('iframe')).to_have_count(1)
        page.locator('#ask-tab').click()
        expect(page.locator('#feed-box iframe')).to_have_count(0)
        for query in ('谁谈过重新计票？','这次量子纠缠实验是谁做的？','特朗普谈纸吸管'):
            page.locator('#query').fill(query)
            page.locator('#find').click()
        thread = page.locator('#archive-thread')
        expect(thread.locator('article')).to_have_count(1)
        expect(thread.locator('.query-turn')).to_have_count(3)
        expect(thread).to_contain_text('No verified excerpt matches')
        expect(thread.locator('a')).to_have_attribute('href', re.compile('turkey-pardoning-ceremony-2/$'))
        page.locator('[data-lang="zh"]').click()
        expect(thread.locator('blockquote')).to_have_count(0)
        expect(thread.locator('.translation')).to_have_count(1)
        expect(thread).to_contain_text('没有找到')
        page.locator('[data-lang="en"]').click()
        expect(thread.locator('blockquote')).to_have_count(1)
        expect(thread.locator('.translation')).to_have_count(0)
        page.evaluate('navigator.serviceWorker.ready')
        page.wait_for_function('!!navigator.serviceWorker.controller')
        context.set_offline(True)
        page.goto(url+'archives.html?launch=home#ask')
        expect(page.locator('[data-lang="en"]')).to_have_attribute('aria-pressed','true')
        page.locator('#query').fill('What did the White House say about straws?')
        page.locator('#query').press('Enter')
        expect(thread.locator('.speaker')).to_have_text('The White House')
        page.locator('#browse-tab').click()
        page.locator('#load-feed').click()
        expect(page.locator('#feed-status')).to_contain_text('needs a connection')
        catalogue = page.locator('#results article')
        expect(catalogue).to_have_count(12)
        page.goto(url)
        page.locator('#prompts button').first.click()
        expect(page.locator('#thread .msg')).to_have_count(3)
        page.locator('.archive-mode').click()
        expect(page.locator('#ask')).to_be_visible()
        assert not errors, errors
        browser.close()
        print('PASS mobile layout, topic lookup, speaker, language, single quote/no hit, X consent/fallback, offline deep link and comedy.')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as directory:
        (Path(directory)/'trumpgpt').symlink_to(Path(__file__).resolve().parents[1]/'docs', target_is_directory=True)
        handler = functools.partial(Handler,directory=directory)
        with http.server.ThreadingHTTPServer(('127.0.0.1',0),handler) as server:
            threading.Thread(target=server.serve_forever,daemon=True).start()
            try:
                exercise(f'http://127.0.0.1:{server.server_port}/trumpgpt/')
            finally:
                server.shutdown()
