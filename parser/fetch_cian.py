#!/usr/bin/env python3
"""Сохранить страницу поиска Циан в HTML через настоящий браузер.

Циан использует JS-challenge ServicePipe и при необходимости показывает
капчу. Поэтому мы не обходим защиту, а открываем обычный видимый браузер:
пользователь при необходимости проходит проверку вручную, после чего скрипт
сохраняет уже отрисованный HTML. Дальше работает parse_cian.py.

Установка:
    python -m pip install -r parser/requirements.txt
    python -m playwright install chromium

Запуск:
    python parser/fetch_cian.py
    python parser/fetch_cian.py --out parser/data/cian-rent.html --wait 30
"""

from __future__ import annotations

import argparse
from pathlib import Path

DEFAULT_URL = "https://novosibirsk.cian.ru/snyat-kvartiru/"


def main() -> None:
    parser = argparse.ArgumentParser(description="Сохранить HTML страницы Циан")
    parser.add_argument("--url", default=DEFAULT_URL, help="адрес поиска")
    parser.add_argument(
        "--out",
        default="parser/data/cian-rent.html",
        help="куда сохранить HTML",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=25,
        help="сколько секунд дать на ручное прохождение капчи",
    )
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit(
            "Playwright не установлен. Выполните:\n"
            "  python -m pip install -r parser/requirements.txt\n"
            "  python -m playwright install chromium"
        )

    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context(
            locale="ru-RU",
            viewport={"width": 1440, "height": 1000},
        )
        page = context.new_page()
        print(f"Открываю {args.url}")
        page.goto(args.url, wait_until="domcontentloaded", timeout=120_000)

        print(
            f"\nЕсли Циан показал капчу или проверку — пройдите её в окне браузера.\n"
            f"Через {args.wait} секунд страница будет сохранена автоматически."
        )
        page.wait_for_timeout(args.wait * 1000)

        try:
            page.wait_for_selector(
                'article[data-name="CardComponent"]',
                timeout=15_000,
            )
        except Exception:
            print(
                "Карточки не найдены. Возможно, капча не пройдена или Циан "
                "изменил разметку. HTML всё равно будет сохранён для отладки."
            )

        # Прокрутка вниз помогает подгрузить ещё несколько карточек.
        for _ in range(5):
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(700)

        html = page.content()
        output.write_text(html, encoding="utf-8")
        print(f"Сохранено: {output} ({len(html):,} символов)")
        browser.close()


if __name__ == "__main__":
    main()
