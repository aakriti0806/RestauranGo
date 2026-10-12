import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey();

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
});

export const menuItems = pgTable("menu_items", {
  id: id(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url").notNull().default(""),
  calories: integer("calories").notNull().default(0),
  allergens: text("allergens").array().notNull().default(sql`ARRAY[]::text[]`),
  dietaryTags: text("dietary_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  isAvailable: boolean("is_available").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
});

export const orders = pgTable("orders", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderType: text("order_type").notNull(),
  status: text("status").notNull().default("placed"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true }).notNull(),
}, (table) => ({
  userCreatedIdx: index("orders_user_created_idx").on(table.userId, table.createdAt),
}));

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  quantity: integer("quantity").notNull(),
  customizations: jsonb("customizations"),
  itemPrice: numeric("item_price", { precision: 10, scale: 2 }).notNull(),
});

export const orderStatusLog = pgTable("order_status_log", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const restaurantTables = pgTable("tables", {
  id: id(),
  tableNumber: text("table_number").notNull().unique(),
  capacity: integer("capacity").notNull(),
});

export const reservations = pgTable("reservations", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tableId: text("table_id").notNull().references(() => restaurantTables.id),
  reservationDate: date("reservation_date", { mode: "string" }).notNull(),
  reservationTime: text("reservation_time").notNull(),
  partySize: integer("party_size").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slotUnique: unique("reservations_table_date_time_unique").on(
    table.tableId,
    table.reservationDate,
    table.reservationTime,
  ),
  dateTimeIdx: index("reservations_date_time_idx").on(table.reservationDate, table.reservationTime),
}));

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MenuItem = typeof menuItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type RestaurantTable = typeof restaurantTables.$inferSelect;