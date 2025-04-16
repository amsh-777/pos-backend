const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const { Pool } = require("pg");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5001;

// ✅ Middleware
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(bodyParser.json());

// ✅ PostgreSQL Pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "pos_db",
  password: process.env.DB_PASSWORD || "2005",
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL Database"))
  .catch((err) => {
    console.error("❌ Database Connection Error:", err.message);
    process.exit(1);
  });

// ✅ File Upload Setup
const upload = multer({ dest: "uploads/" });

// ✅ Test Route
app.get("/", (req, res) => {
  res.send("✅ POS API is running!");
});

/* ============================
   🔐 USER ROUTES
============================ */
app.post("/api/users/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: "❌ Missing credentials" });
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, message: "❌ Invalid credentials" });
    const user = result.rows[0];
    res.status(200).json({ success: true, message: "✅ Login successful", role: user.role, user });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ success: false, message: "❌ Server error. Please try again." });
  }
});

app.post("/api/users", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "❌ Missing required fields" });
  try {
    const existing = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: "❌ Username already exists" });
    const result = await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role",
      [username, password, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error adding user:", error);
    res.status(500).json({ error: "❌ Failed to add user" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ error: "❌ Failed to fetch users" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "✅ User deleted successfully!" });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "❌ Failed to delete user" });
  }
});

/* ============================
   📋 MENU ROUTES
============================ */
app.get("/api/menu", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, category, price FROM menu ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching menu:", error);
    res.status(500).json({ error: "❌ Failed to fetch menu" });
  }
});

app.post("/api/menu", upload.single("image"), async (req, res) => {
  try {
    const { name, category, price } = req.body;
    if (!name || !category || !price || !req.file) return res.status(400).json({ error: "❌ Missing fields or image" });
    const imageBuffer = fs.readFileSync(req.file.path);
    const result = await pool.query(
      "INSERT INTO menu (name, category, price, image) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, category, price, imageBuffer]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error adding menu item:", error);
    res.status(500).json({ error: "❌ Failed to add menu item" });
  }
});

app.delete("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM menu WHERE id = $1 RETURNING *", [id]);
    res.json({ message: "✅ Menu item deleted", deletedItem: result.rows[0] });
  } catch (error) {
    console.error("❌ Error deleting menu item:", error);
    res.status(500).json({ error: "❌ Failed to delete menu item" });
  }
});

/* ============================
   🧾 ORDER ROUTES
============================ */
app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    res.status(500).json({ error: "❌ Failed to fetch orders" });
  }
});

app.post("/api/orders", async (req, res) => {
  const {
    customer_name, phone_number, order_number, payment_method,
    total_amount, status, order_date, source, note, items
  } = req.body;

  if (!customer_name || !order_number || !payment_method || !total_amount || !status) {
    return res.status(400).json({ error: "❌ Missing required fields" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO orders (
        customer_name, phone_number, order_number, payment_method, total_amount,
        status, order_date, source, note
      ) VALUES (
        $1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, $9
      ) RETURNING id`,
      [
        customer_name,
        phone_number || null,
        order_number,
        payment_method,
        total_amount,
        status,
        order_date || null,
        source || "pos",
        note || null
      ]
    );

    const orderId = result.rows[0].id;

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        await client.query(
          "INSERT INTO order_items (order_id, item_name, quantity, price) VALUES ($1, $2, $3, $4)",
          [orderId, item.name, item.quantity, item.price]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "✅ Order saved", orderId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error saving order:", error);
    res.status(500).json({ error: "❌ Failed to save order" });
  } finally {
    client.release();
  }
});

app.get("/api/orders/pending", async (req, res) => {
  try {
    const ordersResult = await pool.query("SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC");
    const orders = ordersResult.rows;

    for (const order of orders) {
      const itemsResult = await pool.query("SELECT item_name, quantity, price FROM order_items WHERE order_id = $1", [order.id]);
      order.items = itemsResult.rows;
    }

    res.json(orders);
  } catch (error) {
    console.error("❌ Error fetching pending orders:", error);
    res.status(500).json({ error: "❌ Failed to fetch pending orders" });
  }
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
