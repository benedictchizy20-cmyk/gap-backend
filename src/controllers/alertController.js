/* =========================================================
   FUELGAP - ALERT CONTROLLER
   =========================================================
   PURPOSE:
   - Create alerts
   - Create automatic system gap alerts
   - Get organization alerts
   - Get single alert
   - Acknowledge alerts
   - Resolve alerts
   - Delete alerts
   - Keep all alert operations organization-scoped
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   HELPER - GET APPLICATION USER
========================================================= */

async function getApplicationUser(authUserId) {

    if (!authUserId) {
        throw new Error("Authenticated user ID is required");
    }

    const { data, error } = await supabaseAdmin
        .from("users")
        .select(`
            id,
            auth_user_id,
            organization_id,
            station_id,
            full_name,
            email,
            phone,
            role,
            is_active
        `)
        .eq("auth_user_id", authUserId)
        .maybeSingle();

    if (error) {
        console.error(
            "GET APPLICATION USER ERROR:",
            error
        );

        throw error;
    }

    if (!data) {
        throw new Error("Application user profile not found");
    }

    return data;
}


/* =========================================================
   HELPER - GET AUTHENTICATED APPLICATION USER
========================================================= */

async function getAuthenticatedApplicationUser(req) {

    const authUserId =
        req.user?.id ||
        req.user?.auth_user_id ||
        req.authUser?.id ||
        req.authUser?.auth_user_id;

    if (!authUserId) {
        throw new Error("Authenticated user not found");
    }

    return await getApplicationUser(authUserId);
}


/* =========================================================
   HELPER - GET ORGANIZATION ID
========================================================= */

function getOrganizationId(req, applicationUser) {

    return (
        applicationUser?.organization_id ||
        req.user?.organization_id ||
        req.authUser?.organization_id ||
        null
    );
}


/* =========================================================
   HELPER - ROLE CHECK
========================================================= */

function hasManagementRole(role) {

    return [
        "owner",
        "admin",
        "manager",
        "super_admin"
    ].includes(role);
}


/* =========================================================
   GET ALL ALERTS
========================================================= */

async function getAlerts(req, res) {

    console.log("==========================================");
    console.log("FUELGAP - GET ALERTS");
    console.log("==========================================");

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(req);

        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );

        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message: "Organization ID not found"
            });
        }


        console.log(
            "AUTHENTICATED USER:",
            applicationUser.id
        );

        console.log(
            "ORGANIZATION ID:",
            organizationId
        );

        console.log(
            "USER ROLE:",
            applicationUser.role
        );


        /* -------------------------------------------------
           ORGANIZATION-SCOPED ALERT QUERY
        ------------------------------------------------- */

        let query =
            supabaseAdmin
                .from("alerts")
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


        /* -------------------------------------------------
           OPTIONAL FILTERS
        ------------------------------------------------- */

        if (req.query.status) {

            query = query.eq(
                "status",
                req.query.status
            );
        }

        if (req.query.severity) {

            query = query.eq(
                "severity",
                req.query.severity
            );
        }

        if (req.query.type) {

            query = query.eq(
                "type",
                req.query.type
            );
        }


        const {
            data,
            error
        } = await query;


        if (error) {

            console.error(
                "GET ALERTS DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load alerts",
                error: error.message
            });
        }


        console.log(
            "ALERTS FOUND:",
            data?.length || 0
        );


        return res.status(200).json({

            success: true,

            data: data || [],

            count: data?.length || 0

        });

    } catch (error) {

        console.error(
            "GET ALERTS EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unexpected error loading alerts"

        });
    }
}


/* =========================================================
   GET ALERT BY ID
========================================================= */

async function getAlertById(req, res) {

    console.log("==========================================");
    console.log("FUELGAP - GET ALERT BY ID");
    console.log("==========================================");

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(req);

        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );

        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message: "Organization ID not found"
            });
        }


        const alertId =
            req.params.id;


        if (!alertId) {

            return res.status(400).json({
                success: false,
                message: "Alert ID is required"
            });
        }


        const {
            data,
            error
        } = await supabaseAdmin
            .from("alerts")
            .select("*")
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (error) {

            console.error(
                "GET ALERT BY ID DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load alert",
                error: error.message
            });
        }


        if (!data) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }


        return res.status(200).json({

            success: true,

            data

        });

    } catch (error) {

        console.error(
            "GET ALERT BY ID EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unexpected error loading alert"

        });
    }
}


