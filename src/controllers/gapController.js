/* =========================================================
   FUELGAP - GAP CONTROLLER
   =========================================================
   PURPOSE:
   - Calculate meter gaps
   - Compare opening vs closing meter readings
   - Create gap records
   - Automatically create gap alerts
   - Support historical readings
   - Prevent duplicate gaps
   - Respect organization/station permissions
   ========================================================= */

const supabaseAdmin =
    require("../config/supabaseAdmin");

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
    return cleanString(role).toLowerCase();
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

    return data;
}


/* =========================================================
   VERIFY STATION ACCESS
========================================================= */

async function verifyStationAccess(
    stationId,
    organizationId
) {

    console.log(
        "VERIFY STATION ACCESS"
    );

    const {
        data: station,
        error
    } = await supabaseAdmin
        .from("stations")
        .select(`
            id,
            organization_id,
            name
        `)
        .eq(
            "id",
            stationId
        )
        .maybeSingle();

    if (error) {

        console.error(
            "VERIFY STATION ACCESS ERROR:",
            error
        );

        throw new Error(
            "Unable to verify station access"
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

    if (
        station.organization_id !==
        organizationId
    ) {

        throw new Error(
            "You do not have access to this station"
        );
    }

    console.log(
        "STATION ACCESS VERIFIED"
    );

    return station;
}


/* =========================================================
   FIND OPENING READING FOR CLOSING READING
========================================================= */

async function findOpeningForClosing(
    closingReading
) {

    const {
        station_id,
        pump_id,
        nozzle_id,
        shift_id,
        captured_at
    } = closingReading;

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
            reading,
            reading_type,
            captured_at
        `)
        .eq(
            "station_id",
            station_id
        )
        .eq(
            "pump_id",
            pump_id
        )
        .eq(
            "nozzle_id",
            nozzle_id
        )
        .eq(
            "shift_id",
            shift_id
        )
        .eq(
            "reading_type",
            "opening"
        )
        .lt(
            "captured_at",
            captured_at
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
            "FIND OPENING READING ERROR:",
            error
        );

        throw new Error(
            "Unable to find opening meter reading"
        );
    }

    return data;
}


/* =========================================================
   FIND CLOSING READING FOR OPENING READING
========================================================= */

async function findClosingForOpening(
    openingReading
) {

    const {
        station_id,
        pump_id,
        nozzle_id,
        shift_id,
        captured_at
    } = openingReading;

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
            reading,
            reading_type,
            captured_at
        `)
        .eq(
            "station_id",
            station_id
        )
        .eq(
            "pump_id",
            pump_id
        )
        .eq(
            "nozzle_id",
            nozzle_id
        )
        .eq(
            "shift_id",
            shift_id
        )
        .eq(
            "reading_type",
            "closing"
        )
        .gt(
            "captured_at",
            captured_at
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
            "FIND CLOSING READING ERROR:",
            error
        );

        throw new Error(
            "Unable to find closing meter reading"
        );
    }

    return data;
}


/* =========================================================
   FIND EXISTING GAP
========================================================= */

