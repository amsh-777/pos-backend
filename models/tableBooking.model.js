const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

// PostgreSQL Connection Pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "pos_db",
  password: process.env.DB_PASSWORD || "2005",
  port: process.env.DB_PORT || 5432,
});

const TableBooking = {
  getAllBookings: async () => {
    const result = await pool.query("SELECT * FROM table_booking ORDER BY table_number");
    return result.rows;
  },

  createBooking: async (customer_name, phone_number, table_number) => {
    const result = await pool.query(
      "INSERT INTO table_booking (customer_name, phone_number, table_number) VALUES ($1, $2, $3) RETURNING *",
      [customer_name, phone_number, table_number]
    );
    return result.rows[0];
  },

  deleteBooking: async (id) => {
    const result = await pool.query("DELETE FROM table_booking WHERE id = $1 RETURNING *", [id]);
    return result.rowCount;
  }
};

module.exports = TableBooking;