/* =========================================================
   CREATE MANUAL ALERT
========================================================= */

async function createAlert(req, res) {

    console.log("==========================================");
    console.log("FUELGAP - CREATE ALERT");
    console.log("==========================================");

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(req);

        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message: "Organization ID not found"
            });
        }


        if (
            !hasManagementRole(
                applicationUser.role
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to create alerts"
            });
        }


        const {
            station_id,
            pump_id,
            nozzle_id,
            shift_id,
            gap_id,
            type,
            severity,
            title,
            message
        } = req.body;


        if (!title || !message) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert title and message are required"
            });
        }


        const allowedSeverities = [
            "info",
            "warning",
            "high",
            "critical"
        ];


        const finalSeverity =
            allowedSeverities.includes(
                severity
            )
                ? severity
                : "info";


        const {
            data,
            error
        } = await supabaseAdmin
            .from("alerts")
            .insert({

                organization_id:
                    organizationId,

                station_id:
                    station_id || null,

                pump_id:
                    pump_id || null,

                nozzle_id:
                    nozzle_id || null,

                shift_id:
                    shift_id || null,

                gap_id:
                    gap_id || null,

                type:
                    type || "system",

                severity:
                    finalSeverity,

                title,

                message,

                status:
                    "new"

            })
            .select()
            .single();


        if (error) {

            console.error(
                "CREATE ALERT DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to create alert",
                error: error.message
            });
        }


        console.log(
            "ALERT CREATED:",
            data.id
        );


        return res.status(201).json({

            success: true,

            message:
                "Alert created successfully",

            data

        });

    } catch (error) {

        console.error(
            "CREATE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unexpected error creating alert"

        });
    }
}


/* =========================================================
   CREATE SYSTEM GAP ALERT
========================================================
   This function is used automatically by gapController.js.

   It:
   - validates required information
   - prevents duplicate alerts for the same gap
   - creates the alert inside the correct organization
========================================================= */

async function createSystemGapAlert({

    organizationId,

    stationId,

    pumpId,

    nozzleId,

    shiftId,

    gapId,

    severity,

    title,

    message

}) {

    console.log("==========================================");
    console.log("FUELGAP - CREATE SYSTEM GAP ALERT");
    console.log("==========================================");


    /* -------------------------------------------------
       REQUIRED DATA
    ------------------------------------------------- */

    if (!organizationId) {

        throw new Error(
            "Organization ID is required for gap alert"
        );
    }


    if (!gapId) {

        throw new Error(
            "Gap ID is required for gap alert"
        );
    }


    if (!title) {

        throw new Error(
            "Gap alert title is required"
        );
    }


    if (!message) {

        throw new Error(
            "Gap alert message is required"
        );
    }


    /* -------------------------------------------------
       VALID SEVERITIES
    ------------------------------------------------- */

    const allowedSeverities = [
        "info",
        "warning",
        "high",
        "critical"
    ];


    const finalSeverity =
        allowedSeverities.includes(
            severity
        )
            ? severity
            : "info";


    /* -------------------------------------------------
       CHECK FOR EXISTING ALERT
       Prevent duplicate alert for same gap
    ------------------------------------------------- */

    const {
        data: existingAlert,
        error: existingAlertError
    } = await supabaseAdmin
        .from("alerts")
        .select("id")
        .eq(
            "organization_id",
            organizationId
        )
        .eq(
            "gap_id",
            gapId
        )
        .limit(1)
        .maybeSingle();


    if (existingAlertError) {

        console.error(
            "CHECK EXISTING GAP ALERT ERROR:",
            existingAlertError
        );

        throw existingAlertError;
    }


    if (existingAlert) {

        console.log(
            "GAP ALERT ALREADY EXISTS:",
            existingAlert.id
        );

        return existingAlert;
    }


    /* -------------------------------------------------
       CREATE ALERT
    ------------------------------------------------- */

    const {
        data,
        error
    } = await supabaseAdmin
        .from("alerts")
        .insert({

            organization_id:
                organizationId,

            station_id:
                stationId || null,

            pump_id:
                pumpId || null,

            nozzle_id:
                nozzleId || null,

            shift_id:
                shiftId || null,

            gap_id:
                gapId || null,

            type:
                "gap_variance",

            severity:
                finalSeverity,

            title,

            message,

            status:
                "new"

        })
        .select()
        .single();


    if (error) {

        console.error(
            "CREATE SYSTEM GAP ALERT DATABASE ERROR:",
            error
        );

        throw error;
    }


    console.log(
        "SYSTEM GAP ALERT CREATED:",
        data.id
    );


    return data;
}


