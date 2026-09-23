/* =========================================================
   FUELGAP - GAP CONTROLLER
   =========================================================
   PURPOSE:
   - Calculate meter gaps using OPENING + CLOSING readings
   - NO SALES CALCULATION
   - Automatically create alerts for calculated gaps
   - Support historical readings
   - Support OPEN and CLOSED shifts
   - Prevent duplicate gap records for the same pair
   - Get gaps
   - Get single gap
   - Manually process a gap

   CORE FORMULA:

       CLOSING METER
       -
       OPENING METER
       =
       METER GAP

   IMPORTANT:
   SALES ARE NOT USED HERE.
   ========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");

const {
    createSystemGapAlert
} = require("./alertController");


/* =========================================================
   HELPERS
========================================================= */

function cleanString(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value).trim();
}


function normalizeRole(role) {

    return cleanString(role)
        .toLowerCase();
}


function isManagementRole(role) {

    return [
        "owner",
        "admin",
        "super_admin",
        "manager"
    ].includes(
        normalizeRole(role)
    );
}


function isRestrictedRole(role) {

    return [
        "staff",
        "attendant"
    ].includes(
        normalizeRole(role)
    );
}


/* =========================================================
   GET APPLICATION USER
========================================================= */

async function getApplicationUser(
    authUserId
) {

    if (!authUserId) {
        return null;
    }

    const {
        data,
        error
    } = await supabaseAdmin
        .from("users")
        .select(`
            id,
            auth_user_id,
            organization_id,
            full_name,
            email,
            phone,
            role,
            is_active,
            station_id
        `)
        .eq(
            "auth_user_id",
            authUserId
        )
        .maybeSingle();


    if (error) {

        console.error(
            "GAP GET APPLICATION USER ERROR:",
            error
        );

        throw error;
    }


    return data || null;
}


/* =========================================================
   VERIFY STATION ACCESS
========================================================= */

async function verifyStationAccess(
    organizationId,
    stationId
) {

    const {
        data: station,
        error
    } = await supabaseAdmin
        .from("stations")
        .select(`
            id,
            organization_id,
            name,
            is_active
        `)
        .eq(
            "id",
            stationId
        )
        .eq(
            "organization_id",
            organizationId
        )
        .maybeSingle();


    if (error) {

        console.error(
            "GAP VERIFY STATION ERROR:",
            error
        );

        throw error;
    }


    if (!station) {

        throw new Error(
            "Station was not found in this organization."
        );
    }


    return station;
}


/* =========================================================
   FIND MATCHING OPENING READING FOR CLOSING
========================================================= */

async function findOpeningForClosing({
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    closingCapturedAt
}) {

    const {
        data: opening,
        error
    } = await supabaseAdmin
        .from("meter_readings")
        .select(`
            id,
            station_id,
            pump_id,
            nozzle_id,
            reading_type,
            reading,
            shift_id,
            captured_at,
            created_at,
            recorded_by
        `)
        .eq(
            "station_id",
            stationId
        )
        .eq(
            "pump_id",
            pumpId
        )
        .eq(
            "nozzle_id",
            nozzleId
        )
        .eq(
            "shift_id",
            shiftId
        )
        .eq(
            "reading_type",
            "opening"
        )
        .lte(
            "captured_at",
            closingCapturedAt
        )
        .order(
            "captured_at",
            {
                ascending: false
            }
        )
        .limit(1)
        .maybeSingle();


    if (error) {

        console.error(
            "GAP FIND OPENING ERROR:",
            error
        );

        throw error;
    }


    return opening || null;
}


/* =========================================================
   FIND MATCHING CLOSING READING FOR OPENING
========================================================= */

async function findClosingForOpening({
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    openingCapturedAt
}) {

    const {
        data: closing,
        error
    } = await supabaseAdmin
        .from("meter_readings")
        .select(`
            id,
            station_id,
            pump_id,
            nozzle_id,
            reading_type,
            reading,
            shift_id,
            captured_at,
            created_at,
            recorded_by
        `)
        .eq(
            "station_id",
            stationId
        )
        .eq(
            "pump_id",
            pumpId
        )
        .eq(
            "nozzle_id",
            nozzleId
        )
        .eq(
            "shift_id",
            shiftId
        )
        .eq(
            "reading_type",
            "closing"
        )
        .gte(
            "captured_at",
            openingCapturedAt
        )
        .order(
            "captured_at",
            {
                ascending: true
            }
        )
        .limit(1)
        .maybeSingle();


    if (error) {

        console.error(
            "GAP FIND CLOSING ERROR:",
            error
        );

        throw error;
    }


    return closing || null;
}


