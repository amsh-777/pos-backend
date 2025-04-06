const { Pool } = require("pg");

// PostgreSQL Connection Pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "pos_db",
  password: process.env.DB_PASSWORD || "your_password",
  port: process.env.DB_PORT || 5432,
});

// ✅ Get all table bookings
exports.getTableBookings = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM table_booking ORDER BY table_number");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching table bookings:", error);
    res.status(500).send(error.message);
  }
};

// ✅ Create a new table booking
exports.createTableBooking = async (req, res) => {
  const { customer_name, phone_number, table_number } = req.body;

  if (!customer_name || !phone_number || !table_number) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO table_booking (customer_name, phone_number, table_number) VALUES ($1, $2, $3) RETURNING *",
      [customer_name, phone_number, table_number]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error booking table:", error);
    res.status(500).send(error.message);
  }
};

// ✅ Unbook a table
exports.deleteTableBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM table_booking WHERE id = $1 RETURNING *", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Table booking not found" });
    }

    res.json({ message: "Table unbooked successfully" });
  } catch (error) {
    console.error("❌ Error unbooking table:", error);
    res.status(500).send(error.message);
  }
};