async function findExistingGap(
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    openingValue,
    closingValue
) {

    const {
        data,
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
        .eq(
            "opening_reading",
            Number(openingValue)
        )
        .eq(
            "closing_reading",
            Number(closingValue)
        )
        .maybeSingle();

    if (error) {

        console.error(
            "FIND EXISTING GAP ERROR:",
            error
        );

        throw new Error(
            "Unable to check for existing meter gap"
        );
    }

    return data;
}


/* =========================================================
   DETERMINE GAP STATUS
========================================================= */

function determineGapStatus(
    meterGap
) {

    const amount =
        Number(meterGap);

    if (Number.isNaN(amount)) {
        return "variance";
    }

    if (amount < 0) {
        return "variance";
    }

    return "normal";
}


/* =========================================================
   DETERMINE ALERT SEVERITY
========================================================= */

function determineAlertSeverity(
    meterGap
) {

    const absoluteGap =
        Math.abs(
            Number(meterGap)
        );

    if (absoluteGap === 0) {
        return "info";
    }

    if (absoluteGap >= 500) {
        return "critical";
    }

    if (absoluteGap >= 100) {
        return "warning";
    }

    return "info";
}


/* =========================================================
   BUILD GAP ALERT
========================================================= */

function buildGapAlert({
    organizationId,
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    gapId,
    openingValue,
    closingValue,
    meterGap
}) {

    const severity =
        determineAlertSeverity(
            meterGap
        );

    return {

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

        gap_id:
            gapId,

        type:
            "gap_variance",

        severity,

        title:
            "Meter Gap Detected",

        message:
            `A meter gap of ${meterGap} litres was detected. ` +
            `Opening reading: ${openingValue}. ` +
            `Closing reading: ${closingValue}.`,

        status:
            "new"
    };
}


/* =========================================================
   PROCESS METER GAP
   =========================================================
   IMPORTANT:

   This function supports BOTH:

   A. Automatic processing from meterReadingController

      readingType: "opening" / "closing"
      reading: createdReading

   B. Manual processing

      openingValue
      closingValue
========================================================= */

async function processMeterGap({

    organizationId,

    stationId,

    pumpId,

    nozzleId,

    shiftId,

    openingValue,

    closingValue,

    readingType,

    reading

}) {

    console.log(
        "PROCESSING METER GAP"
    );

    console.log(
        "READING TYPE:",
        readingType
    );

    console.log(
        "READING OBJECT:",
        reading
    );

    console.log(
        "OPENING VALUE:",
        openingValue
    );

    console.log(
        "CLOSING VALUE:",
        closingValue
    );


    /* =====================================================
       VERIFY STATION ACCESS
    ===================================================== */

    await verifyStationAccess(
        stationId,
        organizationId
    );


    let finalOpeningValue =
        openingValue;

    let finalClosingValue =
        closingValue;

    let openingReadingRecord =
        null;

    let closingReadingRecord =
        null;


    /* =====================================================
       AUTOMATIC CLOSING READING
    ===================================================== */

    if (
        readingType === "closing" &&
        reading
    ) {

        console.log(
            "AUTOMATIC GAP PROCESSING FOR CLOSING READING"
        );


        closingReadingRecord =
            reading;


        openingReadingRecord =
            await findOpeningForClosing(
                reading
            );


        if (!openingReadingRecord) {

            console.log(
                "NO MATCHING OPENING READING FOUND"
            );

            return null;
        }


        finalOpeningValue =
            openingReadingRecord.reading;

        finalClosingValue =
            reading.reading;


        console.log(
            "MATCHED OPENING READING:",
            openingReadingRecord
        );

        console.log(
            "CLOSING READING:",
            reading
        );
    }


    /* =====================================================
       AUTOMATIC OPENING READING

       This handles the case where a closing reading
       already exists before the opening reading is
       processed.
    ===================================================== */

    if (
        readingType === "opening" &&
        reading
    ) {

        console.log(
            "AUTOMATIC GAP PROCESSING FOR OPENING READING"
        );


        openingReadingRecord =
            reading;


        closingReadingRecord =
            await findClosingForOpening(
                reading
            );


        if (!closingReadingRecord) {

            console.log(
                "NO MATCHING CLOSING READING FOUND"
            );

            return null;
        }


        finalOpeningValue =
            reading.reading;

        finalClosingValue =
            closingReadingRecord.reading;


        console.log(
            "OPENING READING:",
            reading
        );

        console.log(
            "MATCHED CLOSING READING:",
            closingReadingRecord
        );
    }


    /* =====================================================
       CONVERT VALUES TO NUMBERS
    ===================================================== */

    finalOpeningValue =
        Number(
            finalOpeningValue
        );

    finalClosingValue =
        Number(
            finalClosingValue
        );


    console.log(
        "FINAL OPENING VALUE:",
        finalOpeningValue
    );

    console.log(
        "FINAL CLOSING VALUE:",
        finalClosingValue
    );


    /* =====================================================
       VALIDATE VALUES
    ===================================================== */

    if (
        Number.isNaN(
            finalOpeningValue
        ) ||
        Number.isNaN(
            finalClosingValue
        )
    ) {

        throw new Error(
            "Opening or closing meter reading is invalid"
        );
    }


    /* =====================================================
       CALCULATE GAP
    ===================================================== */

    const meterGap =
        Number(
            (
                finalClosingValue -
                finalOpeningValue
            ).toFixed(2)
        );


    console.log(
        "CALCULATED METER GAP:",
        meterGap
    );


    /* =====================================================
       DETERMINE STATUS
    ===================================================== */

    const gapStatus =
        determineGapStatus(
            meterGap
        );


    /* =====================================================
       CHECK DUPLICATE GAP
    ===================================================== */

    const existingGap =
        await findExistingGap(

            stationId,

            pumpId,

            nozzleId,

            shiftId,

            finalOpeningValue,

            finalClosingValue
        );


    if (existingGap) {

        console.log(
            "EXISTING GAP FOUND:",
            existingGap.id
        );

        return existingGap;
    }


    /* =====================================================
       CREATE GAP

       IMPORTANT:
       DO NOT INSERT gap_amount.

       PostgreSQL generates gap_amount using:

       closing_reading - opening_reading
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
                finalOpeningValue,

            closing_reading:
                finalClosingValue,

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
            "CREATE GAP DATABASE ERROR:",
            gapError
        );

        throw new Error(
            "Unable to create meter gap"
        );
    }


    console.log(
        "GAP CREATED SUCCESSFULLY:",
        createdGap
    );


    /* =====================================================
       CREATE AUTOMATIC SYSTEM ALERT

       KEEPING YOUR EXISTING
       createSystemGapAlert()
    ===================================================== */

    try {

        const alertData =
            buildGapAlert({

                organizationId,

                stationId,

                pumpId,

                nozzleId,

                shiftId,

                gapId:
                    createdGap.id,

                openingValue:
                    finalOpeningValue,

                closingValue:
                    finalClosingValue,

                meterGap

            });


        console.log(
            "CREATING SYSTEM GAP ALERT"
        );


        const systemAlert =
            await createSystemGapAlert(
                alertData
            );


        console.log(
            "SYSTEM GAP ALERT CREATED:",
            systemAlert?.id
        );


        console.log(
            "SYSTEM GAP ALERT RESULT:",
            systemAlert
        );


    } catch (alertError) {

        console.error(
            "SYSTEM GAP ALERT ERROR:",
            alertError
        );

        /*
         * Do not fail the gap creation if
         * alert creation fails.
         */
    }


    return createdGap;
}


/* =========================================================
   GET ALL GAPS
========================================================= */

async function getGaps(req, res) {

    console.log(
        "FUELGAP - GET GAPS"
    );

    try {

        const authUserId =
            req.user?.id ||
            req.user?.auth_user_id;


        if (!authUserId) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        const appUser =
            await getApplicationUser(
                authUserId
            );


        const organizationId =
            appUser.organization_id;


        console.log(
            "AUTHENTICATED USER:",
            appUser.id
        );

        console.log(
            "ORGANIZATION ID:",
            organizationId
        );

        console.log(
            "USER ROLE:",
            appUser.role
        );


        const {
            data: gaps,
            error
        } = await supabaseAdmin
            .from("gaps")
            .select("*")
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
                    "Unable to retrieve gaps",

                error:
                    error.message

            });
        }


        console.log(
            "GAPS FOUND:",
            gaps?.length || 0
        );


        return res.status(200).json({

            success: true,

            data:
                gaps || []

        });


    } catch (error) {

        console.error(
            "GET GAPS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unable to retrieve gaps"

        });
    }
}


