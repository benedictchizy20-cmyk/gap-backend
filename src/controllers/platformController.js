/* =========================================================
   FUELGAP - PLATFORM CONTROLLER
   SUPABASE + EXPRESS
   SUPER ADMIN / SOFTWARE OWNER

   PLATFORM ACCESS:
   - Only super_admin
   - NOT restricted by organization_id
   - Reads across the entire FuelGap platform

   ENDPOINTS:
   GET /api/platform/overview
   GET /api/platform/organizations
   GET /api/platform/organizations/:id
========================================================= */

const supabase = require("../config/supabase");
async function testPlatformDatabase() {
    console.log("========================================");
    console.log("FUELGAP SUPABASE DATABASE TEST");
    console.log("SUPABASE URL:", process.env.SUPABASE_URL);

    const tables = [
        "organizations",
        "users",
        "stations",
        "pumps",
        "nozzles",
        "shifts",
        "sales",
        "payments",
        "gaps",
        "alerts"
    ];

    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select("*", {
                count: "exact",
                head: true
            });

        console.log(
            `${table}:`,
            error
                ? `ERROR - ${error.message}`
                : `COUNT = ${count}`
        );
    }

    console.log("========================================");
}


/* =========================================================
   HELPER
   GET TABLE COUNT
========================================================= */

const getTableCount = async (
    tableName,
    filter = null
) => {

    let query = supabase
        .from(tableName)
        .select("id", {
            count: "exact",
            head: true
        });

    if (filter) {

        query = query.eq(
            filter.column,
            filter.value
        );
    }

    const {
        count,
        error
    } = await query;

    if (error) {

        console.error(
            `PLATFORM COUNT ERROR - ${tableName}:`,
            error
        );

        throw error;
    }

    return count || 0;
};


/* =========================================================
   GET PLATFORM OVERVIEW
   GET /api/platform/overview

   SUPER ADMIN ONLY
   PLATFORM LEVEL
   NO ORGANIZATION RESTRICTION
========================================================= */

