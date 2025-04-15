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

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(bodyParser.json());

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

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("✅ POS API is running!");
});

// === USER ROUTES ===
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

// === MENU ROUTES ===
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

// === ORDER ROUTES ===
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
    customer_name, order_number, payment_method, total_amount, status,
    order_date, source, note
  } = req.body;
  if (!customer_name || !order_number || !payment_method || !total_amount || !status) {
    return res.status(400).json({ error: "❌ Missing required fields" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO orders (
        customer_name, order_number, payment_method, total_amount, status,
        order_date, source, note
      ) VALUES (
        $1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8
      ) RETURNING *`,
      [customer_name, order_number, payment_method, total_amount, status, order_date || null, source || "pos", note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error saving order:", error);
    res.status(500).json({ error: "❌ Failed to save order" });
  }
});

app.post("/api/orders/:id/prepare", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("UPDATE orders SET status = 'prepared' WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "❌ Order not found" });
    res.json({ success: true, message: "✅ Order marked as prepared", order: result.rows[0] });
  } catch (error) {
    console.error("❌ Error preparing order:", error);
    res.status(500).json({ error: "❌ Failed to mark as prepared" });
  }
});

app.get("/api/orders/pending", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching pending orders:", error);
    res.status(500).json({ error: "❌ Failed to fetch pending orders" });
  }
});

app.get("/api/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT status FROM orders WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "❌ Order not found" });
    res.json({ status: result.rows[0].status });
  } catch (error) {
    console.error("❌ Error checking order status:", error);
    res.status(500).json({ error: "❌ Failed to check order status" });
  }
});

app.post("/api/orders/:id/approve", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("UPDATE orders SET status = 'approved' WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "❌ Order not found" });
    res.json({ success: true, message: "✅ Order approved", order: result.rows[0] });
  } catch (error) {
    console.error("❌ Error approving order:", error);
    res.status(500).json({ error: "❌ Failed to approve order" });
  }
});

app.post("/api/orders/:id/reject", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("UPDATE orders SET status = 'rejected' WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "❌ Order not found" });
    res.json({ success: true, message: "✅ Order rejected", order: result.rows[0] });
  } catch (error) {
    console.error("❌ Error rejecting order:", error);
    res.status(500).json({ error: "❌ Failed to reject order" });
  }
});

// === SALES REPORT ===
app.get("/api/sales", async (req, res) => {
  const { type } = req.query;
  let groupBy;
  if (type === "monthly") groupBy = "TO_CHAR(order_date, 'YYYY-MM')";
  else if (type === "yearly") groupBy = "TO_CHAR(order_date, 'YYYY')";
  else groupBy = "TO_CHAR(order_date, 'YYYY-MM-DD')";
  try {
    const result = await pool.query(
      `SELECT ${groupBy} AS label, SUM(total_amount)::numeric(10,2) AS total FROM orders GROUP BY label ORDER BY label ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching sales data:", error);
    res.status(500).json({ error: "❌ Failed to fetch sales data" });
  }
});

// === TABLE BOOKING ===
app.get("/api/table-booking", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, table_number, customer_name, phone_number, booking_date, booking_time, start_time, end_time, note, people FROM table_booking ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching table bookings:", error);
    res.status(500).json({ error: "❌ Failed to fetch table bookings" });
  }
});

app.post("/api/table-booking", async (req, res) => {
  const {
    table_number,
    customer_name,
    phone_number,
    start_time,
    end_time,
    note,
    people,
  } = req.body;
  if (!table_number || !customer_name || !phone_number || !start_time || !end_time) {
    return res.status(400).json({ error: "❌ Missing required fields" });
  }
  try {
    const start = new Date(start_time);
    const end = new Date(end_time);
    const booking_date = start.toISOString().split("T")[0];
    const booking_time = start.toISOString().split("T")[1].substring(0, 5);
    const result = await pool.query(
      `INSERT INTO table_booking 
        (table_number, customer_name, phone_number, booking_date, booking_time, start_time, end_time, note, people)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        table_number,
        customer_name,
        phone_number,
        booking_date,
        booking_time,
        start.toISOString(),
        end.toISOString(),
        note || null,
        people || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error booking table:", error);
    res.status(500).json({ error: "❌ Failed to book table" });
  }
});

app.delete("/api/table-booking/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM table_booking WHERE id = $1 RETURNING *", [id]);
    res.json({ message: "✅ Table unbooked successfully!", deletedBooking: result.rows[0] });
  } catch (error) {
    console.error("❌ Error unbooking table:", error);
    res.status(500).json({ error: "❌ Failed to unbook table" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
