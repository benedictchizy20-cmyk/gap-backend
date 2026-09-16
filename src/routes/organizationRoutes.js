/* =========================================================
   FUELGAP - ORGANIZATION ROUTES
   SUPABASE + EXPRESS
   HTTPONLY COOKIE SESSION
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   CONTROLLERS
========================================================= */

const {
    getOrganization,
    updateOrganization
} = require("../controllers/organizationController");


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

/*
   IMPORTANT:

   This should be the SAME authentication middleware
   you are already using for:

   /api/auth/me
   /api/stations
   /api/shifts
   /api/sales
   /api/reports
   etc.

   If your existing middleware is named differently,
   change ONLY this import.
*/

const {
    requireAuth
} = require("../middleware/authMiddleware");


/* =========================================================
   GET ORGANIZATION
========================================================= */

router.get(
    "/",
    requireAuth,
    getOrganization
);


/* =========================================================
   UPDATE ORGANIZATION
========================================================= */

router.put(
    "/",
    requireAuth,
    updateOrganization
);


/* =========================================================
   EXPORT ROUTER
========================================================= */

module.exports = router;