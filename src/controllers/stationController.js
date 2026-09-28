const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   HELPER
   CHECK IF CURRENT USER IS A MANAGER
========================================================= */

const isManager = (req) => {

    return String(req.userRole || "")
        .toLowerCase()
        .trim() === "manager";

};


/* =========================================================
   CREATE STATION
   POST /api/stations

   OWNER / ADMIN ONLY
========================================================= */

const createStation = async (req, res) => {

    try {

        /* ---------------------------------------------
           MANAGERS CANNOT CREATE STATIONS
        --------------------------------------------- */

        if (isManager(req)) {

            return res.status(403).json({
                success: false,
                message: "Managers cannot create stations"
            });

        }


        const {
            name,
            address,
            city,
            state
        } = req.body;


        /* ---------------------------------------------
           VALIDATION
        --------------------------------------------- */

        if (!name || !name.trim()) {

            return res.status(400).json({
                success: false,
                message: "Station name is required"
            });

        }


        if (!req.organizationId) {

            return res.status(400).json({
                success: false,
                message: "User organization could not be determined"
            });

        }


        /* ---------------------------------------------
           CREATE STATION
        --------------------------------------------- */

        const {
            data: station,
            error
        } = await supabaseAdmin
            .from("stations")
            .insert([
                {
                    organization_id: req.organizationId,

                    name: name.trim(),

                    address: address
                        ? address.trim()
                        : null,

                    city: city
                        ? city.trim()
                        : null,

                    state: state
                        ? state.trim()
                        : null,

                    is_active: true
                }
            ])
            .select()
            .single();


        if (error) {

            console.error(
                "CREATE STATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to create station",
                error: error.message
            });

        }


        /* ---------------------------------------------
           RESPONSE
        --------------------------------------------- */

        return res.status(201).json({

            success: true,

            message: "Station created successfully",

            data: {
                station
            }

        });


    } catch (error) {

        console.error(
            "CREATE STATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Something went wrong while creating station"
        });

    }

};


/* =========================================================
   GET ALL STATIONS
   GET /api/stations

   OWNER / ADMIN
   → ALL ORGANIZATION STATIONS

   MANAGER
   → ONLY ASSIGNED STATION
========================================================= */

const getStations = async (req, res) => {

    try {

        /* ---------------------------------------------
           ORGANIZATION CHECK
        --------------------------------------------- */

        if (!req.organizationId) {

            return res.status(400).json({
                success: false,
                message: "User organization could not be determined"
            });

        }


        /* ---------------------------------------------
           START QUERY
        --------------------------------------------- */

        let query = supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id,
                name,
                address,
                city,
                state,
                is_active,
                created_at,
                updated_at
            `)
            .eq(
                "organization_id",
                req.organizationId
            );


        /* ---------------------------------------------
           MANAGER RESTRICTION
        --------------------------------------------- */

        if (isManager(req)) {

            /* -----------------------------------------
               MANAGER MUST HAVE ASSIGNED STATION
            ----------------------------------------- */

            if (!req.stationId) {

                console.warn(
                    "MANAGER HAS NO ASSIGNED STATION:",
                    req.user?.id
                );

                return res.status(200).json({

                    success: true,

                    data: {
                        stations: [],
                        count: 0
                    }

                });

            }


            /* -----------------------------------------
               ONLY MANAGER'S ASSIGNED STATION
            ----------------------------------------- */

            query = query.eq(
                "id",
                req.stationId
            );

        }


        /* ---------------------------------------------
           LOAD STATIONS
        --------------------------------------------- */

        const {
            data: stations,
            error
        } = await query.order(
            "created_at",
            {
                ascending: false
            }
        );


        if (error) {

            console.error(
                "GET STATIONS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load stations",
                error: error.message
            });

        }


        /* ---------------------------------------------
           RESPONSE
        --------------------------------------------- */

        return res.status(200).json({

            success: true,

            data: {

                stations: stations || [],

                count: stations
                    ? stations.length
                    : 0

            }

        });


    } catch (error) {

        console.error(
            "GET STATIONS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Something went wrong while loading stations"
        });

    }

};


/* =========================================================
   GET ONE STATION
   GET /api/stations/:id

   MANAGER
   → ONLY THEIR ASSIGNED STATION
========================================================= */

const getStationById = async (req, res) => {

    try {

        const {
            id
        } = req.params;


        /* ---------------------------------------------
           VALIDATION
        --------------------------------------------- */

        if (!id) {

            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });

        }


        /* ---------------------------------------------
           MANAGER ACCESS CHECK
        --------------------------------------------- */

        if (isManager(req)) {

            /* -----------------------------------------
               NO ASSIGNED STATION
            ----------------------------------------- */

            if (!req.stationId) {

                return res.status(403).json({
                    success: false,
                    message: "No station is assigned to this manager"
                });

            }


            /* -----------------------------------------
               WRONG STATION
            ----------------------------------------- */

            if (
                String(id) !==
                String(req.stationId)
            ) {

                return res.status(403).json({
                    success: false,
                    message: "You do not have access to this station"
                });

            }

        }


        /* ---------------------------------------------
           GET STATION
        --------------------------------------------- */

        const {
            data: station,
            error
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id,
                name,
                address,
                city,
                state,
                is_active,
                created_at,
                updated_at
            `)
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                req.organizationId
            )
            .maybeSingle();


        if (error) {

            console.error(
                "GET STATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load station",
                error: error.message
            });

        }


        /* ---------------------------------------------
           STATION NOT FOUND
        --------------------------------------------- */

        if (!station) {

            return res.status(404).json({
                success: false,
                message: "Station not found"
            });

        }


        /* ---------------------------------------------
           RESPONSE
        --------------------------------------------- */

        return res.status(200).json({

            success: true,

            data: {
                station
            }

        });


    } catch (error) {

        console.error(
            "GET STATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Something went wrong while loading station"
        });

    }

};


