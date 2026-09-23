/* =========================================================
   FUELGAP - GAP CONTROLLER
   =========================================================
   PURPOSE:
   - Calculate meter gaps between opening and closing readings
   - Compare ONLY meter readings
   - Support historical readings
   - Support OPEN and CLOSED shifts
   - Prevent duplicate gap records
   - Automatically create alerts for calculated gaps
   - Keep organization/station access secure
   ========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");

const {
    createSystemGapAlert
} = require("./alertController");


/* =========================================================
   HELPERS
========================================================= */

function cleanString(value) {
    return String(value || "").trim();
}


function normalizeRole(role) {
    return cleanString(role).toLowerCase();
}


function isManagementRole(role) {
    return [
        "owner",
        "admin",
        "super_admin",
        "manager"
    ].includes(normalizeRole(role));
}


function isRestrictedRole(role) {
    return [
        "staff",
        "attendant"
    ].includes(normalizeRole(role));
}


/* =========================================================
   GET APPLICATION USER
========================================================= */

async function getApplicationUser(authUserId) {

    if (!authUserId) {
        throw new Error("Authenticated user ID is required");
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
        .eq("auth_user_id", authUserId)
        .maybeSingle();

    if (error) {
        console.error(
            "GET APPLICATION USER ERROR:",
            error
        );

        throw new Error(
            "Unable to load application user"
        );
    }

    if (!data) {
        throw new Error(
            "Application user profile not found"
        );
    }

    if (data.is_active === false) {
        throw new Error(
            "Your account is inactive"
        );
    }

    return data;
}


/* =========================================================
   VERIFY STATION ACCESS
========================================================= */

/* =========================================================
   VERIFY STATION ACCESS
========================================================= */

async function verifyStationAccess(
    stationId,
    organizationId
) {
    try {

        console.log(
            "VERIFY STATION ACCESS"
        );

        console.log(
            "STATION ID:",
            stationId
        );

        console.log(
            "ORGANIZATION ID:",
            organizationId
        );


        if (!stationId) {
            throw new Error(
                "Station ID is required"
            );
        }

        if (!organizationId) {
            throw new Error(
                "Organization ID is required"
            );
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id,
                name,
                status
            `)
            .eq(
                "id",
                stationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "VERIFY STATION DATABASE ERROR:",
                stationError
            );

            throw new Error(
                `Unable to verify station access: ${stationError.message}`
            );
        }


        if (!station) {

            throw new Error(
                "Station not found"
            );
        }


        console.log(
            "STATION FOUND:",
            station
        );


        /* =================================================
           ORGANIZATION ACCESS CHECK
        ================================================= */

        if (
            String(
                station.organization_id
            ) !== String(
                organizationId
            )
        ) {

            console.error(
                "STATION ORGANIZATION MISMATCH"
            );

            console.error(
                "STATION ORGANIZATION:",
                station.organization_id
            );

            console.error(
                "USER ORGANIZATION:",
                organizationId
            );

            throw new Error(
                "Station does not belong to your organization"
            );
        }


        return station;

    } catch (error) {

        console.error(
            "VERIFY STATION ACCESS ERROR:",
            error
        );

        throw error;
    }
}


/* =========================================================
   FIND OPENING READING FOR CLOSING READING
========================================================= */

async function findOpeningForClosing({
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    closingReading
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
            shift_id,
            reading_type,
            reading,
            captured_at,
            recorded_by
        `)
        .eq("station_id", stationId)
        .eq("pump_id", pumpId)
        .eq("nozzle_id", nozzleId)
        .eq("shift_id", shiftId)
        .eq("reading_type", "opening")
        .lt(
            "captured_at",
            closingReading.captured_at
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
            "FIND OPENING FOR CLOSING ERROR:",
            error
        );

        throw new Error(
            "Unable to find opening meter reading"
        );
    }

    return data || null;
}


/* =========================================================
   FIND CLOSING READING FOR OPENING READING
========================================================= */

async function findClosingForOpening({
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    openingReading
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
            shift_id,
            reading_type,
            reading,
            captured_at,
            recorded_by
        `)
        .eq("station_id", stationId)
        .eq("pump_id", pumpId)
        .eq("nozzle_id", nozzleId)
        .eq("shift_id", shiftId)
        .eq("reading_type", "closing")
        .gt(
            "captured_at",
            openingReading.captured_at
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
            "FIND CLOSING FOR OPENING ERROR:",
            error
        );

        throw new Error(
            "Unable to find closing meter reading"
        );
    }

    return data || null;
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

    const {
        data,
        error
    } = await supabaseAdmin
        .from("gaps")
        .select("*")
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
        .eq(
            "opening_reading",
            openingReading
        )
        .eq(
            "closing_reading",
            closingReading
        )
        .maybeSingle();

    if (error) {

        console.error(
            "FIND EXISTING GAP ERROR:",
            error
        );

        throw new Error(
            "Unable to check for existing gap"
        );
    }

    return data || null;
}


/* =========================================================
   DETERMINE GAP STATUS
========================================================= */

function determineGapStatus(meterGap) {

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

function determineAlertSeverity(meterGap) {

    if (meterGap < 0) {
        return "critical";
    }

    if (meterGap > 0) {
        return "warning";
    }

    return "info";
}


/* =========================================================
   BUILD GAP ALERT
========================================================= */

function buildGapAlert({
    gap,
    meterGap
}) {

    const severity =
        determineAlertSeverity(meterGap);

    let title;
    let message;

    if (meterGap < 0) {

        title = "Negative Meter Variance";

        message =
            `A negative meter variance of ${Math.abs(
                meterGap
            )} litres was detected. ` +
            `Opening reading: ${gap.opening_reading}. ` +
            `Closing reading: ${gap.closing_reading}.`;

    } else if (meterGap > 0) {

        title = "Meter Gap Detected";

        message =
            `A meter gap of ${meterGap} litres was detected. ` +
            `Opening reading: ${gap.opening_reading}. ` +
            `Closing reading: ${gap.closing_reading}.`;

    } else {

        title = "Meter Reading Normal";

        message =
            "Opening and closing meter readings match. " +
            "No meter movement was detected.";
    }

    return {
        type: "gap_variance",
        severity,
        title,
        message
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
    reading,
    recordedBy
}) {

    try {

        console.log(
            "================================================="
        );

        console.log(
            "FUELGAP - PROCESS METER GAP"
        );

        console.log(
            "ORGANIZATION:",
            organizationId
        );

        console.log(
            "STATION:",
            stationId
        );

        console.log(
            "PUMP:",
            pumpId
        );

        console.log(
            "NOZZLE:",
            nozzleId
        );

        console.log(
            "SHIFT:",
            shiftId
        );

        console.log(
            "READING TYPE:",
            readingType
        );

        console.log(
            "================================================="
        );


        /* =================================================
           VALIDATION
        ================================================= */

        if (!organizationId) {
            throw new Error(
                "Organization ID is required"
            );
        }

        if (!stationId) {
            throw new Error(
                "Station ID is required"
            );
        }

        if (!pumpId) {
            throw new Error(
                "Pump ID is required"
            );
        }

        if (!nozzleId) {
            throw new Error(
                "Nozzle ID is required"
            );
        }

        if (!shiftId) {
            throw new Error(
                "Shift ID is required"
            );
        }

        if (!reading) {
            throw new Error(
                "Meter reading is required"
            );
        }


        /* =================================================
           NORMALIZE READING TYPE
        ================================================= */

        const normalizedReadingType =
            cleanString(
                readingType
            ).toLowerCase();


        /* =================================================
           ONLY OPENING / CLOSING CREATE GAPS
        ================================================= */

        if (
            normalizedReadingType !== "opening" &&
            normalizedReadingType !== "closing"
        ) {

            console.log(
                "READING TYPE DOES NOT CREATE GAP"
            );

            return null;
        }


        /* =================================================
           NORMALIZE READING VALUE
        ================================================= */

        const currentReading =
            Number(
                reading.reading
            );

        if (
            !Number.isFinite(
                currentReading
            )
        ) {

            throw new Error(
                "Invalid meter reading value"
            );
        }


        /* =================================================
           CLOSING READING
           FIND OPENING
        ================================================= */

        let openingReading = null;
        let closingReading = null;


        if (
            normalizedReadingType === "closing"
        ) {

            closingReading = reading;

            openingReading =
                await findOpeningForClosing({
                    stationId,
                    pumpId,
                    nozzleId,
                    shiftId,
                    closingReading
                });


            if (!openingReading) {

                console.log(
                    "NO OPENING READING FOUND FOR CLOSING READING"
                );

                return null;
            }
        }


        /* =================================================
           OPENING READING
           FIND CLOSING
        ================================================= */

        if (
            normalizedReadingType === "opening"
        ) {

            openingReading = reading;

            closingReading =
                await findClosingForOpening({
                    stationId,
                    pumpId,
                    nozzleId,
                    shiftId,
                    openingReading
                });


            if (!closingReading) {

                console.log(
                    "NO CLOSING READING FOUND YET"
                );

                return null;
            }
        }


        /* =================================================
           EXTRACT VALUES
        ================================================= */

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
                "Opening or closing meter value is invalid"
            );
        }


        /* =================================================
           CALCULATE METER GAP
           
           IMPORTANT:
           gap_amount is generated by PostgreSQL.
           We calculate meterGap here for status/alert
           purposes, but DO NOT manually insert it.
        ================================================= */

        const meterGap =
            Number(
                (
                    closingValue -
                    openingValue
                ).toFixed(2)
            );


        console.log(
            "OPENING VALUE:",
            openingValue
        );

        console.log(
            "CLOSING VALUE:",
            closingValue
        );

        console.log(
            "CALCULATED METER GAP:",
            meterGap
        );


        /* =================================================
           DETERMINE STATUS
        ================================================= */

        const gapStatus =
            determineGapStatus(
                meterGap
            );


        /* =================================================
           CHECK DUPLICATE GAP
        ================================================= */

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
                "GAP ALREADY EXISTS:",
                existingGap.id
            );

            return existingGap;
        }


        /* =================================================
           VERIFY STATION ACCESS
        ================================================= */

        await verifyStationAccess(
            stationId,
            organizationId
        );


        /* =================================================
           CREATE GAP
           
           IMPORTANT:
           DO NOT INSERT gap_amount.
           
           PostgreSQL calculates gap_amount automatically
           because it is a generated column.
        ================================================= */

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

                status:
                    gapStatus

            })
            .select("*")
            .single();


        if (gapError) {

            console.error(
                "CREATE GAP ERROR:",
                gapError
            );

            throw new Error(
                `Unable to create meter gap: ${gapError.message}`
            );
        }


        console.log(
            "GAP CREATED SUCCESSFULLY:",
            createdGap
        );


        /* =================================================
           CREATE SYSTEM ALERT
        ================================================= */

        try {

            const alertInfo =
                buildGapAlert({
                    gap:
                        createdGap,
                    meterGap
                });


            const alertResult =
                await createSystemGapAlert({
                    organizationId,
                    stationId,
                    pumpId,
                    nozzleId,
                    shiftId,
                    gapId:
                        createdGap.id,
                    severity:
                        alertInfo.severity,
                    title:
                        alertInfo.title,
                    message:
                        alertInfo.message,
                    createdBy:
                        recordedBy
                });


            console.log(
                "SYSTEM GAP ALERT RESULT:",
                alertResult
            );

        } catch (alertError) {

            console.error(
                "CREATE SYSTEM GAP ALERT ERROR:",
                alertError
            );

            /*
             * Do not fail the gap calculation just because
             * alert creation failed.
             */
        }


        /* =================================================
           RETURN CREATED GAP
        ================================================= */

        return createdGap;

    } catch (error) {

        console.error(
            "PROCESS METER GAP ERROR:",
            error
        );

        throw error;
    }
}


/* =========================================================
   GET ALL GAPS
========================================================= */

async function getGaps(req, res) {

    try {

        console.log(
            "FUELGAP - GET GAPS"
        );


        if (!req.user) {

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


        const organizationId =
            appUser.organization_id;


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "User is not assigned to an organization"
            });
        }


        const {
            data,
            error
        } = await supabaseAdmin
            .from("gaps")
            .select(`
                *,
                stations (
                    id,
                    name
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
                    fuel_type,
                    price_per_litre
                ),
                shifts (
                    id,
                    shift_name,
                    status
                )
            `)
            .eq(
                "organization_id",
                organizationId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {

            console.error(
                "GET GAPS DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch gaps",
                error:
                    error.message
            });
        }


        console.log(
            "GAPS FOUND:",
            data?.length || 0
        );


        return res.status(200).json({

            success: true,

            data:
                data || [],

            gaps:
                data || [],

            count:
                data?.length || 0

        });

    } catch (error) {

        console.error(
            "GET GAPS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch gaps",
            error:
                error.message
        });
    }
}


/* =========================================================
   GET GAP BY ID
========================================================= */

async function getGapById(req, res) {

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


        if (!req.user) {

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


        const {
            data,
            error
        } = await supabaseAdmin
            .from("gaps")
            .select(`
                *,
                stations (
                    id,
                    name
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
                    fuel_type,
                    price_per_litre
                ),
                shifts (
                    id,
                    shift_name,
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

            console.error(
                "GET GAP BY ID ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch gap",
                error:
                    error.message
            });
        }


        if (!data) {

            return res.status(404).json({
                success: false,
                message:
                    "Gap not found"
            });
        }


        return res.status(200).json({

            success: true,

            data

        });

    } catch (error) {

        console.error(
            "GET GAP BY ID UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch gap",
            error:
                error.message
        });
    }
}


