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
        throw error;
    }


    return closing || null;
}


/* =========================================================
   FIND EXISTING GAP
========================================================= */

async function findExistingGap({
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    openingReading,
    closingReading
}) {

    /*
     * We use the reading values + same station/pump/nozzle/shift
     * because older FuelGap databases may not yet contain
     * opening_reading_id / closing_reading_id columns.
     */

    const {
        data: existingGaps,
        error
    } = await supabaseAdmin
        .from("gaps")
        .select("*")
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
        throw error;
    }


    const records =
        existingGaps || [];


    return records.find(
        gap =>
            Number(
                gap.opening_reading
            ) === Number(
                openingReading
            ) &&
            Number(
                gap.closing_reading
            ) === Number(
                closingReading
            )
    ) || null;
}


/* =========================================================
   DETERMINE GAP STATUS
========================================================= */

function determineGapStatus(
    meterGap
) {

    if (meterGap < 0) {
        return "variance";
    }

    if (meterGap === 0) {
        return "normal";
    }

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
     * because the user requested every calculated gap
     * to be sent to Alerts.
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


    if (meterGap < 0) {

        return {

            title:
                "Meter Reading Variance Detected",

            message:
                `A negative meter movement was detected at ${stationName}. Opening reading: ${Number(openingReading).toFixed(2)} L. Closing reading: ${Number(closingReading).toFixed(2)} L. Calculated variance: -${formattedGap} L. Please review the meter readings.`

        };
    }


    if (meterGap === 0) {

        return {

            title:
                "Meter Reading Gap Recorded",

            message:
                `A meter gap of 0.00 L was recorded at ${stationName}. Opening reading: ${Number(openingReading).toFixed(2)} L. Closing reading: ${Number(closingReading).toFixed(2)} L.`

        };
    }


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


    if (!reading) {
        throw new Error(
            "Meter reading is required."
        );
    }


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
       VERIFY STATION
    ===================================================== */

    const station =
        await verifyStationAccess(
            organizationId,
            stationId
        );


    /* =====================================================
       FIND PAIR
    ===================================================== */

    let openingReading = null;

    let closingReading = null;


    if (
        normalizedReadingType ===
        "closing"
    ) {

        closingReading =
            reading;


        openingReading =
            await findOpeningForClosing({

                stationId,

                pumpId,

                nozzleId,

                shiftId,

                closingCapturedAt:
                    reading.captured_at

            });


    } else {

        openingReading =
            reading;


        closingReading =
            await findClosingForOpening({

                stationId,

                pumpId,

                nozzleId,

                shiftId,

                openingCapturedAt:
                    reading.captured_at

            });
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
       VALIDATE ORDER
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
        closingTime <
        openingTime
    ) {

        throw new Error(
            "Closing reading cannot occur before the opening reading."
        );
    }


    /* =====================================================
       CALCULATE METER GAP
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
        "FUELGAP - METER GAP CALCULATION:",
        {
            opening:
                openingValue,

            closing:
                closingValue,

            gap:
                meterGap,

            status:
                gapStatus
        }
    );


    /* =====================================================
       CHECK EXISTING GAP
    ===================================================== */

    const existingGap =
        await findExistingGap({

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

       The existing gaps table in FuelGap was designed
       around sales reconciliation.

       To avoid breaking that existing database structure,
       expected_sales and actual_sales are kept at 0.

       They are NOT used for the meter-gap calculation.

       gap_amount contains the calculated meter movement
       so existing gap pages can continue reading it.
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


    let createdAlert = null;


    try {

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
         * Gap has already been saved.
         * We do not delete the gap if alert creation fails.
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


        if (
            appUser.is_active === false
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive"
            });
        }


        let query =
            supabaseAdmin
                .from("gaps")
                .select(`
                    *,
                    stations (
                        id,
                        name,
                        address,
                        city,
                        state
                    ),
                    pumps (
                        id,
                        pump_number,
                        brand,
                        model
                    ),
                    nozzles (
                        id,
                        nozzle_number,
                        product,
                        price_per_litre
                    ),
                    shifts (
                        id,
                        shift_name,
                        shift_date,
                        status
                    )
                `)
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
                    records.filter(
                        gap =>
                            gap.status ===
                            "normal"
                    ).length,

                variance:
                    records.filter(
                        gap =>
                            gap.status ===
                            "variance"
                    ).length

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


        const {
            data: gap,
            error
        } = await supabaseAdmin
            .from("gaps")
            .select(`
                *,
                stations (
                    id,
                    name,
                    address,
                    city,
                    state
                ),
                pumps (
                    id,
                    pump_number,
                    brand,
                    model
                ),
                nozzles (
                    id,
                    nozzle_number,
                    product,
                    price_per_litre
                ),
                shifts (
                    id,
                    shift_name,
                    shift_date,
                    status
                )
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


        if (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load gap",
                error:
                    error.message
            });
        }


        if (!gap) {

            return res.status(404).json({
                success: false,
                message:
                    "Gap not found"
            });
        }


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


        if (
            appUser.is_active === false
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive"
            });
        }


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
                    await getLatestClosingReading({

                        stationId:
                            station_id,

                        pumpId:
                            pump_id,

                        nozzleId:
                            nozzle_id,

                        shiftId:
                            shift_id

                    })

            });


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
                id: gap.id
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