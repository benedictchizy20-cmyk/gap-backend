/* =========================================================
   FUELGAP - SALES ROUTES
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
========================================================= */

const express = require("express");

const {
    createSale,
    getSales,
    getSaleById,
    deleteSale
} = require("../controllers/salesController");

const {
    requireAuth
} = require("../middleware/authMiddleware");


const router = express.Router();


/* =========================================================
   CREATE SALE
   POST /api/sales
========================================================= */

router.post(
    "/",
    requireAuth,
    createSale
);


/* =========================================================
   GET ALL SALES
   GET /api/sales
========================================================= */

router.get(
    "/",
    requireAuth,
    getSales
);


/* =========================================================
   GET SALE BY ID
   GET /api/sales/:id
========================================================= */

router.get(
    "/:id",
    requireAuth,
    getSaleById
);


/* =========================================================
   DELETE SALE
   DELETE /api/sales/:id
========================================================= */

router.delete(
    "/:id",
    requireAuth,
    deleteSale
);


module.exports = router;