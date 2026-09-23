/* =========================================================
   FUELGAP - ALERT CONTROLLER
   =========================================================
   PURPOSE:
   - Get alerts
   - Get single alert
   - Create manual alerts
   - Automatically create system gap alerts
   - Acknowledge alerts
   - Resolve alerts
   - Delete alerts

   SYSTEM ALERTS:
   Gap calculations can automatically create alerts
   without requiring the frontend to call POST /api/alerts.
========================================================= */

const supabaseAdmin =
    require("../config/supabaseAdmin");


/* =========================================================
   HELPERS
========================================================= */

async function getApplicationUser(
    authUserId
) {

    if (!authUserId) {
        return null;
    }


    const {
        data,
        error
    } = await supabaseAdmin
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

        throw error;
    }


    return data || null;
}


async function getAuthenticatedApplicationUser(
    req
) {

    const authUserId =
        req.user?.id ||
        req.user?.auth_user_id ||
        req.authUser?.id ||
        null;


    if (!authUserId) {
        return null;
    }


    return getApplicationUser(
        authUserId
    );
}


function getOrganizationId(
    req,
    applicationUser
) {

    return (

        req.organizationId ||

        req.profile?.organization_id ||

        req.user?.organization_id ||

        applicationUser?.organization_id ||

        null

    );
}


function normalizeRole(
    role
) {

    return String(
        role || ""
    )
        .trim()
        .toLowerCase();
}


function isManagementRole(
    role
) {

    return [

        "owner",

        "admin",

        "super_admin",

        "manager"

    ].includes(
        normalizeRole(role)
    );
}


function isRestrictedRole(
    role
) {

    return [

        "staff",

        "attendant"

    ].includes(
        normalizeRole(role)
    );
}


function cleanString(
    value
) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }


    return String(
        value
    ).trim();
}


function normalizeStatus(
    value
) {

    const status =
        cleanString(value)
            .toLowerCase();


    return status || "new";
}


function normalizeSeverity(
    value
) {

    const severity =
        cleanString(value)
            .toLowerCase();


    return severity || "warning";
}


function normalizeType(
    value
) {

    const type =
        cleanString(value)
            .toLowerCase();


    return type || "gap_variance";
}


/* =========================================================
   CREATE SYSTEM GAP ALERT
   =========================================================
   INTERNAL FUNCTION

   Used by gapController.

   This is NOT an HTTP route.

   It directly creates the alert in Supabase.
========================================================= */

