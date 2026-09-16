/* =========================================================
   FUELGAP - ALERT ROUTES
   SUPABASE + EXPRESS
   HTTPONLY COOKIE SESSION
========================================================= */

const express = require("express");

const router = express.Router();


const {

    getAlerts,

    getAlertById,

    createAlert,

    acknowledgeAlert,

    resolveAlert,

    deleteAlert

} = require("../controllers/alertController");


const {
    requireAuth
} = require("../middleware/authMiddleware");


/* =========================================================
   GET ALL ALERTS
   GET /api/alerts
========================================================= */

router.get(
    "/",
    requireAuth,
    getAlerts
);


/* =========================================================
   GET SINGLE ALERT
   GET /api/alerts/:id
========================================================= */

router.get(
    "/:id",
    requireAuth,
    getAlertById
);


/* =========================================================
   CREATE ALERT
   POST /api/alerts
========================================================= */

router.post(
    "/",
    requireAuth,
    createAlert
);


/* =========================================================
   ACKNOWLEDGE ALERT
   PATCH /api/alerts/:id/acknowledge
========================================================= */

router.patch(
    "/:id/acknowledge",
    requireAuth,
    acknowledgeAlert
);


/* =========================================================
   RESOLVE ALERT
   PATCH /api/alerts/:id/resolve
========================================================= */

router.patch(
    "/:id/resolve",
    requireAuth,
    resolveAlert
);


/* =========================================================
   DELETE ALERT
   DELETE /api/alerts/:id
========================================================= */

router.delete(
    "/:id",
    requireAuth,
    deleteAlert
);


module.exports = router;