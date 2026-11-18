#!/usr/bin/env python3
"""Собрать справочник городов из сохранённой страницы Циан.

Циан отдаёт вместе со страницей поиска встроенный JSON со списком регионов и
городов. Скрипт вытаскивает оттуда id/названия, чтобы не держать ручной список
городов в коде.

Результат: parser/data/cities.json — массив вида
    [{"id": 4855, "name": "Майкоп", "fullName": "Майкоп г."}, ...]

Запуск:
    python3 parser/discover_cities.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "parser" / "data"
OUTPUT = DATA_DIR / "cities.json"

# В JSON Циан у городов fullName заканчивается на «г.», у регионов — нет.
CITY_ENTRY_RE = re.compile(
    r'\{"id":(\d+),"name":"([^"]+)","displayName":"[^"]*","fullName":"([^"]*)"'
)


def main() -> None:
    pages = sorted(DATA_DIR.glob("*.html"))
    if not pages:
        raise SystemExit(
            "Нет сохранённых страниц в parser/data. Сначала запустите сборщик."
        )

    cities: dict[int, dict[str, object]] = {}
    for page in pages:
        raw = page.read_text(encoding="utf-8", errors="ignore")
        for raw_id, name, full_name in CITY_ENTRY_RE.findall(raw):
            city_id = int(raw_id)
            is_city = full_name.endswith(" г.") or city_id in (1, 2)
            if not is_city:
                continue
            cities[city_id] = {
                "id": city_id,
                "name": name,
                "fullName": full_name,
            }

    if not cities:
        raise SystemExit("Не удалось найти города во встроенном JSON Циан.")

    result = sorted(cities.values(), key=lambda item: (str(item["name"]).casefold(), item["id"]))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Готово: {len(result)} городов")
    print(f"Записано: {OUTPUT}")
    print("Примеры:", ", ".join(item["name"] for item in result[:8]))


if __name__ == "__main__":
    main()