/* =========================================================
   FIND EXISTING GAP
========================================================= */

async function findExistingGap({
    organizationId,
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    openingReading,
    closingReading
}) {

    /*
     * We compare:
     *
     * organization
     * station
     * pump
     * nozzle
     * shift
     * opening meter
     * closing meter
     *
     * This prevents the same opening/closing pair
     * from creating duplicate gap records.
     */

    const {
        data: existingGaps,
        error
    } = await supabaseAdmin
        .from("gaps")
        .select(`
            *
        `)
        .eq(
            "organization_id",
            organizationId
        )
        .eq(
            "station_id",
            stationId
        )
        .eq(
            "pump_id",
            pumpId
        )
        .eq(
            "nozzle_id",
            nozzleId
        )
        .eq(
            "shift_id",
            shiftId
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        )
        .limit(50);


    if (error) {

        console.error(
            "FUELGAP - FIND EXISTING GAP ERROR:",
            error
        );

        throw error;
    }


    const records =
        existingGaps || [];


    return records.find(
        gap => {

            const existingOpening =
                Number(
                    gap.opening_reading
                );

            const existingClosing =
                Number(
                    gap.closing_reading
                );

            return (
                Number.isFinite(
                    existingOpening
                ) &&
                Number.isFinite(
                    existingClosing
                ) &&
                existingOpening ===
                    Number(openingReading) &&
                existingClosing ===
                    Number(closingReading)
            );
        }
    ) || null;
}


/* =========================================================
   DETERMINE GAP STATUS
========================================================= */

function determineGapStatus(
    meterGap
) {

    /*
     * A negative movement means the closing meter
     * is lower than the opening meter.
     *
     * This is treated as a variance.
     */

    if (meterGap < 0) {

        return "variance";
    }


    /*
     * Zero movement is normal.
     */

    if (meterGap === 0) {

        return "normal";
    }


    /*
     * Positive meter movement is also stored
     * as normal because it represents normal
     * cumulative meter progression.
     */

    return "normal";
}


/* =========================================================
   DETERMINE ALERT SEVERITY
========================================================= */

function determineAlertSeverity(
    meterGap
) {

    /*
     * Negative meter movement is abnormal because
     * a cumulative meter should normally not go backwards.
     */

    if (meterGap < 0) {

        return "critical";
    }


    /*
     * Positive movement is still recorded as an alert
     * because every calculated gap must appear
     * on the Alerts page.
     */

    if (meterGap > 0) {

        return "warning";
    }


    /*
     * Zero movement is informational.
     */

    return "info";
}


/* =========================================================
   BUILD ALERT MESSAGE
========================================================= */

function buildGapAlert({
    stationName,
    meterGap,
    openingReading,
    closingReading
}) {

    const formattedGap =
        Math.abs(
            Number(meterGap)
        ).toFixed(2);


    /* =====================================================
       NEGATIVE MOVEMENT
    ===================================================== */

    if (meterGap < 0) {

        return {

            title:
                "Meter Reading Variance Detected",

            message:
                `A negative meter movement was detected at ${stationName}. Opening reading: ${Number(openingReading).toFixed(2)} L. Closing reading: ${Number(closingReading).toFixed(2)} L. Calculated variance: -${formattedGap} L. Please review the meter readings.`

        };
    }


    /* =====================================================
       ZERO MOVEMENT
    ===================================================== */

    if (meterGap === 0) {

        return {

            title:
                "Meter Reading Gap Recorded",

            message:
                `A meter gap of 0.00 L was recorded at ${stationName}. Opening reading: ${Number(openingReading).toFixed(2)} L. Closing reading: ${Number(closingReading).toFixed(2)} L.`

        };
    }


    /* =====================================================
       POSITIVE MOVEMENT
    ===================================================== */

    return {

        title:
            "Meter Gap Recorded",

        message:
            `A meter movement of ${formattedGap} L was recorded at ${stationName}. Opening reading: ${Number(openingReading).toFixed(2)} L. Closing reading: ${Number(closingReading).toFixed(2)} L. This calculation is based only on meter readings and does not use sales.`

    };
}


