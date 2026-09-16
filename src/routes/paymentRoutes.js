/* =========================================================
   FUELGAP - PAYMENT ROUTES
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   PAYMENT CONTROLLER
========================================================= */

const {
    createPayment,
    getPayments,
    getPaymentById,
    deletePayment
} = require("../controllers/paymentController");


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
    requireAuth
} = require("../middleware/authMiddleware");


/* =========================================================
   CREATE PAYMENT
   POST /api/payments

   Records a payment against a sale.
========================================================= */

router.post(
    "/",
    requireAuth,
    createPayment
);


/* =========================================================
   GET ALL PAYMENTS
   GET /api/payments

   Optional filters:

   ?station_id=...
   ?shift_id=...
   ?sale_id=...
   ?payment_method=...
   ?date=YYYY-MM-DD
========================================================= */

router.get(
    "/",
    requireAuth,
    getPayments
);


/* =========================================================
   GET PAYMENT BY ID
   GET /api/payments/:id
========================================================= */

router.get(
    "/:id",
    requireAuth,
    getPaymentById
);


/* =========================================================
   DELETE PAYMENT
   DELETE /api/payments/:id
========================================================= */

router.delete(
    "/:id",
    requireAuth,
    deletePayment
);


/* =========================================================
   EXPORT ROUTER
========================================================= */

module.exports = router;