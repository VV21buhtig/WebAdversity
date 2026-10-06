export interface Product {
  id: number
  name: string
  price: number
  category: string
  image: string
}

const base = import.meta.env.BASE_URL

export const products: Product[] = [
  { id: 1, name: 'Ноутбук Pro 14', price: 89990, category: 'Электроника', image: `${base}products/notebook.jpg` },
  { id: 2, name: 'Механическая клавиатура', price: 7500, category: 'Электроника', image: `${base}products/keyboard.jpg` },
  { id: 3, name: 'Кружка разработчика', price: 690, category: 'Аксессуары', image: `${base}products/cup.jpg` },
  { id: 4, name: 'Худи "Vue Master"', price: 3200, category: 'Одежда', image: `${base}products/hoodie.jpg` },
  { id: 5, name: 'Мышь беспроводная', price: 2400, category: 'Электроника', image: `${base}products/mouse.jpg` },
  { id: 6, name: 'Стикерпак с логотипом', price: 150, category: 'Аксессуары', image: `${base}products/stickers.jpg` },
  { id: 7, name: 'Монитор 27"', price: 24990, category: 'Электроника', image: `${base}products/monitor.jpg` },
  { id: 8, name: 'Кепка "Frontend"', price: 1100, category: 'Одежда', image: `${base}products/cap.jpg` },
]

export const categories = ['Все', ...new Set(products.map((p) => p.category))]