/* =========================================================
   PROCESS METER GAP
========================================================= */

async function processMeterGap({
    organizationId,
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    readingType,
    reading
}) {

    console.log(
        "=============================================="
    );

    console.log(
        "FUELGAP - PROCESS METER GAP"
    );

    console.log(
        "=============================================="
    );


    /* =====================================================
       VALIDATE REQUIRED IDS
    ===================================================== */

    if (!organizationId) {

        throw new Error(
            "Organization ID is required."
        );
    }


    if (!stationId) {

        throw new Error(
            "Station ID is required."
        );
    }


    if (!pumpId) {

        throw new Error(
            "Pump ID is required."
        );
    }


    if (!nozzleId) {

        throw new Error(
            "Nozzle ID is required."
        );
    }


    if (!shiftId) {

        throw new Error(
            "Shift ID is required."
        );
    }


    if (
        reading === undefined ||
        reading === null
    ) {

        throw new Error(
            "Meter reading is required."
        );
    }


    /* =====================================================
       NORMALIZE READING OBJECT
    ===================================================== */

    /*
     * Normally the meter controller passes an object:
     *
     * {
     *     id,
     *     reading,
     *     captured_at,
     *     ...
     * }
     *
     * We also allow a raw number/string so that the
     * function remains backwards compatible.
     */

    let normalizedReading =
        reading;


    if (
        typeof reading !== "object"
    ) {

        normalizedReading = {

            reading:
                reading,

            captured_at:
                new Date().toISOString()

        };
    }


    /* =====================================================
       NORMALIZE READING TYPE
    ===================================================== */

    const normalizedReadingType =
        normalizeRole(
            readingType
        );


    /*
     * Only opening and closing readings
     * participate in automatic gap calculation.
     */

    if (
        ![
            "opening",
            "closing"
        ].includes(
            normalizedReadingType
        )
    ) {

        return {

            success: true,

            processed: false,

            reason:
                "Only opening and closing readings create meter gaps."

        };
    }


    /* =====================================================
       VALIDATE CURRENT READING VALUE
    ===================================================== */

    const currentReadingValue =
        Number(
            normalizedReading.reading
        );


    if (
        !Number.isFinite(
            currentReadingValue
        )
    ) {

        throw new Error(
            "Meter reading must be a valid number."
        );
    }


    /* =====================================================
       VALIDATE CAPTURED TIME
    ===================================================== */

    const capturedAt =
        normalizedReading.captured_at;


    if (!capturedAt) {

        throw new Error(
            "Meter reading captured_at is required for gap calculation."
        );
    }


    const capturedTimestamp =
        new Date(
            capturedAt
        ).getTime();


    if (
        !Number.isFinite(
            capturedTimestamp
        )
    ) {

        throw new Error(
            "Meter reading captured_at is not a valid date."
        );
    }


    /* =====================================================
       VERIFY STATION
    ===================================================== */

    const station =
        await verifyStationAccess(
            organizationId,
            stationId
        );


    console.log(
        "FUELGAP - STATION VERIFIED:",
        station.name
    );


    /* =====================================================
       FIND MATCHING OPENING / CLOSING
    ===================================================== */

    let openingReading =
        null;

    let closingReading =
        null;


    /* =====================================================
       CURRENT READING IS CLOSING
    ===================================================== */

    if (
        normalizedReadingType ===
        "closing"
    ) {

        closingReading =
            normalizedReading;


        console.log(
            "FUELGAP - FINDING OPENING READING"
        );


        openingReading =
            await findOpeningForClosing({

                stationId,

                pumpId,

                nozzleId,

                shiftId,

                closingCapturedAt:
                    capturedAt

            });


        if (openingReading) {

            console.log(
                "FUELGAP - MATCHING OPENING:",
                openingReading.id
            );
        }

    }


    /* =====================================================
       CURRENT READING IS OPENING
    ===================================================== */

    else {

        openingReading =
            normalizedReading;


        console.log(
            "FUELGAP - FINDING CLOSING READING"
        );


        closingReading =
            await findClosingForOpening({

                stationId,

                pumpId,

                nozzleId,

                shiftId,

                openingCapturedAt:
                    capturedAt

            });


        if (closingReading) {

            console.log(
                "FUELGAP - MATCHING CLOSING:",
                closingReading.id
            );
        }
    }


    /* =====================================================
       PAIR NOT READY
    ===================================================== */

    if (
        !openingReading ||
        !closingReading
    ) {

        console.log(
            "FUELGAP - GAP PAIR NOT COMPLETE"
        );


        return {

            success: true,

            processed: false,

            reason:
                !openingReading
                    ? "Waiting for matching opening reading."
                    : "Waiting for matching closing reading.",

            opening:
                openingReading,

            closing:
                closingReading

        };
    }


    /* =====================================================
       VALIDATE OPENING/CLOSING TIMESTAMPS
    ===================================================== */

    const openingTime =
        new Date(
            openingReading.captured_at
        ).getTime();


    const closingTime =
        new Date(
            closingReading.captured_at
        ).getTime();


    if (
        !Number.isFinite(
            openingTime
        ) ||
        !Number.isFinite(
            closingTime
        )
    ) {

        throw new Error(
            "Opening or closing reading has an invalid captured_at date."
        );
    }


    if (
        closingTime <
        openingTime
    ) {

        throw new Error(
            "Closing reading cannot occur before the opening reading."
        );
    }


    /* =====================================================
       CALCULATE METER VALUES
    ===================================================== */

    const openingValue =
        Number(
            openingReading.reading
        );


    const closingValue =
        Number(
            closingReading.reading
        );


    if (
        !Number.isFinite(
            openingValue
        ) ||
        !Number.isFinite(
            closingValue
        )
    ) {

        throw new Error(
            "Opening or closing meter reading is not a valid number."
        );
    }


    /* =====================================================
       CORE GAP FORMULA
    =====================================================

       CLOSING - OPENING = METER GAP
    ===================================================== */

    const meterGap =
        Number(
            (
                closingValue -
                openingValue
            ).toFixed(2)
        );


    const gapStatus =
        determineGapStatus(
            meterGap
        );


    console.log(
        "FUELGAP - METER GAP CALCULATION"
    );

    console.log(
        "OPENING:",
        openingValue
    );

    console.log(
        "CLOSING:",
        closingValue
    );

    console.log(
        "METER GAP:",
        meterGap
    );

    console.log(
        "STATUS:",
        gapStatus
    );


    /* =====================================================
       CHECK EXISTING GAP
    ===================================================== */

    const existingGap =
        await findExistingGap({

            organizationId,

            stationId,

            pumpId,

            nozzleId,

            shiftId,

            openingReading:
                openingValue,

            closingReading:
                closingValue

        });


    if (existingGap) {

        console.log(
            "FUELGAP - GAP ALREADY EXISTS:",
            existingGap.id
        );


        return {

            success: true,

            processed: true,

            duplicate: true,

            gap:
                existingGap

        };
    }


    /* =====================================================
       SAVE GAP
    =====================================================

       IMPORTANT:

       opening_reading and closing_reading are saved
       because duplicate detection uses them.

       expected_sales and actual_sales remain 0
       for compatibility with the existing gaps table.

       SALES ARE NOT USED.
    ===================================================== */

    const {
        data: createdGap,
        error: gapError
    } = await supabaseAdmin
        .from("gaps")
        .insert({

            organization_id:
                organizationId,

            station_id:
                stationId,

            pump_id:
                pumpId,

            nozzle_id:
                nozzleId,

            shift_id:
                shiftId,

            opening_reading:
                openingValue,

            closing_reading:
                closingValue,

            expected_sales:
                0,

            actual_sales:
                0,

            gap_amount:
                meterGap,

            status:
                gapStatus

        })
        .select("*")
        .single();


    if (gapError) {

        console.error(
            "FUELGAP - CREATE GAP ERROR:",
            gapError
        );

        throw new Error(
            `Unable to create meter gap: ${gapError.message}`
        );
    }


    console.log(
        "FUELGAP - GAP CREATED:",
        createdGap.id
    );


    /* =====================================================
       CREATE AUTOMATIC ALERT
    ===================================================== */

    const severity =
        determineAlertSeverity(
            meterGap
        );


    const alertContent =
        buildGapAlert({

            stationName:
                station.name,

            meterGap,

            openingReading:
                openingValue,

            closingReading:
                closingValue

        });


    let createdAlert =
        null;


    try {

        console.log(
            "FUELGAP - CREATING AUTOMATIC GAP ALERT"
        );


        createdAlert =
            await createSystemGapAlert({

                organizationId,

                stationId,

                pumpId,

                nozzleId,

                shiftId,

                gapId:
                    createdGap.id,

                severity,

                title:
                    alertContent.title,

                message:
                    alertContent.message

            });


        console.log(
            "FUELGAP - GAP ALERT CREATED:",
            createdAlert?.id
        );

    } catch (alertError) {

        /*
         * The gap has already been saved.
         *
         * We deliberately do not delete the gap if
         * alert creation fails.
         *
         * This protects the meter-gap record.
         */

        console.error(
            "FUELGAP - AUTOMATIC ALERT CREATION ERROR:",
            alertError
        );
    }


    /* =====================================================
       RETURN RESULT
    ===================================================== */

    return {

        success: true,

        processed: true,

        duplicate: false,

        gap:
            createdGap,

        alert:
            createdAlert,

        openingReading,

        closingReading,

        openingValue,

        closingValue,

        meterGap,

        status:
            gapStatus

    };
}


