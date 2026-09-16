const express = require("express");

const {
    createStaff,
    createStaffLogin,
    getStaff,
    getStaffById,
    updateStaff,
    deleteStaff
} = require("../controllers/staffController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();


/* =========================================================
   CREATE STAFF + LOGIN ACCOUNT
========================================================= */

router.post(
    "/",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    createStaff
);


/* =========================================================
   CREATE LOGIN FOR EXISTING STAFF
========================================================= */

router.post(
    "/:id/create-login",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    createStaffLogin
);


/* =========================================================
   GET ALL STAFF
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
    getStaff
);


/* =========================================================
   GET STAFF BY ID
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
    getStaffById
);


/* =========================================================
   UPDATE STAFF
========================================================= */

router.patch(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    updateStaff
);


/* =========================================================
   DEACTIVATE STAFF
========================================================= */

router.delete(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin"
    ),
    deleteStaff
);


module.exports = router;