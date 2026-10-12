import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, pool, categories, menuItems, restaurantTables, users } from "@workspace/db";

const categoryData = [
  ["soups", "Soups", "Slow-simmered bowls from the kitchen."],
  ["salads", "Salads", "Bright, seasonal greens and grains."],
  ["mains", "Mains", "Generous plates made to order."],
  ["drinks", "Drinks", "Fresh pours, spritzes, and house blends."],
  ["desserts", "Desserts", "A sweet finish for the table."],
] as const;

const menuData = [
  ["saffron-soup", "soups", "Saffron Tomato Soup", "Fire-roasted tomatoes, saffron, basil oil, and a toasted sourdough crisp.", 9.5, "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85", 280, ["gluten"], ["vegetarian"], true],
  ["green-goddess", "salads", "Green Goddess Salad", "Little gem lettuce, avocado, cucumber, herbs, pepitas, and bright herb dressing.", 13.5, "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85", 360, ["seeds"], ["vegan", "gluten-free"], true],
  ["citrus-salmon", "mains", "Citrus Miso Salmon", "Miso-glazed salmon, charred broccolini, ginger rice, and pickled citrus.", 24, "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=85", 620, ["fish", "soy"], ["high-protein", "gluten-free"], true],
  ["braised-chicken", "mains", "Rosemary Braised Chicken", "Free-range chicken, silky polenta, roasted mushrooms, and rosemary jus.", 21, "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=85", 690, ["dairy"], ["high-protein"], false],
  ["mushroom-rigatoni", "mains", "Wild Mushroom Rigatoni", "Bronze-cut pasta, roasted wild mushrooms, parmesan, thyme, and lemon.", 18, "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=85", 740, ["gluten", "dairy"], ["vegetarian"], false],
  ["hibiscus-spritz", "drinks", "Hibiscus Citrus Spritz", "Hibiscus tea, ruby grapefruit, lemon, and a bright rosemary finish.", 6.5, "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85", 90, [], ["vegan", "gluten-free"], true],
  ["sea-salt-chocolate", "desserts", "Sea Salt Chocolate Tart", "Bittersweet chocolate ganache, cocoa crust, flaky salt, and olive oil.", 8.5, "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=85", 440, ["gluten", "dairy"], ["vegetarian"], false],
  ["olive-oil-cake", "desserts", "Warm Olive Oil Cake", "Citrus olive oil cake, whipped ricotta, and seasonal berries.", 8, "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&w=900&q=85", 390, ["gluten", "dairy", "egg"], ["vegetarian"], false],
  ["roasted-carrot-soup", "soups", "Roasted Carrot & Ginger Soup", "Silky roasted carrots, ginger, coconut cream, and toasted seeds.", 8.5, "", 220, ["seeds"], ["vegan", "gluten-free"], false],
  ["cucumber-lime-cooler", "drinks", "Cucumber Lime Cooler", "Pressed cucumber, lime, mint, and sparkling water.", 5.5, "", 45, [], ["vegan", "gluten-free"], false],
  ["paneer-tikka", "mains", "Smoky Paneer Tikka", "Charred paneer, peppers, coriander, and warm basmati rice.", 17.5, "", 560, ["dairy"], ["vegetarian", "gluten-free"], false],
  ["berry-panna-cotta", "desserts", "Vanilla Berry Panna Cotta", "Vanilla bean panna cotta with macerated seasonal berries.", 9, "", 320, ["dairy"], ["vegetarian", "gluten-free"], false],
] as const;

async function seed() {
  const categoryIds = new Map<string, string>();
  for (const [id, name, description] of categoryData) {
    await db.insert(categories).values({ id, name, description }).onConflictDoNothing();
    categoryIds.set(id, id);
  }
  for (const [id, categoryId, name, description, price, imageUrl, calories, allergens, dietaryTags, featured] of menuData) {
    await db.insert(menuItems).values({
      id,
      categoryId: categoryIds.get(categoryId)!,
      name,
      description,
      price: price.toFixed(2),
      imageUrl,
      calories,
      allergens: [...allergens],
      dietaryTags: [...dietaryTags],
      featured,
      isAvailable: true,
    }).onConflictDoNothing();
  }
  for (const [tableNumber, capacity] of [["01", 2], ["02", 2], ["03", 4], ["04", 4], ["05", 6], ["06", 6], ["07", 8], ["08", 12]] as const) {
    await db.insert(restaurantTables).values({ id: `table-${tableNumber}`, tableNumber, capacity }).onConflictDoNothing();
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.toLowerCase();
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.insert(users).values({
      id: randomUUID(),
      name: process.env.ADMIN_NAME ?? "RestauranGo Admin",
      email,
      passwordHash,
      role: "admin",
    }).onConflictDoNothing();
  }
  process.stdout.write("RestauranGo seed completed.\n");
}

seed().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});