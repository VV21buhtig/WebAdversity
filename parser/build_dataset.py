#!/usr/bin/env python3
"""Собрать единый JSON из всех сохранённых страниц Циан.

Скрипт не ходит в сеть. Он берёт файлы parser/data/city-<id>-<тип>.html,
парсит их через parse_cian и подставляет название города из автоматически
собранного справочника parser/data/cities.json.

Запуск:
    python3 parser/build_dataset.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
PARSER_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT / "parser" / "data"
CITIES_FILE = DATA_DIR / "cities.json"
OUTPUT = ROOT / "src" / "data" / "listings.json"

sys.path.insert(0, str(PARSER_DIR))
from parse_cian import parse_html  # noqa: E402

FILE_RE = re.compile(r"^city-(\d+)-(flat|house)\.html$")

# Циан иногда отдаёт в карточке цену вроде «34 ₽/мес.» — это почти наверняка
# ошибка продавца или цена за сутки/человека. Для долгосрочной аренды такие
# значения ломают статистику, поэтому не считаем их ценой месячной аренды.
MIN_MONTHLY_RENT = 3000


def load_cities() -> dict[int, str]:
    if not CITIES_FILE.exists():
        raise SystemExit(
            f"Нет справочника городов: {CITIES_FILE}\n"
            "Сначала запустите: python3 parser/discover_cities.py"
        )
    raw = json.loads(CITIES_FILE.read_text(encoding="utf-8"))
    return {
        int(item["id"]): str(item["name"])
        for item in raw
        if item.get("id") is not None and item.get("name")
    }


def normalize_item(item: dict[str, Any], city: str, city_id: int, type_key: str) -> dict[str, Any]:
    item = dict(item)
    is_house = type_key == "house"

    # Тип жилья определяется по разделу, из которого сохранена страница.
    # Это надёжнее эвристики по заголовку отдельного объявления.
    item["propertyType"] = "house" if is_house else "flat"
    item["city"] = city
    item["cityId"] = city_id
    item["bedrooms"] = item.get("rooms") if is_house else None
    if not is_house:
        item["landArea"] = None

    price = item.get("price")
    if isinstance(price, (int, float)) and 0 < price < MIN_MONTHLY_RENT:
        item["price"] = None
        item["priceLabel"] = ""

    if item.get("url"):
        item["sourceUrl"] = item["url"]
    return item


def main() -> None:
    if not DATA_DIR.exists():
        raise SystemExit(f"Нет папки с сохранёнными страницами: {DATA_DIR}")

    city_names = load_cities()
    merged: dict[str, dict[str, Any]] = {}
    stats: dict[tuple[str, str], int] = {}

    for path in sorted(DATA_DIR.glob("*.html")):
        match = FILE_RE.fullmatch(path.name)
        if not match:
            continue
        city_id = int(match.group(1))
        type_key = match.group(2)
        city = city_names.get(city_id)
        if not city:
            print(f"  ! {path.name}: город {city_id} отсутствует в справочнике")
            continue

        raw = path.read_text(encoding="utf-8", errors="ignore")
        items = parse_html(raw)
        if not items:
            print(f"  ! {path.name}: объявления не найдены")
            continue

        accepted = 0
        for item in items:
            normalized = normalize_item(item, city, city_id, type_key)
            listing_id = str(normalized.get("id") or "").strip()
            if not listing_id or listing_id in merged:
                continue
            merged[listing_id] = normalized
            accepted += 1

        stats[(city, type_key)] = accepted
        print(f"  {city:<20} {type_key:<5} {accepted:>3}")

    if not merged:
        raise SystemExit(
            "Не удалось собрать ни одного объявления. "
            "Проверьте, что в parser/data есть сохранённые страницы без капчи."
        )

    listings = sorted(
        merged.values(),
        key=lambda item: (
            str(item.get("city", "")).casefold(),
            0 if item.get("propertyType") == "flat" else 1,
            item.get("price") if isinstance(item.get("price"), (int, float)) else 10**12,
            str(item.get("id", "")),
        ),
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(listings, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    cities = sorted({item["city"] for item in listings}, key=str.casefold)
    flats = sum(1 for item in listings if item.get("propertyType") == "flat")
    houses = len(listings) - flats

    print()
    print(f"Готово: {len(listings)} объявлений")
    print(f"  квартиры: {flats}")
    print(f"  дома:     {houses}")
    print(f"  города:   {', '.join(cities)}")
    print(f"  записано: {OUTPUT}")


if __name__ == "__main__":
    main()
