import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { and, asc, desc, eq, gte, ilike, inArray, lt, ne, sql } from "drizzle-orm";
import {
  CreateOrderResponse,
  CreateReservationResponse,
  GetDashboardSummaryResponse,
  GetFeaturedMenuResponse,
  GetOrderResponse,
  GetReservationAvailabilityResponse,
  ListMenuResponse,
  ListOrdersResponse,
  ListReservationsResponse,
  UpdateOrderStatusResponse,
} from "@workspace/api-zod";
import {
  categories,
  db,
  menuItems,
  orderItems,
  orderStatusLog,
  orders,
  reservations,
  restaurantTables,
  sessions,
  users,
} from "@workspace/db";
import { z } from "zod";
import {
  attachUser,
  clearSessionCookie,
  createSession,
  getSessionToken,
  hashSessionToken,
  requireAdmin,
  requireAuth,
  requireStaff,
  setSessionCookie,
} from "../middlewares/auth";

const router: IRouter = Router();
router.use(attachUser);

const statusValues = ["placed", "confirmed", "preparing", "ready", "out_for_delivery", "completed"] as const;
const reservationStatusValues = ["pending", "confirmed", "cancelled"] as const;
const slotValues = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
const authAttempts = new Map<string, number[]>();
const writeAttempts = new Map<string, number[]>();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional(),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});
const menuQuerySchema = z.object({
  search: z.coerce.string().trim().optional(),
  category: z.coerce.string().trim().optional(),
  dietaryTag: z.coerce.string().trim().optional(),
});
const orderSchema = z.object({
  customerName: z.string().trim().min(1).max(120).optional(),
  orderType: z.enum(["pickup", "delivery"]),
  address: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    menuItemId: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(50),
    customizations: z.string().trim().max(500).optional(),
  })).min(1).max(50),
});
const statusSchema = z.object({ status: z.enum(statusValues) });
const reservationSchema = z.object({
  guestName: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(18|19|20|21):[0-5]\d$/),
  partySize: z.number().int().min(1).max(12),
});
const reservationUpdateSchema = z.object({ status: z.enum(reservationStatusValues) });
const menuWriteSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000),
  price: z.coerce.number().positive().max(100000),
  imageUrl: z.string().url().or(z.literal("")).default(""),
  calories: z.coerce.number().int().min(0).max(10000).default(0),
  allergens: z.array(z.string().trim().min(1).max(80)).default([]),
  dietaryTags: z.array(z.string().trim().min(1).max(80)).default([]),
  isAvailable: z.boolean().default(true),
  featured: z.boolean().default(false),
});

function rateLimited(key: string, bucket: Map<string, number[]>, max: number) {
  const now = Date.now();
  const recent = (bucket.get(key) ?? []).filter((timestamp) => timestamp > now - 60 * 60 * 1000);
  if (recent.length >= max) return true;
  recent.push(now);
  bucket.set(key, recent);
  return false;
}

function clientKey(req: Request) {
  return `${req.ip ?? "unknown"}:${req.user?.id ?? "anonymous"}`;
}

function paramStr(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function safeUser(user: typeof users.$inferSelect) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function toMenuItem(row: {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  imageUrl: string;
  calories: number;
  allergens: string[];
  dietaryTags: string[];
  isAvailable: boolean;
  featured: boolean;
}) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: numeric(row.price),
    imageUrl: row.imageUrl,
    calories: row.calories,
    allergens: row.allergens ?? [],
    dietaryTags: row.dietaryTags ?? [],
    isAvailable: row.isAvailable,
    featured: row.featured,
  };
}

async function menuRows(filters?: { featured?: boolean; search?: string; category?: string; dietaryTag?: string }) {
  const conditions = [];
  if (filters?.featured !== undefined) conditions.push(eq(menuItems.featured, filters.featured));
  if (filters?.category) conditions.push(ilike(categories.name, filters.category));
  if (filters?.dietaryTag) conditions.push(sql`${filters.dietaryTag} = ANY(${menuItems.dietaryTags})`);
  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(sql`(${menuItems.name} ILIKE ${term} OR ${menuItems.description} ILIKE ${term} OR ${categories.name} ILIKE ${term})`);
  }
  const rows = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      category: categories.name,
      description: menuItems.description,
      price: menuItems.price,
      imageUrl: menuItems.imageUrl,
      calories: menuItems.calories,
      allergens: menuItems.allergens,
      dietaryTags: menuItems.dietaryTags,
      isAvailable: menuItems.isAvailable,
      featured: menuItems.featured,
    })
    .from(menuItems)
    .innerJoin(categories, eq(categories.id, menuItems.categoryId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(categories.name), asc(menuItems.name));
  return rows.map(toMenuItem);
}

