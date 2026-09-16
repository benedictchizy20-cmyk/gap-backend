const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   CREATE STATION
   POST /api/stations
========================================================= */

const createStation = async (req, res) => {
    try {
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
========================================================= */

const getStations = async (req, res) => {
    try {

        if (!req.organizationId) {
            return res.status(400).json({
                success: false,
                message: "User organization could not be determined"
            });
        }

        const {
            data: stations,
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
                "organization_id",
                req.organizationId
            )
            .order(
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

        return res.status(200).json({
            success: true,
            data: {
                stations,
                count: stations.length
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
========================================================= */

const getStationById = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });
        }

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
            .eq("id", id)
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

        if (!station) {
            return res.status(404).json({
                success: false,
                message: "Station not found"
            });
        }

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
========================================================= */

const updateStation = async (req, res) => {
    try {
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

            updateData.name = name.trim();
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
            if (typeof is_active !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "is_active must be true or false"
                });
            }

            updateData.is_active = is_active;
        }

        updateData.updated_at = new Date().toISOString();

        /* ---------------------------------------------
           UPDATE
        --------------------------------------------- */

        const {
            data: station,
            error
        } = await supabaseAdmin
            .from("stations")
            .update(updateData)
            .eq("id", id)
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

   NOTE:
   Because the database uses ON DELETE CASCADE,
   deleting a station will also delete its pumps,
   nozzles, shifts, readings, sales, payments and gaps.
========================================================= */

const deleteStation = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });
        }

        /* ---------------------------------------------
           CHECK STATION EXISTS
        --------------------------------------------- */

        const {
            data: station,
            error: findError
        } = await supabaseAdmin
            .from("stations")
            .select("id, name")
            .eq("id", id)
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
            .eq("id", id)
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


module.exports = {
    createStation,
    getStations,
    getStationById,
    updateStation,
    deleteStation
};