/* =========================================================
   ACKNOWLEDGE ALERT
========================================================= */

async function acknowledgeAlert(req, res) {

    console.log("==========================================");
    console.log("FUELGAP - ACKNOWLEDGE ALERT");
    console.log("==========================================");

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(req);

        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message: "Organization ID not found"
            });
        }


        const alertId =
            req.params.id;


        if (!alertId) {

            return res.status(400).json({
                success: false,
                message: "Alert ID is required"
            });
        }


        const {
            data: existingAlert,
            error: findError
        } = await supabaseAdmin
            .from("alerts")
            .select("*")
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (findError) {

            console.error(
                "ACKNOWLEDGE ALERT FIND ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to find alert",
                error: findError.message
            });
        }


        if (!existingAlert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }


        const {
            data,
            error
        } = await supabaseAdmin
            .from("alerts")
            .update({

                status:
                    "acknowledged",

                acknowledged_at:
                    new Date().toISOString(),

                acknowledged_by:
                    applicationUser.id

            })
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            )
            .select()
            .single();


        if (error) {

            console.error(
                "ACKNOWLEDGE ALERT DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to acknowledge alert",
                error: error.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert acknowledged successfully",

            data

        });

    } catch (error) {

        console.error(
            "ACKNOWLEDGE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unexpected error acknowledging alert"

        });
    }
}


/* =========================================================
   RESOLVE ALERT
========================================================= */

async function resolveAlert(req, res) {

    console.log("==========================================");
    console.log("FUELGAP - RESOLVE ALERT");
    console.log("==========================================");

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(req);

        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message: "Organization ID not found"
            });
        }


        const alertId =
            req.params.id;


        if (!alertId) {

            return res.status(400).json({
                success: false,
                message: "Alert ID is required"
            });
        }


        const {
            data: existingAlert,
            error: findError
        } = await supabaseAdmin
            .from("alerts")
            .select("*")
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (findError) {

            console.error(
                "RESOLVE ALERT FIND ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to find alert",
                error: findError.message
            });
        }


        if (!existingAlert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }


        const {
            data,
            error
        } = await supabaseAdmin
            .from("alerts")
            .update({

                status:
                    "resolved",

                resolved_at:
                    new Date().toISOString(),

                resolved_by:
                    applicationUser.id

            })
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            )
            .select()
            .single();


        if (error) {

            console.error(
                "RESOLVE ALERT DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to resolve alert",
                error: error.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert resolved successfully",

            data

        });

    } catch (error) {

        console.error(
            "RESOLVE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unexpected error resolving alert"

        });
    }
}


/* =========================================================
   DELETE ALERT
========================================================= */

async function deleteAlert(req, res) {

    console.log("==========================================");
    console.log("FUELGAP - DELETE ALERT");
    console.log("==========================================");

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(req);

        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message: "Organization ID not found"
            });
        }


        if (
            !hasManagementRole(
                applicationUser.role
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to delete alerts"
            });
        }


        const alertId =
            req.params.id;


        if (!alertId) {

            return res.status(400).json({
                success: false,
                message: "Alert ID is required"
            });
        }


        const {
            data: existingAlert,
            error: findError
        } = await supabaseAdmin
            .from("alerts")
            .select("id")
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (findError) {

            console.error(
                "DELETE ALERT FIND ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to find alert",
                error: findError.message
            });
        }


        if (!existingAlert) {

            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }


        const {
            error
        } = await supabaseAdmin
            .from("alerts")
            .delete()
            .eq("id", alertId)
            .eq(
                "organization_id",
                organizationId
            );


        if (error) {

            console.error(
                "DELETE ALERT DATABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to delete alert",
                error: error.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert deleted successfully"

        });

    } catch (error) {

        console.error(
            "DELETE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unexpected error deleting alert"

        });
    }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    getAlerts,

    getAlertById,

    createAlert,

    createSystemGapAlert,

    acknowledgeAlert,

    resolveAlert,

    deleteAlert

};