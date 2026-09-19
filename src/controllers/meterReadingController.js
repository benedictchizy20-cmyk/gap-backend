/* =========================================================
   FUELGAP - METER READING CONTROLLER
   =========================================================
   PURPOSE:
   - Create meter readings
   - Validate station / pump / nozzle relationships
   - Validate user permissions
   - Support current and historical readings
   - Support opening / periodic / closing / correction
   - Evidence photo is OPTIONAL
   - Support captured_at historical date/time
   - Get organization meter readings
   - Get one meter reading
   - Delete meter readings

   DATABASE:
   Supabase

   AUTHENTICATION:
   req.user.id = Supabase Auth User ID

   IMPORTANT:
   This controller does NOT calculate the fuel gap.
   It only records and manages meter readings.

   ========================================================= */

// const { supabaseAdmin } = require("../config/supabaseAdmin");
const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   HELPER
   GET APPLICATION USER
   ========================================================= */

async function getApplicationUser(authUserId) {

    if (!authUserId) {
        return {
            user: null,
            error: new Error("Authentication user ID is missing.")
        };
    }

    const { data, error } = await supabaseAdmin
        .from("users")
        .select(`
            id,
            organization_id,
            full_name,
            email,
            phone,
            role,
            is_active,
            auth_user_id,
            station_id
        `)
        .eq("auth_user_id", authUserId)
        .maybeSingle();

    if (error) {
        console.error(
            "METER READING - APPLICATION USER ERROR:",
            error
        );

        return {
            user: null,
            error
        };
    }

    if (!data) {
        return {
            user: null,
            error: new Error(
                "FuelGap application user profile was not found."
            )
        };
    }

    return {
        user: data,
        error: null
    };
}


/* =========================================================
   HELPER
   CHECK HISTORICAL DATE
   ========================================================= */

function isHistoricalReading(capturedAt) {

    if (!capturedAt) {
        return false;
    }

    const suppliedDate = new Date(capturedAt);

    if (Number.isNaN(suppliedDate.getTime())) {
        return false;
    }

    const now = new Date();

    const suppliedYear = suppliedDate.getFullYear();
    const suppliedMonth = suppliedDate.getMonth();
    const suppliedDay = suppliedDate.getDate();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    return (
        suppliedYear < currentYear ||
        (
            suppliedYear === currentYear &&
            suppliedMonth < currentMonth
        ) ||
        (
            suppliedYear === currentYear &&
            suppliedMonth === currentMonth &&
            suppliedDay < currentDay
        )
    );
}


/* =========================================================
   HELPER
   NORMALIZE READING TYPE
   ========================================================= */

function normalizeReadingType(value) {

    if (!value) {
        return "";
    }

    return String(value)
        .trim()
        .toLowerCase();
}


/* =========================================================
   CREATE METER READING
   ========================================================= */

