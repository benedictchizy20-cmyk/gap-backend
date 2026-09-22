/* =========================================================
   FUELGAP - METER READING CONTROLLER
   =========================================================
   PURPOSE:
   - Create meter readings
   - Validate station / pump / nozzle relationships
   - Validate user permissions
   - EVERY meter reading MUST belong to a shift
   - Support current and historical readings
   - Support OPEN and CLOSED shifts
   - Evidence photo is OPTIONAL
   - Historical readings can use CLOSED shifts
   - Support opening / periodic / closing / correction
   - Get meter readings
   - Get a single meter reading
   - Delete meter readings
   ========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");

/* =========================================================
   HELPERS
   ========================================================= */

async function getApplicationUser(authUserId) {
    const { data, error } = await supabaseAdmin
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
        console.error("GET APPLICATION USER ERROR:", error);
        throw error;
    }

    return data;
}


/* =========================================================
   ROLE HELPERS
   ========================================================= */

function isOrganizationWideRole(role) {
    return ["owner", "admin", "super_admin"].includes(
        String(role || "").trim().toLowerCase()
    );
}


function isStationRestrictedRole(role) {
    return ["manager", "staff", "attendant"].includes(
        String(role || "").trim().toLowerCase()
    );
}


/* =========================================================
   STATION ACCESS
   ========================================================= */

function userCanAccessStation(user, stationId) {
    if (!user || !stationId) {
        return false;
    }

    const role = String(user.role || "")
        .trim()
        .toLowerCase();

    /*
     * Organization-wide users can access stations
     * belonging to their organization.
     */
    if (isOrganizationWideRole(role)) {
        return true;
    }

    /*
     * Station-restricted users can only access
     * their assigned station.
     */
    if (isStationRestrictedRole(role)) {
        if (!user.station_id) {
            return false;
        }

        return String(user.station_id) === String(stationId);
    }

    return false;
}


/* =========================================================
   VALID READING TYPES
   ========================================================= */

const VALID_READING_TYPES = [
    "opening",
    "periodic",
    "closing",
    "correction"
];


/* =========================================================
   CREATE METER READING
   ========================================================= */