async function loadOrder(id: string) {
  const rows = await db
    .select({ order: orders, item: orderItems, name: menuItems.name })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(eq(orders.id, id))
    .orderBy(asc(orderItems.id));
  const first = rows[0];
  if (!first) return null;
  return {
    id: first.order.id,
    customerName: (await db.select({ name: users.name }).from(users).where(eq(users.id, first.order.userId)).limit(1))[0]?.name ?? "Customer",
    orderType: first.order.orderType as "pickup" | "delivery",
    status: first.order.status as typeof statusValues[number],
    totalAmount: numeric(first.order.totalAmount),
    address: first.order.address,
    items: rows.map(({ item, name }) => ({
      menuItemId: item.menuItemId,
      name,
      quantity: item.quantity,
      itemPrice: numeric(item.itemPrice),
      ...(typeof item.customizations === "string" ? { customizations: item.customizations } : {}),
    })),
    createdAt: first.order.createdAt,
    estimatedReadyAt: first.order.estimatedReadyAt,
    userId: first.order.userId,
  };
}

async function reservationRows(userId?: string) {
  const rows = await db
    .select({ reservation: reservations, table: restaurantTables, user: users })
    .from(reservations)
    .innerJoin(restaurantTables, eq(restaurantTables.id, reservations.tableId))
    .innerJoin(users, eq(users.id, reservations.userId))
    .where(userId ? eq(reservations.userId, userId) : undefined)
    .orderBy(desc(reservations.createdAt));
  return rows.map(({ reservation, table, user }) => ({
    id: reservation.id,
    guestName: user.name,
    date: reservation.reservationDate,
    time: reservation.reservationTime,
    partySize: reservation.partySize,
    status: reservation.status as typeof reservationStatusValues[number],
    tableLabel: `Table ${table.tableNumber}`,
  }));
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (rateLimited(ip, authAttempts, 10)) {
    res.status(429).json({ error: "Too many authentication attempts. Try again later." });
    return;
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a valid name, email, and password." });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }
  const user = {
    id: randomUUID(),
    name: parsed.data.name,
    email,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    phone: parsed.data.phone || null,
    role: "customer",
    createdAt: new Date(),
  };
  await db.insert(users).values(user);
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.status(201).json({ user: safeUser(user), message: "Account created." });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  if (rateLimited(req.ip ?? "unknown", authAttempts, 10)) {
    res.status(429).json({ error: "Too many authentication attempts. Try again later." });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password." });
    return;
  }
  const record = (await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1))[0];
  if (!record || !(await bcrypt.compare(parsed.data.password, record.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  const token = await createSession(record.id);
  setSessionCookie(res, token);
  res.json({ user: safeUser(record) });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = getSessionToken(req);
  if (token) await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", (req, res): void => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  res.json({ user: req.user });
});

router.get("/menu", async (req, res): Promise<void> => {
  const parsed = menuQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await menuRows({
    search: parsed.data.search,
    category: parsed.data.category,
    dietaryTag: parsed.data.dietaryTag,
  });
  res.json(ListMenuResponse.parse(result));
});

router.get("/menu/featured", async (_req, res): Promise<void> => {
  const result = await menuRows({ featured: true });
  res.json(GetFeaturedMenuResponse.parse(result));
});

router.get("/menu/:id", async (req, res): Promise<void> => {
  const result = (await menuRows()).find((item) => item.id === paramStr(req.params.id));
  if (!result) {
    res.status(404).json({ error: "Menu item not found." });
    return;
  }
  res.json(result);
});

router.post("/admin/menu", requireAdmin, async (req, res): Promise<void> => {
  const parsed = menuWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const category = (await db.select().from(categories).where(eq(categories.name, parsed.data.category)).limit(1))[0];
  if (!category) {
    res.status(400).json({ error: "Unknown menu category." });
    return;
  }
  await db.insert(menuItems).values({
    id: randomUUID(),
    categoryId: category.id,
    ...parsed.data,
    price: parsed.data.price.toFixed(2),
  });
  const created = (await menuRows()).find((item) => item.name === parsed.data.name);
  res.status(201).json(created);
});

router.put("/admin/menu/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = menuWriteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const category = parsed.data.category
    ? (await db.select().from(categories).where(eq(categories.name, parsed.data.category)).limit(1))[0]
    : undefined;
  if (parsed.data.category && !category) {
    res.status(400).json({ error: "Unknown menu category." });
    return;
  }
  const { category: _category, price, ...rest } = parsed.data;
  const menuId = paramStr(req.params.id);
  await db.update(menuItems).set({
    ...rest,
    ...(category ? { categoryId: category.id } : {}),
    ...(price === undefined ? {} : { price: price.toFixed(2) }),
  }).where(eq(menuItems.id, menuId));
  const updated = (await menuRows()).find((item) => item.id === menuId);
  if (!updated) {
    res.status(404).json({ error: "Menu item not found." });
    return;
  }
  res.json(updated);
});

router.delete("/admin/menu/:id", requireAdmin, async (req, res): Promise<void> => {
  const result = await db.delete(menuItems).where(eq(menuItems.id, paramStr(req.params.id))).returning({ id: menuItems.id });
  if (!result.length) {
    res.status(404).json({ error: "Menu item not found." });
    return;
  }
  res.status(204).end();
});

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({ id: orders.id }).from(orders)
    .where(req.user?.role === "admin" || req.user?.role === "staff" ? undefined : eq(orders.userId, req.user!.id))
    .orderBy(desc(orders.createdAt));
  const result = (await Promise.all(rows.map((row) => loadOrder(row.id)))).filter((order): order is NonNullable<typeof order> => Boolean(order));
  res.json(ListOrdersResponse.parse(result));
});

