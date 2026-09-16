const supabaseAdmin = require("../config/supabaseAdmin");

/*
==================================================
CREATE NOZZLE
POST /api/nozzles
==================================================
*/
const createNozzle = async (req, res) => {
    try {
        const {
            pump_id,
            nozzle_number,
            product,
            price_per_litre
        } = req.body;

        // ------------------------------------------
        // VALIDATION
        // ------------------------------------------

        if (!pump_id) {
            return res.status(400).json({
                success: false,
                message: "pump_id is required"
            });
        }

        if (!nozzle_number) {
            return res.status(400).json({
                success: false,
                message: "nozzle_number is required"
            });
        }

        if (!product) {
            return res.status(400).json({
                success: false,
                message: "product is required"
            });
        }

        const allowedProducts = [
            "PMS",
            "AGO",
            "DPK",
            "OTHER"
        ];

        if (!allowedProducts.includes(product)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product. Use PMS, AGO, DPK or OTHER"
            });
        }

        // ------------------------------------------
        // VALIDATE PRICE
        // ------------------------------------------

        let price = 0;

        if (price_per_litre !== undefined) {
            price = Number(price_per_litre);

            if (Number.isNaN(price) || price < 0) {
                return res.status(400).json({
                    success: false,
                    message: "price_per_litre must be a valid positive number"
                });
            }
        }

        // ------------------------------------------
        // VERIFY PUMP BELONGS TO ORGANIZATION
        // ------------------------------------------

        const { data: pump, error: pumpError } =
            await supabaseAdmin
                .from("pumps")
                .select(`
                    id,
                    station_id,
                    pump_number,
                    is_active,
                    stations!inner(
                        id,
                        organization_id,
                        name,
                        is_active
                    )
                `)
                .eq("id", pump_id)
                .eq(
                    "stations.organization_id",
                    req.organizationId
                )
                .maybeSingle();

        if (pumpError) {
            console.error(
                "PUMP CHECK ERROR:",
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

        // ------------------------------------------
        // CHECK PUMP STATUS
        // ------------------------------------------

        if (!pump.is_active) {
            return res.status(400).json({
                success: false,
                message: "Cannot add a nozzle to an inactive pump"
            });
        }

        // ------------------------------------------
        // CHECK STATION STATUS
        // ------------------------------------------

        if (!pump.stations.is_active) {
            return res.status(400).json({
                success: false,
                message: "Cannot add a nozzle to an inactive station"
            });
        }

        // ------------------------------------------
        // NORMALIZE NOZZLE NUMBER
        // ------------------------------------------

        const normalizedNozzleNumber =
            String(nozzle_number).trim();

        if (!normalizedNozzleNumber) {
            return res.status(400).json({
                success: false,
                message: "nozzle_number cannot be empty"
            });
        }

        // ------------------------------------------
        // CHECK DUPLICATE NOZZLE
        // ------------------------------------------

        const {
            data: existingNozzle,
            error: existingError
        } = await supabaseAdmin
            .from("nozzles")
            .select("id")
            .eq("pump_id", pump_id)
            .eq(
                "nozzle_number",
                normalizedNozzleNumber
            )
            .maybeSingle();

        if (existingError) {
            console.error(
                "EXISTING NOZZLE CHECK ERROR:",
                existingError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to check existing nozzle"
            });
        }

        if (existingNozzle) {
            return res.status(409).json({
                success: false,
                message:
                    "A nozzle with this number already exists on this pump"
            });
        }

        // ------------------------------------------
        // CREATE NOZZLE
        // ------------------------------------------

        const {
            data: nozzle,
            error: nozzleError
        } = await supabaseAdmin
            .from("nozzles")
            .insert({
                pump_id: pump_id,
                nozzle_number: normalizedNozzleNumber,
                product: product,
                price_per_litre: price,
                is_active: true
            })
            .select()
            .single();

        if (nozzleError) {
            console.error(
                "NOZZLE CREATION ERROR:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to create nozzle"
            });
        }

        return res.status(201).json({
            success: true,
            message: "Nozzle created successfully",
            data: {
                nozzle
            }
        });

    } catch (error) {
        console.error(
            "CREATE NOZZLE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
GET ALL NOZZLES
GET /api/nozzles
GET /api/nozzles?pump_id=...
==================================================
*/
const getNozzles = async (req, res) => {
    try {
        const {
            pump_id,
            station_id
        } = req.query;

        let query = supabaseAdmin
            .from("nozzles")
            .select(`
                id,
                pump_id,
                nozzle_number,
                product,
                price_per_litre,
                is_active,
                created_at,
                pumps!inner(
                    id,
                    station_id,
                    pump_number,
                    brand,
                    model,
                    stations!inner(
                        id,
                        organization_id,
                        name
                    )
                )
            `)
            .eq(
                "pumps.stations.organization_id",
                req.organizationId
            );

        // ------------------------------------------
        // FILTER BY PUMP
        // ------------------------------------------

        if (pump_id) {
            query = query.eq(
                "pump_id",
                pump_id
            );
        }

        // ------------------------------------------
        // FILTER BY STATION
        // ------------------------------------------

        if (station_id) {
            query = query.eq(
                "pumps.station_id",
                station_id
            );
        }

        const {
            data: nozzles,
            error
        } = await query
            .order("nozzle_number", {
                ascending: true
            });

        if (error) {
            console.error(
                "GET NOZZLES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to fetch nozzles"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                nozzles
            }
        });

    } catch (error) {
        console.error(
            "GET NOZZLES ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
GET NOZZLE BY ID
GET /api/nozzles/:id
==================================================
*/
const getNozzleById = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        const {
            data: nozzle,
            error
        } = await supabaseAdmin
            .from("nozzles")
            .select(`
                id,
                pump_id,
                nozzle_number,
                product,
                price_per_litre,
                is_active,
                created_at,
                pumps!inner(
                    id,
                    station_id,
                    pump_number,
                    brand,
                    model,
                    stations!inner(
                        id,
                        organization_id,
                        name
                    )
                )
            `)
            .eq("id", id)
            .eq(
                "pumps.stations.organization_id",
                req.organizationId
            )
            .maybeSingle();

        if (error) {
            console.error(
                "GET NOZZLE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to fetch nozzle"
            });
        }

        if (!nozzle) {
            return res.status(404).json({
                success: false,
                message: "Nozzle not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                nozzle
            }
        });

    } catch (error) {
        console.error(
            "GET NOZZLE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
UPDATE NOZZLE
PATCH /api/nozzles/:id
==================================================
*/
const updateNozzle = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        const {
            nozzle_number,
            product,
            price_per_litre,
            is_active
        } = req.body;

        // ------------------------------------------
        // FIND EXISTING NOZZLE
        // ------------------------------------------

        const {
            data: existingNozzle,
            error: existingError
        } = await supabaseAdmin
            .from("nozzles")
            .select(`
                id,
                pump_id,
                nozzle_number,
                product,
                price_per_litre,
                is_active,
                pumps!inner(
                    id,
                    station_id,
                    stations!inner(
                        organization_id
                    )
                )
            `)
            .eq("id", id)
            .eq(
                "pumps.stations.organization_id",
                req.organizationId
            )
            .maybeSingle();

        if (existingError) {
            console.error(
                "UPDATE NOZZLE CHECK ERROR:",
                existingError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify nozzle"
            });
        }

        if (!existingNozzle) {
            return res.status(404).json({
                success: false,
                message: "Nozzle not found"
            });
        }

        // ------------------------------------------
        // PREPARE UPDATE DATA
        // ------------------------------------------

        const updateData = {};

        // ------------------------------------------
        // NOZZLE NUMBER
        // ------------------------------------------

        if (nozzle_number !== undefined) {
            const normalizedNumber =
                String(nozzle_number).trim();

            if (!normalizedNumber) {
                return res.status(400).json({
                    success: false,
                    message: "nozzle_number cannot be empty"
                });
            }

            updateData.nozzle_number =
                normalizedNumber;
        }

        // ------------------------------------------
        // PRODUCT
        // ------------------------------------------

        if (product !== undefined) {
            const allowedProducts = [
                "PMS",
                "AGO",
                "DPK",
                "OTHER"
            ];

            if (!allowedProducts.includes(product)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid product. Use PMS, AGO, DPK or OTHER"
                });
            }

            updateData.product = product;
        }

        // ------------------------------------------
        // PRICE
        // ------------------------------------------

        if (price_per_litre !== undefined) {
            const price =
                Number(price_per_litre);

            if (
                Number.isNaN(price) ||
                price < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "price_per_litre must be a valid positive number"
                });
            }

            updateData.price_per_litre =
                price;
        }

        // ------------------------------------------
        // ACTIVE STATUS
        // ------------------------------------------

        if (is_active !== undefined) {
            if (
                typeof is_active !== "boolean"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "is_active must be true or false"
                });
            }

            updateData.is_active =
                is_active;
        }

        // ------------------------------------------
        // CHECK EMPTY UPDATE
        // ------------------------------------------

        if (
            Object.keys(updateData).length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "No fields provided for update"
            });
        }

        // ------------------------------------------
        // CHECK DUPLICATE NOZZLE NUMBER
        // ------------------------------------------

        if (
            nozzle_number !== undefined
        ) {
            const {
                data: duplicateNozzle,
                error: duplicateError
            } = await supabaseAdmin
                .from("nozzles")
                .select("id")
                .eq(
                    "pump_id",
                    existingNozzle.pump_id
                )
                .eq(
                    "nozzle_number",
                    String(nozzle_number).trim()
                )
                .neq("id", id)
                .maybeSingle();

            if (duplicateError) {
                console.error(
                    "DUPLICATE NOZZLE CHECK ERROR:",
                    duplicateError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to check nozzle number"
                });
            }

            if (duplicateNozzle) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Another nozzle already uses this number on this pump"
                });
            }
        }

        // ------------------------------------------
        // UPDATE NOZZLE
        // ------------------------------------------

        const {
            data: nozzle,
            error: updateError
        } = await supabaseAdmin
            .from("nozzles")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (updateError) {
            console.error(
                "UPDATE NOZZLE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update nozzle"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Nozzle updated successfully",
            data: {
                nozzle
            }
        });

    } catch (error) {
        console.error(
            "UPDATE NOZZLE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/*
==================================================
DELETE / DEACTIVATE NOZZLE
DELETE /api/nozzles/:id
==================================================
*/
const deleteNozzle = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        // ------------------------------------------
        // VERIFY NOZZLE
        // ------------------------------------------

        const {
            data: nozzle,
            error: nozzleError
        } = await supabaseAdmin
            .from("nozzles")
            .select(`
                id,
                pump_id,
                is_active,
                pumps!inner(
                    id,
                    station_id,
                    stations!inner(
                        organization_id
                    )
                )
            `)
            .eq("id", id)
            .eq(
                "pumps.stations.organization_id",
                req.organizationId
            )
            .maybeSingle();

        if (nozzleError) {
            console.error(
                "DELETE NOZZLE CHECK ERROR:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify nozzle"
            });
        }

        if (!nozzle) {
            return res.status(404).json({
                success: false,
                message: "Nozzle not found"
            });
        }

        // ------------------------------------------
        // DEACTIVATE
        // ------------------------------------------

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("nozzles")
            .update({
                is_active: false
            })
            .eq("id", id);

        if (deleteError) {
            console.error(
                "DELETE NOZZLE ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to deactivate nozzle"
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Nozzle deactivated successfully"
        });

    } catch (error) {
        console.error(
            "DELETE NOZZLE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


module.exports = {
    createNozzle,
    getNozzles,
    getNozzleById,
    updateNozzle,
    deleteNozzle
};