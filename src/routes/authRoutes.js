const express = require("express");

const {
    register,
    login,
    getCurrentUser,
    logout
} = require("../controllers/authController");

const {
    requireAuth
} = require("../middleware/authMiddleware");

const router = express.Router();


/* =========================================================
   PUBLIC AUTH ROUTES
========================================================= */

/*
POST /api/auth/register
*/
router.post(
    "/register",
    register
);


/*
POST /api/auth/login
*/
router.post(
    "/login",
    login
);


/* =========================================================
   PROTECTED AUTH ROUTES
========================================================= */

/*
GET /api/auth/me
*/
router.get(
    "/me",
    requireAuth,
    getCurrentUser
);


/*
POST /api/auth/logout
*/
router.post(
    "/logout",
    requireAuth,
    logout
);


module.exports = router;