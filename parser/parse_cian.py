#!/usr/bin/env python3
"""Парсер сохранённой страницы Циан с объявлениями об аренде.

Почему парсер работает с сохранённым HTML, а не с requests:
Циан отдаёт обычному HTTP-клиенту JS-заглушку ServicePipe. Поэтому страницу
сначала открывает настоящий браузер (см. fetch_cian.py), при необходимости
пользователь вручную проходит капчу, после чего HTML сохраняется на диск.
Этот скрипт извлекает объявления из сохранённого HTML и нормализует поля.

Запуск:
    python parser/parse_cian.py parser/data/cian-rent.html -o src/data/listings.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from lxml import html
from lxml.etree import _Element


PRICE_RE = re.compile(r"([\d\s\u00a0]+)\s*₽\s*/\s*мес", re.IGNORECASE)
ROOMS_RE = re.compile(r"(\d+)\s*-\s*комн", re.IGNORECASE)
BEDROOMS_RE = re.compile(r"(\d+)\s+спальн", re.IGNORECASE)
AREA_RE = re.compile(r"([\d]+(?:[.,]\d+)?)\s*м²", re.IGNORECASE)
LAND_AREA_RE = re.compile(r"([\d]+(?:[.,]\d+)?)\s*сот", re.IGNORECASE)
FLOOR_RE = re.compile(r"(\d+)\s*/\s*(\d+)\s*этаж", re.IGNORECASE)
HOUSE_FLOORS_RE = re.compile(r"(\d+)\s*этаж", re.IGNORECASE)
OFFER_ID_RE = re.compile(r"/rent/(?:flat|suburban)/(\d+)/")
METRO_RE = re.compile(r"м\.\s*([^,]+)", re.IGNORECASE)
DISTRICT_RE = re.compile(r"р-н\s+([^,]+)", re.IGNORECASE)


def text(node: _Element | None) -> str:
    """Текст узла без лишних пробелов и переводов строк."""
    if node is None:
        return ""
    return " ".join(node.text_content().replace("\xa0", " ").split())


def first_text(card: _Element, xpath: str) -> str:
    nodes = card.xpath(xpath)
    return text(nodes[0]) if nodes else ""


def parse_price(raw: str) -> int | None:
    match = PRICE_RE.search(raw)
    if not match:
        return None
    digits = re.sub(r"\D", "", match.group(1))
    return int(digits) if digits else None


def pluralize_ru(value: int, one: str, few: str, many: str) -> str:
    if value % 10 == 1 and value % 100 != 11:
        return one
    if 2 <= value % 10 <= 4 and not 12 <= value % 100 <= 14:
        return few
    return many


def parse_property_type(title: str, url: str) -> str:
    value = f"{title} {url}".lower()
    if "/rent/suburban/" in value or re.match(r"\s*(дом|коттедж|дача)\b", value):
        return "house"
    return "flat"


def parse_rooms(
    subtitle: str, title: str, property_type: str = "flat"
) -> tuple[int | None, str]:
    # Для домов Циан пишет не «комнатность», а количество спален.
    if property_type == "house":
        match = BEDROOMS_RE.search(f"{subtitle} {title}")
        if match:
            bedrooms = int(match.group(1))
            word = pluralize_ru(bedrooms, "спальня", "спальни", "спален")
            return bedrooms, f"{bedrooms} {word}"
        return None, "Спальни не указаны"

    # Сначала доверяем формальному подзаголовку Циан: там указана
    # фактическая комнатность. Маркетинговое название («квартира-студия»)
    # может противоречить ей, поэтому используем его только как fallback.
    match = ROOMS_RE.search(subtitle)
    if match:
        rooms = int(match.group(1))
        return rooms, f"{rooms}-комн."
    if re.search(r"студи|квартира-студия", subtitle, re.IGNORECASE):
        return 0, "Студия"

    match = ROOMS_RE.search(title)
    if match:
        rooms = int(match.group(1))
        return rooms, f"{rooms}-комн."
    if re.search(r"студи|квартира-студия", title, re.IGNORECASE):
        return 0, "Студия"

    if re.search(r"\bкомнат", f"{subtitle} {title}", re.IGNORECASE):
        return None, "Комната"
    return None, "Комнатность не указана"


def parse_area(value: str) -> float | None:
    match = AREA_RE.search(value)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def parse_land_area(value: str) -> float | None:
    match = LAND_AREA_RE.search(value)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def parse_floor(
    value: str, property_type: str = "flat"
) -> tuple[int | None, int | None]:
    match = FLOOR_RE.search(value)
    if match:
        return int(match.group(1)), int(match.group(2))
    if property_type == "house":
        match = HOUSE_FLOORS_RE.search(value)
        if match:
            return None, int(match.group(1))
    return None, None


def parse_url(card: _Element) -> str:
    links = card.xpath(
        './/a[contains(@href, "/rent/flat/") or contains(@href, "/rent/suburban/")]/@href'
    )
    if not links:
        return ""
    # Убираем query-параметры трекинга, оставляем чистую ссылку на объявление.
    return links[0].split("?")[0]


def parse_photos(card: _Element) -> list[str]:
    candidates: list[str] = []
    for image in card.xpath(".//img"):
        for attr in ("src", "data-src", "data-original"):
            value = image.get(attr)
            if value and value.startswith("http"):
                candidates.append(value)
                break
    # Иногда Циан отдаёт srcset; добавляем и его, если src не найден.
    if not candidates:
        for value in card.xpath(".//img/@srcset"):
            first = value.split(",")[0].strip().split(" ")[0]
            if first.startswith("http"):
                candidates.append(first)

    seen: set[str] = set()
    result: list[str] = []
    for url in candidates:
        if url not in seen:
            seen.add(url)
            result.append(url)
    return result[:12]


def parse_card(card: _Element, index: int) -> dict[str, Any] | None:
    url = parse_url(card)
    offer_id_match = OFFER_ID_RE.search(url)
    offer_id = offer_id_match.group(1) if offer_id_match else f"card-{index}"

    offer_title = first_text(card, './/*[@data-mark="OfferTitle"]')
    subtitle = first_text(card, './/*[@data-mark="OfferSubtitle"]')
    title_component = first_text(card, './/*[@data-name="TitleComponent"]')

    # На странице поиска OfferSubtitle — это «2-комн. квартира, 54 м², 9/29 этаж».
    # Если разметка изменилась, используем заголовок карточки как запасной вариант.
    if not subtitle:
        subtitle = title_component or offer_title
    title = offer_title or subtitle or f"Объявление #{offer_id}"
    if offer_title and subtitle and offer_title != subtitle:
        title = offer_title

    price_raw = first_text(card, './/*[contains(@class, "price")]')
    if not price_raw:
        price_raw = first_text(card, './/*[contains(@class, "Price")]')
    price = parse_price(price_raw)

    # Не отбрасываем объявление, если цена не распознана: приложение умеет
    # показывать «Цена не указана» и не ломается на неполных данных.
    geo_labels = [text(node) for node in card.xpath('.//*[@data-name="GeoLabel"]')]
    address = ", ".join(item for item in geo_labels if item)
    district = next(
        (label.removeprefix("р-н ").strip() for label in geo_labels if label.startswith("р-н ")),
        "",
    )
    if not district:
        district_match = DISTRICT_RE.search(address)
        district = district_match.group(1).strip() if district_match else ""
    metro = next(
        (label.removeprefix("м. ").strip() for label in geo_labels if label.startswith("м. ")),
        "",
    )
    if not metro:
        metro_match = METRO_RE.search(address)
        metro = metro_match.group(1).strip() if metro_match else ""

    property_type = parse_property_type(title, url)
    rooms, rooms_label = parse_rooms(
        subtitle, f"{title} {address}", property_type
    )
    area = parse_area(subtitle) or parse_area(title)
    land_area = parse_land_area(f"{subtitle} {title}")
    floor, floors = parse_floor(f"{subtitle} {title}", property_type)
    description = first_text(card, './/*[@data-name="Description"]')
    published = first_text(card, './/*[@data-name="TimeLabel"]')

    return {
        "id": offer_id,
        "title": title,
        "subtitle": subtitle,
        "price": price,
        "priceLabel": f"{price:,}".replace(",", " ") + " ₽/мес." if price else "",
        "propertyType": property_type,
        "city": "",
        "district": district,
        "metro": metro,
        "rooms": rooms,
        "roomsLabel": rooms_label,
        "bedrooms": rooms if property_type == "house" else None,
        "area": area,
        "landArea": land_area if property_type == "house" else None,
        "floor": floor,
        "floors": floors,
        "description": description,
        "photos": parse_photos(card),
        "address": address,
        "published": published,
        "url": url,
        "source": "Циан",
    }


def parse_html(raw_html: str) -> list[dict[str, Any]]:
    document = html.fromstring(raw_html)
    cards = document.xpath(
        '//article[@data-name="CardComponent"] | //article[@data-name="RecommendationDesktop"]'
    )
    listings: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, card in enumerate(cards, start=1):
        item = parse_card(card, index)
        if item is None or item["id"] in seen:
            continue
        seen.add(item["id"])
        listings.append(item)
    return listings


def main() -> None:
    parser = argparse.ArgumentParser(description="Извлечь аренду с сохранённой страницы Циан")
    parser.add_argument(
        "input",
        nargs="?",
        default="parser/data/cian-rent.html",
        help="путь к сохранённому HTML Циан",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="src/data/listings.json",
        help="куда записать JSON",
    )
    args = parser.parse_args()

    source = Path(args.input)
    if not source.exists():
        raise SystemExit(
            f"Не найден {source}. Сначала сохраните страницу:\n"
            f"  python parser/fetch_cian.py --out {source}"
        )

    listings = parse_html(source.read_text(encoding="utf-8", errors="ignore"))
    if not listings:
        raise SystemExit(
            "Объявления не найдены. Проверьте, что сохранена страница поиска "
            "https://novosibirsk.cian.ru/snyat-kvartiru/ и что на ней нет капчи."
        )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(listings, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    with_photo = sum(1 for item in listings if item["photos"])
    with_district = sum(1 for item in listings if item["district"])
    print(f"Готово: {len(listings)} объявлений")
    print(f"  с фото:       {with_photo}")
    print(f"  с районом:    {with_district}")
    print(f"  записано в:   {output}")


if __name__ == "__main__":
    main()