async function createMeterReading(req, res) {

    try {

        console.log(
            "================================================="
        );

        console.log(
            "FUELGAP - CREATE METER READING"
        );

        console.log(
            "================================================="
        );


        /* =====================================================
           1. CHECK AUTHENTICATION
        ===================================================== */

        if (!req.user || !req.user.id) {

            console.warn(
                "METER READING: Authentication required."
            );

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }


        console.log(
            "Authenticated user:",
            req.user.id
        );


        /* =====================================================
           2. GET APPLICATION USER
        ===================================================== */

        const {
            user: appUser,
            error: userError
        } = await getApplicationUser(req.user.id);


        if (userError || !appUser) {

            console.error(
                "METER READING: Application user error:",
                userError
            );

            return res.status(404).json({
                success: false,
                message: "FuelGap user profile not found.",
                error: userError
                    ? userError.message
                    : null
            });
        }


        console.log(
            "FuelGap user:",
            appUser.full_name
        );

        console.log(
            "Role:",
            appUser.role
        );

        console.log(
            "Organization:",
            appUser.organization_id
        );


        /* =====================================================
           3. CHECK ACCOUNT STATUS
        ===================================================== */

        if (appUser.is_active === false) {

            return res.status(403).json({
                success: false,
                message:
                    "Your FuelGap account is inactive. Contact an administrator."
            });
        }


        /* =====================================================
           4. GET REQUEST BODY
        ===================================================== */

        const {
            station_id,
            pump_id,
            nozzle_id,
            reading_type,
            reading,
            shift_id,
            photo_url,
            captured_at
        } = req.body || {};


        console.log(
            "Meter reading request:",
            {
                station_id,
                pump_id,
                nozzle_id,
                reading_type,
                reading,
                shift_id,
                has_photo: Boolean(photo_url),
                captured_at
            }
        );


        /* =====================================================
           5. REQUIRED FIELD VALIDATION
        ===================================================== */

        if (
            !station_id ||
            !pump_id ||
            !nozzle_id ||
            !reading_type ||
            reading === undefined ||
            reading === null ||
            reading === ""
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Station, pump, nozzle, reading type and reading are required."
            });
        }


        /* =====================================================
           6. NORMALIZE READING TYPE
        ===================================================== */

        const normalizedReadingType =
            normalizeReadingType(reading_type);


        const allowedReadingTypes = [
            "opening",
            "periodic",
            "closing",
            "correction"
        ];


        if (
            !allowedReadingTypes.includes(
                normalizedReadingType
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid reading type. Allowed values are opening, periodic, closing and correction."
            });
        }


        /* =====================================================
           7. VALIDATE METER READING NUMBER
        ===================================================== */

        const numericReading =
            Number(reading);


        if (
            !Number.isFinite(numericReading) ||
            numericReading < 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Meter reading must be a valid number greater than or equal to zero."
            });
        }


        /* =====================================================
           8. VALIDATE CAPTURED DATE/TIME
        ===================================================== */

        let finalCapturedAt = new Date().toISOString();

        let historicalReading = false;


        if (captured_at) {

            const parsedCapturedAt =
                new Date(captured_at);


            if (
                Number.isNaN(
                    parsedCapturedAt.getTime()
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "The reading date and time is invalid."
                });
            }


            finalCapturedAt =
                parsedCapturedAt.toISOString();


            historicalReading =
                isHistoricalReading(
                    parsedCapturedAt
                );
        }


        console.log(
            "Captured at:",
            finalCapturedAt
        );

        console.log(
            "Historical reading:",
            historicalReading
        );


        /* =====================================================
           9. FIND STATION
        ===================================================== */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id,
                name,
                address,
                city,
                state,
                status
            `)
            .eq("id", station_id)
            .eq(
                "organization_id",
                appUser.organization_id
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "METER READING - STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify the station.",
                error: stationError.message
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found or does not belong to your organization."
            });
        }


        /* =====================================================
           10. CHECK STATION STATUS
        ===================================================== */

        if (
            station.status &&
            String(station.status).toLowerCase() ===
            "inactive"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "This station is inactive."
            });
        }


        /* =====================================================
           11. CHECK STATION ACCESS
        ===================================================== */

        const userRole =
            String(
                appUser.role || ""
            ).toLowerCase();


        const organizationWideRoles = [
            "owner",
            "admin",
            "super_admin"
        ];


        const hasOrganizationWideAccess =
            organizationWideRoles.includes(
                userRole
            );


        if (
            !hasOrganizationWideAccess &&
            appUser.station_id &&
            String(appUser.station_id) !==
            String(station_id)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You are not allowed to record meter readings for this station."
            });
        }


        /* =====================================================
           12. FIND PUMP
        ===================================================== */

        const {
            data: pump,
            error: pumpError
        } = await supabaseAdmin
            .from("pumps")
            .select(`
                id,
                station_id,
                pump_number,
                brand,
                model,
                status
            `)
            .eq("id", pump_id)
            .eq("station_id", station_id)
            .maybeSingle();


        if (pumpError) {

            console.error(
                "METER READING - PUMP ERROR:",
                pumpError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify the pump.",
                error: pumpError.message
            });
        }


        if (!pump) {

            return res.status(404).json({
                success: false,
                message:
                    "Pump not found or does not belong to the selected station."
            });
        }


        /* =====================================================
           13. CHECK PUMP STATUS
        ===================================================== */

        if (
            pump.status &&
            String(pump.status).toLowerCase() ===
            "inactive"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "This pump is inactive."
            });
        }


        /* =====================================================
           14. FIND NOZZLE
        ===================================================== */

        const {
            data: nozzle,
            error: nozzleError
        } = await supabaseAdmin
            .from("nozzles")
            .select(`
                id,
                pump_id,
                nozzle_number,
                fuel_type,
                price_per_litre,
                status
            `)
            .eq("id", nozzle_id)
            .eq("pump_id", pump_id)
            .maybeSingle();


        if (nozzleError) {

            console.error(
                "METER READING - NOZZLE ERROR:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify the nozzle.",
                error: nozzleError.message
            });
        }


        if (!nozzle) {

            return res.status(404).json({
                success: false,
                message:
                    "Nozzle not found or does not belong to the selected pump."
            });
        }


        /* =====================================================
           15. CHECK NOZZLE STATUS
        ===================================================== */

        if (
            nozzle.status &&
            String(nozzle.status).toLowerCase() ===
            "inactive"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "This nozzle is inactive."
            });
        }


        /* =====================================================
           16. VERIFY SHIFT IF PROVIDED
        ===================================================== */

        let shift = null;


        if (shift_id) {

            const {
                data: foundShift,
                error: shiftError
            } = await supabaseAdmin
                .from("shifts")
                .select(`
                    id,
                    station_id,
                    shift_name,
                    shift_date,
                    start_time,
                    end_shift,
                    status,
                    created_at
                `)
                .eq("id", shift_id)
                .eq("station_id", station_id)
                .maybeSingle();


            if (shiftError) {

                console.error(
                    "METER READING - SHIFT ERROR:",
                    shiftError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to verify the shift.",
                    error: shiftError.message
                });
            }


            if (!foundShift) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Shift not found or does not belong to the selected station."
                });
            }


            shift = foundShift;


            /* =================================================
               SHIFT STATUS
            ================================================= */

            const shiftStatus =
                String(
                    shift.status || ""
                ).toLowerCase();


            const shiftIsOpen =
                shiftStatus === "open";


            const shiftIsClosed =
                shiftStatus === "closed";


            /* =================================================
               CORRECTION READINGS
               CAN USE OPEN OR CLOSED SHIFTS
            ================================================= */

            if (
                normalizedReadingType ===
                "correction"
            ) {

                if (
                    !shiftIsOpen &&
                    !shiftIsClosed
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "A correction reading must belong to an open or closed shift."
                    });
                }
            }


            /* =================================================
               CURRENT NORMAL READINGS
               MUST USE OPEN SHIFT
            ================================================= */

            else if (!historicalReading) {

                if (!shiftIsOpen) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Current opening, periodic and closing readings must belong to an open shift."
                    });
                }
            }


            /* =================================================
               HISTORICAL NORMAL READINGS
               MAY USE CLOSED SHIFT
            ================================================= */

            else {

                if (
                    !shiftIsOpen &&
                    !shiftIsClosed
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Historical readings must belong to an open or closed shift."
                    });
                }
            }
        }


        /* =====================================================
           17. OPTIONAL PHOTO EVIDENCE
        ===================================================== */

        let finalPhotoUrl = null;


        if (
            photo_url !== undefined &&
            photo_url !== null &&
            String(photo_url).trim() !== ""
        ) {

            finalPhotoUrl =
                String(photo_url).trim();
        }


        /*
         * IMPORTANT:
         *
         * Evidence is OPTIONAL.
         *
         * Therefore:
         *
         * photo_url = null
         *
         * is completely valid.
         */


        /* =====================================================
           18. PREPARE DATABASE RECORD
        ===================================================== */

        const meterReadingRecord = {

            station_id: station_id,

            pump_id: pump_id,

            nozzle_id: nozzle_id,

            recorded_by: appUser.id,

            reading_type:
                normalizedReadingType,

            reading:
                numericReading,

            shift_id:
                shift_id || null,

            photo_url:
                finalPhotoUrl,

            captured_at:
                finalCapturedAt
        };


        console.log(
            "METER READING - INSERT RECORD:",
            {
                station_id:
                    meterReadingRecord.station_id,

                pump_id:
                    meterReadingRecord.pump_id,

                nozzle_id:
                    meterReadingRecord.nozzle_id,

                reading_type:
                    meterReadingRecord.reading_type,

                reading:
                    meterReadingRecord.reading,

                shift_id:
                    meterReadingRecord.shift_id,

                has_photo:
                    Boolean(
                        meterReadingRecord.photo_url
                    ),

                captured_at:
                    meterReadingRecord.captured_at
            }
        );


        /* =====================================================
           19. INSERT INTO SUPABASE
        ===================================================== */

        const {
            data: createdReading,
            error: insertError
        } = await supabaseAdmin
            .from("meter_readings")
            .insert([
                meterReadingRecord
            ])
            .select(`
                id,
                station_id,
                pump_id,
                nozzle_id,
                recorded_by,
                reading_type,
                reading,
                shift_id,
                photo_url,
                captured_at,
                created_at
            `)
            .single();


        if (insertError) {

            console.error(
                "METER READING - INSERT ERROR:",
                insertError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to save meter reading.",
                error: insertError.message
            });
        }


        /* =====================================================
           20. SUCCESS RESPONSE
        ===================================================== */

        console.log(
            "METER READING CREATED:",
            createdReading.id
        );


        return res.status(201).json({

            success: true,

            message:
                historicalReading
                    ? (
                        finalPhotoUrl
                            ? "Historical meter reading saved with evidence."
                            : "Historical meter reading saved without evidence."
                    )
                    : (
                        finalPhotoUrl
                            ? "Meter reading saved with evidence."
                            : "Meter reading saved without evidence."
                    ),

            data: createdReading
        });


    } catch (error) {

        console.error(
            "METER READING CREATE UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "An unexpected error occurred while creating the meter reading.",
            error: error.message
        });
    }
}


/* =========================================================
   GET ALL METER READINGS
   ========================================================= */

async function getMeterReadings(req, res) {

    try {

        console.log(
            "FUELGAP - GET METER READINGS"
        );


        /* =====================================================
           1. AUTHENTICATION
        ===================================================== */

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });
        }


        /* =====================================================
           2. APPLICATION USER
        ===================================================== */

        const {
            user: appUser,
            error: userError
        } = await getApplicationUser(
            req.user.id
        );


        if (userError || !appUser) {

            return res.status(404).json({
                success: false,
                message:
                    "FuelGap user profile not found."
            });
        }


        /* =====================================================
           3. CHECK ACTIVE USER
        ===================================================== */

        if (appUser.is_active === false) {

            return res.status(403).json({
                success: false,
                message:
                    "Your FuelGap account is inactive."
            });
        }


        /* =====================================================
           4. GET ORGANIZATION STATIONS
        ===================================================== */

        const {
            data: organizationStations,
            error: stationsError
        } = await supabaseAdmin
            .from("stations")
            .select("id")
            .eq(
                "organization_id",
                appUser.organization_id
            );


        if (stationsError) {

            console.error(
                "GET METER READINGS - STATIONS ERROR:",
                stationsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load organization stations.",
                error: stationsError.message
            });
        }


        const stationIds =
            (organizationStations || [])
                .map(station => station.id);


        /* =====================================================
           NO STATIONS
        ===================================================== */

        if (stationIds.length === 0) {

            return res.status(200).json({

                success: true,

                data: [],

                count: 0
            });
        }


        /* =====================================================
           5. BUILD QUERY
        ===================================================== */

        let query = supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id,
                pump_id,
                nozzle_id,
                recorded_by,
                reading_type,
                reading,
                shift_id,
                photo_url,
                captured_at,
                created_at
            `)
            .in(
                "station_id",
                stationIds
            )
            .order(
                "captured_at",
                {
                    ascending: false
                }
            );


        /* =====================================================
           6. STAFF / ATTENDANT STATION FILTER
        ===================================================== */

        const userRole =
            String(
                appUser.role || ""
            ).toLowerCase();


        const stationRestrictedRoles = [
            "staff",
            "attendant",
            "manager"
        ];


        if (
            stationRestrictedRoles.includes(
                userRole
            ) &&
            appUser.station_id
        ) {

            query = query.eq(
                "station_id",
                appUser.station_id
            );
        }


        /* =====================================================
           7. EXECUTE QUERY
        ===================================================== */

        const {
            data: readings,
            error: readingsError
        } = await query;


        if (readingsError) {

            console.error(
                "GET METER READINGS ERROR:",
                readingsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load meter readings.",
                error: readingsError.message
            });
        }


        /* =====================================================
           8. SUCCESS
        ===================================================== */

        return res.status(200).json({

            success: true,

            data:
                readings || [],

            count:
                (readings || []).length
        });


    } catch (error) {

        console.error(
            "GET METER READINGS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "An unexpected error occurred while loading meter readings.",
            error: error.message
        });
    }
}