router.get("/orders/user/:userId", requireAuth, async (req, res): Promise<void> => {
  const userId = paramStr(req.params.userId);
  if (req.user!.id !== userId && !["admin", "staff"].includes(req.user!.role)) {
    res.status(403).json({ error: "You can only view your own orders." });
    return;
  }
  const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  const result = (await Promise.all(rows.map((row) => loadOrder(row.id)))).filter((order): order is NonNullable<typeof order> => Boolean(order));
  res.json(ListOrdersResponse.parse(result));
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  if (rateLimited(clientKey(req), writeAttempts, 5)) {
    res.status(429).json({ error: "Too many order requests. Try again later." });
    return;
  }
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success || (parsed.data.orderType === "delivery" && !parsed.data.address)) {
    res.status(400).json({ error: "Please provide a valid order and delivery address." });
    return;
  }
  const ids = [...new Set(parsed.data.items.map((item) => item.menuItemId))];
  let orderId = "";
  try {
    await db.transaction(async (tx) => {
      const products = await tx.select().from(menuItems).where(inArray(menuItems.id, ids));
      const byId = new Map(products.map((item) => [item.id, item]));
      const lines = parsed.data.items.map((item) => {
        const product = byId.get(item.menuItemId);
        if (!product || !product.isAvailable) throw new Error("One or more menu items are unavailable.");
        return { product, quantity: item.quantity, customizations: item.customizations };
      });
      const total = lines.reduce((sum, line) => sum + numeric(line.product.price) * line.quantity, 0);
      orderId = `RG-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const now = new Date();
      await tx.insert(orders).values({
        id: orderId,
        userId: req.user!.id,
        orderType: parsed.data.orderType,
        status: "placed",
        totalAmount: total.toFixed(2),
        address: parsed.data.orderType === "delivery" ? parsed.data.address : null,
        createdAt: now,
        estimatedReadyAt: new Date(now.getTime() + (parsed.data.orderType === "delivery" ? 45 : 25) * 60 * 1000),
      });
      await tx.insert(orderItems).values(lines.map((line) => ({
        id: randomUUID(),
        orderId,
        menuItemId: line.product.id,
        quantity: line.quantity,
        itemPrice: numeric(line.product.price).toFixed(2),
        customizations: line.customizations ? line.customizations : null,
      })));
      await tx.insert(orderStatusLog).values({ id: randomUUID(), orderId, status: "placed", updatedBy: req.user!.id });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unavailable")) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  const result = await loadOrder(orderId);
  res.status(201).json(CreateOrderResponse.parse(result));
});

router.get("/orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const order = await loadOrder(paramStr(req.params.id));
  if (!order || (order.userId !== req.user!.id && !["admin", "staff"].includes(req.user!.role))) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json({ id: order.id, status: order.status, updatedAt: order.createdAt });
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const order = await loadOrder(paramStr(req.params.id));
  if (!order || (order.userId !== req.user!.id && !["admin", "staff"].includes(req.user!.role))) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json(GetOrderResponse.parse(order));
});

const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const orderId = paramStr(req.params.id);
  const updated = await db.update(orders).set({ status: parsed.data.status }).where(eq(orders.id, orderId)).returning({ id: orders.id });
  if (!updated.length) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  await db.insert(orderStatusLog).values({ id: randomUUID(), orderId, status: parsed.data.status, updatedBy: req.user!.id });
  const result = await loadOrder(orderId);
  res.json(UpdateOrderStatusResponse.parse(result));
};
router.patch("/orders/:id/status", requireStaff, updateOrderStatus);
router.patch("/admin/orders/:id/status", requireStaff, updateOrderStatus);

router.get("/reservations", requireAuth, async (req, res): Promise<void> => {
  const result = await reservationRows(req.user!.role === "admin" || req.user!.role === "staff" ? undefined : req.user!.id);
  res.json(ListReservationsResponse.parse(result));
});

router.get("/reservations/user/:userId", requireAuth, async (req, res): Promise<void> => {
  const userId = paramStr(req.params.userId);
  if (req.user!.id !== userId && !["admin", "staff"].includes(req.user!.role)) {
    res.status(403).json({ error: "You can only view your own reservations." });
    return;
  }
  res.json(ListReservationsResponse.parse(await reservationRows(userId)));
});

router.get("/reservations/availability", async (req, res): Promise<void> => {
  const date = typeof req.query.date === "string" ? req.query.date : "";
  const partySize = Number(req.query.partySize);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(partySize) || partySize < 1 || partySize > 12) {
    res.status(400).json({ error: "A valid date and party size are required." });
    return;
  }
  const tables = await db.select().from(restaurantTables).orderBy(asc(restaurantTables.capacity));
  const booked = await db.select().from(reservations).where(and(eq(reservations.reservationDate, date), ne(reservations.status, "cancelled")));
  const slots = slotValues.filter((time) => tables.some((table) =>
    table.capacity >= partySize && !booked.some((reservation) => reservation.reservationTime === time && reservation.tableId === table.id),
  ));
  res.json(GetReservationAvailabilityResponse.parse({ date, partySize, slots }));
});

router.post("/reservations", requireAuth, async (req, res): Promise<void> => {
  if (rateLimited(clientKey(req), writeAttempts, 5)) {
    res.status(429).json({ error: "Too many reservation requests. Try again later." });
    return;
  }
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let reservationId = "";
  let tableNumber = "";
  try {
    await db.transaction(async (tx) => {
      const booked = await tx.select({ tableId: reservations.tableId }).from(reservations)
        .where(and(eq(reservations.reservationDate, parsed.data.date), eq(reservations.reservationTime, parsed.data.time), ne(reservations.status, "cancelled")));
      const bookedIds = new Set(booked.map((row) => row.tableId));
      const table = (await tx.select().from(restaurantTables).where(gte(restaurantTables.capacity, parsed.data.partySize)).orderBy(asc(restaurantTables.capacity))).find((candidate) => !bookedIds.has(candidate.id));
      if (!table) throw new Error("That time is already reserved. Please choose another slot.");
      reservationId = randomUUID();
      tableNumber = table.tableNumber;
      await tx.insert(reservations).values({
        id: reservationId,
        userId: req.user!.id,
        tableId: table.id,
        reservationDate: parsed.data.date,
        reservationTime: parsed.data.time,
        partySize: parsed.data.partySize,
        status: "pending",
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("reserved") || error.message.includes("unique"))) {
      res.status(409).json({ error: "That time is already reserved. Please choose another slot." });
      return;
    }
    throw error;
  }
  const result = {
    id: reservationId,
    guestName: req.user!.name,
    date: parsed.data.date,
    time: parsed.data.time,
    partySize: parsed.data.partySize,
    status: "pending" as const,
    tableLabel: `Table ${tableNumber}`,
  };
  res.status(201).json(CreateReservationResponse.parse(result));
});

router.get("/admin/reservations", requireStaff, async (_req, res): Promise<void> => {
  res.json(ListReservationsResponse.parse(await reservationRows()));
});

router.patch("/admin/reservations/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = reservationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const reservationId = paramStr(req.params.id);
  const updated = await db.update(reservations).set({ status: parsed.data.status }).where(eq(reservations.id, reservationId)).returning({ id: reservations.id });
  if (!updated.length) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  const result = (await reservationRows()).find((reservation) => reservation.id === reservationId);
  res.json(result);
});

router.get("/dashboard/summary", requireStaff, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const revenue = (await db.select({ value: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)` }).from(orders).where(sql`${orders.createdAt}::date = ${today}`))[0]?.value;
  const open = (await db.select({ value: sql<string>`COUNT(*)` }).from(orders).where(ne(orders.status, "completed")))[0]?.value;
  const reservationsToday = (await db.select({ value: sql<string>`COUNT(*)` }).from(reservations).where(and(eq(reservations.reservationDate, today), ne(reservations.status, "cancelled"))))[0]?.value;
  const breakdown = await db.select({ status: orders.status, count: sql<string>`COUNT(*)` }).from(orders).groupBy(orders.status);
  const popular = await db.select({ name: menuItems.name, orders: sql<string>`SUM(${orderItems.quantity})` })
    .from(orderItems).innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId)).groupBy(menuItems.id, menuItems.name).orderBy(desc(sql`SUM(${orderItems.quantity})`)).limit(5);
  res.json(GetDashboardSummaryResponse.parse({
    todayRevenue: numeric(revenue),
    openOrders: Number(open ?? 0),
    reservationsToday: Number(reservationsToday ?? 0),
    popularItems: popular.map((item) => ({ name: item.name, orders: Number(item.orders) })),
    statusBreakdown: breakdown.map((item) => ({ status: item.status, count: Number(item.count) })),
  }));
});

export default router;