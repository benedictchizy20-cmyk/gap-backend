/* =========================================================
   FUELGAP - SHIFT CONTROLLER
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
   JAVASCRIPT VERSION
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   HELPER - GET LAGOS TIME
========================================================= */

function getLagosTime() {

    const now = new Date();

    const lagosString =
        now.toLocaleString("en-US", {
            timeZone: "Africa/Lagos"
        });

    return new Date(lagosString).toISOString();
}


/* =========================================================
   HELPER - CONVERT DATE + TIME TO TIMESTAMPTZ
========================================================= */

function buildStartTimestamp(shiftDate, startTime) {

    if (!shiftDate || !startTime) {
        return null;
    }

    /*
        Frontend sends:

        shiftDate = 2026-09-10
        startTime = 06:00

        Lagos is UTC+01:00.

        We explicitly create:

        2026-09-10T06:00:00+01:00
    */

    const cleanDate =
        String(shiftDate).trim();

    const cleanTime =
        String(startTime).trim();


    /*
        Validate date.
    */

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)
    ) {
        return null;
    }


    /*
        Accept:

        06:00
        06:00:00
    */

    let normalizedTime =
        cleanTime;

    if (
        /^\d{2}:\d{2}$/.test(normalizedTime)
    ) {

        normalizedTime += ":00";
    }


    if (
        !/^\d{2}:\d{2}:\d{2}$/.test(
            normalizedTime
        )
    ) {

        return null;
    }


    /*
        Validate hour/minute/second.
    */

    const [
        hour,
        minute,
        second
    ] =
        normalizedTime
            .split(":")
            .map(Number);


    if (
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
    ) {

        return null;
    }


    /*
        Return Lagos timestamp.
    */

    return `${cleanDate}T${normalizedTime}+01:00`;
}


/* =========================================================
   HELPER - GET ORGANIZATION ID
========================================================= */

function getOrganizationId(req) {

    return (
        req.organizationId ||
        req.profile?.organization_id ||
        req.user?.organization_id ||
        null
    );
}


/* =========================================================
   HELPER - GET USER ROLE
========================================================= */

function getUserRole(req) {

    return String(
        req.userRole ||
        req.profile?.role ||
        req.user?.role ||
        ""
    )
        .toLowerCase()
        .trim();
}


/* =========================================================
   HELPER - GET USER PROFILE ID
========================================================= */

function getProfileId(req) {

    return (
        req.profile?.id ||
        req.user?.id ||
        null
    );
}


/* =========================================================
   CREATE SHIFT
   POST /api/shifts
========================================================= */