/* =========================================================
   GET SINGLE METER READING
   ========================================================= */

async function getMeterReadingById(req, res) {

    try {

        console.log(
            "FUELGAP - GET SINGLE METER READING"
        );


        /* =====================================================
           1. AUTHENTICATION
        ===================================================== */

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });
        }


        /* =====================================================
           2. GET APPLICATION USER
        ===================================================== */

        const {
            user: appUser,
            error: userError
        } = await getApplicationUser(
            req.user.id
        );


        if (userError || !appUser) {

            return res.status(404).json({
                success: false,
                message:
                    "FuelGap user profile not found."
            });
        }


        /* =====================================================
           3. GET READING ID
        ===================================================== */

        const readingId =
            req.params.id;


        if (!readingId) {

            return res.status(400).json({
                success: false,
                message:
                    "Meter reading ID is required."
            });
        }


        /* =====================================================
           4. GET READING
        ===================================================== */

        const {
            data: reading,
            error: readingError
        } = await supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id,
                pump_id,
                nozzle_id,
                recorded_by,
                reading_type,
                reading,
                shift_id,
                photo_url,
                captured_at,
                created_at
            `)
            .eq("id", readingId)
            .maybeSingle();


        if (readingError) {

            console.error(
                "GET SINGLE METER READING ERROR:",
                readingError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load meter reading.",
                error: readingError.message
            });
        }


        if (!reading) {

            return res.status(404).json({
                success: false,
                message:
                    "Meter reading not found."
            });
        }


        /* =====================================================
           5. CHECK STATION BELONGS TO ORGANIZATION
        ===================================================== */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id
            `)
            .eq(
                "id",
                reading.station_id
            )
            .maybeSingle();


        if (stationError) {

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify reading station.",
                error: stationError.message
            });
        }


        if (
            !station ||
            String(
                station.organization_id
            ) !==
            String(
                appUser.organization_id
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You are not allowed to access this meter reading."
            });
        }


        /* =====================================================
           6. STATION-LEVEL ACCESS
        ===================================================== */

        const userRole =
            String(
                appUser.role || ""
            ).toLowerCase();


        const organizationWideRoles = [
            "owner",
            "admin",
            "super_admin"
        ];


        const hasOrganizationWideAccess =
            organizationWideRoles.includes(
                userRole
            );


        if (
            !hasOrganizationWideAccess &&
            appUser.station_id &&
            String(appUser.station_id) !==
            String(reading.station_id)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You are not allowed to access readings from this station."
            });
        }


        /* =====================================================
           7. SUCCESS
        ===================================================== */

        return res.status(200).json({

            success: true,

            data: reading
        });


    } catch (error) {

        console.error(
            "GET SINGLE METER READING UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "An unexpected error occurred while loading the meter reading.",
            error: error.message
        });
    }
}