async function createSystemGapAlert({

    organizationId,

    stationId,

    pumpId,

    nozzleId,

    shiftId,

    gapId,

    severity = "warning",

    title,

    message

}) {

    console.log(
        "=============================================="
    );

    console.log(
        "FUELGAP - CREATE SYSTEM GAP ALERT"
    );

    console.log(
        "=============================================="
    );


    if (!organizationId) {

        throw new Error(
            "Organization ID is required to create system alert."
        );
    }


    if (!title) {

        throw new Error(
            "Alert title is required."
        );
    }


    if (!message) {

        throw new Error(
            "Alert message is required."
        );
    }


    const normalizedSeverity =
        normalizeSeverity(
            severity
        );


    const allowedSeverities = [

        "info",

        "warning",

        "high",

        "critical"

    ];


    if (
        !allowedSeverities.includes(
            normalizedSeverity
        )
    ) {

        throw new Error(
            "Invalid alert severity."
        );
    }


    /* =====================================================
       DUPLICATE PROTECTION
    ===================================================== */

    if (gapId) {

        const {
            data: existingAlerts,
            error: duplicateError
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
            .limit(1);


        if (duplicateError) {

            console.error(
                "CHECK EXISTING GAP ALERT ERROR:",
                duplicateError
            );

            throw duplicateError;
        }


        if (
            existingAlerts &&
            existingAlerts.length > 0
        ) {

            console.log(
                "SYSTEM GAP ALERT ALREADY EXISTS:",
                existingAlerts[0].id
            );


            return existingAlerts[0];
        }
    }


    /* =====================================================
       INSERT ALERT
    ===================================================== */

    const insertData = {

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
            normalizedSeverity,

        title:
            cleanString(title),

        message:
            cleanString(message),

        status:
            "new"

    };


    const {
        data: alert,
        error
    } = await supabaseAdmin
        .from("alerts")
        .insert(
            insertData
        )
        .select()
        .single();


    if (error) {

        console.error(
            "CREATE SYSTEM GAP ALERT DATABASE ERROR:",
            error
        );

        throw new Error(
            `Failed to create system gap alert: ${error.message}`
        );
    }


    console.log(
        "SYSTEM GAP ALERT CREATED:",
        alert.id
    );


    return alert;
}


/* =========================================================
   GET ALERTS
   GET /api/alerts
========================================================= */

async function getAlerts(
    req,
    res
) {

    try {

        console.log(
            "=============================================="
        );

        console.log(
            "GET FUELGAP ALERTS"
        );

        console.log(
            "=============================================="
        );


        const applicationUser =
            await getAuthenticatedApplicationUser(
                req
            );


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user not found."
            });
        }


        if (
            applicationUser.is_active === false
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive."
            });
        }


        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined."
            });
        }


        const {

            station_id = "",

            severity = "",

            status = "",

            type = "",

            gap_id = "",

            shift_id = "",

            limit = "100"

        } = req.query;


            let query =
    supabaseAdmin
        .from("alerts")
        .select("*")
        .eq(
            "organization_id",
            appUser.organization_id
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );
        const role =
            normalizeRole(
                applicationUser.role
            );


        if (
            isRestrictedRole(role) &&
            applicationUser.station_id
        ) {

            query =
                query.eq(
                    "station_id",
                    applicationUser.station_id
                );
        }


        if (station_id) {

            if (
                isRestrictedRole(role) &&
                applicationUser.station_id &&
                station_id !==
                    applicationUser.station_id
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this station."
                });
            }


            query =
                query.eq(
                    "station_id",
                    station_id
                );
        }


        if (status) {

            query =
                query.eq(
                    "status",
                    status
                );
        }


        if (severity) {

            query =
                query.eq(
                    "severity",
                    severity
                );
        }


        if (type) {

            query =
                query.eq(
                    "type",
                    type
                );
        }


        if (gap_id) {

            query =
                query.eq(
                    "gap_id",
                    gap_id
                );
        }


        if (shift_id) {

            query =
                query.eq(
                    "shift_id",
                    shift_id
                );
        }


        const {
            data: alerts,
            error
        } = await query;


        if (error) {

            console.error(
                "GET ALERTS SUPABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load alerts.",
                error:
                    error.message
            });
        }


        const records =
            alerts || [];


        const summary = {

            total:
                records.length,

            new:
                records.filter(
                    alert =>
                        alert.status ===
                        "new"
                ).length,

            acknowledged:
                records.filter(
                    alert =>
                        alert.status ===
                        "acknowledged"
                ).length,

            resolved:
                records.filter(
                    alert =>
                        alert.status ===
                        "resolved"
                ).length,

            info:
                records.filter(
                    alert =>
                        alert.severity ===
                        "info"
                ).length,

            warning:
                records.filter(
                    alert =>
                        alert.severity ===
                        "warning"
                ).length,

            high:
                records.filter(
                    alert =>
                        alert.severity ===
                        "high"
                ).length,

            critical:
                records.filter(
                    alert =>
                        alert.severity ===
                        "critical"
                ).length

        };


        return res.status(200).json({

            success: true,

            message:
                "Alerts loaded successfully.",

            data:
                records,

            summary

        });


    } catch (error) {

        console.error(
            "GET ALERTS EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to load alerts.",

            error:
                error.message

        });
    }
}


/* =========================================================
   GET SINGLE ALERT
   GET /api/alerts/:id
========================================================= */

async function getAlertById(
    req,
    res
) {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert ID is required."
            });
        }


        const applicationUser =
            await getAuthenticatedApplicationUser(
                req
            );


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user not found."
            });
        }


        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined."
            });
        }


        const role =
            normalizeRole(
                applicationUser.role
            );


        const {
            data: alert,
            error
        } = await supabaseAdmin
            .from("alerts")
            .select(`
                *,
                stations (
                    id,
                    name,
                    address,
                    city,
                    state
                ),
                pumps (
                    id,
                    pump_number,
                    brand,
                    model
                ),
                nozzles (
                    id,
                    nozzle_number,
                    product,
                    price_per_litre
                ),
                shifts (
                    id,
                    shift_name,
                    shift_date,
                    status
                )
            `)
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load alert.",
                error:
                    error.message
            });
        }


        if (!alert) {

            return res.status(404).json({
                success: false,
                message:
                    "Alert not found."
            });
        }


        if (
            isRestrictedRole(role) &&
            applicationUser.station_id &&
            alert.station_id !==
                applicationUser.station_id
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this alert."
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert loaded successfully.",

            data:
                alert

        });


    } catch (error) {

        console.error(
            "GET ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to load alert.",

            error:
                error.message

        });
    }
}


