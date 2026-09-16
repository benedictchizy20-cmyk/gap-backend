const express = require("express");

const {
    createStation,
    getStations,
    getStationById,
    updateStation,
    deleteStation
} = require("../controllers/stationController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const router = express.Router();


/* =========================================================
   STATION ROUTES
========================================================= */


/*
   CREATE STATION

   Only:
   - owner
   - admin
   - manager
*/
router.post(
    "/",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    createStation
);


/*
   GET ALL STATIONS
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
    getStations
);


/*
   GET ONE STATION
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
    getStationById
);


/*
   UPDATE STATION

   Only:
   - owner
   - admin
   - manager
*/
router.patch(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin",
        "manager"
    ),
    updateStation
);


/*
   DELETE STATION

   Only:
   - owner
   - admin
*/
router.delete(
    "/:id",
    requireAuth,
    requireRole(
        "owner",
        "admin"
    ),
    deleteStation
);


module.exports = router;