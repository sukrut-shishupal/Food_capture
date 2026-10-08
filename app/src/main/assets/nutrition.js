// Built-in nutrition table: typical values per 100 g of the food as usually served
// (cooked where it is normally eaten cooked). Approximations from standard references
// such as USDA FoodData Central and India's IFCT; real dishes vary with recipe and oil.
// Columns: aliases, protein g, carbs g, fat g, kcal.
window.NUTRITION = (() => {
  const T = [
    // Poultry, meat, fish, eggs
    [["chicken breast", "grilled chicken", "baked chicken", "roast chicken breast", "chicken fillet"], 31, 0, 3.6, 165],
    [["chicken thigh", "chicken leg", "chicken drumstick", "drumstick"], 26, 0, 11, 209],
    [["fried chicken", "chicken nuggets", "chicken tenders", "chicken strips"], 24, 11, 15, 285],
    [["chicken curry", "chicken masala", "chicken korma"], 14, 5, 9, 160],
    [["butter chicken", "chicken makhani", "chicken tikka masala"], 14, 6, 12, 190],
    [["chicken tikka", "tandoori chicken"], 25, 3, 7, 175],
    [["turkey breast", "turkey"], 29, 0, 2, 147],
    [["steak", "beef steak", "sirloin", "ribeye", "roast beef"], 26, 0, 15, 250],
    [["ground beef", "minced beef", "beef mince", "hamburger patty", "burger patty", "meatballs"], 25, 2, 15, 250],
    [["pork chop", "pork loin", "roast pork"], 27, 0, 9, 200],
    [["bacon"], 37, 1.4, 42, 541],
    [["ham"], 21, 1.5, 6, 145],
    [["sausage", "sausages", "hot dog"], 14, 2, 27, 300],
    [["lamb curry", "mutton curry", "rogan josh", "goat curry"], 15, 4, 12, 185],
    [["salmon"], 25, 0, 12, 208],
    [["tuna"], 25, 0, 1, 116],
    [["cod", "tilapia", "white fish", "fish fillet"], 23, 0, 1, 105],
    [["fish curry"], 14, 4, 8, 145],
    [["shrimp", "prawns", "prawn"], 24, 0.2, 0.3, 99],
    [["boiled egg", "hard boiled egg", "poached egg", "egg", "eggs"], 12.6, 1.1, 10.6, 155],
    [["scrambled egg", "scrambled eggs"], 10, 1.6, 11, 149],
    [["omelette", "omelet"], 10.6, 0.6, 12, 154],
    [["fried egg", "fried eggs"], 13.6, 0.8, 15, 196],
    [["egg white", "egg whites"], 11, 0.7, 0.2, 52],
    // Vegetarian protein
    [["tofu"], 15.8, 2.8, 8.7, 144],
    [["tempeh"], 20, 7.6, 11, 192],
    [["paneer", "cottage cheese indian"], 18, 3, 20, 265],
    [["palak paneer", "paneer butter masala", "paneer tikka masala", "shahi paneer", "kadai paneer", "matar paneer"], 8, 6, 12, 165],
    [["paneer tikka"], 16, 5, 15, 220],
    [["dal", "daal", "dhal", "dal tadka", "dal fry", "yellow dal", "moong dal", "toor dal"], 6.5, 14, 3, 110],
    [["dal makhani"], 6, 13, 7, 140],
    [["lentils", "lentil"], 9, 20, 0.4, 116],
    [["lentil soup"], 5, 11, 1.5, 75],
    [["chickpeas", "garbanzo beans", "chickpea"], 8.9, 27, 2.6, 164],
    [["chole", "chana masala", "chickpea curry"], 7, 18, 6, 150],
    [["rajma", "kidney bean curry"], 6, 15, 4, 120],
    [["kidney beans"], 8.7, 22.8, 0.5, 127],
    [["black beans"], 8.9, 23.7, 0.5, 132],
    [["baked beans"], 4.8, 21, 0.4, 94],
    [["hummus"], 7.9, 14, 9.6, 166],
    [["edamame"], 11.9, 8.9, 5.2, 121],
    // Dairy
    [["greek yogurt", "greek yoghurt", "skyr"], 10, 3.6, 0.4, 59],
    [["yogurt", "yoghurt", "curd", "dahi", "raita"], 3.5, 4.7, 3.3, 61],
    [["milk"], 3.2, 4.8, 3.3, 61],
    [["cottage cheese"], 11, 3.4, 4.3, 98],
    [["cheddar", "cheddar cheese", "cheese", "cheese slice"], 25, 1.3, 33, 403],
    [["mozzarella"], 22, 2.2, 22, 300],
    [["protein shake", "whey shake"], 7, 1, 0.5, 36],
    [["butter"], 0.9, 0.1, 81, 717],
    [["ghee"], 0, 0, 100, 900],
    // Grains and starches
    [["rice", "white rice", "steamed rice", "basmati rice", "jasmine rice", "plain rice", "jeera rice"], 2.7, 28, 0.3, 130],
    [["brown rice"], 2.6, 23, 0.9, 112],
    [["fried rice"], 5, 25, 6, 170],
    [["biryani", "biriyani", "chicken biryani", "mutton biryani"], 8, 20, 6, 170],
    [["veg biryani", "vegetable biryani"], 4, 25, 5, 160],
    [["pulao", "pulav", "pilaf", "pilau"], 3, 25, 4, 145],
    [["khichdi", "khichri"], 4, 18, 3, 115],
    [["quinoa"], 4.4, 21.3, 1.9, 120],
    [["oatmeal", "porridge", "oats"], 2.5, 12, 1.5, 71],
    [["pasta", "spaghetti", "penne", "macaroni", "fusilli"], 5.8, 31, 0.9, 158],
    [["mac and cheese", "macaroni and cheese"], 7, 20, 8, 180],
    [["noodles", "egg noodles", "hakka noodles", "chow mein", "lo mein"], 4.5, 25, 4, 155],
    [["bread", "white bread", "toast"], 9, 49, 3.2, 265],
    [["whole wheat bread", "wholemeal bread", "brown bread", "multigrain bread", "whole wheat toast", "whole grain bread"], 13, 41, 3.4, 247],
    [["roti", "chapati", "chapatti", "phulka"], 8, 46, 7.5, 280],
    [["naan", "butter naan", "garlic naan"], 9, 50, 5, 290],
    [["paratha", "aloo paratha"], 6.4, 45, 13, 320],
    [["puri", "poori"], 6, 45, 22, 400],
    [["tortilla", "wrap"], 8, 50, 8, 310],
    [["bagel"], 10, 53, 1.7, 270],
    [["idli"], 4, 26, 0.4, 130],
    [["dosa", "plain dosa"], 4, 28, 4, 165],
    [["masala dosa"], 4, 26, 7, 185],
    [["sambar", "sambhar"], 3, 8, 2, 60],
    [["poha"], 2.6, 23, 5, 145],
    [["upma"], 3, 20, 5, 140],
    [["pancake", "pancakes"], 6, 28, 10, 227],
    [["french toast"], 7.7, 25, 11, 229],
    [["waffle", "waffles"], 7.9, 33, 14, 291],
    [["cornflakes", "cereal"], 7.5, 84, 0.4, 357],
    [["granola"], 10, 64, 20, 471],
    [["muesli"], 10, 66, 6, 370],
    [["potato", "potatoes", "boiled potato", "baked potato", "roast potatoes"], 2.2, 20, 0.1, 90],
    [["mashed potato", "mashed potatoes"], 2, 15, 4, 106],
    [["french fries", "fries"], 3.4, 41, 15, 312],
    [["sweet potato"], 2, 21, 0.2, 90],
    [["aloo sabzi", "aloo gobi", "potato curry", "bombay potatoes"], 2.5, 15, 6, 120],
    // Mixed dishes
    [["pizza", "cheese pizza", "pepperoni pizza"], 11, 33, 10, 266],
    [["burger", "cheeseburger", "hamburger"], 15, 24, 14, 285],
    [["burrito"], 9, 25, 7, 200],
    [["taco", "tacos"], 9, 20, 10, 210],
    [["sushi", "maki", "sushi roll"], 5, 28, 1, 145],
    [["samosa"], 5, 30, 17, 290],
    [["pakora", "pakoras", "bhaji", "onion bhaji"], 6, 25, 15, 260],
    [["caesar salad"], 7, 7, 13, 170],
    // Vegetables
    [["salad", "green salad", "lettuce", "mixed greens", "salad greens"], 1.4, 3, 0.2, 17],
    [["spinach"], 3, 3.8, 0.3, 23],
    [["broccoli"], 2.4, 7.2, 0.4, 35],
    [["carrot", "carrots"], 0.9, 9.6, 0.2, 41],
    [["cucumber"], 0.7, 3.6, 0.1, 15],
    [["tomato", "tomatoes", "cherry tomatoes"], 0.9, 3.9, 0.2, 18],
    [["green beans"], 1.8, 7, 0.2, 35],
    [["mixed vegetables", "mixed veg", "stir fried vegetables", "vegetable stir fry"], 2.6, 10, 2, 65],
    [["corn", "sweet corn"], 3.4, 21, 1.5, 96],
    [["peas", "green peas"], 5.4, 14, 0.4, 81],
    [["avocado", "guacamole"], 2, 8.5, 14.7, 160],
    [["mushroom", "mushrooms"], 3.1, 3.3, 0.3, 22],
    [["onion", "onions"], 1.1, 9.3, 0.1, 40],
    [["bell pepper", "capsicum", "peppers"], 1, 6, 0.3, 26],
    // Fruit
    [["banana"], 1.1, 23, 0.3, 89],
    [["apple"], 0.3, 14, 0.2, 52],
    [["orange"], 0.9, 12, 0.1, 47],
    [["strawberries", "strawberry"], 0.7, 7.7, 0.3, 32],
    [["blueberries", "blueberry", "berries", "mixed berries"], 0.7, 14.5, 0.3, 57],
    [["grapes"], 0.7, 18, 0.2, 69],
    [["mango"], 0.8, 15, 0.4, 60],
    [["watermelon"], 0.6, 7.6, 0.2, 30],
    [["pineapple"], 0.5, 13, 0.1, 50],
    [["papaya"], 0.5, 11, 0.3, 43],
    // Nuts, oils
    [["almonds", "almond"], 21, 22, 50, 579],
    [["peanuts", "peanut"], 26, 16, 49, 567],
    [["peanut butter"], 25, 20, 50, 588],
    [["walnuts", "walnut"], 15, 14, 65, 654],
    [["cashews", "cashew"], 18, 30, 44, 553],
    [["olive oil", "cooking oil", "vegetable oil", "oil"], 0, 0, 100, 884],
    // Drinks and sweets
    [["black coffee", "espresso", "americano"], 0.1, 0, 0, 1],
    [["latte", "cappuccino", "flat white"], 3.4, 4.9, 3.4, 62],
    [["chai", "masala chai", "milk tea"], 1.5, 7, 1.5, 48],
    [["orange juice"], 0.7, 10, 0.2, 45],
    [["cola", "soda", "coke", "soft drink"], 0, 10.6, 0, 42],
    [["beer"], 0.5, 3.6, 0, 43],
    [["chocolate", "milk chocolate"], 7.7, 59, 30, 535],
    [["ice cream"], 3.5, 24, 11, 207],
    [["cookie", "cookies", "biscuit", "biscuits"], 5, 65, 22, 480],
    [["cake", "chocolate cake"], 4, 50, 15, 350],
    [["donut", "doughnut"], 5, 51, 25, 452],
    [["gulab jamun"], 4, 50, 15, 340],
  ];

  const norm = (s) => String(s || "").toLowerCase().replace(/[-_/]/g, " ").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  // Every alias with its entry, longest first, so "fried rice" wins over "rice".
  const index = [];
  T.forEach(([aliases, p, c, f, kcal]) => aliases.forEach((a) => index.push({ a: norm(a), p, c, f, kcal, label: aliases[0] })));
  index.sort((x, y) => y.a.length - x.a.length);

  // Words that change a food enough that plain table values would mislead.
  const FRIED = /\b(fried|crispy|battered|breaded|deep fried)\b/;

  const singular = (s) => s.split(" ").map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");

  function lookup(name) {
    return find(" " + norm(name) + " ") || find(" " + singular(norm(name)) + " ");
  }

  function find(n) {
    for (const e of index) {
      if (n.includes(" " + e.a + " ")) {
        // "fried fish" should not take plain fish values; let the model's estimate stand.
        if (FRIED.test(n) && !FRIED.test(" " + e.a + " ")) return null;
        return e;
      }
    }
    return null;
  }

  return { lookup, size: T.length };
})();