/* =========================================================
   CREATE MANUAL ALERT
   POST /api/alerts
========================================================= */

async function createAlert(
    req,
    res
) {

    try {

        const applicationUser =
            await getAuthenticatedApplicationUser(
                req
            );


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user not found."
            });
        }


        if (
            applicationUser.is_active === false
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive."
            });
        }


        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined."
            });
        }


        const role =
            normalizeRole(
                applicationUser.role
            );


        if (
            !isManagementRole(role)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Only management users can create alerts."
            });
        }


        const {

            station_id = null,

            pump_id = null,

            nozzle_id = null,

            shift_id = null,

            gap_id = null,

            type = "gap_variance",

            severity = "warning",

            title,

            message,

            status = "new"

        } = req.body || {};


        if (!cleanString(title)) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert title is required."
            });
        }


        if (!cleanString(message)) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert message is required."
            });
        }


        const normalizedSeverity =
            normalizeSeverity(
                severity
            );


        const allowedSeverities = [

            "info",

            "warning",

            "high",

            "critical"

        ];


        if (
            !allowedSeverities.includes(
                normalizedSeverity
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid alert severity. Use info, warning, high, or critical."
            });
        }


        const normalizedStatus =
            normalizeStatus(
                status
            );


        const allowedStatuses = [

            "new",

            "acknowledged",

            "resolved"

        ];


        if (
            !allowedStatuses.includes(
                normalizedStatus
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid alert status."
            });
        }


        if (station_id) {

            const {
                data: station,
                error: stationError
            } = await supabaseAdmin
                .from("stations")
                .select("id")
                .eq(
                    "id",
                    station_id
                )
                .eq(
                    "organization_id",
                    organizationId
                )
                .maybeSingle();


            if (stationError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to verify station."
                });
            }


            if (!station) {

                return res.status(400).json({
                    success: false,
                    message:
                        "The selected station does not belong to your organization."
                });
            }
        }


        if (gap_id) {

            const {
                data: gap,
                error: gapError
            } = await supabaseAdmin
                .from("gaps")
                .select(
                    "id, station_id"
                )
                .eq(
                    "id",
                    gap_id
                )
                .eq(
                    "organization_id",
                    organizationId
                )
                .maybeSingle();


            if (gapError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to verify gap."
                });
            }


            if (!gap) {

                return res.status(400).json({
                    success: false,
                    message:
                        "The selected gap was not found."
                });
            }


            if (
                station_id &&
                gap.station_id &&
                gap.station_id !==
                    station_id
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "The gap and station do not match."
                });
            }
        }


        const insertData = {

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
                normalizeType(type),

            severity:
                normalizedSeverity,

            title:
                cleanString(title),

            message:
                cleanString(message),

            status:
                normalizedStatus

        };


        const {
            data: alert,
            error
        } = await supabaseAdmin
            .from("alerts")
            .insert(
                insertData
            )
            .select()
            .single();


        if (error) {

            console.error(
                "CREATE ALERT SUPABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to create alert.",
                error:
                    error.message
            });
        }


        return res.status(201).json({

            success: true,

            message:
                "Alert created successfully.",

            data:
                alert

        });


    } catch (error) {

        console.error(
            "CREATE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to create alert.",

            error:
                error.message

        });
    }
}


/* =========================================================
   ACKNOWLEDGE ALERT
   PATCH /api/alerts/:id/acknowledge
========================================================= */

async function acknowledgeAlert(
    req,
    res
) {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert ID is required."
            });
        }


        const applicationUser =
            await getAuthenticatedApplicationUser(
                req
            );


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user not found."
            });
        }


        if (
            applicationUser.is_active === false
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive."
            });
        }


        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined."
            });
        }


        const role =
            normalizeRole(
                applicationUser.role
            );


        if (
            !isManagementRole(role)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Only management users can acknowledge alerts."
            });
        }


        const {
            data: existingAlert,
            error: findError
        } = await supabaseAdmin
            .from("alerts")
            .select("*")
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (findError) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to find alert.",
                error:
                    findError.message
            });
        }


        if (!existingAlert) {

            return res.status(404).json({
                success: false,
                message:
                    "Alert not found."
            });
        }


        if (
            existingAlert.status ===
            "resolved"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "A resolved alert cannot be acknowledged."
            });
        }


        const {
            data: alert,
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
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .select()
            .single();


        if (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to acknowledge alert.",
                error:
                    error.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert acknowledged successfully.",

            data:
                alert

        });


    } catch (error) {

        console.error(
            "ACKNOWLEDGE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to acknowledge alert.",

            error:
                error.message

        });
    }
}


