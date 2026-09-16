const express = require("express");

const {
    createPump,
    getPumps,
    getPumpById,
    updatePump,
    deletePump
} = require("../controllers/pumpController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();


/*
==================================================
CREATE PUMP
OWNER / ADMIN / MANAGER
==================================================
*/
router.post(
    "/",
    requireAuth,
    requireRole("owner", "admin", "manager"),
    createPump
);


/*
==================================================
GET ALL PUMPS
ALL AUTHENTICATED USERS
==================================================
*/
router.get(
    "/",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager",
        "attendant"
    ),
    getPumps
);


/*
==================================================
GET SINGLE PUMP
ALL AUTHENTICATED USERS
==================================================
*/
router.get(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager",
        "attendant"
    ),
    getPumpById
);


/*
==================================================
UPDATE PUMP
OWNER / ADMIN / MANAGER
==================================================
*/
router.patch(
    "/:id",
    requireAuth,
    requireRole("owner", "admin", "manager"),
    updatePump
);


/*
==================================================
DEACTIVATE PUMP
OWNER / ADMIN
==================================================
*/
router.delete(
    "/:id",
    requireAuth,
    requireRole("owner", "admin"),
    deletePump
);


module.exports = router;