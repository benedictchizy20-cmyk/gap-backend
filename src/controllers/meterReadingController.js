/* =========================================================
   FUELGAP - METER READING CONTROLLER
   PRODUCTION VERSION
   ========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   GET APPLICATION USER
   ========================================================= */

async function getApplicationUser(authUserId) {

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

        throw new Error(error.message);
    }

    return data;
}


/* =========================================================
   CHECK ORGANIZATION-WIDE ROLE
   ========================================================= */

function isOrganizationWideRole(role) {

    return [
        "owner",
        "admin",
        "super_admin"
    ].includes(role);

}


/* =========================================================
   CHECK STATION-RESTRICTED ROLE
   ========================================================= */

function isStationRestrictedRole(role) {

    return [
        "manager",
        "staff",
        "attendant"
    ].includes(role);

}


/* =========================================================
   CHECK USER STATION ACCESS
   ========================================================= */

function userCanAccessStation(
    appUser,
    stationId
) {

    if (!appUser) {
        return false;
    }


    /*
       Organization-wide users can access
       stations belonging to their organization.
    */

    if (
        isOrganizationWideRole(
            appUser.role
        )
    ) {

        return true;
    }


    /*
       Station-restricted users must have
       a station assigned.
    */

    if (
        isStationRestrictedRole(
            appUser.role
        )
    ) {

        if (!appUser.station_id) {
            return false;
        }

        return (
            String(appUser.station_id) ===
            String(stationId)
        );
    }


    return false;
}


/* =========================================================
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
   POST /api/meter-readings
   ========================================================= */