/* =========================================================
   DELETE METER READING
   ========================================================= */

async function deleteMeterReading(req, res) {

    try {

        console.log(
            "FUELGAP - DELETE METER READING"
        );


        /* =====================================================
           1. AUTHENTICATION
        ===================================================== */

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });
        }


        /* =====================================================
           2. APPLICATION USER
        ===================================================== */

        const {
            user: appUser,
            error: userError
        } = await getApplicationUser(
            req.user.id
        );


        if (userError || !appUser) {

            return res.status(404).json({
                success: false,
                message:
                    "FuelGap user profile not found."
            });
        }


        /* =====================================================
           3. CHECK ACTIVE USER
        ===================================================== */

        if (appUser.is_active === false) {

            return res.status(403).json({
                success: false,
                message:
                    "Your FuelGap account is inactive."
            });
        }


        /* =====================================================
           4. DELETE PERMISSION
        ===================================================== */

        const userRole =
            String(
                appUser.role || ""
            ).toLowerCase();


        const allowedDeleteRoles = [
            "owner",
            "admin",
            "super_admin"
        ];


        if (
            !allowedDeleteRoles.includes(
                userRole
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to delete meter readings."
            });
        }


        /* =====================================================
           5. GET READING ID
        ===================================================== */

        const readingId =
            req.params.id;


        if (!readingId) {

            return res.status(400).json({
                success: false,
                message:
                    "Meter reading ID is required."
            });
        }


        /* =====================================================
           6. FIND READING
        ===================================================== */

        const {
            data: existingReading,
            error: findError
        } = await supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id,
                reading_type,
                reading,
                photo_url,
                captured_at
            `)
            .eq("id", readingId)
            .maybeSingle();


        if (findError) {

            console.error(
                "DELETE METER READING - FIND ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to find meter reading.",
                error: findError.message
            });
        }


        if (!existingReading) {

            return res.status(404).json({
                success: false,
                message:
                    "Meter reading not found."
            });
        }


        /* =====================================================
           7. VERIFY STATION ORGANIZATION
        ===================================================== */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id
            `)
            .eq(
                "id",
                existingReading.station_id
            )
            .maybeSingle();


        if (stationError) {

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station ownership.",
                error: stationError.message
            });
        }


        if (
            !station ||
            String(
                station.organization_id
            ) !==
            String(
                appUser.organization_id
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You are not allowed to delete this meter reading."
            });
        }


        /* =====================================================
           8. DELETE
        ===================================================== */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("meter_readings")
            .delete()
            .eq("id", readingId);


        if (deleteError) {

            console.error(
                "DELETE METER READING ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete meter reading.",
                error: deleteError.message
            });
        }


        /* =====================================================
           9. SUCCESS
        ===================================================== */

        console.log(
            "METER READING DELETED:",
            readingId
        );


        return res.status(200).json({

            success: true,

            message:
                "Meter reading deleted successfully."
        });


    } catch (error) {

        console.error(
            "DELETE METER READING UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "An unexpected error occurred while deleting the meter reading.",
            error: error.message
        });
    }
}


/* =========================================================
   EXPORT CONTROLLERS
   ========================================================= */

module.exports = {

    createMeterReading,

    getMeterReadings,

    getMeterReadingById,

    deleteMeterReading

};