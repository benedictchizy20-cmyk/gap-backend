const express = require("express");

const router = express.Router();

const {
    createGap,
    getGaps,
    getGapById,
    deleteGap
} = require("../controllers/gapController");

const {
    requireAuth
} = require("../middleware/authMiddleware");


/* =========================================================
   GAP ROUTES
========================================================= */

router.post(
    "/",
    requireAuth,
    createGap
);


router.get(
    "/",
    requireAuth,
    getGaps
);


router.get(
    "/:id",
    requireAuth,
    getGapById
);


router.delete(
    "/:id",
    requireAuth,
    deleteGap
);


module.exports = router;