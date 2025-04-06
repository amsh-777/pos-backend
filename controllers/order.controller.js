const { Pool } = require("pg");

// ✅ PostgreSQL Connection Pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "pos_db",
  password: process.env.DB_PASSWORD || "your_password",
  port: process.env.DB_PORT || 5432,
});

// ✅ Check if database connection works
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database Connection Error:", err.stack);
  } else {
    console.log("✅ Database Connected Successfully!");
    release();
  }
});

// ================================
// ✅ Get all orders
// ================================
exports.getOrders = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders", details: error.message });
  }
};

// ================================
// ✅ Create a new order (with Debugging Logs)
// ================================
exports.createOrder = async (req, res) => {
  try {
    const { customer_name, order_number, payment_method, total_amount } = req.body;

    console.log("📥 Received Order Data:", req.body);

    // ✅ Validate Request Data
    if (!customer_name || !order_number || !payment_method || typeof total_amount !== "number") {
      console.error("❌ Invalid order data received:", req.body);
      return res.status(400).json({ error: "Invalid order data. Please check the format." });
    }

    // ✅ Debug SQL Query
    const query = `
      INSERT INTO orders (customer_name, order_number, payment_method, total_amount, order_date) 
      VALUES ($1, $2, $3, $4, NOW()) 
      RETURNING *;
    `;
    console.log("🔍 Executing SQL Query:", query);
    console.log("🔍 Query Values:", [customer_name, order_number, payment_method, total_amount]);

    // ✅ Execute Query
    const result = await pool.query(query, [customer_name, order_number, payment_method, total_amount]);

    console.log("✅ Order Saved Successfully:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ SQL Error Saving Order:", error);
    res.status(500).json({ error: "Failed to save order", details: error.message });
  }
};

// ================================
// ✅ Delete an order
// ================================
exports.deleteOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING *", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ message: "✅ Order deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting order:", error);
    res.status(500).json({ error: "Failed to delete order", details: error.message });
  }
};
