/* =========================================================
   FUELGAP - SHIFT ROUTES
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
========================================================= */

const express = require("express");

const {
    createShift,
    getShifts,
    getShiftById,
    openShift,
    closeShift,
    cancelShift,
    assignShiftAttendants,
    getShiftAttendants,
    removeShiftAttendant
} = require("../controllers/shiftController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");


const router = express.Router();


/* =========================================================
   CREATE / SCHEDULE SHIFT

   POST /api/shifts

   OWNER
   ADMIN
   MANAGER
========================================================= */

router.post(
    "/",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    createShift
);


/* =========================================================
   GET ALL SHIFTS

   GET /api/shifts

   OWNER
   ADMIN
   MANAGER
   ATTENDANT
========================================================= */

router.get(
    "/",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager",
        "attendant"
    ),
    getShifts
);


/* =========================================================
   GET SHIFT BY ID

   GET /api/shifts/:id

   OWNER
   ADMIN
   MANAGER
   ATTENDANT
========================================================= */

router.get(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager",
        "attendant"
    ),
    getShiftById
);


/* =========================================================
   OPEN SHIFT

   PATCH /api/shifts/:id/open

   OWNER
   ADMIN
   MANAGER
   ATTENDANT

   The controller handles the actual
   station and shift-status permissions.
========================================================= */

router.patch(
    "/:id/open",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager",
        "attendant"
    ),
    openShift
);


/* =========================================================
   CLOSE SHIFT

   PATCH /api/shifts/:id/close

   OWNER
   ADMIN
   MANAGER
========================================================= */

router.patch(
    "/:id/close",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    closeShift
);


/* =========================================================
   CANCEL SHIFT

   PATCH /api/shifts/:id/cancel

   OWNER
   ADMIN
   MANAGER
========================================================= */

router.patch(
    "/:id/cancel",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    cancelShift
);


/* =========================================================
   ASSIGN ATTENDANTS TO SHIFT

   POST /api/shifts/:id/attendants

   OWNER
   ADMIN
   MANAGER

   Body:

   {
       "attendant_ids": [
           "ATTENDANT-UUID-1",
           "ATTENDANT-UUID-2"
       ]
   }
========================================================= */

router.post(
    "/:id/attendants",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    assignShiftAttendants
);


/* =========================================================
   GET SHIFT ATTENDANTS

   GET /api/shifts/:id/attendants

   OWNER
   ADMIN
   MANAGER
   ATTENDANT
========================================================= */

router.get(
    "/:id/attendants",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager",
        "attendant"
    ),
    getShiftAttendants
);


/* =========================================================
   REMOVE ATTENDANT FROM SHIFT

   DELETE /api/shifts/:id/attendants/:attendantId

   OWNER
   ADMIN
   MANAGER
========================================================= */

router.delete(
    "/:id/attendants/:attendantId",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    removeShiftAttendant
);


/* =========================================================
   EXPORT ROUTER
========================================================= */

module.exports = router;