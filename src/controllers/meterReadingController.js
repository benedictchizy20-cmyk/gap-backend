/* =========================================================
   FUELGAP - METER READING CONTROLLER
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   GET APPLICATION USER
   AUTH USER ID -> USERS TABLE ID
========================================================= */

const getApplicationUser = async (authUserId) => {

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
        throw error;
    }

    return data;
};


/* =========================================================
   CREATE METER READING
   POST /api/meter-readings
========================================================= */

const createMeterReading = async (req, res) => {

    try {

        /* =====================================================
           AUTHENTICATED USER
        ===================================================== */

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });

        }

        const authUserId = req.user.id;


        /* =====================================================
           GET APPLICATION USER
        ===================================================== */

        const appUser = await getApplicationUser(authUserId);

        if (!appUser) {

            return res.status(404).json({
                success: false,
                message: "Application user profile not found"
            });

        }


        /* =====================================================
           CHECK USER STATUS
        ===================================================== */

        if (appUser.is_active === false) {

            return res.status(403).json({
                success: false,
                message: "Your account is inactive"
            });

        }


        /* =====================================================
           REQUEST DATA
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
        } = req.body;


        /* =====================================================
           REQUIRED FIELDS
        ===================================================== */

        if (!station_id) {

            return res.status(400).json({
                success: false,
                message: "Station is required"
            });

        }

        if (!pump_id) {

            return res.status(400).json({
                success: false,
                message: "Pump is required"
            });

        }

        if (!nozzle_id) {

            return res.status(400).json({
                success: false,
                message: "Nozzle is required"
            });

        }

        if (!reading_type) {

            return res.status(400).json({
                success: false,
                message: "Reading type is required"
            });

        }

        if (
            reading === undefined ||
            reading === null ||
            reading === ""
        ) {

            return res.status(400).json({
                success: false,
                message: "Meter reading is required"
            });

        }


        /* =====================================================
           VALIDATE READING TYPE
        ===================================================== */

        const allowedReadingTypes = [
            "opening",
            "periodic",
            "closing",
            "correction"
        ];

        if (!allowedReadingTypes.includes(reading_type)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid reading type. Allowed values: opening, periodic, closing, correction"
            });

        }


        /* =====================================================
           VALIDATE NUMERIC READING
        ===================================================== */

        const numericReading = Number(reading);

        if (!Number.isFinite(numericReading)) {

            return res.status(400).json({
                success: false,
                message: "Meter reading must be a valid number"
            });

        }

        if (numericReading < 0) {

            return res.status(400).json({
                success: false,
                message: "Meter reading cannot be negative"
            });

        }


        /* =====================================================
           VERIFY STATION
           ORGANIZATION SECURITY INCLUDED
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
                is_active
            `)
            .eq("id", station_id)
            .eq("organization_id", appUser.organization_id)
            .maybeSingle();

        if (stationError) {

            console.error(
                "Station verification error:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify station",
                error: stationError.message
            });

        }

        if (!station) {

            return res.status(404).json({
                success: false,
                message: "Station not found"
            });

        }

        if (station.is_active === false) {

            return res.status(400).json({
                success: false,
                message: "Station is inactive"
            });

        }


        /* =====================================================
           VERIFY STAFF STATION ACCESS
        ===================================================== */

        if (
            appUser.station_id &&
            appUser.station_id !== station.id &&
            !["owner", "admin"].includes(
                String(appUser.role).toLowerCase()
            )
        ) {

            return res.status(403).json({
                success: false,
                message: "You do not have access to this station"
            });

        }


        /* =====================================================
           VERIFY PUMP
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
                is_active
            `)
            .eq("id", pump_id)
            .eq("station_id", station.id)
            .maybeSingle();

        if (pumpError) {

            console.error(
                "Pump verification error:",
                pumpError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify pump",
                error: pumpError.message
            });

        }

        if (!pump) {

            return res.status(404).json({
                success: false,
                message: "Pump not found for this station"
            });

        }

        if (pump.is_active === false) {

            return res.status(400).json({
                success: false,
                message: "Pump is inactive"
            });

        }


        /* =====================================================
           VERIFY NOZZLE
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
                product,
                price_per_litre,
                is_active
            `)
            .eq("id", nozzle_id)
            .eq("pump_id", pump.id)
            .maybeSingle();

        if (nozzleError) {

            console.error(
                "Nozzle verification error:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify nozzle",
                error: nozzleError.message
            });

        }

        if (!nozzle) {

            return res.status(404).json({
                success: false,
                message: "Nozzle not found for this pump"
            });

        }

        if (nozzle.is_active === false) {

            return res.status(400).json({
                success: false,
                message: "Nozzle is inactive"
            });

        }


        /* =====================================================
           VERIFY SHIFT
        ===================================================== */

        if (shift_id) {

            const {
                data: shift,
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
                    opened_by,
                    closed_by,
                    created_at
                `)
                .eq("id", shift_id)
                .eq("station_id", station.id)
                .maybeSingle();

            if (shiftError) {

                console.error(
                    "Shift verification error:",
                    shiftError
                );

                return res.status(500).json({
                    success: false,
                    message: "Failed to verify shift",
                    error: shiftError.message
                });

            }

            if (!shift) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Shift not found for this station"
                });

            }


            /* =================================================
               NORMAL READINGS REQUIRE OPEN SHIFT

               CORRECTION READINGS CAN BE RECORDED ON
               CLOSED SHIFTS.
            ================================================= */

            const shiftStatus =
                String(shift.status || "")
                    .toLowerCase()
                    .trim();

            if (
                reading_type !== "correction" &&
                shiftStatus !== "open"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `Meter readings can only be recorded on an open shift. Current shift status: ${shift.status}`
                });

            }

        }


        /* =====================================================
           CAPTURE TIMESTAMP

           IMPORTANT:
           captured_at IS NOT NULL IN DATABASE.

           If frontend does not provide it, automatically
           create the timestamp on the backend.
        ===================================================== */

        let finalCapturedAt;

        if (captured_at) {

            const parsedCapturedAt =
                new Date(captured_at);

            if (Number.isNaN(parsedCapturedAt.getTime())) {

                return res.status(400).json({
                    success: false,
                    message:
                        "captured_at must be a valid date/time"
                });

            }

            finalCapturedAt =
                parsedCapturedAt.toISOString();

        } else {

            finalCapturedAt =
                new Date().toISOString();

        }


        /* =====================================================
           PREPARE INSERT
           
           IMPORTANT:
           recorded_by MUST BE users.id
           
           NOT req.user.id
        ===================================================== */

        const meterReadingData = {

            station_id: station.id,

            pump_id: pump.id,

            nozzle_id: nozzle.id,

            recorded_by: appUser.id,

            reading_type,

            reading: numericReading,

            shift_id: shift_id || null,

            photo_url: photo_url || null,

            captured_at: finalCapturedAt

        };


        console.log(
            "CREATING METER READING:",
            {
                station_id: meterReadingData.station_id,
                pump_id: meterReadingData.pump_id,
                nozzle_id: meterReadingData.nozzle_id,
                shift_id: meterReadingData.shift_id,
                reading_type: meterReadingData.reading_type,
                reading: meterReadingData.reading,
                captured_at: meterReadingData.captured_at
            }
        );


        /* =====================================================
           INSERT METER READING
        ===================================================== */

        const {
            data: meterReading,
            error: insertError
        } = await supabaseAdmin
            .from("meter_readings")
            .insert(meterReadingData)
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
                "Create meter reading error:",
                insertError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to create meter reading",
                error: insertError.message,
                code: insertError.code,
                details: insertError.details,
                hint: insertError.hint
            });

        }


        /* =====================================================
           SUCCESS
        ===================================================== */

        return res.status(201).json({

            success: true,

            message:
                "Meter reading recorded successfully",

            data: meterReading

        });

    } catch (error) {

        console.error(
            "Unexpected create meter reading error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });

    }

};


/* =========================================================
   GET ALL METER READINGS
   GET /api/meter-readings
========================================================= */

const getMeterReadings = async (req, res) => {

    try {

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });

        }

        const appUser =
            await getApplicationUser(req.user.id);

        if (!appUser) {

            return res.status(404).json({
                success: false,
                message:
                    "Application user profile not found"
            });

        }


        /* =====================================================
           GET STATIONS IN USER ORGANIZATION
        ===================================================== */

        const {
            data: stations,
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
                "Get organization stations error:",
                stationsError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load stations",
                error: stationsError.message
            });

        }

        const stationIds =
            (stations || []).map(
                station => station.id
            );

        if (stationIds.length === 0) {

            return res.status(200).json({
                success: true,
                data: []
            });

        }


        /* =====================================================
           GET METER READINGS
        ===================================================== */

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
                "created_at",
                {
                    ascending: false
                }
            );

        if (error) {

            console.error(
                "Get meter readings error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load meter readings",
                error: error.message
            });

        }


        /* =====================================================
           STAFF STATION FILTER
        ===================================================== */

        let filteredData =
            data || [];

        if (
            appUser.station_id &&
            !["owner", "admin"].includes(
                String(appUser.role).toLowerCase()
            )
        ) {

            filteredData =
                filteredData.filter(
                    reading =>
                        reading.station_id ===
                        appUser.station_id
                );

        }


        return res.status(200).json({

            success: true,

            data: filteredData

        });

    } catch (error) {

        console.error(
            "Unexpected get meter readings error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });

    }

};


/* =========================================================
   GET METER READING BY ID
   GET /api/meter-readings/:id
========================================================= */

const getMeterReadingById = async (req, res) => {

    try {

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });

        }

        const appUser =
            await getApplicationUser(req.user.id);

        if (!appUser) {

            return res.status(404).json({
                success: false,
                message:
                    "Application user profile not found"
            });

        }

        const { id } = req.params;


        /* =====================================================
           FIND METER READING
        ===================================================== */

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
                recorded_by,
                reading_type,
                reading,
                shift_id,
                photo_url,
                captured_at,
                created_at
            `)
            .eq("id", id)
            .maybeSingle();

        if (error) {

            console.error(
                "Get meter reading by ID error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load meter reading",
                error: error.message
            });

        }

        if (!data) {

            return res.status(404).json({
                success: false,
                message:
                    "Meter reading not found"
            });

        }


        /* =====================================================
           VERIFY ORGANIZATION
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
            .eq("id", data.station_id)
            .maybeSingle();

        if (stationError) {

            console.error(
                "Meter reading station lookup error:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to verify meter reading",
                error: stationError.message
            });

        }

        if (
            !station ||
            station.organization_id !==
                appUser.organization_id
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this meter reading"
            });

        }


        /* =====================================================
           VERIFY STAFF STATION
        ===================================================== */

        if (
            appUser.station_id &&
            data.station_id !==
                appUser.station_id &&
            !["owner", "admin"].includes(
                String(appUser.role).toLowerCase()
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this meter reading"
            });

        }


        return res.status(200).json({

            success: true,

            data

        });

    } catch (error) {

        console.error(
            "Unexpected get meter reading by ID error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });

    }

};