const createShift = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);

        const profileId =
            getProfileId(req);


        const {
            station_id,
            shift_name,
            shift_date,
            start_time
        } = req.body;


        /* -----------------------------------------
           AUTH VALIDATION
        ----------------------------------------- */

        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
            });
        }


        if (!profileId) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated profile could not be identified."
            });
        }


        /* -----------------------------------------
           INPUT VALIDATION
        ----------------------------------------- */

        if (!station_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Station is required."
            });
        }


        if (
            !shift_name ||
            !String(shift_name).trim()
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Shift name is required."
            });
        }


        if (!shift_date) {

            return res.status(400).json({
                success: false,
                message:
                    "Shift date is required."
            });
        }


        if (!start_time) {

            return res.status(400).json({
                success: false,
                message:
                    "Shift start time is required."
            });
        }


        /* -----------------------------------------
           BUILD START TIMESTAMP
        ----------------------------------------- */

        const startTimestamp =
            buildStartTimestamp(
                shift_date,
                start_time
            );


        if (!startTimestamp) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid shift date or start time."
            });
        }


        /* -----------------------------------------
           GET STATION
        ----------------------------------------- */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq("id", station_id)
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "CREATE SHIFT STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        /* -----------------------------------------
           ACTIVE STATION CHECK
        ----------------------------------------- */

        if (
            station.is_active === false
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Cannot create a shift for an inactive station."
            });
        }


        /* -----------------------------------------
           MANAGER / ATTENDANT STATION RESTRICTION
        ----------------------------------------- */

        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to create a shift for this station."
                });
            }
        }


        /* -----------------------------------------
           CHECK EXISTING ACTIVE SHIFT
        ----------------------------------------- */

        const {
            data: existingShifts,
            error: existingShiftError
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
                "station_id",
                station_id
            )
            .eq(
                "shift_date",
                shift_date
            )
            .in(
                "status",
                [
                    "scheduled",
                    "open"
                ]
            );


        if (existingShiftError) {

            console.error(
                "EXISTING SHIFT CHECK ERROR:",
                existingShiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to check existing shifts."
            });
        }


        /* -----------------------------------------
           DUPLICATE SHIFT CHECK
        ----------------------------------------- */

        if (
            existingShifts &&
            existingShifts.length > 0
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "An active shift already exists for this station on the selected date."
            });
        }


        /* -----------------------------------------
           CREATE SHIFT
        ----------------------------------------- */

        const {
            data: shift,
            error: createError
        } = await supabaseAdmin
            .from("shifts")
            .insert([
                {
                    station_id,

                    opened_by:
                        null,

                    closed_by:
                        null,

                    shift_name:
                        String(
                            shift_name
                        ).trim(),

                    shift_date,

                    /*
                        IMPORTANT:
                        Database expects TIMESTAMPTZ.
                    */

                    start_time:
                        startTimestamp,

                    end_shift:
                        null,

                    status:
                        "scheduled"
                }
            ])
            .select(`
                id,
                station_id,
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .single();


        if (createError) {

            console.error(
                "CREATE SHIFT ERROR:",
                createError
            );

            return res.status(500).json({
                success: false,
                message:
                    createError.message ||
                    "Unable to create shift."
            });
        }


        /* -----------------------------------------
           RESPONSE
        ----------------------------------------- */

        return res.status(201).json({

            success: true,

            message:
                "Shift created successfully.",

            data: {

                shift: {
                    ...shift,
                    station
                }

            }

        });

    } catch (error) {

        console.error(
            "CREATE SHIFT UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to create shift."
        });
    }
};


/* =========================================================
   GET ALL SHIFTS
   GET /api/shifts
========================================================= */

const getShifts = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
            });
        }


        /* -----------------------------------------
           GET ORGANIZATION STATIONS
        ----------------------------------------- */

        const {
            data: stations,
            error: stationsError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "organization_id",
                organizationId
            );


        if (stationsError) {

            console.error(
                "GET SHIFTS STATIONS ERROR:",
                stationsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load stations."
            });
        }


        const stationMap =
            new Map();


        (stations || []).forEach(
            station => {

                stationMap.set(
                    String(station.id),
                    station
                );

            }
        );


        /* -----------------------------------------
           GET SHIFTS
        ----------------------------------------- */

        let query =
            supabaseAdmin
                .from("shifts")
                .select(`
                    id,
                    station_id,
                    opened_by,
                    closed_by,
                    shift_name,
                    shift_date,
                    start_time,
                    end_shift,
                    status,
                    created_at
                `)
                .order(
                    "shift_date",
                    {
                        ascending:
                            false
                    }
                )
                .order(
                    "start_time",
                    {
                        ascending:
                            false
                    }
                );


        /* -----------------------------------------
           ORGANIZATION FILTER
        ----------------------------------------- */

        const organizationStationIds =
            (stations || []).map(
                station =>
                    station.id
            );


        if (
            organizationStationIds.length === 0
        ) {

            return res.json({
                success: true,
                data: {
                    shifts: []
                }
            });
        }


        query =
            query.in(
                "station_id",
                organizationStationIds
            );


        /* -----------------------------------------
           MANAGER / ATTENDANT RESTRICTION
        ----------------------------------------- */

        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (!userStationId) {

                return res.json({
                    success: true,
                    data: {
                        shifts: []
                    }
                });
            }


            query =
                query.eq(
                    "station_id",
                    userStationId
                );
        }


        const {
            data: shifts,
            error: shiftsError
        } = await query;


        if (shiftsError) {

            console.error(
                "GET SHIFTS ERROR:",
                shiftsError
            );

            return res.status(500).json({
                success: false,
                message:
                    shiftsError.message ||
                    "Unable to load shifts."
            });
        }


        /* -----------------------------------------
           ATTACH STATION
        ----------------------------------------- */

        const formattedShifts =
            (shifts || []).map(
                shift => ({

                    ...shift,

                    station:
                        stationMap.get(
                            String(
                                shift.station_id
                            )
                        ) || null

                })
            );


        return res.json({

            success: true,

            data: {

                shifts:
                    formattedShifts

            }

        });

    } catch (error) {

        console.error(
            "GET SHIFTS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load shifts."
        });
    }
};


/* =========================================================
   GET SHIFT BY ID
   GET /api/shifts/:id
========================================================= */

const getShiftById = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
            });
        }


        if (!shiftId) {

            return res.status(400).json({
                success: false,
                message:
                    "Shift ID is required."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "GET SHIFT ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "GET SHIFT STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift does not belong to your organization."
            });
        }


        /* -----------------------------------------
           MANAGER / ATTENDANT RESTRICTION
        ----------------------------------------- */

        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to view this shift."
                });
            }
        }


        return res.json({

            success: true,

            data: {

                shift: {
                    ...shift,
                    station
                }

            }

        });

    } catch (error) {

        console.error(
            "GET SHIFT UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load shift."
        });
    }
};


/* =========================================================
   OPEN SHIFT
   PATCH /api/shifts/:id/open
========================================================= */

const openShift = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const profileId =
            getProfileId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;


        if (
            !organizationId ||
            !profileId
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication information is missing."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "OPEN SHIFT GET ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "OPEN SHIFT STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to open this shift."
                });
            }
        }


        if (
            shift.status !==
            "scheduled"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    `This shift cannot be opened because its current status is "${shift.status}".`
            });
        }


        /* -----------------------------------------
           CHECK ANOTHER OPEN SHIFT
        ----------------------------------------- */

        const {
            data: openShifts,
            error: openShiftError
        } = await supabaseAdmin
            .from("shifts")
            .select(
                "id, shift_name, status"
            )
            .eq(
                "station_id",
                shift.station_id
            )
            .eq(
                "status",
                "open"
            )
            .neq(
                "id",
                shiftId
            );


        if (openShiftError) {

            console.error(
                "OPEN SHIFT EXISTING ERROR:",
                openShiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to check for another open shift."
            });
        }


        if (
            openShifts &&
            openShifts.length > 0
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "Another shift is already open at this station."
            });
        }


        /* -----------------------------------------
           OPEN SHIFT
        ----------------------------------------- */

        const {
            data: updatedShift,
            error: updateError
        } = await supabaseAdmin
            .from("shifts")
            .update({

                status:
                    "open",

                opened_by:
                    profileId

            })
            .eq(
                "id",
                shiftId
            )
            .select(`
                id,
                station_id,
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .single();


        if (updateError) {

            console.error(
                "OPEN SHIFT UPDATE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message:
                    updateError.message ||
                    "Unable to open shift."
            });
        }


        return res.json({

            success: true,

            message:
                "Shift opened successfully.",

            data: {

                shift: {
                    ...updatedShift,
                    station
                }

            }

        });

    } catch (error) {

        console.error(
            "OPEN SHIFT UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to open shift."
        });
    }
};


