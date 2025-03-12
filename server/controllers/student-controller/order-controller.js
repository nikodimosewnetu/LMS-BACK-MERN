const axios = require("axios");
const Order = require("../../models/Order");
const Course = require("../../models/Course");
const StudentCourses = require("../../models/StudentCourses");

const CHAPA_AUTH_KEY = "CHASECK_TEST-HgKQ35Wyp5cz8ajB9mmGGaCLYPvWQecE"; // Use environment variable in production

// Endpoint to initialize Chapa payment
const createOrder = async (req, res) => {
  try {
    const {
      userId,
      userName,
      userEmail,
      orderStatus,
      paymentMethod,
      paymentStatus,
      orderDate,
      courseId,
      courseTitle,
      coursePricing,
    } = req.body;

    // Check required fields
    if (!coursePricing || !courseId || !courseTitle) {
      return res.status(400).json({ success: false, message: "All fields are required!" });
    }

    const tx_ref = `chapa-${Date.now()}`; // Generate unique transaction reference

    // Prepare Chapa payment request body
    const headers = {
      Authorization: `Bearer ${CHAPA_AUTH_KEY}`,
      "Content-Type": "application/json",
    };

    const body = {
      amount: coursePricing,
      currency: "ETB", // Change the currency as per your needs
      email: userEmail,
      first_name: userName,
      last_name: userName, // Using userName for both first and last name
      phone_number: "0800000000", // Add actual phone number if available
      tx_ref,
      return_url: `http://localhost:5173/payment-success?tx_ref=${tx_ref}`, // Ensure frontend is using this URL
    };

    // Initialize payment with Chapa
    const response = await axios.post("https://api.chapa.co/v1/transaction/initialize", body, { headers });

    // If payment initialization was successful
    if (response.data.data.checkout_url) {
      const newlyCreatedCourseOrder = new Order({
        userId,
        userName,
        userEmail,
        orderStatus,
        paymentMethod,
        paymentStatus,
        orderDate,
        tx_ref, // Use tx_ref here
        courseId,
        courseTitle,
        coursePricing,
      });

      // Save the order
      await newlyCreatedCourseOrder.save();

      // Send the response with the Chapa payment URL for frontend redirection
      res.status(201).json({
        success: true,
        data: {
          checkoutUrl: response.data.data.checkout_url,
          orderId: newlyCreatedCourseOrder._id,
        },
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Error while creating Chapa payment!",
      });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Some error occurred while initializing payment!",
    });
  }
};

// Endpoint to verify Chapa payment after user completes the transaction
const verifyPayment = async (req, res) => {
  try {
    const { tx_ref } = req.params;

    // Verify payment using Chapa API
    const headers = {
      Authorization: `Bearer ${CHAPA_AUTH_KEY}`,
      "Content-Type": "application/json",
    };

    const response = await axios.get(`https://api.chapa.co/v1/transaction/verify/${tx_ref}`, { headers });

    if (response.data.data.status === "successful") {
      // Handle the order status update in the database
      let order = await Order.findOne({ tx_ref });

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found!" });
      }

      order.paymentStatus = "paid";
      order.orderStatus = "confirmed";

      await order.save();

      // Update student courses
      const studentCourses = await StudentCourses.findOne({ userId: order.userId });
      if (studentCourses) {
        studentCourses.courses.push({
          courseId: order.courseId,
          title: order.courseTitle,
          dateOfPurchase: order.orderDate,
        });
        await studentCourses.save();
      } else {
        const newStudentCourses = new StudentCourses({
          userId: order.userId,
          courses: [{ courseId: order.courseId, title: order.courseTitle, dateOfPurchase: order.orderDate }],
        });
        await newStudentCourses.save();
      }

      // Update the course schema to reflect the student purchase
      await Course.findByIdAndUpdate(order.courseId, {
        $addToSet: {
          students: {
            studentId: order.userId,
            studentName: order.userName,
            studentEmail: order.userEmail,
            paidAmount: order.coursePricing,
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Order confirmed and payment successful",
        data: order,
      });
    } else {
      res.status(400).json({ success: false, message: "Payment verification failed" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Error verifying payment!",
    });
  }
};

module.exports = { createOrder, verifyPayment };
