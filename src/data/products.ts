export interface Product {
  id: number
  name: string
  price: number
  category: string
  image: string
}

export const products: Product[] = [
  { id: 1, name: 'Ноутбук Pro 14', price: 89990, category: 'Электроника', image: '/products/notebook.jpg' },
  { id: 2, name: 'Механическая клавиатура', price: 7500, category: 'Электроника', image: '/products/keyboard.jpg' },
  { id: 3, name: 'Кружка разработчика', price: 690, category: 'Аксессуары', image: '/products/cup.jpg' },
  { id: 4, name: 'Худи "Vue Master"', price: 3200, category: 'Одежда', image: '/products/hoodie.jpg' },
  { id: 5, name: 'Мышь беспроводная', price: 2400, category: 'Электроника', image: '/products/mouse.jpg' },
  { id: 6, name: 'Стикерпак с логотипом', price: 150, category: 'Аксессуары', image: '/products/stickers.jpg' },
  { id: 7, name: 'Монитор 27"', price: 24990, category: 'Электроника', image: '/products/monitor.jpg' },
  { id: 8, name: 'Кепка "Frontend"', price: 1100, category: 'Одежда', image: '/products/cap.jpg' },
]

export const categories = ['Все', ...new Set(products.map((p) => p.category))]
