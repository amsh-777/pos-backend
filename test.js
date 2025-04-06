const axios = require('axios');

// API Base URL
const API_BASE_URL = 'http://localhost:5000/api/orders';

// Test creating an order
const createOrder = async () => {
  try {
    const response = await axios.post(`${API_BASE_URL}/create`, {
      customerName: 'vedant',
      orderNumber: 101,
      paymentMethod: 'Credit',
      totalAmount: 45.99,
    });

    console.log('Order Created:', response.data);
  } catch (error) {
    console.error('Error Creating Order:', error.response ? error.response.data : error.message);
  }
};

// Test fetching all orders
const fetchOrders = async () => {
  try {
    const response = await axios.get(API_BASE_URL);

    console.log('All Orders:', response.data);
  } catch (error) {
    console.error('Error Fetching Orders:', error.response ? error.response.data : error.message);
  }
};

// Execute the test functions
(async () => {
  console.log('--- Creating Order ---');
  await createOrder();

  console.log('--- Fetching Orders ---');
  await fetchOrders();
})();