/* =========================================================
   GET GAPS
   GET /api/gaps
========================================================= */

async function getGaps(
    req,
    res
) {

    try {

        console.log(
            "FUELGAP - GET GAPS"
        );


        /* =====================================================
           AUTHENTICATION
        ===================================================== */

        if (
            !req.user ||
            !req.user.id
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        /* =====================================================
           APPLICATION USER
        ===================================================== */

        const appUser =
            await getApplicationUser(
                req.user.id
            );


        if (!appUser) {

            return res.status(404).json({

                success: false,

                message:
                    "Application user profile not found"

            });
        }


        /* =====================================================
           ACTIVE ACCOUNT
        ===================================================== */

        if (
            appUser.is_active === false
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Your account is inactive"

            });
        }


        console.log(
            "AUTHENTICATED USER:",
            appUser.id
        );

        console.log(
            "ORGANIZATION ID:",
            appUser.organization_id
        );

        console.log(
            "USER ROLE:",
            appUser.role
        );


        /* =====================================================
           BASE QUERY
        ===================================================== */

        let query =
            supabaseAdmin
                .from("gaps")
                .select("*")
                .eq(
                    "organization_id",
                    appUser.organization_id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        /* =====================================================
           STATION RESTRICTION
        ===================================================== */

        const role =
            normalizeRole(
                appUser.role
            );


        if (
            isRestrictedRole(role) &&
            appUser.station_id
        ) {

            query =
                query.eq(
                    "station_id",
                    appUser.station_id
                );
        }


        /* =====================================================
           EXECUTE QUERY
        ===================================================== */

        const {
            data: gaps,
            error
        } = await query;


        if (error) {

            console.error(
                "GET GAPS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load gaps",

                error:
                    error.message

            });
        }


        const records =
            gaps || [];


        console.log(
            "GAPS FOUND:",
            records.length
        );


        /* =====================================================
           SUMMARY
        ===================================================== */

        const normalCount =
            records.filter(
                gap =>
                    gap.status ===
                    "normal"
            ).length;


        const varianceCount =
            records.filter(
                gap =>
                    gap.status ===
                    "variance"
            ).length;


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.status(200).json({

            success: true,

            message:
                "Gaps loaded successfully",

            data:
                records,

            summary: {

                total:
                    records.length,

                normal:
                    normalCount,

                variance:
                    varianceCount

            }

        });


    } catch (error) {

        console.error(
            "GET GAPS EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to load gaps",

            error:
                error.message

        });
    }
}