const createMeterReading = async (req, res) => {
    try {
        console.log("FUELGAP - CREATE METER READING");

        /* -----------------------------------------------------
           AUTHENTICATION
           ----------------------------------------------------- */

        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const authUserId = req.user.id;

        console.log("AUTHENTICATED USER:", authUserId);


        /* -----------------------------------------------------
           APPLICATION USER
           ----------------------------------------------------- */

        let appUser;

        try {
            appUser = await getApplicationUser(authUserId);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Unable to load application user",
                error: error.message
            });
        }

        if (!appUser) {
            return res.status(404).json({
                success: false,
                message: "Application user profile not found"
            });
        }


        /* -----------------------------------------------------
           ACTIVE ACCOUNT CHECK
           ----------------------------------------------------- */

        if (appUser.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive"
            });
        }


        /* -----------------------------------------------------
           REQUEST DATA
           ----------------------------------------------------- */

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


        /* -----------------------------------------------------
           REQUIRED FIELDS
           ----------------------------------------------------- */

        if (
            !station_id ||
            !pump_id ||
            !nozzle_id ||
            !reading_type ||
            !shift_id ||
            reading === undefined ||
            reading === null
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Station, pump, nozzle, reading type, shift and meter reading are required"
            });
        }


        /* -----------------------------------------------------
           NORMALIZE READING TYPE
           ----------------------------------------------------- */

        const normalizedReadingType = String(reading_type)
            .trim()
            .toLowerCase();


        if (!VALID_READING_TYPES.includes(normalizedReadingType)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid reading type. Use opening, periodic, closing or correction"
            });
        }


        /* -----------------------------------------------------
           VALIDATE METER VALUE
           ----------------------------------------------------- */

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


        /* -----------------------------------------------------
           CAPTURED DATE / TIME
           -----------------------------------------------------
           Historical readings are allowed.
           If captured_at is not supplied, use current time.
           ----------------------------------------------------- */

        let finalCapturedAt;

        if (captured_at) {
            finalCapturedAt = new Date(captured_at);

            if (Number.isNaN(finalCapturedAt.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid captured date/time"
                });
            }
        } else {
            finalCapturedAt = new Date();
        }


        /* =====================================================
           VERIFY STATION
           ===================================================== */

        console.log("VERIFYING STATION:", station_id);

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
            .maybeSingle();


        if (stationError) {
            console.error(
                "CREATE READING STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify station",
                error: stationError.message
            });
        }


        if (!station) {
            return res.status(404).json({
                success: false,
                message: "Station not found"
            });
        }


        /* -----------------------------------------------------
           ORGANIZATION SECURITY
           ----------------------------------------------------- */

        if (
            String(station.organization_id) !==
            String(appUser.organization_id)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this station"
            });
        }


        /* -----------------------------------------------------
           STATION ACTIVE CHECK
           ----------------------------------------------------- */

        if (station.is_active === false) {
            return res.status(400).json({
                success: false,
                message: "This station is inactive"
            });
        }


        /* -----------------------------------------------------
           STATION ROLE ACCESS
           ----------------------------------------------------- */

        if (!userCanAccessStation(appUser, station.id)) {
            return res.status(403).json({
                success: false,
                message:
                    "You are not authorized to record readings for this station"
            });
        }


        /* =====================================================
           VERIFY PUMP
           ===================================================== */

        console.log("VERIFYING PUMP:", pump_id);

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
            .maybeSingle();


        if (pumpError) {
            console.error(
                "CREATE READING PUMP ERROR:",
                pumpError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify pump",
                error: pumpError.message
            });
        }


        if (!pump) {
            return res.status(404).json({
                success: false,
                message: "Pump not found"
            });
        }


        /* -----------------------------------------------------
           PUMP MUST BELONG TO STATION
           ----------------------------------------------------- */

        if (
            String(pump.station_id) !==
            String(station_id)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Selected pump does not belong to this station"
            });
        }


        /* -----------------------------------------------------
           PUMP ACTIVE CHECK
           ----------------------------------------------------- */

        if (pump.is_active === false) {
            return res.status(400).json({
                success: false,
                message: "This pump is inactive"
            });
        }


        /* =====================================================
           VERIFY NOZZLE
           ===================================================== */

        console.log("VERIFYING NOZZLE:", nozzle_id);

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
            .maybeSingle();


        if (nozzleError) {
            console.error(
                "CREATE READING NOZZLE ERROR:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify nozzle",
                error: nozzleError.message
            });
        }


        if (!nozzle) {
            return res.status(404).json({
                success: false,
                message: "Nozzle not found"
            });
        }


        /* -----------------------------------------------------
           NOZZLE MUST BELONG TO PUMP
           ----------------------------------------------------- */

        if (
            String(nozzle.pump_id) !==
            String(pump_id)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Selected nozzle does not belong to this pump"
            });
        }


        /* -----------------------------------------------------
           NOZZLE ACTIVE CHECK
           ----------------------------------------------------- */

        if (nozzle.is_active === false) {
            return res.status(400).json({
                success: false,
                message: "This nozzle is inactive"
            });
        }


        /* =====================================================
           VERIFY SHIFT
           =====================================================
           IMPORTANT:
           Every meter reading MUST have a shift.

           We allow:
           - OPEN shift
           - CLOSED shift

           We reject:
           - SCHEDULED shift
           - CANCELLED shift

           CLOSED shifts are intentionally allowed because
           historical readings may need to be entered later
           for gap / mismatch calculations.
           ===================================================== */

        console.log("VERIFYING SHIFT:", shift_id);

        if (!shift_id) {
            return res.status(400).json({
                success: false,
                message:
                    "Shift is required for every meter reading"
            });
        }


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
                status
            `)
            .eq("id", shift_id)
            .maybeSingle();


        if (shiftError) {
            console.error(
                "CREATE READING SHIFT ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify shift",
                error: shiftError.message
            });
        }


        if (!shift) {
            return res.status(404).json({
                success: false,
                message: "Selected shift was not found"
            });
        }


        /* -----------------------------------------------------
           SHIFT MUST BELONG TO SELECTED STATION
           ----------------------------------------------------- */

        if (
            String(shift.station_id) !==
            String(station_id)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Selected shift does not belong to this station"
            });
        }


        /* -----------------------------------------------------
           SHIFT STATUS
           -----------------------------------------------------
           Actual FuelGap shift statuses:
           - scheduled
           - open
           - closed
           - cancelled
           ----------------------------------------------------- */

        const shiftStatus = shift.status
            ? String(shift.status)
                  .trim()
                  .toLowerCase()
            : "";


        if (!["open", "closed"].includes(shiftStatus)) {
            return res.status(400).json({
                success: false,
                message:
                    "The selected shift must be open or closed for this meter reading"
            });
        }


        const finalShiftId = shift.id;


        /* =====================================================
           PHOTO / EVIDENCE
           =====================================================
           Evidence is OPTIONAL.

           This means:
           photo_url can be:
           - a valid URL
           - null
           - empty
           ===================================================== */

        let finalPhotoUrl = null;

        if (
            photo_url !== undefined &&
            photo_url !== null &&
            String(photo_url).trim() !== ""
        ) {
            finalPhotoUrl = String(photo_url).trim();
        }


        /* =====================================================
           CREATE METER READING
           ===================================================== */

        console.log(
            "CREATING METER READING:",
            {
                station_id,
                pump_id,
                nozzle_id,
                reading_type: normalizedReadingType,
                reading: numericReading,
                shift_id: finalShiftId,
                photo_url: finalPhotoUrl,
                captured_at: finalCapturedAt.toISOString(),
                recorded_by: appUser.id
            }
        );


        const {
            data: createdReading,
            error: createError
        } = await supabaseAdmin
            .from("meter_readings")
            .insert({
                station_id: station_id,
                pump_id: pump_id,
                nozzle_id: nozzle_id,
                recorded_by: appUser.id,
                reading_type: normalizedReadingType,
                reading: numericReading,
                shift_id: finalShiftId,
                photo_url: finalPhotoUrl,
                captured_at: finalCapturedAt.toISOString()
            })
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


        if (createError) {
            console.error(
                "CREATE METER READING DATABASE ERROR:",
                createError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to create meter reading",
                error: createError.message
            });
        }


        /* =====================================================
           SUCCESS
           ===================================================== */

        console.log(
            "METER READING CREATED:",
            createdReading.id
        );


        return res.status(201).json({
            success: true,
            message: "Meter reading recorded successfully",
            data: createdReading
        });

    } catch (error) {
        console.error(
            "CREATE METER READING UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
            error: error.message
        });
    }
};


/* =========================================================
   GET METER READINGS
   ========================================================= */

const getMeterReadings = async (req, res) => {
    try {
        console.log("FUELGAP - GET METER READINGS");

        /* -----------------------------------------------------
           AUTHENTICATION
           ----------------------------------------------------- */

        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }


        const authUserId = req.user.id;


        /* -----------------------------------------------------
           APPLICATION USER
           ----------------------------------------------------- */

        let appUser;

        try {
            appUser = await getApplicationUser(authUserId);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Unable to load application user",
                error: error.message
            });
        }


        if (!appUser) {
            return res.status(404).json({
                success: false,
                message: "Application user profile not found"
            });
        }


        /* -----------------------------------------------------
           GET ORGANIZATION STATIONS
           ----------------------------------------------------- */

        const {
            data: stations,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                name,
                organization_id,
                is_active
            `)
            .eq(
                "organization_id",
                appUser.organization_id
            );


        if (stationError) {
            console.error(
                "GET METER READINGS STATIONS ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load stations",
                error: stationError.message
            });
        }


        let accessibleStationIds = (stations || []).map(
            station => station.id
        );


        /* -----------------------------------------------------
           RESTRICTED USERS
           ----------------------------------------------------- */

        const role = String(appUser.role || "")
            .trim()
            .toLowerCase();


        if (isStationRestrictedRole(role)) {
            if (!appUser.station_id) {
                return res.status(200).json({
                    success: true,
                    data: []
                });
            }

            accessibleStationIds = accessibleStationIds.filter(
                id =>
                    String(id) ===
                    String(appUser.station_id)
            );
        }


        /* -----------------------------------------------------
           NO ACCESSIBLE STATIONS
           ----------------------------------------------------- */

        if (accessibleStationIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }


        /* =====================================================
           GET READINGS
           ===================================================== */

        const {
            data: readings,
            error: readingsError
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
                accessibleStationIds
            )
            .order(
                "captured_at",
                {
                    ascending: false
                }
            );


        if (readingsError) {
            console.error(
                "GET METER READINGS DATABASE ERROR:",
                readingsError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load meter readings",
                error: readingsError.message
            });
        }


        return res.status(200).json({
            success: true,
            data: readings || []
        });

    } catch (error) {
        console.error(
            "GET METER READINGS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
            error: error.message
        });
    }
};