/* =========================================================
   CLOSE SHIFT
   PATCH /api/shifts/:id/close
========================================================= */

const closeShift = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const profileId =
            getProfileId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;


        if (
            !organizationId ||
            !profileId
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication information is missing."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "CLOSE SHIFT GET ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "CLOSE SHIFT STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to close this shift."
                });
            }
        }


        if (
            shift.status !==
            "open"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    `This shift cannot be closed because its current status is "${shift.status}".`
            });
        }


        /* -----------------------------------------
           CLOSE SHIFT
        ----------------------------------------- */

        const {
            data: updatedShift,
            error: updateError
        } = await supabaseAdmin
            .from("shifts")
            .update({

                status:
                    "closed",

                closed_by:
                    profileId,

                end_shift:
                    getLagosTime()

            })
            .eq(
                "id",
                shiftId
            )
            .select(`
                id,
                station_id,
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .single();


        if (updateError) {

            console.error(
                "CLOSE SHIFT UPDATE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message:
                    updateError.message ||
                    "Unable to close shift."
            });
        }


        return res.json({

            success: true,

            message:
                "Shift closed successfully.",

            data: {

                shift: {
                    ...updatedShift,
                    station
                }

            }

        });

    } catch (error) {

        console.error(
            "CLOSE SHIFT UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to close shift."
        });
    }
};


/* =========================================================
   CANCEL SHIFT
   PATCH /api/shifts/:id/cancel
========================================================= */

const cancelShift = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "CANCEL SHIFT GET ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "CANCEL SHIFT STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to cancel this shift."
                });
            }
        }


        if (
            shift.status !==
            "scheduled"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    `This shift cannot be cancelled because its current status is "${shift.status}".`
            });
        }


        const {
            data: updatedShift,
            error: updateError
        } = await supabaseAdmin
            .from("shifts")
            .update({
                status:
                    "cancelled"
            })
            .eq(
                "id",
                shiftId
            )
            .select(`
                id,
                station_id,
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .single();


        if (updateError) {

            console.error(
                "CANCEL SHIFT UPDATE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message:
                    updateError.message ||
                    "Unable to cancel shift."
            });
        }


        return res.json({

            success: true,

            message:
                "Shift cancelled successfully.",

            data: {

                shift: {
                    ...updatedShift,
                    station
                }

            }

        });

    } catch (error) {

        console.error(
            "CANCEL SHIFT UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to cancel shift."
        });
    }
};