/* =========================================================
   CREATE GAP MANUALLY
========================================================= */

async function createGap(req, res) {

    try {

        console.log(
            "FUELGAP - CREATE GAP"
        );


        if (!req.user) {

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
                    "You do not have permission to create gaps"
            });
        }


        const {
            station_id,
            pump_id,
            nozzle_id,
            shift_id,
            opening_reading,
            closing_reading
        } = req.body;


        if (
            !station_id ||
            !pump_id ||
            !nozzle_id ||
            !shift_id ||
            opening_reading === undefined ||
            closing_reading === undefined
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Station, pump, nozzle, shift, opening reading and closing reading are required"
            });
        }


        const openingValue =
            Number(
                opening_reading
            );

        const closingValue =
            Number(
                closing_reading
            );


        if (
            !Number.isFinite(
                openingValue
            ) ||
            !Number.isFinite(
                closingValue
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Opening and closing readings must be valid numbers"
            });
        }


        await verifyStationAccess(
            station_id,
            appUser.organization_id
        );


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


        const existingGap =
            await findExistingGap({
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
                openingReading:
                    openingValue,
                closingReading:
                    closingValue
            });


        if (existingGap) {

            return res.status(409).json({
                success: false,
                message:
                    "This gap has already been recorded",
                data:
                    existingGap
            });
        }


        /* =================================================
           IMPORTANT:
           gap_amount IS NOT INSERTED.
           PostgreSQL generates it automatically.
        ================================================= */

        const {
            data: createdGap,
            error
        } = await supabaseAdmin
            .from("gaps")
            .insert({

                organization_id:
                    appUser.organization_id,

                station_id:
                    station_id,

                pump_id:
                    pump_id,

                nozzle_id:
                    nozzle_id,

                shift_id:
                    shift_id,

                opening_reading:
                    openingValue,

                closing_reading:
                    closingValue,

                expected_sales:
                    0,

                actual_sales:
                    0,

                status:
                    gapStatus

            })
            .select("*")
            .single();


        if (error) {

            console.error(
                "CREATE MANUAL GAP ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to create gap",
                error:
                    error.message
            });
        }


        /* =================================================
           CREATE ALERT
        ================================================= */

        try {

            const alertInfo =
                buildGapAlert({
                    gap:
                        createdGap,
                    meterGap
                });


            await createSystemGapAlert({

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

                gapId:
                    createdGap.id,

                severity:
                    alertInfo.severity,

                title:
                    alertInfo.title,

                message:
                    alertInfo.message,

                createdBy:
                    appUser.id

            });

        } catch (alertError) {

            console.error(
                "MANUAL GAP ALERT ERROR:",
                alertError
            );
        }


        return res.status(201).json({

            success: true,

            message:
                "Gap created successfully",

            data:
                createdGap

        });

    } catch (error) {

        console.error(
            "CREATE GAP UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create gap",
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
            shift_id,
            reading_type,
            reading,
            captured_at,
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
            "GET LATEST CLOSING READING ERROR:",
            error
        );

        throw new Error(
            "Unable to fetch latest closing reading"
        );
    }


    return data || null;
}


/* =========================================================
   DELETE GAP
========================================================= */

async function deleteGap(req, res) {

    try {

        console.log(
            "FUELGAP - DELETE GAP"
        );


        if (!req.user) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required"
            });
        }


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


        const appUser =
            await getApplicationUser(
                req.user.id
            );


        const role =
            normalizeRole(
                appUser.role
            );


        if (
            ![
                "owner",
                "admin",
                "super_admin"
            ].includes(role)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to delete gaps"
            });
        }


        const {
            data: existingGap,
            error: findError
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


        if (findError) {

            console.error(
                "FIND GAP FOR DELETE ERROR:",
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


        if (!existingGap) {

            return res.status(404).json({
                success: false,
                message:
                    "Gap not found"
            });
        }


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
                "DELETE GAP ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete gap",
                error:
                    deleteError.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Gap deleted successfully"

        });

    } catch (error) {

        console.error(
            "DELETE GAP UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to delete gap",
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