/* =========================================================
   GET SINGLE METER READING
   ========================================================= */

const getMeterReadingById = async (req, res) => {
    try {
        console.log(
            "FUELGAP - GET METER READING BY ID"
        );

        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }


        const authUserId = req.user.id;
        const readingId = req.params.id;


        if (!readingId) {
            return res.status(400).json({
                success: false,
                message: "Meter reading ID is required"
            });
        }


        /* -----------------------------------------------------
           APPLICATION USER
           ----------------------------------------------------- */

        let appUser;

        try {
            appUser = await getApplicationUser(authUserId);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Unable to load application user",
                error: error.message
            });
        }


        if (!appUser) {
            return res.status(404).json({
                success: false,
                message: "Application user profile not found"
            });
        }


        /* -----------------------------------------------------
           GET READING
           ----------------------------------------------------- */

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
                "GET METER READING ERROR:",
                readingError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load meter reading",
                error: readingError.message
            });
        }


        if (!reading) {
            return res.status(404).json({
                success: false,
                message: "Meter reading not found"
            });
        }


        /* -----------------------------------------------------
           GET STATION
           ----------------------------------------------------- */

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
            .eq("id", reading.station_id)
            .maybeSingle();


        if (stationError) {
            console.error(
                "GET METER READING STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify station",
                error: stationError.message
            });
        }


        if (!station) {
            return res.status(404).json({
                success: false,
                message: "Reading station not found"
            });
        }


        /* -----------------------------------------------------
           ORGANIZATION SECURITY
           ----------------------------------------------------- */

        if (
            String(station.organization_id) !==
            String(appUser.organization_id)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this meter reading"
            });
        }


        /* -----------------------------------------------------
           STATION ACCESS
           ----------------------------------------------------- */

        if (!userCanAccessStation(appUser, station.id)) {
            return res.status(403).json({
                success: false,
                message:
                    "You are not authorized to view this meter reading"
            });
        }


        return res.status(200).json({
            success: true,
            data: reading
        });

    } catch (error) {
        console.error(
            "GET METER READING BY ID UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
            error: error.message
        });
    }
};


