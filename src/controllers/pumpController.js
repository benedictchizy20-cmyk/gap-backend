const supabaseAdmin = require("../config/supabaseAdmin");

/*
==================================================
CREATE PUMP
POST /api/pumps
==================================================
*/
const createPump = async (req, res) => {
    try {
        const {
            station_id,
            pump_number,
            brand,
            model
        } = req.body;

        if (!station_id) {
            return res.status(400).json({
                success: false,
                message: "station_id is required"
            });
        }

        if (!pump_number) {
            return res.status(400).json({
                success: false,
                message: "pump_number is required"
            });
        }

        /*
        ------------------------------------------
        VERIFY STATION BELONGS TO ORGANIZATION
        ------------------------------------------
        */
        const { data: station, error: stationError } =
            await supabaseAdmin
                .from("stations")
                .select("id, organization_id, name, is_active")
                .eq("id", station_id)
                .eq("organization_id", req.organizationId)
                .maybeSingle();

        if (stationError) {
            console.error("STATION CHECK ERROR:", stationError);

            return res.status(500).json({
                success: false,
                message: "Unable to verify station"
            });
        }

        if (!station) {
            return res.status(404).json({
                success: false,
                message: "Station not found"
            });
        }

        if (!station.is_active) {
            return res.status(400).json({
                success: false,
                message: "Cannot add a pump to an inactive station"
            });
        }

        /*
        ------------------------------------------
        CHECK DUPLICATE PUMP NUMBER
        ------------------------------------------
        */
        const { data: existingPump, error: existingError } =
            await supabaseAdmin
                .from("pumps")
                .select("id")
                .eq("station_id", station_id)
                .eq("pump_number", pump_number)
                .maybeSingle();

        if (existingError) {
            console.error("EXISTING PUMP CHECK ERROR:", existingError);

            return res.status(500).json({
                success: false,
                message: "Unable to check existing pump"
            });
        }

        if (existingPump) {
            return res.status(409).json({
                success: false,
                message: "A pump with this number already exists at this station"
            });
        }

        /*
        ------------------------------------------
        CREATE PUMP
        ------------------------------------------
        */
        const { data: pump, error: pumpError } =
            await supabaseAdmin
                .from("pumps")
                .insert({
                    station_id,
                    pump_number: String(pump_number).trim(),
                    brand: brand ? String(brand).trim() : null,
                    model: model ? String(model).trim() : null,
                    is_active: true
                })
                .select()
                .single();

        if (pumpError) {
            console.error("PUMP CREATION ERROR:", pumpError);

            return res.status(500).json({
                success: false,
                message: "Unable to create pump"
            });
        }

        return res.status(201).json({
            success: true,
            message: "Pump created successfully",
            data: {
                pump
            }
        });

    } catch (error) {
        console.error("CREATE PUMP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
GET ALL PUMPS FOR ORGANIZATION
GET /api/pumps
==================================================
*/
const getPumps = async (req, res) => {
    try {
        const { station_id } = req.query;

        let query = supabaseAdmin
            .from("pumps")
            .select(`
                id,
                station_id,
                pump_number,
                brand,
                model,
                is_active,
                created_at,
                updated_at,
                stations!inner(
                    id,
                    organization_id,
                    name
                )
            `)
            .eq(
                "stations.organization_id",
                req.organizationId
            );

        if (station_id) {
            query = query.eq("station_id", station_id);
        }

        const { data: pumps, error } = await query
            .order("pump_number", {
                ascending: true
            });

        if (error) {
            console.error("GET PUMPS ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to fetch pumps"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                pumps
            }
        });

    } catch (error) {
        console.error("GET PUMPS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
GET SINGLE PUMP
GET /api/pumps/:id
==================================================
*/
const getPumpById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: pump, error } =
            await supabaseAdmin
                .from("pumps")
                .select(`
                    id,
                    station_id,
                    pump_number,
                    brand,
                    model,
                    is_active,
                    created_at,
                    updated_at,
                    stations!inner(
                        id,
                        organization_id,
                        name
                    )
                `)
                .eq("id", id)
                .eq(
                    "stations.organization_id",
                    req.organizationId
                )
                .maybeSingle();

        if (error) {
            console.error("GET PUMP ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to fetch pump"
            });
        }

        if (!pump) {
            return res.status(404).json({
                success: false,
                message: "Pump not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                pump
            }
        });

    } catch (error) {
        console.error("GET PUMP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
UPDATE PUMP
PATCH /api/pumps/:id
==================================================
*/
const updatePump = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            pump_number,
            brand,
            model,
            is_active
        } = req.body;

        /*
        ------------------------------------------
        VERIFY PUMP BELONGS TO ORGANIZATION
        ------------------------------------------
        */
        const { data: existingPump, error: existingError } =
            await supabaseAdmin
                .from("pumps")
                .select(`
                    id,
                    station_id,
                    stations!inner(
                        organization_id
                    )
                `)
                .eq("id", id)
                .eq(
                    "stations.organization_id",
                    req.organizationId
                )
                .maybeSingle();

        if (existingError) {
            console.error(
                "UPDATE PUMP CHECK ERROR:",
                existingError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify pump"
            });
        }

        if (!existingPump) {
            return res.status(404).json({
                success: false,
                message: "Pump not found"
            });
        }

        const updateData = {};

        if (pump_number !== undefined) {
            updateData.pump_number =
                String(pump_number).trim();
        }

        if (brand !== undefined) {
            updateData.brand =
                brand ? String(brand).trim() : null;
        }

        if (model !== undefined) {
            updateData.model =
                model ? String(model).trim() : null;
        }

        if (is_active !== undefined) {
            updateData.is_active = Boolean(is_active);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields provided for update"
            });
        }

        /*
        ------------------------------------------
        CHECK DUPLICATE NUMBER
        ------------------------------------------
        */
        if (pump_number !== undefined) {
            const { data: duplicatePump, error: duplicateError } =
                await supabaseAdmin
                    .from("pumps")
                    .select("id")
                    .eq(
                        "station_id",
                        existingPump.station_id
                    )
                    .eq(
                        "pump_number",
                        String(pump_number).trim()
                    )
                    .neq("id", id)
                    .maybeSingle();

            if (duplicateError) {
                console.error(
                    "DUPLICATE PUMP CHECK ERROR:",
                    duplicateError
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to check pump number"
                });
            }

            if (duplicatePump) {
                return res.status(409).json({
                    success: false,
                    message: "Another pump already uses this number"
                });
            }
        }

        const { data: pump, error: updateError } =
            await supabaseAdmin
                .from("pumps")
                .update(updateData)
                .eq("id", id)
                .select()
                .single();

        if (updateError) {
            console.error(
                "UPDATE PUMP ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update pump"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Pump updated successfully",
            data: {
                pump
            }
        });

    } catch (error) {
        console.error("UPDATE PUMP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
DELETE PUMP
DELETE /api/pumps/:id
==================================================
*/
const deletePump = async (req, res) => {
    try {
        const { id } = req.params;

        /*
        ------------------------------------------
        VERIFY PUMP BELONGS TO ORGANIZATION
        ------------------------------------------
        */
        const { data: pump, error: pumpError } =
            await supabaseAdmin
                .from("pumps")
                .select(`
                    id,
                    station_id,
                    stations!inner(
                        organization_id
                    )
                `)
                .eq("id", id)
                .eq(
                    "stations.organization_id",
                    req.organizationId
                )
                .maybeSingle();

        if (pumpError) {
            console.error(
                "DELETE PUMP CHECK ERROR:",
                pumpError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify pump"
            });
        }

        if (!pump) {
            return res.status(404).json({
                success: false,
                message: "Pump not found"
            });
        }

        /*
        ------------------------------------------
        SOFT DELETE
        ------------------------------------------
        */
        const { error: deleteError } =
            await supabaseAdmin
                .from("pumps")
                .update({
                    is_active: false
                })
                .eq("id", id);

        if (deleteError) {
            console.error(
                "DELETE PUMP ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to deactivate pump"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Pump deactivated successfully"
        });

    } catch (error) {
        console.error("DELETE PUMP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


module.exports = {
    createPump,
    getPumps,
    getPumpById,
    updatePump,
    deletePump
};