/* =========================================================
   GET SINGLE GAP
   GET /api/gaps/:id
========================================================= */

async function getGapById(
    req,
    res
) {

    try {

        console.log(
            "FUELGAP - GET GAP BY ID"
        );


        /* =====================================================
           GAP ID
        ===================================================== */

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({

                success: false,

                message:
                    "Gap ID is required"

            });
        }


        /* =====================================================
           AUTHENTICATION
        ===================================================== */

        if (
            !req.user ||
            !req.user.id
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        /* =====================================================
           APPLICATION USER
        ===================================================== */

        const appUser =
            await getApplicationUser(
                req.user.id
            );


        if (!appUser) {

            return res.status(404).json({

                success: false,

                message:
                    "Application user profile not found"

            });
        }


        /* =====================================================
           ACTIVE ACCOUNT
        ===================================================== */

        if (
            appUser.is_active === false
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Your account is inactive"

            });
        }


        /* =====================================================
           FIND GAP
           ORGANIZATION ISOLATION
        ===================================================== */

        const {
            data: gap,
            error
        } = await supabaseAdmin
            .from("gaps")
            .select("*")
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                appUser.organization_id
            )
            .maybeSingle();


        if (error) {

            console.error(
                "GET GAP BY ID ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load gap",

                error:
                    error.message

            });
        }


        /* =====================================================
           GAP NOT FOUND
        ===================================================== */

        if (!gap) {

            return res.status(404).json({

                success: false,

                message:
                    "Gap not found"

            });
        }


        /* =====================================================
           STATION RESTRICTION
        ===================================================== */

        const role =
            normalizeRole(
                appUser.role
            );


        if (
            isRestrictedRole(role) &&
            appUser.station_id &&
            String(
                gap.station_id
            ) !==
            String(
                appUser.station_id
            )
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You do not have access to this gap"

            });
        }


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.status(200).json({

            success: true,

            data:
                gap

        });


    } catch (error) {

        console.error(
            "GET GAP BY ID EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to load gap",

            error:
                error.message

        });
    }
}