const getPlatformOverview = async (
    req,
    res
) => {

    try {

        console.log(
            "========================================"
        );

        console.log(
            "LOADING FUELGAP PLATFORM OVERVIEW"
        );


        /* =================================================
           ORGANIZATIONS
        ================================================= */

        const {
            count: totalOrganizations,
            error: organizationsError
        } = await supabase
            .from("organizations")
            .select("id", {
                count: "exact",
                head: true
            });

        if (organizationsError) {

            console.error(
                "PLATFORM ORGANIZATIONS COUNT ERROR:",
                organizationsError
            );

            throw organizationsError;
        }


        /* =================================================
           USERS
        ================================================= */

        const {
            count: totalUsers,
            error: usersError
        } = await supabase
            .from("users")
            .select("id", {
                count: "exact",
                head: true
            });

        if (usersError) {

            console.error(
                "PLATFORM USERS COUNT ERROR:",
                usersError
            );

            throw usersError;
        }


        /* =================================================
           ACTIVE USERS
        ================================================= */

        const {
            count: activeUsers,
            error: activeUsersError
        } = await supabase
            .from("users")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq(
                "is_active",
                true
            );

        if (activeUsersError) {

            console.error(
                "PLATFORM ACTIVE USERS COUNT ERROR:",
                activeUsersError
            );

            throw activeUsersError;
        }


        /* =================================================
           STATIONS
        ================================================= */

        const {
            count: totalStations,
            error: stationsError
        } = await supabase
            .from("stations")
            .select("id", {
                count: "exact",
                head: true
            });

        if (stationsError) {

            console.error(
                "PLATFORM STATIONS COUNT ERROR:",
                stationsError
            );

            throw stationsError;
        }


        /* =================================================
           ACTIVE STATIONS
        ================================================= */

        const {
            count: activeStations,
            error: activeStationsError
        } = await supabase
            .from("stations")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq(
                "is_active",
                true
            );

        if (activeStationsError) {

            console.error(
                "PLATFORM ACTIVE STATIONS COUNT ERROR:",
                activeStationsError
            );

            throw activeStationsError;
        }


        /* =================================================
           PUMPS
        ================================================= */

        const {
            count: totalPumps,
            error: pumpsError
        } = await supabase
            .from("pumps")
            .select("id", {
                count: "exact",
                head: true
            });

        if (pumpsError) {

            console.error(
                "PLATFORM PUMPS COUNT ERROR:",
                pumpsError
            );

            throw pumpsError;
        }


        /* =================================================
           NOZZLES
        ================================================= */

        const {
            count: totalNozzles,
            error: nozzlesError
        } = await supabase
            .from("nozzles")
            .select("id", {
                count: "exact",
                head: true
            });

        if (nozzlesError) {

            console.error(
                "PLATFORM NOZZLES COUNT ERROR:",
                nozzlesError
            );

            throw nozzlesError;
        }


        /* =================================================
           SHIFTS
        ================================================= */

        const {
            count: totalShifts,
            error: shiftsError
        } = await supabase
            .from("shifts")
            .select("id", {
                count: "exact",
                head: true
            });

        if (shiftsError) {

            console.error(
                "PLATFORM SHIFTS COUNT ERROR:",
                shiftsError
            );

            throw shiftsError;
        }


        /* =================================================
           SALES
        ================================================= */

        const {
            data: sales,
            error: salesError
        } = await supabase
            .from("sales")
            .select(`
                id,
                amount,
                created_at
            `);

        if (salesError) {

            console.error(
                "PLATFORM SALES ERROR:",
                salesError
            );

            throw salesError;
        }


        const salesRecords =
            sales || [];


        const totalSales =
            salesRecords.length;


        /* =================================================
           TOTAL SALES AMOUNT
        ================================================= */

        const totalSalesAmount =
            salesRecords.reduce(
                (
                    total,
                    sale
                ) => {

                    return (
                        total +
                        (
                            Number(
                                sale.amount
                            ) || 0
                        )
                    );

                },
                0
            );


        /* =================================================
           TODAY'S SALES
        ================================================= */

        const now =
            new Date();


        const startOfToday =
            new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            );


        const todaySales =
            salesRecords.filter(
                sale => {

                    if (
                        !sale.created_at
                    ) {
                        return false;
                    }

                    return (
                        new Date(
                            sale.created_at
                        ) >=
                        startOfToday
                    );
                }
            );


        const todaySalesAmount =
            todaySales.reduce(
                (
                    total,
                    sale
                ) => {

                    return (
                        total +
                        (
                            Number(
                                sale.amount
                            ) || 0
                        )
                    );

                },
                0
            );


        /* =================================================
           PAYMENTS
        ================================================= */

        const {
            count: totalPayments,
            error: paymentsError
        } = await supabase
            .from("payments")
            .select("id", {
                count: "exact",
                head: true
            });

        if (paymentsError) {

            console.error(
                "PLATFORM PAYMENTS COUNT ERROR:",
                paymentsError
            );

            throw paymentsError;
        }


        /* =================================================
           GAPS
        ================================================= */

        const {
            count: totalGaps,
            error: gapsError
        } = await supabase
            .from("gaps")
            .select("id", {
                count: "exact",
                head: true
            });

        if (gapsError) {

            console.error(
                "PLATFORM GAPS COUNT ERROR:",
                gapsError
            );

            throw gapsError;
        }


        /* =================================================
           ALERTS
        ================================================= */

        const {
            count: totalAlerts,
            error: alertsError
        } = await supabase
            .from("alerts")
            .select("id", {
                count: "exact",
                head: true
            });

        if (alertsError) {

            console.error(
                "PLATFORM ALERTS COUNT ERROR:",
                alertsError
            );

            throw alertsError;
        }


        /* =================================================
           ACTIVE ALERTS
        ================================================= */

        const {
            count: activeAlerts,
            error: activeAlertsError
        } = await supabase
            .from("alerts")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq(
                "status",
                "active"
            );

        if (activeAlertsError) {

            console.error(
                "PLATFORM ACTIVE ALERTS COUNT ERROR:",
                activeAlertsError
            );

            throw activeAlertsError;
        }


        /* =================================================
           PLATFORM OVERVIEW
        ================================================= */

        const platformOverview = {

            organizations: {

                total:
                    totalOrganizations || 0

            },


            users: {

                total:
                    totalUsers || 0,

                active:
                    activeUsers || 0

            },


            stations: {

                total:
                    totalStations || 0,

                active:
                    activeStations || 0

            },


            pumps: {

                total:
                    totalPumps || 0

            },


            nozzles: {

                total:
                    totalNozzles || 0

            },


            shifts: {

                total:
                    totalShifts || 0

            },


            sales: {

                total:
                    totalSales,

                totalAmount:
                    totalSalesAmount,

                todayAmount:
                    todaySalesAmount

            },


            payments: {

                total:
                    totalPayments || 0

            },


            gaps: {

                total:
                    totalGaps || 0

            },


            alerts: {

                total:
                    totalAlerts || 0,

                active:
                    activeAlerts || 0

            }

        };


        /* =================================================
           LOG RESULT
        ================================================= */

        console.log(
            "PLATFORM OVERVIEW:",
            platformOverview
        );

        console.log(
            "========================================"
        );


        /* =================================================
           RESPONSE
        ================================================= */

        return res.status(200).json({

            success: true,

            message:
                "Platform overview retrieved successfully",

            data:
                platformOverview

        });

    } catch (error) {

        console.error(
            "PLATFORM OVERVIEW ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to load platform overview",

            error:
                error.message

        });

    }

};