/* =========================================================
   ASSIGN SHIFT ATTENDANTS
   POST /api/shifts/:id/attendants
========================================================= */

const assignShiftAttendants = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;

        const {
            attendant_ids
        } = req.body;


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
            });
        }


        if (
            !Array.isArray(
                attendant_ids
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "attendant_ids must be an array."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "ASSIGN ATTENDANTS SHIFT ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "ASSIGN ATTENDANTS STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        if (
            userRole === "manager"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to assign attendants to this shift."
                });
            }
        }


        const uniqueAttendantIds =
            [
                ...new Set(
                    attendant_ids
                        .filter(Boolean)
                        .map(String)
                )
            ];


        if (
            uniqueAttendantIds.length === 0
        ) {

            return res.json({

                success: true,

                message:
                    "No attendants selected.",

                data: {
                    shift,
                    station,
                    attendants: []
                }

            });
        }


        /* -----------------------------------------
           VERIFY ATTENDANTS
        ----------------------------------------- */

        const {
            data: attendants,
            error: attendantsError
        } = await supabaseAdmin
            .from("users")
            .select(`
                id,
                full_name,
                email,
                role,
                station_id,
                is_active
            `)
            .in(
                "id",
                uniqueAttendantIds
            );


        if (attendantsError) {

            console.error(
                "ASSIGN ATTENDANTS USERS ERROR:",
                attendantsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify attendants."
            });
        }


        if (
            !attendants ||
            attendants.length !==
            uniqueAttendantIds.length
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "One or more selected attendants could not be found."
            });
        }


        /* -----------------------------------------
           VALIDATE ATTENDANTS
        ----------------------------------------- */

        for (
            const attendant of attendants
        ) {

            if (
                attendant.role !==
                "attendant"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `${attendant.full_name || "Selected user"} is not an attendant.`
                });
            }


            if (
                attendant.is_active === false
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `${attendant.full_name || "Selected attendant"} is inactive.`
                });
            }


            if (
                attendant.station_id &&
                String(
                    attendant.station_id
                ) !==
                String(
                    shift.station_id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `${attendant.full_name || "Selected attendant"} does not belong to this station.`
                });
            }
        }


        /* -----------------------------------------
           INSERT ASSIGNMENTS
        ----------------------------------------- */

        const assignments =
            uniqueAttendantIds.map(
                attendantId => ({

                    shift_id:
                        shiftId,

                    attendant_id:
                        attendantId

                })
            );


        const {
            error: assignmentError
        } = await supabaseAdmin
            .from("shift_attendants")
            .upsert(
                assignments,
                {
                    onConflict:
                        "shift_id,attendant_id"
                }
            );


        if (assignmentError) {

            console.error(
                "ASSIGN SHIFT ATTENDANTS ERROR:",
                assignmentError
            );

            return res.status(500).json({
                success: false,
                message:
                    assignmentError.message ||
                    "Unable to assign attendants."
            });
        }


        return res.json({

            success: true,

            message:
                "Attendants assigned successfully.",

            data: {
                shift,
                station,
                attendants
            }

        });

    } catch (error) {

        console.error(
            "ASSIGN ATTENDANTS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to assign attendants."
        });
    }
};


