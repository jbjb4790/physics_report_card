#!/usr/bin/env python3
"""Headless browser smoke test that works in navigation-restricted sandboxes."""
from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import Route, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
OUTPUT = ROOT / 'tests' / 'output'
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://tpl.local/'


def with_base(html: str) -> str:
    return html.replace('<head>', f'<head><base href="{BASE}">', 1)


def serve_static(route: Route) -> None:
    parsed = urlparse(route.request.url)
    relative = unquote(parsed.path.lstrip('/')) or 'index.html'
    target = (SITE / relative).resolve()
    try:
        target.relative_to(SITE.resolve())
    except ValueError:
        route.fulfill(status=403, body='Forbidden')
        return
    if target.is_dir():
        target = target / 'index.html'
    if not target.exists() or not target.is_file():
        route.fulfill(status=404, body='Not found')
        return
    content_type = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
    if target.suffix == '.webmanifest':
        content_type = 'application/manifest+json'
    route.fulfill(status=200, path=str(target), content_type=content_type)


STORAGE_SHIM = r"""
(() => {
  function createStore() {
    const data = new Map();
    return {
      get length() { return data.size; },
      clear() { data.clear(); },
      getItem(key) { key = String(key); return data.has(key) ? data.get(key) : null; },
      key(index) { return Array.from(data.keys())[Number(index)] ?? null; },
      removeItem(key) { data.delete(String(key)); },
      setItem(key, value) { data.set(String(key), String(value)); }
    };
  }
  try { Object.defineProperty(window, 'localStorage', { value: createStore(), configurable: true }); } catch (_) {}
  try { Object.defineProperty(window, 'sessionStorage', { value: createStore(), configurable: true }); } catch (_) {}
})();
"""