/* =========================================================
   GET ALL ORGANIZATIONS
   GET /api/platform/organizations

   SUPER ADMIN ONLY
========================================================= */

const getPlatformOrganizations = async (
    req,
    res
) => {

    try {

        console.log(
            "========================================"
        );

        console.log(
            "LOADING PLATFORM ORGANIZATIONS"
        );


        /* =================================================
           ORGANIZATIONS
        ================================================= */

        const {
            data: organizations,
            error: organizationsError
        } = await supabase
            .from("organizations")
            .select(`
                id,
                name,
                email,
                phone,
                created_at,
                updated_at
            `)
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (organizationsError) {

            console.error(
                "PLATFORM ORGANIZATIONS ERROR:",
                organizationsError
            );

            throw organizationsError;
        }


        /* =================================================
           USERS
        ================================================= */

        const {
            data: users,
            error: usersError
        } = await supabase
            .from("users")
            .select(`
                id,
                organization_id,
                is_active
            `);


        if (usersError) {

            console.error(
                "PLATFORM USERS ERROR:",
                usersError
            );

            throw usersError;
        }


        /* =================================================
           STATIONS
        ================================================= */

        const {
            data: stations,
            error: stationsError
        } = await supabase
            .from("stations")
            .select(`
                id,
                organization_id,
                is_active
            `);


        if (stationsError) {

            console.error(
                "PLATFORM STATIONS ERROR:",
                stationsError
            );

            throw stationsError;
        }


        /* =================================================
           BUILD ORGANIZATION LIST
        ================================================= */

        const organizationList =
            (organizations || []).map(
                organization => {

                    const organizationUsers =
                        (users || []).filter(
                            user =>
                                user.organization_id ===
                                organization.id
                        );


                    const organizationStations =
                        (stations || []).filter(
                            station =>
                                station.organization_id ===
                                organization.id
                        );


                    return {

                        id:
                            organization.id,

                        name:
                            organization.name,

                        email:
                            organization.email,

                        phone:
                            organization.phone,

                        created_at:
                            organization.created_at,

                        updated_at:
                            organization.updated_at,


                        users: {

                            total:
                                organizationUsers.length,

                            active:
                                organizationUsers.filter(
                                    user =>
                                        user.is_active === true
                                ).length

                        },


                        stations: {

                            total:
                                organizationStations.length,

                            active:
                                organizationStations.filter(
                                    station =>
                                        station.is_active === true
                                ).length

                        }

                    };

                }
            );


        console.log(
            "PLATFORM ORGANIZATIONS:",
            organizationList
        );


        console.log(
            "========================================"
        );


        /* =================================================
           RESPONSE
        ================================================= */

        return res.status(200).json({

            success: true,

            message:
                "Platform organizations retrieved successfully",

            data:
                organizationList

        });

    } catch (error) {

        console.error(
            "PLATFORM ORGANIZATIONS EXCEPTION:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to load platform organizations",

            error:
                error.message

        });

    }

};