/* =========================================================
   RESOLVE ALERT
   PATCH /api/alerts/:id/resolve
========================================================= */

async function resolveAlert(
    req,
    res
) {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert ID is required."
            });
        }


        const applicationUser =
            await getAuthenticatedApplicationUser(
                req
            );


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user not found."
            });
        }


        if (
            applicationUser.is_active === false
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive."
            });
        }


        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined."
            });
        }


        const role =
            normalizeRole(
                applicationUser.role
            );


        if (
            !isManagementRole(role)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Only management users can resolve alerts."
            });
        }


        const {
            data: existingAlert,
            error: findError
        } = await supabaseAdmin
            .from("alerts")
            .select("*")
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (findError) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to find alert.",
                error:
                    findError.message
            });
        }


        if (!existingAlert) {

            return res.status(404).json({
                success: false,
                message:
                    "Alert not found."
            });
        }


        if (
            existingAlert.status ===
            "resolved"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert has already been resolved."
            });
        }


        const {
            data: alert,
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
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .select()
            .single();


        if (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to resolve alert.",
                error:
                    error.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert resolved successfully.",

            data:
                alert

        });


    } catch (error) {

        console.error(
            "RESOLVE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to resolve alert.",

            error:
                error.message

        });
    }
}


/* =========================================================
   DELETE ALERT
   DELETE /api/alerts/:id
========================================================= */

async function deleteAlert(
    req,
    res
) {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({
                success: false,
                message:
                    "Alert ID is required."
            });
        }


        const applicationUser =
            await getAuthenticatedApplicationUser(
                req
            );


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user not found."
            });
        }


        const organizationId =
            getOrganizationId(
                req,
                applicationUser
            );


        const role =
            normalizeRole(
                applicationUser.role
            );


        if (
            !isManagementRole(role)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Only management users can delete alerts."
            });
        }


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined."
            });
        }


        const {
            data: existingAlert,
            error: findError
        } = await supabaseAdmin
            .from("alerts")
            .select("id")
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (findError) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to find alert.",
                error:
                    findError.message
            });
        }


        if (!existingAlert) {

            return res.status(404).json({
                success: false,
                message:
                    "Alert not found."
            });
        }


        const {
            error
        } = await supabaseAdmin
            .from("alerts")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "organization_id",
                organizationId
            );


        if (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete alert.",
                error:
                    error.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Alert deleted successfully."

        });


    } catch (error) {

        console.error(
            "DELETE ALERT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to delete alert.",

            error:
                error.message

        });
    }
}

/* =========================================================
   CREATE SYSTEM GAP ALERT
   =========================================================
   PURPOSE:
   - Automatically create an alert when a meter gap is created
   - Called internally by gapController
   - Does NOT require another HTTP request
   - Prevent duplicate alerts for the same gap
========================================================= */

async function createSystemGapAlert({
    organizationId,
    stationId,
    pumpId,
    nozzleId,
    shiftId,
    gapId,
    severity = "info",
    title,
    message
}) {

    console.log(
        "FUELGAP - CREATE SYSTEM GAP ALERT"
    );

    if (!organizationId) {
        throw new Error(
            "Organization ID is required for system alert"
        );
    }

    if (!gapId) {
        throw new Error(
            "Gap ID is required for system alert"
        );
    }

    /* =====================================================
       CHECK FOR EXISTING ALERT
    ===================================================== */

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
            "SYSTEM GAP ALERT DUPLICATE CHECK ERROR:",
            existingAlertError
        );

        throw existingAlertError;
    }

    /* =====================================================
       DO NOT CREATE DUPLICATE ALERT
    ===================================================== */

    if (existingAlert) {

        console.log(
            "FUELGAP - SYSTEM GAP ALERT ALREADY EXISTS:",
            existingAlert.id
        );

        return existingAlert;
    }

    /* =====================================================
       CREATE ALERT
    ===================================================== */

    const {
        data: alert,
        error: alertError
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
                gapId,

            type:
                "gap_variance",

            severity:
                severity || "info",

            title:
                title ||
                "Meter Gap Recorded",

            message:
                message ||
                "A meter gap has been calculated.",

            status:
                "new"

        })
        .select("*")
        .single();

    if (alertError) {

        console.error(
            "FUELGAP - CREATE SYSTEM GAP ALERT ERROR:",
            alertError
        );

        throw alertError;
    }

    console.log(
        "FUELGAP - SYSTEM GAP ALERT CREATED:",
        alert.id
    );

    return alert;
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

    deleteAlert,
     createSystemGapAlert

};