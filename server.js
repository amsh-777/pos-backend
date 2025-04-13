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

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// PostgreSQL Setup
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

// Test Route
app.get("/", (req, res) => {
  res.send("✅ POS API is running!");
});

// ================= TABLE BOOKING =================
app.post("/api/table-booking", async (req, res) => {
  const {
    table_number,
    customer_name,
    phone_number,
    start_time,
    end_time,
    note,
    people
  } = req.body;

  console.log("📥 Incoming booking:", req.body);

  if (!table_number || !customer_name || !phone_number || !start_time || !end_time) {
    return res.status(400).json({ error: "❌ Missing required fields" });
  }

  try {
    const conflictCheck = await pool.query(
      `SELECT * FROM table_booking
       WHERE table_number = $1
       AND NOT ($3 <= start_time OR $2 >= end_time)`,
      [table_number, start_time, end_time]
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(409).json({ error: "❌ This table is already booked for the selected time." });
    }

    const result = await pool.query(
      `INSERT INTO table_booking 
        (table_number, customer_name, phone_number, start_time, end_time, note, people)
       VALUES ($1, $2, $3, $4::timestamp, $5::timestamp, $6, $7) RETURNING *`,
      [
        table_number,
        customer_name,
        phone_number,
        start_time,
        end_time,
        note || null,
        people || 1
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error booking table:", error);
    res.status(500).json({ error: "❌ Failed to book table" });
  }
});

app.get("/api/table-booking", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM table_booking ORDER BY table_number ASC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching table bookings:", error);
    res.status(500).json({ error: "❌ Failed to fetch table bookings" });
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

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
