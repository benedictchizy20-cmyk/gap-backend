/* =========================================================
   FUELGAP - REPORT ROUTES
   SUPABASE + EXPRESS
   HTTPONLY COOKIE SESSION

   ROUTE:
   GET /api/reports
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   REPORT CONTROLLER
========================================================= */

const {
    getReport
} = require("../controllers/reportController");


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
    requireAuth
} = require("../middleware/authMiddleware");


/* =========================================================
   GET REPORT
========================================================= */

router.get(
    "/",
    requireAuth,
    getReport
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;