const express = require("express");

const {
    createNozzle,
    getNozzles,
    getNozzleById,
    updateNozzle,
    deleteNozzle
} = require("../controllers/nozzleController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();


/*
==================================================
CREATE NOZZLE
POST /api/nozzles
==================================================
*/
router.post(
    "/",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    createNozzle
);


/*
==================================================
GET ALL NOZZLES
GET /api/nozzles
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
    getNozzles
);


/*
==================================================
GET NOZZLE BY ID
GET /api/nozzles/:id
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
    getNozzleById
);


/*
==================================================
UPDATE NOZZLE
PATCH /api/nozzles/:id
==================================================
*/
router.patch(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    updateNozzle
);


/*
==================================================
DEACTIVATE NOZZLE
DELETE /api/nozzles/:id
==================================================
*/
router.delete(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin"
    ),
    deleteNozzle
);


module.exports = router;