async function createMeterReading(
    req,
    res
) {

    try {

        console.log(
            "=========================================="
        );

        console.log(
            "FUELGAP - CREATE METER READING"
        );

        console.log(
            "=========================================="
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


        console.log(
            "AUTHENTICATED USER:",
            req.user.id
        );


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
            "APPLICATION USER:",
            {
                id:
                    appUser.id,

                organization_id:
                    appUser.organization_id,

                station_id:
                    appUser.station_id,

                role:
                    appUser.role
            }
        );


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

        if (
            !station_id ||
            !pump_id ||
            !nozzle_id ||
            !reading_type ||
            reading === undefined ||
            reading === null
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Station, pump, nozzle, reading type and reading are required"

            });

        }


        /* =====================================================
           READING TYPE
           ===================================================== */

        const normalizedReadingType =
            normalizeReadingType(
                reading_type
            );


        if (
            !VALID_READING_TYPES.includes(
                normalizedReadingType
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid reading type. Allowed values: opening, periodic, closing, correction"

            });

        }


        /* =====================================================
           READING VALUE
           ===================================================== */

        const numericReading =
            Number(reading);


        if (
            !Number.isFinite(
                numericReading
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Meter reading must be a valid number"

            });

        }


        if (
            numericReading < 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Meter reading cannot be negative"

            });

        }


        /* =====================================================
           CAPTURED DATE

           Historical readings are supported.

           If captured_at is omitted,
           current time is used.

           This allows older meter records
           to be entered manually.
           ===================================================== */

        let finalCapturedAt =
            new Date();


        if (captured_at) {

            const parsedCapturedAt =
                new Date(
                    captured_at
                );


            if (
                Number.isNaN(
                    parsedCapturedAt.getTime()
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid captured_at date"

                });

            }


            finalCapturedAt =
                parsedCapturedAt;

        }


        /* =====================================================
           STATION

           IMPORTANT:

           stations table uses:
               is_active

           NOT:
               status
           ===================================================== */

        console.log(
            "VERIFYING STATION:",
            station_id
        );


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
            .eq(
                "id",
                station_id
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "CREATE READING STATION ERROR:",
                stationError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify station",

                error:
                    stationError.message

            });

        }


        if (!station) {

            return res.status(404).json({

                success: false,

                message:
                    "Station not found"

            });

        }


        console.log(
            "STATION VERIFIED:",
            {
                id:
                    station.id,

                organization_id:
                    station.organization_id,

                name:
                    station.name,

                is_active:
                    station.is_active
            }
        );


        /* =====================================================
           ORGANIZATION SECURITY
           ===================================================== */

        if (
            !appUser.organization_id ||
            String(station.organization_id) !==
                String(appUser.organization_id)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You do not have access to this station"

            });

        }


        /* =====================================================
           STATION STATUS
           ===================================================== */

        if (
            station.is_active === false
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "This station is inactive"

            });

        }


        /* =====================================================
           STATION ASSIGNMENT SECURITY
           ===================================================== */

        if (
            !userCanAccessStation(
                appUser,
                station_id
            )
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You are not assigned to this station"

            });

        }


        /* =====================================================
           PUMP

           IMPORTANT:

           pumps table uses:
               is_active

           NOT:
               status
           ===================================================== */

        console.log(
            "VERIFYING PUMP:",
            pump_id
        );


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
            .eq(
                "id",
                pump_id
            )
            .maybeSingle();


        if (pumpError) {

            console.error(
                "CREATE READING PUMP ERROR:",
                pumpError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify pump",

                error:
                    pumpError.message

            });

        }


        if (!pump) {

            return res.status(404).json({

                success: false,

                message:
                    "Pump not found"

            });

        }


        if (
            String(pump.station_id) !==
            String(station_id)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "The selected pump does not belong to this station"

            });

        }


        /* =====================================================
           PUMP ACTIVE CHECK

           Database uses boolean is_active.
           ===================================================== */

        if (
            pump.is_active === false
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "This pump is inactive"

            });

        }


        console.log(
            "PUMP VERIFIED:",
            {
                id:
                    pump.id,

                pump_number:
                    pump.pump_number,

                is_active:
                    pump.is_active
            }
        );


        /* =====================================================
           NOZZLE

           IMPORTANT:

           nozzles table uses:
               product
               is_active

           NOT:
               fuel_type
               status
           ===================================================== */

        console.log(
            "VERIFYING NOZZLE:",
            nozzle_id
        );


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
            .eq(
                "id",
                nozzle_id
            )
            .maybeSingle();


        if (nozzleError) {

            console.error(
                "CREATE READING NOZZLE ERROR:",
                nozzleError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify nozzle",

                error:
                    nozzleError.message

            });

        }


        if (!nozzle) {

            return res.status(404).json({

                success: false,

                message:
                    "Nozzle not found"

            });

        }


        if (
            String(nozzle.pump_id) !==
            String(pump_id)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "The selected nozzle does not belong to this pump"

            });

        }


        /* =====================================================
           NOZZLE ACTIVE CHECK

           Database uses boolean is_active.
           ===================================================== */

        if (
            nozzle.is_active === false
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "This nozzle is inactive"

            });

        }


        console.log(
            "NOZZLE VERIFIED:",
            {
                id:
                    nozzle.id,

                nozzle_number:
                    nozzle.nozzle_number,

                product:
                    nozzle.product,

                is_active:
                    nozzle.is_active
            }
        );


        /* =====================================================
           SHIFT VALIDATION
           ===================================================== */

        let finalShiftId = null;


        if (shift_id) {

            console.log(
                "VERIFYING SHIFT:",
                shift_id
            );


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
                .eq(
                    "id",
                    shift_id
                )
                .maybeSingle();


            if (shiftError) {

                console.error(
                    "CREATE READING SHIFT ERROR:",
                    shiftError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to verify shift",

                    error:
                        shiftError.message

                });

            }


            if (!shift) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Shift not found"

                });

            }


            if (
                String(shift.station_id) !==
                String(station_id)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "The selected shift does not belong to this station"

                });

            }


            const shiftStatus =
                shift.status
                    ? String(
                        shift.status
                    ).trim().toLowerCase()
                    : "";


            /* =================================================
               SHIFT STATUS

               Your shifts table uses:

               scheduled
               open
               closed
               cancelled

               For normal meter readings:
               - open = allowed
               - closed = allowed

               Closed is allowed because historical
               meter readings can be entered later.

               Correction readings do not require
               an active shift.
               ================================================= */

            if (
                normalizedReadingType !==
                    "correction"
            ) {

                if (
                    ![
                        "open",
                        "closed"
                    ].includes(
                        shiftStatus
                    )
                ) {

                    return res.status(400).json({

                        success: false,

                        message:
                            "The selected shift must be open or closed for this meter reading"

                    });

                }

            }


            finalShiftId =
                shift.id;


            console.log(
                "SHIFT VERIFIED:",
                {
                    id:
                        shift.id,

                    shift_name:
                        shift.shift_name,

                    shift_date:
                        shift.shift_date,

                    status:
                        shift.status
                }
            );

        }


        /* =====================================================
           PHOTO URL

           Evidence is OPTIONAL.

           A reading can be created with:
               photo_url = null

           This supports older records and
           historical gap entries.
           ===================================================== */

        let finalPhotoUrl =
            null;


        if (
            photo_url !== undefined &&
            photo_url !== null
        ) {

            const cleanedPhotoUrl =
                String(
                    photo_url
                ).trim();


            if (
                cleanedPhotoUrl.length > 0
            ) {

                finalPhotoUrl =
                    cleanedPhotoUrl;

            }

        }


        /* =====================================================
           INSERT DATA
           ===================================================== */

        const insertData = {

            station_id,

            pump_id,

            nozzle_id,

            recorded_by:
                appUser.id,

            reading_type:
                normalizedReadingType,

            reading:
                numericReading,

            shift_id:
                finalShiftId,

            photo_url:
                finalPhotoUrl,

            captured_at:
                finalCapturedAt.toISOString()

        };


        console.log(
            "CREATING METER READING:",
            insertData
        );


        /* =====================================================
           INSERT READING
           ===================================================== */

        const {
            data: createdReading,
            error: insertError
        } = await supabaseAdmin
            .from("meter_readings")
            .insert(
                insertData
            )
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
                "CREATE METER READING DATABASE ERROR:",
                insertError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to create meter reading",

                error:
                    insertError.message

            });

        }


        console.log(
            "METER READING CREATED:",
            createdReading.id
        );


        /* =====================================================
           SUCCESS
           ===================================================== */

        return res.status(201).json({

            success: true,

            message:
                "Meter reading created successfully",

            data:
                createdReading

        });

    } catch (error) {

        console.error(
            "CREATE METER READING UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unexpected error while creating meter reading",

            error:
                error.message

        });

    }

}


