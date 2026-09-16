/* =========================================================
   FUELGAP - PLATFORM ROUTES
   SUPABASE + EXPRESS
   SUPER ADMIN / SOFTWARE OWNER

   PLATFORM ACCESS:
   - Only super_admin
   - NOT restricted by organization_id
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   PLATFORM CONTROLLER
========================================================= */

const {
    getPlatformOverview,
    getPlatformOrganizations,
    getPlatformOrganization
} = require("../controllers/platformController");


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
    requireAuth,
    requireSuperAdmin
} = require("../middleware/authMiddleware");


/* =========================================================
   PLATFORM OVERVIEW
   GET /api/platform/overview

   Returns:
   - Organizations
   - Users
   - Stations
   - Pumps
   - Nozzles
   - Shifts
   - Sales
   - Payments
   - Gaps
   - Alerts
========================================================= */

router.get(
    "/overview",
    requireAuth,
    requireSuperAdmin,
    getPlatformOverview
);


/* =========================================================
   ALL ORGANIZATIONS
   GET /api/platform/organizations

   Super Admin can see every organization
========================================================= */

router.get(
    "/organizations",
    requireAuth,
    requireSuperAdmin,
    getPlatformOrganizations
);


/* =========================================================
   SINGLE ORGANIZATION
   GET /api/platform/organizations/:id

   Super Admin can inspect any organization
========================================================= */

router.get(
    "/organizations/:id",
    requireAuth,
    requireSuperAdmin,
    getPlatformOrganization
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;