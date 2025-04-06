const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

// Create a new order
router.post('/create', orderController.createOrder);

// Get all orders
router.get('/', orderController.getAllOrders);

module.exports = router;