/* =========================================================
   GET GAP BY ID
========================================================= */

async function getGapById(
    req,
    res
) {

    console.log(
        "FUELGAP - GET GAP BY ID"
    );

    try {

        const authUserId =
            req.user?.id ||
            req.user?.auth_user_id;


        if (!authUserId) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        const appUser =
            await getApplicationUser(
                authUserId
            );


        const organizationId =
            appUser.organization_id;


        const {
            id
        } = req.params;


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
                organizationId
            )
            .maybeSingle();


        if (error) {

            console.error(
                "GET GAP BY ID DATABASE ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve gap",

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


        return res.status(200).json({

            success: true,

            data:
                gap

        });


    } catch (error) {

        console.error(
            "GET GAP BY ID UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unable to retrieve gap"

        });
    }
}


/* =========================================================
   CREATE GAP MANUALLY
========================================================= */

async function createGap(
    req,
    res
) {

    console.log(
        "FUELGAP - CREATE GAP"
    );

    try {

        const authUserId =
            req.user?.id ||
            req.user?.auth_user_id;


        if (!authUserId) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        const appUser =
            await getApplicationUser(
                authUserId
            );


        const organizationId =
            appUser.organization_id;


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
            opening_reading === null ||
            closing_reading === undefined ||
            closing_reading === null
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
            Number.isNaN(
                openingValue
            ) ||
            Number.isNaN(
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
            organizationId
        );


        const createdGap =
            await processMeterGap({

                organizationId,

                stationId:
                    station_id,

                pumpId:
                    pump_id,

                nozzleId:
                    nozzle_id,

                shiftId:
                    shift_id,

                openingValue,

                closingValue

            });


        return res.status(201).json({

            success: true,

            message:
                "Meter gap created successfully",

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
                error.message ||
                "Unable to create meter gap"

        });
    }
}


/* =========================================================
   GET LATEST CLOSING READING
========================================================= */

async function getLatestClosingReading(
    stationId,
    pumpId,
    nozzleId,
    shiftId
) {

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
            reading,
            reading_type,
            captured_at
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
            "Unable to find latest closing reading"
        );
    }


    return data;
}


/* =========================================================
   DELETE GAP
========================================================= */

async function deleteGap(
    req,
    res
) {

    console.log(
        "FUELGAP - DELETE GAP"
    );

    try {

        const authUserId =
            req.user?.id ||
            req.user?.auth_user_id;


        if (!authUserId) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });
        }


        const appUser =
            await getApplicationUser(
                authUserId
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
            id
        } = req.params;


        const {
            data: existingGap,
            error: findError
        } = await supabaseAdmin
            .from("gaps")
            .select(`
                id,
                organization_id
            `)
            .eq(
                "id",
                id
            )
            .maybeSingle();


        if (findError) {

            console.error(
                "DELETE GAP FIND ERROR:",
                findError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to find gap"

            });
        }


        if (!existingGap) {

            return res.status(404).json({

                success: false,

                message:
                    "Gap not found"

            });
        }


        if (
            existingGap.organization_id !==
            appUser.organization_id
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You do not have access to this gap"

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
                "DELETE GAP DATABASE ERROR:",
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
                error.message ||
                "Unable to delete gap"

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

    getLatestClosingReading,

    deleteGap

};