/* =========================================================
   MANUAL GAP PROCESSING
   POST /api/gaps
========================================================= */

async function createGap(
    req,
    res
) {

    try {

        console.log(
            "FUELGAP - MANUAL GAP PROCESSING"
        );


        /* =====================================================
           AUTHENTICATION
        ===================================================== */

        if (
            !req.user ||
            !req.user.id
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        /* =====================================================
           APPLICATION USER
        ===================================================== */

        const appUser =
            await getApplicationUser(
                req.user.id
            );


        if (!appUser) {

            return res.status(404).json({

                success: false,

                message:
                    "Application user profile not found"

            });
        }


        /* =====================================================
           ACTIVE ACCOUNT
        ===================================================== */

        if (
            appUser.is_active === false
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Your account is inactive"

            });
        }


        /* =====================================================
           ROLE CHECK
        ===================================================== */

        const role =
            normalizeRole(
                appUser.role
            );


        if (
            !isManagementRole(role)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Only management users can manually process gaps"

            });
        }


        /* =====================================================
           REQUEST BODY
        ===================================================== */

        const {

            station_id,

            pump_id,

            nozzle_id,

            shift_id

        } = req.body || {};


        if (
            !station_id ||
            !pump_id ||
            !nozzle_id ||
            !shift_id
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Station, pump, nozzle and shift are required"

            });
        }


        /* =====================================================
           GET LATEST CLOSING READING
        ===================================================== */

        const latestClosingReading =
            await getLatestClosingReading({

                stationId:
                    station_id,

                pumpId:
                    pump_id,

                nozzleId:
                    nozzle_id,

                shiftId:
                    shift_id

            });


        /* =====================================================
           PROCESS GAP
        ===================================================== */

        const result =
            await processMeterGap({

                organizationId:
                    appUser.organization_id,

                stationId:
                    station_id,

                pumpId:
                    pump_id,

                nozzleId:
                    nozzle_id,

                shiftId:
                    shift_id,

                readingType:
                    "closing",

                reading:
                    latestClosingReading

            });


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.status(
            result.processed
                ? 201
                : 200
        ).json({

            success: true,

            message:
                result.processed
                    ? "Meter gap processed successfully"
                    : result.reason,

            data:
                result

        });


    } catch (error) {

        console.error(
            "CREATE GAP EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to process meter gap",

            error:
                error.message

        });
    }
}


