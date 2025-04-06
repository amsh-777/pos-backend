const express = require("express");
const router = express.Router();
const tableBookingController = require("../controllers/tableBooking.controller");

// Define Routes
router.get("/", tableBookingController.getAllBookings);
router.post("/", tableBookingController.createBooking);
router.delete("/:id", tableBookingController.deleteBooking);

module.exports = router;
