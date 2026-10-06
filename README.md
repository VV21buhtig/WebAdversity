# Магазин как десктоп-приложение — ветка `electron`

Тот же магазин, что в `main` (каталог, поиск, фильтр, сортировка, корзина,
`localStorage`, промокод `WEB` −10%), упакованный в Electron-окно.

Ветки репозитория:
- `main` — веб
- `electron` — десктоп (этот README)
- `android` — нативный Kotlin-магазин под Android

Готовая сборка (распаковал → запустил `Shop.exe`) — в [Releases](../../releases).

## Требования

- Node.js 20.19+ или 22.12+
- Windows x64 (сборка ниже) / любой десктоп для dev

## Запуск из исходников

```sh
npm install
```

Dev (Vite + окно Electron поверх):

```sh
npm run dev        # терминал 1
ELECTRON_DEV=1 npm run electron   # терминал 2 (Windows PowerShell: $env:ELECTRON_DEV=1; npm run electron)
```

Прод (окно грузит собранный `dist`):

```sh
npm run build
npm run electron
```

## Сборка exe

```sh
npm run dist-electron
```

На выходе `release/Shop-win32-x64/Shop.exe` — запуск одной кнопкой, установка не нужна.