/* =========================================================
   GET LATEST CLOSING READING
========================================================= */

async function getLatestClosingReading({
    stationId,
    pumpId,
    nozzleId,
    shiftId
}) {

    const {
        data,
        error
    } = await supabaseAdmin
        .from("meter_readings")
        .select(`
            id,
            station_id,
            pump_id,
            nozzle_id,
            reading_type,
            reading,
            shift_id,
            captured_at,
            created_at,
            recorded_by
        `)
        .eq(
            "station_id",
            stationId
        )
        .eq(
            "pump_id",
            pumpId
        )
        .eq(
            "nozzle_id",
            nozzleId
        )
        .eq(
            "shift_id",
            shiftId
        )
        .eq(
            "reading_type",
            "closing"
        )
        .order(
            "captured_at",
            {
                ascending: false
            }
        )
        .limit(1)
        .maybeSingle();


    if (error) {

        console.error(
            "FUELGAP - GET LATEST CLOSING ERROR:",
            error
        );

        throw error;
    }


    if (!data) {

        throw new Error(
            "No closing meter reading was found for this shift."
        );
    }


    return data;
}


/* =========================================================
   DELETE GAP
   DELETE /api/gaps/:id
========================================================= */

async function deleteGap(
    req,
    res
) {

    try {

        console.log(
            "FUELGAP - DELETE GAP"
        );


        /* =====================================================
           AUTHENTICATION
        ===================================================== */

        if (
            !req.user ||
            !req.user.id
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        /* =====================================================
           GAP ID
        ===================================================== */

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({

                success: false,

                message:
                    "Gap ID is required"

            });
        }


        /* =====================================================
           GET APPLICATION USER
        ===================================================== */

        const appUser =
            await getApplicationUser(
                req.user.id
            );


        if (!appUser) {

            return res.status(404).json({

                success: false,

                message:
                    "Application user profile not found"

            });
        }


        /* =====================================================
           ACTIVE ACCOUNT CHECK
        ===================================================== */

        if (
            appUser.is_active === false
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Your account is inactive"

            });
        }


        /* =====================================================
           ROLE CHECK
        ===================================================== */

        const role =
            normalizeRole(
                appUser.role
            );


        if (
            !isManagementRole(role)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Only management users can delete gaps"

            });
        }


        /* =====================================================
           FIND GAP
           ORGANIZATION ISOLATION
        ===================================================== */

        const {
            data: gap,
            error: findError
        } = await supabaseAdmin
            .from("gaps")
            .select(`
                id,
                organization_id,
                station_id,
                pump_id,
                nozzle_id,
                shift_id,
                opening_reading,
                closing_reading,
                gap_amount,
                status
            `)
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                appUser.organization_id
            )
            .maybeSingle();


        if (findError) {

            console.error(
                "FUELGAP - FIND GAP FOR DELETE ERROR:",
                findError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to find gap",

                error:
                    findError.message

            });
        }


        if (!gap) {

            return res.status(404).json({

                success: false,

                message:
                    "Gap not found"

            });
        }


        /* =====================================================
           DELETE GAP
        ===================================================== */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("gaps")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                appUser.organization_id
            );


        if (deleteError) {

            console.error(
                "FUELGAP - DELETE GAP ERROR:",
                deleteError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete gap",

                error:
                    deleteError.message

            });
        }


        /* =====================================================
           SUCCESS
        ===================================================== */

        console.log(
            "FUELGAP - GAP DELETED:",
            id
        );


        return res.status(200).json({

            success: true,

            message:
                "Gap deleted successfully",

            data: {

                id:
                    gap.id

            }

        });


    } catch (error) {

        console.error(
            "DELETE GAP EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to delete gap",

            error:
                error.message

        });
    }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    getGaps,

    getGapById,

    createGap,

    processMeterGap,

    deleteGap

};