/* =========================================================
   GET SINGLE ORGANIZATION
   GET /api/platform/organizations/:id

   SUPER ADMIN ONLY
========================================================= */

const getPlatformOrganization = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({

                success: false,

                message:
                    "Organization ID is required"

            });

        }


        /* =================================================
           ORGANIZATION
        ================================================= */

        const {
            data: organization,
            error: organizationError
        } = await supabase
            .from("organizations")
            .select(`
                id,
                name,
                email,
                phone,
                created_at,
                updated_at
            `)
            .eq(
                "id",
                id
            )
            .maybeSingle();


        if (organizationError) {

            console.error(
                "PLATFORM ORGANIZATION ERROR:",
                organizationError
            );

            throw organizationError;
        }


        if (!organization) {

            return res.status(404).json({

                success: false,

                message:
                    "Organization not found"

            });

        }


        /* =================================================
           USERS
        ================================================= */

        const {
            data: users,
            error: usersError
        } = await supabase
            .from("users")
            .select(`
                id,
                auth_user_id,
                organization_id,
                full_name,
                email,
                role,
                station_id,
                is_active
            `)
            .eq(
                "organization_id",
                id
            )
            .order(
                "full_name",
                {
                    ascending: true
                }
            );


        if (usersError) {

            console.error(
                "PLATFORM ORGANIZATION USERS ERROR:",
                usersError
            );

            throw usersError;
        }


        /* =================================================
           STATIONS
        ================================================= */

        const {
            data: stations,
            error: stationsError
        } = await supabase
            .from("stations")
            .select("*")
            .eq(
                "organization_id",
                id
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (stationsError) {

            console.error(
                "PLATFORM ORGANIZATION STATIONS ERROR:",
                stationsError
            );

            throw stationsError;
        }


        /* =================================================
           ACTIVITY COUNTS
        ================================================= */

        const salesCount =
            await getTableCount(
                "sales",
                {
                    column:
                        "organization_id",

                    value:
                        id

                }
            );


        const paymentsCount =
            await getTableCount(
                "payments",
                {
                    column:
                        "organization_id",

                    value:
                        id

                }
            );


        const gapsCount =
            await getTableCount(
                "gaps",
                {
                    column:
                        "organization_id",

                    value:
                        id

                }
            );


        const alertsCount =
            await getTableCount(
                "alerts",
                {
                    column:
                        "organization_id",

                    value:
                        id

                }
            );


        /* =================================================
           RESPONSE
        ================================================= */

        return res.status(200).json({

            success: true,

            message:
                "Platform organization retrieved successfully",

            data: {

                organization,

                users: {

                    total:
                        users?.length || 0,

                    active:
                        (users || []).filter(
                            user =>
                                user.is_active === true
                        ).length,

                    records:
                        users || []

                },


                stations: {

                    total:
                        stations?.length || 0,

                    active:
                        (stations || []).filter(
                            station =>
                                station.is_active === true
                        ).length,

                    records:
                        stations || []

                },


                activity: {

                    sales:
                        salesCount,

                    payments:
                        paymentsCount,

                    gaps:
                        gapsCount,

                    alerts:
                        alertsCount

                }

            }

        });

    } catch (error) {

        console.error(
            "PLATFORM ORGANIZATION EXCEPTION:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to load platform organization",

            error:
                error.message

        });

    }

};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    getPlatformOverview,

    getPlatformOrganizations,

    getPlatformOrganization

};