/* =========================================================
   GET ALL METER READINGS
   GET /api/meter-readings
   ========================================================= */

async function getMeterReadings(
    req,
    res
) {

    try {

        console.log(
            "=========================================="
        );

        console.log(
            "FUELGAP - GET METER READINGS"
        );

        console.log(
            "=========================================="
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


        console.log(
            "AUTHENTICATED USER:",
            req.user.id
        );


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
           ORGANIZATION STATIONS
           ===================================================== */

        const {
            data: stations,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("id")
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

                message:
                    "Unable to load organization stations",

                error:
                    stationError.message

            });

        }


        const organizationStationIds =
            (stations || [])
                .map(
                    station =>
                        station.id
                );


        if (
            organizationStationIds.length ===
            0
        ) {

            return res.status(200).json({

                success: true,

                count: 0,

                data: []

            });

        }


        /* =====================================================
           STATION ACCESS
           ===================================================== */

        let allowedStationIds =
            organizationStationIds;


        if (
            isStationRestrictedRole(
                appUser.role
            )
        ) {

            if (
                !appUser.station_id
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Your account is not assigned to a station"

                });

            }


            if (
                !organizationStationIds.includes(
                    appUser.station_id
                )
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Your assigned station does not belong to your organization"

                });

            }


            allowedStationIds = [
                appUser.station_id
            ];

        }


        /* =====================================================
           GET READINGS
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
                allowedStationIds
            )
            .order(
                "captured_at",
                {
                    ascending: false
                }
            );


        if (error) {

            console.error(
                "GET METER READINGS DATABASE ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load meter readings",

                error:
                    error.message

            });

        }


        console.log(
            "METER READINGS FOUND:",
            data
                ? data.length
                : 0
        );


        return res.status(200).json({

            success: true,

            count:
                data
                    ? data.length
                    : 0,

            data:
                data || []

        });

    } catch (error) {

        console.error(
            "GET METER READINGS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unexpected error while loading meter readings",

            error:
                error.message

        });

    }

}


/* =========================================================
   GET SINGLE METER READING
   GET /api/meter-readings/:id
   ========================================================= */