/* =========================================================
   UPDATE STATION
   PATCH /api/stations/:id

   MANAGERS CANNOT UPDATE STATIONS
========================================================= */

const updateStation = async (req, res) => {

    try {

        /* ---------------------------------------------
           MANAGER RESTRICTION
        --------------------------------------------- */

        if (isManager(req)) {

            return res.status(403).json({
                success: false,
                message: "Managers cannot update stations"
            });

        }


        const {
            id
        } = req.params;


        const {
            name,
            address,
            city,
            state,
            is_active
        } = req.body;


        /* ---------------------------------------------
           VALIDATION
        --------------------------------------------- */

        if (!id) {

            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });

        }


        /* ---------------------------------------------
           BUILD UPDATE OBJECT
        --------------------------------------------- */

        const updateData = {};


        if (name !== undefined) {

            if (!name.trim()) {

                return res.status(400).json({
                    success: false,
                    message: "Station name cannot be empty"
                });

            }

            updateData.name =
                name.trim();

        }


        if (address !== undefined) {

            updateData.address =
                address
                    ? address.trim()
                    : null;

        }


        if (city !== undefined) {

            updateData.city =
                city
                    ? city.trim()
                    : null;

        }


        if (state !== undefined) {

            updateData.state =
                state
                    ? state.trim()
                    : null;

        }


        if (is_active !== undefined) {

            if (
                typeof is_active !==
                "boolean"
            ) {

                return res.status(400).json({
                    success: false,
                    message: "is_active must be true or false"
                });

            }

            updateData.is_active =
                is_active;

        }


        updateData.updated_at =
            new Date().toISOString();


        /* ---------------------------------------------
           UPDATE STATION
        --------------------------------------------- */

        const {
            data: station,
            error
        } = await supabaseAdmin
            .from("stations")
            .update(updateData)
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                req.organizationId
            )
            .select()
            .maybeSingle();


        if (error) {

            console.error(
                "UPDATE STATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update station",
                error: error.message
            });

        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message: "Station not found"
            });

        }


        /* ---------------------------------------------
           RESPONSE
        --------------------------------------------- */

        return res.status(200).json({

            success: true,

            message: "Station updated successfully",

            data: {
                station
            }

        });


    } catch (error) {

        console.error(
            "UPDATE STATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Something went wrong while updating station"
        });

    }

};


/* =========================================================
   DELETE STATION
   DELETE /api/stations/:id

   MANAGERS CANNOT DELETE STATIONS
========================================================= */

const deleteStation = async (req, res) => {

    try {

        /* ---------------------------------------------
           MANAGER RESTRICTION
        --------------------------------------------- */

        if (isManager(req)) {

            return res.status(403).json({
                success: false,
                message: "Managers cannot delete stations"
            });

        }


        const {
            id
        } = req.params;


        /* ---------------------------------------------
           VALIDATION
        --------------------------------------------- */

        if (!id) {

            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });

        }


        /* ---------------------------------------------
           FIND STATION
        --------------------------------------------- */

        const {
            data: station,
            error: findError
        } = await supabaseAdmin
            .from("stations")
            .select(
                "id, name"
            )
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                req.organizationId
            )
            .maybeSingle();


        if (findError) {

            console.error(
                "FIND STATION ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to find station"
            });

        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message: "Station not found"
            });

        }


        /* ---------------------------------------------
           DELETE
        --------------------------------------------- */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("stations")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                req.organizationId
            );


        if (deleteError) {

            console.error(
                "DELETE STATION ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to delete station",
                error: deleteError.message
            });

        }


        /* ---------------------------------------------
           RESPONSE
        --------------------------------------------- */

        return res.status(200).json({

            success: true,

            message: "Station deleted successfully"

        });


    } catch (error) {

        console.error(
            "DELETE STATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Something went wrong while deleting station"
        });

    }

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

    createStation,

    getStations,

    getStationById,

    updateStation,

    deleteStation

};