/* =========================================================
   DELETE METER READING
   ========================================================= */

const deleteMeterReading = async (req, res) => {
    try {
        console.log(
            "FUELGAP - DELETE METER READING"
        );

        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }


        const authUserId = req.user.id;
        const readingId = req.params.id;


        if (!readingId) {
            return res.status(400).json({
                success: false,
                message: "Meter reading ID is required"
            });
        }


        /* -----------------------------------------------------
           APPLICATION USER
           ----------------------------------------------------- */

        let appUser;

        try {
            appUser = await getApplicationUser(authUserId);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Unable to load application user",
                error: error.message
            });
        }


        if (!appUser) {
            return res.status(404).json({
                success: false,
                message: "Application user profile not found"
            });
        }


        /* -----------------------------------------------------
           DELETE PERMISSION
           ----------------------------------------------------- */

        const role = String(appUser.role || "")
            .trim()
            .toLowerCase();


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
                    "You are not authorized to delete meter readings"
            });
        }


        /* -----------------------------------------------------
           GET READING
           ----------------------------------------------------- */

        const {
            data: reading,
            error: readingError
        } = await supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id,
                reading_type,
                reading,
                shift_id
            `)
            .eq("id", readingId)
            .maybeSingle();


        if (readingError) {
            console.error(
                "DELETE METER READING FETCH ERROR:",
                readingError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to find meter reading",
                error: readingError.message
            });
        }


        if (!reading) {
            return res.status(404).json({
                success: false,
                message: "Meter reading not found"
            });
        }


        /* -----------------------------------------------------
           GET STATION
           ----------------------------------------------------- */

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
            .eq("id", reading.station_id)
            .maybeSingle();


        if (stationError) {
            console.error(
                "DELETE METER READING STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify station",
                error: stationError.message
            });
        }


        if (!station) {
            return res.status(404).json({
                success: false,
                message: "Station not found"
            });
        }


        /* -----------------------------------------------------
           ORGANIZATION SECURITY
           ----------------------------------------------------- */

        if (
            String(station.organization_id) !==
            String(appUser.organization_id)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this meter reading"
            });
        }


        /* -----------------------------------------------------
           DELETE
           ----------------------------------------------------- */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("meter_readings")
            .delete()
            .eq("id", readingId);


        if (deleteError) {
            console.error(
                "DELETE METER READING DATABASE ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to delete meter reading",
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
            "DELETE METER READING UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
            error: error.message
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