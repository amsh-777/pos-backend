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
app.use(cors({ origin: ["https://dineease-pos.vercel.app"], credentials: true }));
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

// ✅ File Upload
const upload = multer({ dest: "uploads/" });

// ✅ Test
app.get("/", (req, res) => {
  res.send("✅ POS API is running!");
});

// ============================ 🔐 USER ROUTES ============================
app.post("/api/users/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: "❌ Missing credentials" });
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, message: "❌ Invalid credentials" });
    res.status(200).json({ success: true, message: "✅ Login successful", role: result.rows[0].role, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "❌ Server error" });
  }
});

app.post("/api/users", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "❌ Missing fields" });
  try {
    const exists = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (exists.rows.length > 0) return res.status(400).json({ error: "❌ Username exists" });
    const result = await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role", [username, password, role]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to create user" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, role FROM users ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to fetch users" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ message: "✅ User deleted" });
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to delete user" });
  }
});

// ============================ 📋 MENU ROUTES ============================
app.get("/api/menu", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, category, price FROM menu ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to fetch menu" });
  }
});

app.post("/api/menu", upload.single("image"), async (req, res) => {
  try {
    const { name, category, price } = req.body;
    const imageBuffer = fs.readFileSync(req.file.path);
    const result = await pool.query(
      "INSERT INTO menu (name, category, price, image) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, category, price, imageBuffer]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to add menu item" });
  }
});

app.get("/api/menu/:id/image", async (req, res) => {
  try {
    const result = await pool.query("SELECT image FROM menu WHERE id = $1", [req.params.id]);
    if (!result.rows.length) return res.status(404).send("Image not found");
    res.set("Content-Type", "image/jpeg");
    res.send(result.rows[0].image);
  } catch (error) {
    res.status(500).send("❌ Image fetch error");
  }
});

app.delete("/api/menu/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM menu WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ message: "✅ Menu item deleted", deletedItem: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to delete menu item" });
  }
});

// ============================ 🧾 ORDER ROUTES ============================
app.post("/api/orders", async (req, res) => {
  const {
    customer_name, phone_number, order_number, payment_method,
    total_amount, status, order_date, source, note, items
  } = req.body;

  if (!customer_name || !order_number || !payment_method || !total_amount || !status)
    return res.status(400).json({ error: "❌ Missing fields" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `INSERT INTO orders (
        customer_name, phone_number, order_number, payment_method,
        total_amount, status, order_date, source, note
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, $9) RETURNING id`,
      [customer_name, phone_number, order_number, payment_method, total_amount, status, order_date, source, note]
    );

    const orderId = orderResult.rows[0].id;

    if (Array.isArray(items)) {
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
    res.status(500).json({ error: "❌ Failed to save order" });
  } finally {
    client.release();
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to fetch orders" });
  }
});

app.get("/api/orders/pending", async (req, res) => {
  try {
    const ordersRes = await pool.query("SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC");
    const orders = ordersRes.rows;

    for (const order of orders) {
      const itemsRes = await pool.query("SELECT item_name, quantity, price FROM order_items WHERE order_id = $1", [order.id]);
      order.items = itemsRes.rows;
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to fetch pending orders" });
  }
});

app.post("/api/orders/:id/prepare", async (req, res) => {
  try {
    const result = await pool.query("UPDATE orders SET status = 'prepared' WHERE id = $1 RETURNING *", [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "❌ Order not found" });
    res.json({ message: "✅ Marked prepared", order: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to update order" });
  }
});

app.post("/api/orders/:id/approve", async (req, res) => {
  try {
    const result = await pool.query("UPDATE orders SET status = 'approved' WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ message: "✅ Approved", order: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "❌ Approval failed" });
  }
});

app.post("/api/orders/:id/reject", async (req, res) => {
  try {
    const result = await pool.query("UPDATE orders SET status = 'rejected' WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ message: "✅ Rejected", order: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "❌ Rejection failed" });
  }
});

app.get("/api/orders/:id/status", async (req, res) => {
  try {
    const result = await pool.query("SELECT status FROM orders WHERE id = $1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ status: result.rows[0].status });
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to get status" });
  }
});

// ============================ 📈 SALES REPORT ============================
app.get("/api/sales", async (req, res) => {
  const { type } = req.query;
  let groupBy = "TO_CHAR(order_date, 'YYYY-MM-DD')";
  if (type === "monthly") groupBy = "TO_CHAR(order_date, 'YYYY-MM')";
  else if (type === "yearly") groupBy = "TO_CHAR(order_date, 'YYYY')";
  try {
    const result = await pool.query(
      `SELECT ${groupBy} AS label, SUM(total_amount)::numeric(10,2) AS total FROM orders GROUP BY label ORDER BY label ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to fetch sales data" });
  }
});

// ============================ 🍽️ TABLE BOOKING ============================
app.get("/api/table-booking", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM table_booking ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to fetch table bookings" });
  }
});

app.post("/api/table-booking", async (req, res) => {
  const { table_number, customer_name, phone_number, start_time, end_time, note, people } = req.body;
  if (!table_number || !customer_name || !phone_number || !start_time || !end_time)
    return res.status(400).json({ error: "❌ Missing fields" });

  try {
    const start = new Date(start_time);
    const end = new Date(end_time);
    const booking_date = start.toISOString().split("T")[0];
    const booking_time = start.toISOString().split("T")[1].slice(0, 5);

    const result = await pool.query(
      `INSERT INTO table_booking (
        table_number, customer_name, phone_number, booking_date,
        booking_time, start_time, end_time, note, people
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [table_number, customer_name, phone_number, booking_date, booking_time, start, end, note || null, people || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to book table" });
  }
});

app.delete("/api/table-booking/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM table_booking WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ message: "✅ Table unbooked", deletedBooking: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "❌ Failed to unbook table" });
  }
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});