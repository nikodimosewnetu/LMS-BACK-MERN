const express = require("express");
const { createOrder, verifyPayment } = require("../../controllers/student-controller/order-controller");

const router = express.Router();

// Route to create a new order and initialize Chapa payment
router.post("/create", createOrder);

// Route to verify payment after transaction is completed
router.get("/verify/:tx_ref", verifyPayment);

module.exports = router;
