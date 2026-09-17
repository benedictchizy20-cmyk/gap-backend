/* =========================================================
   FUELGAP - EXPRESS APPLICATION
========================================================= */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const meterReadingRoutes = require("./routes/meterReadingRoutes");

require("./config/supabase");


/* =========================================================
   ROUTES
========================================================= */

const authRoutes =
    require("./routes/authRoutes");

const stationRoutes =
    require("./routes/stationRoutes");

const pumpRoutes =
    require("./routes/pumpRoutes");

const nozzleRoutes =
    require("./routes/nozzleRoutes");

const staffRoutes =
    require("./routes/staffRoutes");

const shiftRoutes =
    require("./routes/shiftRoutes");
    const salesRoutes = require("./routes/salesRoutes");
    const paymentRoutes = require("./routes/paymentRoutes");
    const gapRoutes = require("./routes/gapRoutes");
    const reportRoutes = require("./routes/reportRoutes");
    const alertRoutes = require("./routes/alertRoutes");
    const organizationRoutes = require("./routes/organizationRoutes");
    const platformRoutes = require("./routes/platformRoutes");



/* =========================================================
   APP
========================================================= */

const app = express();


/* =========================================================
   SECURITY
========================================================= */

app.use(
    helmet()
);




/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://fuelg.netlify.app"
];

app.use(
    cors({

        origin: function (origin, callback) {

            /*
             * Allow requests that do not contain
             * an Origin header.
             *
             * Example:
             * Postman / server-to-server requests
             */

            if (!origin) {
                return callback(null, true);
            }

            /*
             * Allow approved frontend origins
             */

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            /*
             * Reject unknown origins
             */

            return callback(
                new Error(
                    "Not allowed by CORS: " + origin
                )
            );

        },

        /*
         * IMPORTANT
         * Required for FuelGap HttpOnly
         * authentication cookies.
         */

        credentials: true

    })
);

/* =========================================================
   COOKIE PARSER
========================================================= */

app.use(
    cookieParser()
);


/* =========================================================
   BODY PARSERS
========================================================= */

app.use(
    express.json({
        limit: "10mb"
    })
);


app.use(
    express.urlencoded({
        extended: true
    })
);


/* =========================================================
   RATE LIMIT
========================================================= */

/* =========================================================
   RATE LIMIT
========================================================= */

/*
 * Development-friendly API limiter.
 *
 * FuelGap dashboard loads several endpoints at startup:
 * auth/me
 * health
 * stations
 * pumps
 * staff
 * shifts
 * sales
 * gaps
 * alerts
 *
 * A higher limit prevents normal local development
 * and dashboard refreshes from being blocked.
 */

const limiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: 2000,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        message:
            "Too many requests, please try again later."
    }

});


app.use(
    "/api",
    limiter
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    (req, res) => {

        res.status(200).json({

            success: true,

            message:
                "FuelGap API is running",

            timestamp:
                new Date().toISOString()

        });

    }
);


/* =========================================================
   AUTH
========================================================= */

app.use(
    "/api/auth",
    authRoutes
);


/* =========================================================
   STATIONS
========================================================= */

app.use(
    "/api/stations",
    stationRoutes
);


/* =========================================================
   PUMPS
========================================================= */

app.use(
    "/api/pumps",
    pumpRoutes
);


/* =========================================================
   NOZZLES
========================================================= */

app.use(
    "/api/nozzles",
    nozzleRoutes
);


/* =========================================================
   STAFF
========================================================= */

app.use(
    "/api/staff",
    staffRoutes
);


/* =========================================================
   SHIFTS
========================================================= */

app.use(
    "/api/shifts",
    shiftRoutes
);

app.use(
    "/api/meter-readings",
    meterReadingRoutes
);

app.use(
    "/api/sales",
    salesRoutes
);

app.use("/api/payments", paymentRoutes);
app.use("/api/gaps", gapRoutes);

app.use("/api/reports", reportRoutes);
app.use("/api/alerts", alertRoutes);
app.use(
    "/api/organization",
    organizationRoutes
);
app.use(
    "/api/platform",
    platformRoutes
);



/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "API route not found",

            method:
                req.method,

            path:
                req.originalUrl

        });

    }
);


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
    (err, req, res, next) => {

        console.error(
            "GLOBAL ERROR:",
            err
        );

        res.status(500).json({

            success: false,

            message:
                "Internal server error"

        });

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = app;