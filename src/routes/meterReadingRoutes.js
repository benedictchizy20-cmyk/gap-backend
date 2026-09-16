/* =========================================================
   FUELGAP - METER READING ROUTES
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
========================================================= */

const express = require("express");

const {
    createMeterReading,
    getMeterReadings,
    getMeterReadingById,
    deleteMeterReading
} = require("../controllers/meterReadingController");

const {
    requireAuth
} = require("../middleware/authMiddleware");


const router = express.Router();


/* =========================================================
   CREATE METER READING
   POST /api/meter-readings
========================================================= */

router.post(
    "/",
    requireAuth,
    createMeterReading
);


/* =========================================================
   GET ALL METER READINGS
   GET /api/meter-readings
========================================================= */

router.get(
    "/",
    requireAuth,
    getMeterReadings
);


/* =========================================================
   GET METER READING BY ID
   GET /api/meter-readings/:id
========================================================= */

router.get(
    "/:id",
    requireAuth,
    getMeterReadingById
);


/* =========================================================
   DELETE METER READING
   DELETE /api/meter-readings/:id
========================================================= */

router.delete(
    "/:id",
    requireAuth,
    deleteMeterReading
);


/* =========================================================
   EXPORT ROUTER
========================================================= */

module.exports = router;