/* =========================================================
   DELETE METER READING
   DELETE /api/meter-readings/:id
========================================================= */

const deleteMeterReading = async (req, res) => {

    try {

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required"
            });

        }

        const appUser =
            await getApplicationUser(req.user.id);

        if (!appUser) {

            return res.status(404).json({
                success: false,
                message:
                    "Application user profile not found"
            });

        }

        const { id } = req.params;


        /* =====================================================
           ONLY OWNER / ADMIN CAN DELETE
        ===================================================== */

        const allowedRoles = [
            "owner",
            "admin"
        ];

        if (
            !allowedRoles.includes(
                String(appUser.role).toLowerCase()
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to delete meter readings"
            });

        }


        /* =====================================================
           FIND READING
        ===================================================== */

        const {
            data: existingReading,
            error: findError
        } = await supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id
            `)
            .eq("id", id)
            .maybeSingle();

        if (findError) {

            console.error(
                "Find meter reading error:",
                findError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to find meter reading",
                error: findError.message
            });

        }

        if (!existingReading) {

            return res.status(404).json({
                success: false,
                message:
                    "Meter reading not found"
            });

        }


        /* =====================================================
           VERIFY STATION ORGANIZATION
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

            console.error(
                "Delete station verification error:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to verify station",
                error: stationError.message
            });

        }

        if (
            !station ||
            station.organization_id !==
                appUser.organization_id
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this reading"
            });

        }


        /* =====================================================
           DELETE
        ===================================================== */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("meter_readings")
            .delete()
            .eq("id", id);

        if (deleteError) {

            console.error(
                "Delete meter reading error:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete meter reading",
                error: deleteError.message
            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Meter reading deleted successfully"

        });

    } catch (error) {

        console.error(
            "Unexpected delete meter reading error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });

    }

};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    createMeterReading,

    getMeterReadings,

    getMeterReadingById,

    deleteMeterReading

};