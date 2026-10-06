package com.example.shop

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

data class Product(val id: Int, val name: String, val price: Int, val category: String, val image: Int)

val PRODUCTS = listOf(
    Product(1, "Ноутбук Pro 14", 89990, "Электроника", R.drawable.notebook),
    Product(2, "Механическая клавиатура", 7500, "Электроника", R.drawable.keyboard),
    Product(3, "Кружка разработчика", 690, "Аксессуары", R.drawable.cup),
    Product(4, "Худи \"Vue Master\"", 3200, "Одежда", R.drawable.hoodie),
    Product(5, "Мышь беспроводная", 2400, "Электроника", R.drawable.mouse),
    Product(6, "Стикерпак с логотипом", 150, "Аксессуары", R.drawable.stickers),
    Product(7, "Монитор 27\"", 24990, "Электроника", R.drawable.monitor),
    Product(8, "Кепка \"Frontend\"", 1100, "Одежда", R.drawable.cap),
)

const val PROMO_CODE = "WEB"
const val PROMO_OFF = 0.1
const val PREFS = "shop-cart"
const val KEY_CART = "items"
const val KEY_PROMO = "promo"

fun fmt(n: Int): String = "%,d ₽".format(n).replace(',', ' ')

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ShopApp(this) }
    }
}

fun loadCart(ctx: Context): MutableMap<Int, Int> {
    val out = mutableMapOf<Int, Int>()
    try {
        val arr = JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CART, "[]"))
        for (i in 0 until arr.length()) {
            val o: JSONObject = arr.getJSONObject(i)
            val id = o.getInt("id")
            val qty = o.getInt("qty")
            if (qty > 0 && PRODUCTS.any { it.id == id }) out[id] = qty
        }
    } catch (_: Exception) {
    }
    return out
}

fun saveCart(ctx: Context, cart: Map<Int, Int>, promo: Boolean) {
    val arr = JSONArray()
    cart.forEach { (id, qty) -> arr.put(JSONObject().put("id", id).put("qty", qty)) }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString(KEY_CART, arr.toString())
        .putBoolean(KEY_PROMO, promo)
        .apply()
}

@Composable
fun ShopApp(ctx: Context) {
    val prefs = remember { ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    val cart = remember { mutableStateMapOf<Int, Int>().also { it.putAll(loadCart(ctx)) } }
    var promo by remember { mutableStateOf(prefs.getBoolean(KEY_PROMO, false)) }
    var promoInput by remember { mutableStateOf("") }
    var promoError by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Все") }
    var sortAsc by remember { mutableStateOf<Boolean?>(null) }

    fun persist() = saveCart(ctx, cart, promo)
    fun priceOf(id: Int): Int {
        val p = PRODUCTS.find { it.id == id } ?: return 0
        return if (promo) (p.price * (1 - PROMO_OFF)).toInt() else p.price
    }

    val cats = remember { listOf("Все") + PRODUCTS.map { it.category }.distinct() }
    val filtered = PRODUCTS
        .filter { (category == "Все" || it.category == category) &&
            (search.isBlank() || it.name.contains(search.trim(), ignoreCase = true)) }
        .let { if (sortAsc == true) it.sortedBy { p -> p.price } else if (sortAsc == false) it.sortedByDescending { p -> p.price } else it }
    val total = cart.entries.sumOf { (id, qty) -> priceOf(id) * qty }
    val totalFull = cart.entries.sumOf { (id, qty) -> (PRODUCTS.find { it.id == id }?.price ?: 0) * qty }

    MaterialTheme {
        LazyVerticalGrid(columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize().systemBarsPadding().padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    Text("Магазин", style = MaterialTheme.typography.headlineMedium)
                    Text("Корзина: ${cart.values.sum()} · ${fmt(total)}")
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(value = search, onValueChange = { search = it },
                        label = { Text("Поиск товаров...") }, modifier = Modifier.fillMaxWidth(),
                        singleLine = true)
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        cats.forEach { c ->
                            FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c) })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = sortAsc == true, onClick = { sortAsc = if (sortAsc == true) null else true }, label = { Text("Дешевле") })
                        FilterChip(selected = sortAsc == false, onClick = { sortAsc = if (sortAsc == false) null else false }, label = { Text("Дороже") })
                    }
                }
            }
            if (filtered.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { Text("Ничего не найдено") }
            items(filtered) { p ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(8.dp)) {
                        Image(painterResource(p.image), p.name,
                            modifier = Modifier.fillMaxWidth().height(110.dp),
                            contentScale = ContentScale.Crop)
                        Text(p.name, style = MaterialTheme.typography.titleSmall, maxLines = 2)
                        Text(if (promo) "${fmt(p.price)} → ${fmt(priceOf(p.id))}" else fmt(p.price),
                            style = MaterialTheme.typography.bodyMedium)
                        Button(onClick = { cart[p.id] = (cart[p.id] ?: 0) + 1; persist() }) {
                            Text("В корзину")
                        }
                    }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Spacer(Modifier.height(4.dp))
                Text("Корзина", style = MaterialTheme.typography.headlineSmall)
                if (cart.isEmpty()) Text("Пусто")
            }
            items(cart.entries.toList(), span = { GridItemSpan(maxLineSpan) }) { (id, qty) ->
                val p = PRODUCTS.find { it.id == id } ?: return@items
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${p.name} ${fmt(priceOf(id))} x$qty = ${fmt(priceOf(id) * qty)}",
                        modifier = Modifier.weight(1f))
                    Row {
                        Button(onClick = { if (qty <= 1) cart.remove(id) else cart[id] = qty - 1; persist() }) { Text("−") }
                        Button(onClick = { cart[id] = qty + 1; persist() }) { Text("+") }
                        Button(onClick = { cart.remove(id); persist() }) { Text("✕") }
                    }
                }
            }
            if (cart.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                if (promo) Text("Без скидки: ${fmt(totalFull)} (−10%)")
                Text("Итого: ${fmt(total)}", style = MaterialTheme.typography.titleMedium)
                Button(onClick = { cart.clear(); persist() }) { Text("Очистить корзину") }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                if (!promo) {
                    OutlinedTextField(value = promoInput, onValueChange = { promoInput = it },
                        label = { Text("Промокод (WEB = −10%)") })
                    Button(onClick = {
                        if (promoInput.trim().uppercase() == PROMO_CODE) {
                            promo = true; promoError = ""; promoInput = ""; persist()
                        } else promoError = "Неверный промокод"
                    }) { Text("Применить") }
                    if (promoError.isNotEmpty()) Text(promoError)
                } else {
                    Row {
                        Text("Промокод $PROMO_CODE (−10%)")
                        Button(onClick = { promo = false; persist() }) { Text("Убрать") }
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}