/* =========================================================
   GET SHIFT ATTENDANTS
   GET /api/shifts/:id/attendants
========================================================= */

const getShiftAttendants = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "GET SHIFT ATTENDANTS SHIFT ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "GET SHIFT ATTENDANTS STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        if (
            userRole === "manager" ||
            userRole === "attendant"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to view these attendants."
                });
            }
        }


        /* -----------------------------------------
           GET ASSIGNMENTS
        ----------------------------------------- */

        const {
            data: assignments,
            error: assignmentsError
        } = await supabaseAdmin
            .from("shift_attendants")
            .select(`
                id,
                shift_id,
                attendant_id,
                assigned_at
            `)
            .eq(
                "shift_id",
                shiftId
            );


        if (assignmentsError) {

            console.error(
                "GET SHIFT ATTENDANTS ERROR:",
                assignmentsError
            );

            return res.status(500).json({
                success: false,
                message:
                    assignmentsError.message ||
                    "Unable to load shift attendants."
            });
        }


        const attendantIds =
            (assignments || []).map(
                assignment =>
                    assignment.attendant_id
            );


        let attendants = [];


        if (
            attendantIds.length > 0
        ) {

            const {
                data: users,
                error: usersError
            } = await supabaseAdmin
                .from("users")
                .select(`
                    id,
                    full_name,
                    email,
                    role,
                    station_id,
                    is_active
                `)
                .in(
                    "id",
                    attendantIds
                );


            if (usersError) {

                console.error(
                    "GET SHIFT ATTENDANTS USERS ERROR:",
                    usersError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load attendant details."
                });
            }


            const userMap =
                new Map();


            (users || []).forEach(
                user => {

                    userMap.set(
                        String(user.id),
                        user
                    );

                }
            );


            attendants =
                (assignments || []).map(
                    assignment => ({

                        ...assignment,

                        attendant:
                            userMap.get(
                                String(
                                    assignment.attendant_id
                                )
                            ) || null

                    })
                );
        }


        return res.json({

            success: true,

            data: {

                shift,

                station,

                attendants

            }

        });

    } catch (error) {

        console.error(
            "GET SHIFT ATTENDANTS UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load shift attendants."
        });
    }
};


/* =========================================================
   REMOVE SHIFT ATTENDANT
   DELETE /api/shifts/:id/attendants/:attendantId
========================================================= */

const removeShiftAttendant = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userRole =
            getUserRole(req);

        const shiftId =
            req.params.id;

        const attendantId =
            req.params.attendantId;


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
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
                opened_by,
                closed_by,
                shift_name,
                shift_date,
                start_time,
                end_shift,
                status,
                created_at
            `)
            .eq(
                "id",
                shiftId
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "REMOVE ATTENDANT SHIFT ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load shift."
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found."
            });
        }


        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select(
                "id, organization_id"
            )
            .eq(
                "id",
                shift.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "REMOVE ATTENDANT STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify station."
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found."
            });
        }


        if (
            userRole === "manager"
        ) {

            const userStationId =
                req.stationId ||
                req.profile?.station_id ||
                req.user?.station_id ||
                null;


            if (
                !userStationId ||
                String(userStationId) !==
                String(shift.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to remove attendants from this shift."
                });
            }
        }


        const {
            error: deleteError
        } = await supabaseAdmin
            .from("shift_attendants")
            .delete()
            .eq(
                "shift_id",
                shiftId
            )
            .eq(
                "attendant_id",
                attendantId
            );


        if (deleteError) {

            console.error(
                "REMOVE SHIFT ATTENDANT ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    deleteError.message ||
                    "Unable to remove attendant."
            });
        }


        return res.json({

            success: true,

            message:
                "Attendant removed successfully."

        });

    } catch (error) {

        console.error(
            "REMOVE SHIFT ATTENDANT UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to remove attendant."
        });
    }
};


/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {

    createShift,

    getShifts,

    getShiftById,

    openShift,

    closeShift,

    cancelShift,

    assignShiftAttendants,

    getShiftAttendants,

    removeShiftAttendant

};