async function getMeterReadingById(
    req,
    res
) {

    try {

        console.log(
            "=========================================="
        );

        console.log(
            "FUELGAP - GET SINGLE METER READING"
        );

        console.log(
            "=========================================="
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


        /* =====================================================
           READING ID
           ===================================================== */

        const readingId =
            req.params.id;


        if (!readingId) {

            return res.status(400).json({

                success: false,

                message:
                    "Meter reading ID is required"

            });

        }


        /* =====================================================
           GET READING
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
            .eq(
                "id",
                readingId
            )
            .maybeSingle();


        if (readingError) {

            console.error(
                "GET SINGLE METER READING ERROR:",
                readingError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load meter reading",

                error:
                    readingError.message

            });

        }


        if (!reading) {

            return res.status(404).json({

                success: false,

                message:
                    "Meter reading not found"

            });

        }


        /* =====================================================
           GET STATION
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
            .eq(
                "id",
                reading.station_id
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "GET SINGLE READING STATION ERROR:",
                stationError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify station",

                error:
                    stationError.message

            });

        }


        if (!station) {

            return res.status(404).json({

                success: false,

                message:
                    "Reading station not found"

            });

        }


        /* =====================================================
           ORGANIZATION SECURITY
           ===================================================== */

        if (
            String(station.organization_id) !==
            String(appUser.organization_id)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You do not have access to this reading"

            });

        }


        /* =====================================================
           STATION SECURITY
           ===================================================== */

        if (
            !userCanAccessStation(
                appUser,
                reading.station_id
            )
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You do not have access to this station"

            });

        }


        return res.status(200).json({

            success: true,

            data:
                reading

        });

    } catch (error) {

        console.error(
            "GET SINGLE METER READING UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unexpected error while loading meter reading",

            error:
                error.message

        });

    }

}


/* =========================================================
   DELETE METER READING
   DELETE /api/meter-readings/:id
   ========================================================= */

async function deleteMeterReading(
    req,
    res
) {

    try {

        console.log(
            "=========================================="
        );

        console.log(
            "FUELGAP - DELETE METER READING"
        );

        console.log(
            "=========================================="
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


        /* =====================================================
           DELETE PERMISSION
           ===================================================== */

        if (
            ![
                "owner",
                "admin",
                "super_admin"
            ].includes(
                appUser.role
            )
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You do not have permission to delete meter readings"

            });

        }


        /* =====================================================
           READING ID
           ===================================================== */

        const readingId =
            req.params.id;


        if (!readingId) {

            return res.status(400).json({

                success: false,

                message:
                    "Meter reading ID is required"

            });

        }


        /* =====================================================
           FIND READING
           ===================================================== */

        const {
            data: reading,
            error: readingError
        } = await supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id
            `)
            .eq(
                "id",
                readingId
            )
            .maybeSingle();


        if (readingError) {

            console.error(
                "DELETE METER READING LOOKUP ERROR:",
                readingError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to find meter reading",

                error:
                    readingError.message

            });

        }


        if (!reading) {

            return res.status(404).json({

                success: false,

                message:
                    "Meter reading not found"

            });

        }


        /* =====================================================
           VERIFY STATION
           ===================================================== */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id,
                is_active
            `)
            .eq(
                "id",
                reading.station_id
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "DELETE READING STATION ERROR:",
                stationError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify reading station",

                error:
                    stationError.message

            });

        }


        if (!station) {

            return res.status(404).json({

                success: false,

                message:
                    "Reading station not found"

            });

        }


        /* =====================================================
           ORGANIZATION SECURITY
           ===================================================== */

        if (
            String(station.organization_id) !==
            String(appUser.organization_id)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "You cannot delete a reading outside your organization"

            });

        }


        /* =====================================================
           DELETE READING
           ===================================================== */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("meter_readings")
            .delete()
            .eq(
                "id",
                readingId
            );


        if (deleteError) {

            console.error(
                "DELETE METER READING DATABASE ERROR:",
                deleteError
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete meter reading",

                error:
                    deleteError.message

            });

        }


        console.log(
            "METER READING DELETED:",
            readingId
        );


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

            message:
                "Unexpected error while deleting meter reading",

            error:
                error.message

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