# Магазин под Android (Kotlin + Compose) — ветка `android`

Нативный магазин: каталог 8 товаров с фото, поиск, фильтр по категориям,
сортировка цены, корзина (+/−/удалить/очистить/итого), сохранение в
`SharedPreferences`, промокод `WEB` (−10%).

Ветки репозитория:
- `main` — веб (Vue)
- `electron` — десктоп
- `android` — Android (этот README)

Готовый APK (установка на телефон/планшет одной кнопкой) — в [Releases](../../releases).

## Требования

- Java 17+ (`java -version`)
- Android SDK: platform-tools, `platforms;android-35`, `build-tools;35.0.0`
  (через Android Studio или `sdkmanager`)
- Переменные окружения `ANDROID_HOME` / `ANDROID_SDK_ROOT` на папку SDK

## Сборка APK

```sh
cd android
./gradlew :app:assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Установка на устройство

1. На устройстве: 7 тапов по номеру сборки → «Для разработчиков» →
   включить «Отладка по USB», подключить кабелем, разрешить отладку.
2. Проверить: `adb devices` (должен быть `device`).
3. Поставить:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Промокод

`WEB` — скидка 10%.