def main() -> None:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path='/usr/bin/chromium',
            headless=True,
            args=['--no-sandbox', '--disable-gpu'],
        )
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script(STORAGE_SHIM)
        context.route('https://tpl.local/**', serve_static)

        page = context.new_page()
        page.on('console', lambda msg: errors.append(f'console {msg.type}: {msg.text}') if msg.type == 'error' else None)
        page.on('pageerror', lambda exc: errors.append(f'pageerror: {exc}'))
        page.set_content(with_base((SITE / 'index.html').read_text(encoding='utf-8')), wait_until='networkidle')
        assert page.locator('.site-header .brand__logo').is_visible()
        assert page.locator('.site-header .brand__logo').evaluate('(img) => img.complete && img.naturalWidth > 0')
        assert page.locator('.answer-input').count() == 20
        assert page.locator('.answer-options').count() == 0
        page.locator('.answer-input').first.fill('4')
        assert page.locator('.answer-input').first.input_value() == '4'
        page.locator('#examSelect').select_option('tpl-mid-08')
        assert page.locator('.answer-input').count() == 20
        page.locator('#examSelect').select_option('tpl-mid-09')
        assert page.locator('.answer-input').count() == 20
        assert '9회' in page.locator('#examSelect option:checked').inner_text()
        page.locator('#examSelect').select_option('tpl-mid-10')
        assert page.locator('.answer-input').count() == 20
        assert '10회' in page.locator('#examSelect option:checked').inner_text()
        page.locator('#examSelect').select_option('tpl-mid-01')
        page.locator('#sampleData').click()
        page.locator('#generateReport').evaluate('(el) => el.click()')
        page.locator('.modal').wait_for(state='visible')
        report_url = page.locator('.modal a[href*="report.html"]').get_attribute('href')
        assert report_url and '#report=' in report_url
        assert '#id=' not in report_url
        assert '71.25' in page.locator('.modal').inner_text()
        page.screenshot(path=str(OUTPUT / 'admin.png'), full_page=True)

        report = context.new_page()
        report.on('console', lambda msg: errors.append(f'report console {msg.type}: {msg.text}') if msg.type == 'error' else None)
        report.on('pageerror', lambda exc: errors.append(f'report pageerror: {exc}'))
        report.evaluate("hash => { location.hash = hash; }", urlparse(report_url).fragment)
        report.set_content(with_base((SITE / 'report.html').read_text(encoding='utf-8')), wait_until='load')
        report.locator('#reportDocument').wait_for(state='visible')
        body = report.locator('#reportDocument').inner_text()
        assert '71.25' in body
        assert '문항별 정오표' in body
        assert '오답·미기입 해설과 직접 푸는 동형 문제' in body
        assert report.locator('.review-card').count() == 5
        assert '7번' in body and '공식 정답' in body
        assert report.locator('.report-toolbar .brand__logo').is_visible()
        assert report.locator('.report-cover__avatar img').evaluate('(img) => img.complete && img.naturalWidth > 0')
        assert report.locator('#wordButton').is_visible()
        assert report.locator('#printButton').is_visible()
        assert report.locator('img.question-image').count() == 5
        assert report.locator('.practice-quiz').count() == 5

        first_quiz = report.locator('.practice-quiz').first
        assert first_quiz.get_attribute('data-question-no') == '3'
        assert not first_quiz.locator('.practice-solution').is_visible()
        assert first_quiz.locator('[data-practice-action="check"]').count() == 0
        assert first_quiz.locator('[data-practice-action="reveal"]').count() == 0

        # 선택지를 고르는 순간 정오와 정답·해설이 함께 공개되어야 한다.
        first_quiz.locator('.practice-option[data-choice="1"]').click()
        assert '오답입니다' in first_quiz.locator('.practice-feedback').inner_text()
        assert first_quiz.locator('.practice-solution').is_visible()
        assert '임계각' in first_quiz.locator('.practice-solution').inner_text()
        assert first_quiz.locator('.practice-option.is-correct').count() == 1
        assert first_quiz.locator('.practice-option.is-wrong').count() == 1
        assert first_quiz.locator('.practice-option input:disabled').count() == 5

        # 다시 풀기를 누르면 정답·해설과 선택 상태가 초기화되고 다시 선택할 수 있어야 한다.
        first_quiz.locator('[data-practice-action="reset"]').click()
        assert not first_quiz.locator('.practice-solution').is_visible()
        assert first_quiz.locator('.practice-quiz__status').inner_text() == '미풀이'
        assert first_quiz.locator('.practice-option input:disabled').count() == 0
        first_quiz.locator('.practice-option[data-choice="3"]').click()
        assert '정답입니다' in first_quiz.locator('.practice-feedback').inner_text()
        assert first_quiz.locator('.practice-solution').is_visible()

        second_quiz = report.locator('.practice-quiz').nth(1)
        assert second_quiz.get_attribute('data-question-no') == '7'
        assert not second_quiz.locator('.practice-solution').is_visible()
        second_quiz.locator('[data-practice-action="hint"]').click()
        assert second_quiz.locator('.practice-hint').is_visible()
        second_quiz.locator('.practice-option[data-choice="1"]').click()
        assert '오답입니다' in second_quiz.locator('.practice-feedback').inner_text()
        assert second_quiz.locator('.practice-solution').is_visible()
        second_quiz.locator('[data-practice-action="reset"]').click()
        assert not second_quiz.locator('.practice-solution').is_visible()
        assert not second_quiz.locator('.practice-hint').is_visible()
        assert second_quiz.locator('.practice-quiz__status').inner_text() == '미풀이'

        assert report.evaluate('localStorage.length') > 0
        first_quiz.screenshot(path=str(OUTPUT / 'practice.png'))
        report.screenshot(path=str(OUTPUT / 'report.png'), full_page=True)

        with report.expect_download() as download_info:
            report.locator('#wordButton').click()
        download = download_info.value
        target = OUTPUT / download.suggested_filename
        download.save_as(str(target))
        assert target.suffix.lower() == '.doc'
        assert target.stat().st_size > 50_000
        word_text = target.read_text(encoding='utf-8-sig')
        assert '같은 풀이로 한 문제 더' in word_text
        assert '굴절률이 √2인 유리에서 공기로' in word_text
        assert '같은 풀이 방식' in word_text

        report.set_viewport_size({'width': 390, 'height': 844})
        report.evaluate('window.scrollTo(0, 0)')
        mobile_width = report.evaluate('({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth })')
        assert mobile_width['scroll'] <= mobile_width['inner'] + 1, mobile_width
        report.screenshot(path=str(OUTPUT / 'report-mobile.png'))

        browser.close()

    filtered = [entry for entry in errors if 'favicon' not in entry.lower()]
    assert not filtered, '\n'.join(filtered)
    print('smoke.py: browser flow passed')


if __name__ == '__main__':
    main()
