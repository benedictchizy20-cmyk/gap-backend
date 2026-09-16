/* =========================================================
   FUELGAP - SALES CONTROLLER
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
   JAVASCRIPT VERSION

   DATABASE COLUMN:
   sales.litres
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


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
   HELPER - GET APPLICATION USER ID
========================================================= */

function getProfileId(req) {

    return (
        req.profile?.id ||
        req.user?.id ||
        null
    );

}


/* =========================================================
   HELPER - GET USER STATION
========================================================= */

function getUserStationId(req) {

    return (
        req.stationId ||
        req.profile?.station_id ||
        req.user?.station_id ||
        null
    );

}


/* =========================================================
   HELPER - GET APPLICATION USER FROM AUTH USER
========================================================= */

async function getApplicationUser(authUserId) {

    if (!authUserId) {

        return {
            user: null,
            error: new Error(
                "Authenticated user ID is missing."
            )
        };

    }


    const {
        data,
        error
    } = await supabaseAdmin
        .from("users")
        .select(`
            id,
            organization_id,
            station_id,
            full_name,
            email,
            role,
            is_active,
            auth_user_id
        `)
        .eq(
            "auth_user_id",
            authUserId
        )
        .maybeSingle();


    return {
        user: data,
        error
    };

}


/* =========================================================
   HELPER - RESOLVE APPLICATION USER
========================================================= */

async function resolveApplicationUser(req) {

    /*
        If middleware already supplied
        the application profile, use it.
    */

    if (req.profile?.id) {

        return {
            id: req.profile.id,

            organization_id:
                req.profile.organization_id,

            station_id:
                req.profile.station_id,

            full_name:
                req.profile.full_name,

            email:
                req.profile.email,

            role:
                req.profile.role,

            is_active:
                req.profile.is_active
        };

    }


    /*
        Otherwise resolve the Supabase Auth
        user ID through users.auth_user_id.
    */

    const authUserId =
        req.user?.id ||
        req.authUser?.id ||
        null;


    if (!authUserId) {
        return null;
    }


    const {
        user,
        error
    } = await getApplicationUser(
        authUserId
    );


    if (error) {

        console.error(
            "RESOLVE SALES USER ERROR:",
            error
        );

        return null;

    }


    return user || null;

}


/* =========================================================
   CREATE SALE
   POST /api/sales
========================================================= */

const createSale = async (req, res) => {

    try {

        const applicationUser =
            await resolveApplicationUser(req);


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user could not be identified."
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
            applicationUser.organization_id ||
            getOrganizationId(req);


        const userRole =
            String(
                applicationUser.role ||
                getUserRole(req)
            )
                .toLowerCase()
                .trim();


        const applicationUserId =
            applicationUser.id ||
            getProfileId(req);


        const userStationId =
            applicationUser.station_id ||
            getUserStationId(req);


        /*
            We accept "liters" from the frontend
            for compatibility.

            The actual Supabase database column
            is "litres".
        */

        const {
            station_id,
            pump_id,
            nozzle_id,
            shift_id,
            liters,
            price_per_litre,
            amount,
            payment_method
        } = req.body;


        /* =====================================================
           AUTH VALIDATION
        ===================================================== */

        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
            });

        }


        if (!applicationUserId) {

            return res.status(401).json({
                success: false,
                message:
                    "Application user could not be identified."
            });

        }


        /* =====================================================
           INPUT VALIDATION
        ===================================================== */

        if (!station_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Station is required."
            });

        }


        if (!pump_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Pump is required."
            });

        }


        if (!nozzle_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Nozzle is required."
            });

        }


        if (!shift_id) {

            return res.status(400).json({
                success: false,
                message:
                    "Shift is required."
            });

        }


        const litresNumber =
            Number(liters);


        if (
            !Number.isFinite(litresNumber) ||
            litresNumber <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Litres must be a number greater than zero."
            });

        }


        const priceNumber =
            Number(price_per_litre);


        if (
            !Number.isFinite(priceNumber) ||
            priceNumber <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Price per litre must be a number greater than zero."
            });

        }


        /* =====================================================
           CALCULATE AMOUNT ON SERVER
        ===================================================== */

        const calculatedAmount =
            Number(
                (
                    litresNumber *
                    priceNumber
                ).toFixed(2)
            );


        /*
            Do not trust an amount supplied
            by the browser.
        */

        if (
            amount !== undefined &&
            amount !== null &&
            amount !== ""
        ) {

            const suppliedAmount =
                Number(amount);


            if (
                !Number.isFinite(
                    suppliedAmount
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid sale amount."
                });

            }


            /*
                Allow tiny floating-point
                difference.
            */

            if (
                Math.abs(
                    suppliedAmount -
                    calculatedAmount
                ) > 0.01
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Sale amount does not match litres × price per litre."
                });

            }

        }


        /* =====================================================
           PAYMENT METHOD
        ===================================================== */

        const allowedPaymentMethods = [
            "cash",
            "pos",
            "transfer",
            "bank_transfer",
            "card",
            "other"
        ];


        const normalizedPaymentMethod =
            String(
                payment_method ||
                "cash"
            )
                .toLowerCase()
                .trim();


        if (
            !allowedPaymentMethods.includes(
                normalizedPaymentMethod
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment method."
            });

        }


        /* =====================================================
           STATION VALIDATION
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
                address,
                city,
                state,
                is_active
            `)
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

            console.error(
                "CREATE SALE STATION ERROR:",
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
            station.is_active === false
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Cannot record a sale for an inactive station."
            });

        }


        /* =====================================================
           MANAGER / ATTENDANT STATION RESTRICTION
        ===================================================== */

        if (
            userRole === "manager" ||
            userRole === "attendant" ||
            userRole === "staff"
        ) {

            if (
                !userStationId ||
                String(userStationId) !==
                String(station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to record sales for this station."
                });

            }

        }


        /* =====================================================
           PUMP VALIDATION
        ===================================================== */

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
            .eq(
                "station_id",
                station_id
            )
            .maybeSingle();


        if (pumpError) {

            console.error(
                "CREATE SALE PUMP ERROR:",
                pumpError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify pump."
            });

        }


        if (!pump) {

            return res.status(404).json({
                success: false,
                message:
                    "Pump not found for this station."
            });

        }


        if (
            pump.is_active === false
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Cannot record a sale from an inactive pump."
            });

        }


        /* =====================================================
           NOZZLE VALIDATION
        ===================================================== */

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
            .eq(
                "pump_id",
                pump_id
            )
            .maybeSingle();


        if (nozzleError) {

            console.error(
                "CREATE SALE NOZZLE ERROR:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify nozzle."
            });

        }


        if (!nozzle) {

            return res.status(404).json({
                success: false,
                message:
                    "Nozzle not found for this pump."
            });

        }


        if (
            nozzle.is_active === false
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Cannot record a sale from an inactive nozzle."
            });

        }


        /* =====================================================
           SHIFT VALIDATION
        ===================================================== */

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
            .eq(
                "station_id",
                station_id
            )
            .maybeSingle();


        if (shiftError) {

            console.error(
                "CREATE SALE SHIFT ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify shift."
            });

        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found for this station."
            });

        }


        /*
            Sales should only happen while
            the shift is open.
        */

        if (
            String(shift.status)
                .toLowerCase()
                !== "open"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Sales can only be recorded during an open shift."
            });

        }


        /* =====================================================
           INSERT SALE

           IMPORTANT:
           Database column is "litres",
           NOT "liters".
        ===================================================== */

        const {
            data: sale,
            error: createError
        } = await supabaseAdmin
            .from("sales")
            .insert([
                {
                    station_id,

                    pump_id,

                    nozzle_id,

                    shift_id,

                    recorded_by:
                        applicationUserId,

                    litres:
                        litresNumber,

                    price_per_litre:
                        priceNumber,

                    amount:
                        calculatedAmount,

                    payment_method:
                        normalizedPaymentMethod
                }
            ])
            .select(`
                id,
                station_id,
                pump_id,
                nozzle_id,
                shift_id,
                recorded_by,
                litres,
                price_per_litre,
                amount,
                payment_method,
                created_at
            `)
            .single();


        if (createError) {

            console.error(
                "CREATE SALE ERROR:",
                createError
            );

            return res.status(500).json({
                success: false,
                message:
                    createError.message ||
                    "Unable to create sale."
            });

        }


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.status(201).json({

            success: true,

            message:
                "Sale recorded successfully.",

            data: {

                sale: {

                    ...sale,

                    station,

                    pump,

                    nozzle,

                    shift

                }

            }

        });


    } catch (error) {

        console.error(
            "CREATE SALE UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to record sale."
        });

    }

};


/* =========================================================
   GET ALL SALES
   GET /api/sales
========================================================= */

const getSales = async (req, res) => {

    try {

        const applicationUser =
            await resolveApplicationUser(req);


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user could not be identified."
            });

        }


        const organizationId =
            applicationUser.organization_id ||
            getOrganizationId(req);


        const userRole =
            String(
                applicationUser.role ||
                getUserRole(req)
            )
                .toLowerCase()
                .trim();


        const userStationId =
            applicationUser.station_id ||
            getUserStationId(req);


        if (!organizationId) {

            return res.status(401).json({
                success: false,
                message:
                    "Organization could not be identified."
            });

        }


        /* =====================================================
           GET ORGANIZATION STATIONS
        ===================================================== */

        const {
            data: stations,
            error: stationsError
        } = await supabaseAdmin
            .from("stations")
            .select(`
                id,
                organization_id,
                name,
                address,
                city,
                state,
                is_active
            `)
            .eq(
                "organization_id",
                organizationId
            );


        if (stationsError) {

            console.error(
                "GET SALES STATIONS ERROR:",
                stationsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load stations."
            });

        }


        const stationIds =
            (stations || []).map(
                station => station.id
            );


        if (
            stationIds.length === 0
        ) {

            return res.json({
                success: true,
                data: {
                    sales: []
                }
            });

        }


        /* =====================================================
           SALES QUERY

           IMPORTANT:
           Database column is "litres".
        ===================================================== */

        let query =
            supabaseAdmin
                .from("sales")
                .select(`
                    id,
                    station_id,
                    pump_id,
                    nozzle_id,
                    shift_id,
                    recorded_by,
                    litres,
                    price_per_litre,
                    amount,
                    payment_method,
                    created_at
                `)
                .in(
                    "station_id",
                    stationIds
                )
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );


        /* =====================================================
           MANAGER / ATTENDANT RESTRICTION
        ===================================================== */

        if (
            userRole === "manager" ||
            userRole === "attendant" ||
            userRole === "staff"
        ) {

            if (!userStationId) {

                return res.json({
                    success: true,
                    data: {
                        sales: []
                    }
                });

            }


            query =
                query.eq(
                    "station_id",
                    userStationId
                );

        }


        /* =====================================================
           OPTIONAL FILTERS
        ===================================================== */

        const {
            station_id,
            shift_id,
            payment_method,
            date
        } = req.query;


        if (station_id) {

            if (
                !stationIds.includes(
                    station_id
                )
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


        if (shift_id) {

            query =
                query.eq(
                    "shift_id",
                    shift_id
                );

        }


        if (payment_method) {

            query =
                query.eq(
                    "payment_method",
                    String(
                        payment_method
                    )
                        .toLowerCase()
                        .trim()
                );

        }


        /* =====================================================
           DATE FILTER
        ===================================================== */

        if (date) {

            const start =
                `${date}T00:00:00+01:00`;

            const end =
                `${date}T23:59:59+01:00`;

            query =
                query
                    .gte(
                        "created_at",
                        start
                    )
                    .lte(
                        "created_at",
                        end
                    );

        }


        const {
            data: sales,
            error: salesError
        } = await query;


        if (salesError) {

            console.error(
                "GET SALES ERROR:",
                salesError
            );

            return res.status(500).json({
                success: false,
                message:
                    salesError.message ||
                    "Unable to load sales."
            });

        }


        /* =====================================================
           LOOKUP STATIONS
        ===================================================== */

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


        /* =====================================================
           GET PUMPS
        ===================================================== */

        const pumpIds =
            [
                ...new Set(
                    (sales || [])
                        .map(
                            sale =>
                                sale.pump_id
                        )
                        .filter(Boolean)
                )
            ];


        let pumps = [];


        if (
            pumpIds.length > 0
        ) {

            const {
                data,
                error
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
                .in(
                    "id",
                    pumpIds
                );


            if (error) {

                console.error(
                    "GET SALES PUMPS ERROR:",
                    error
                );

            } else {

                pumps =
                    data || [];

            }

        }


        const pumpMap =
            new Map();


        pumps.forEach(
            pump => {

                pumpMap.set(
                    String(pump.id),
                    pump
                );

            }
        );


        /* =====================================================
           GET NOZZLES
        ===================================================== */

        const nozzleIds =
            [
                ...new Set(
                    (sales || [])
                        .map(
                            sale =>
                                sale.nozzle_id
                        )
                        .filter(Boolean)
                )
            ];


        let nozzles = [];


        if (
            nozzleIds.length > 0
        ) {

            const {
                data,
                error
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
                .in(
                    "id",
                    nozzleIds
                );


            if (error) {

                console.error(
                    "GET SALES NOZZLES ERROR:",
                    error
                );

            } else {

                nozzles =
                    data || [];

            }

        }


        const nozzleMap =
            new Map();


        nozzles.forEach(
            nozzle => {

                nozzleMap.set(
                    String(nozzle.id),
                    nozzle
                );

            }
        );


        /* =====================================================
           FORMAT SALES
        ===================================================== */

        const formattedSales =
            (sales || []).map(
                sale => ({

                    /*
                        Keep database value "litres".

                        Also provide "liters" as an
                        API compatibility alias so
                        older frontend code continues
                        to work.
                    */

                    ...sale,

                    liters:
                        sale.litres,

                    station:
                        stationMap.get(
                            String(
                                sale.station_id
                            )
                        ) || null,

                    pump:
                        pumpMap.get(
                            String(
                                sale.pump_id
                            )
                        ) || null,

                    nozzle:
                        nozzleMap.get(
                            String(
                                sale.nozzle_id
                            )
                        ) || null

                })
            );


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.json({

            success: true,

            data: {

                sales:
                    formattedSales

            }

        });


    } catch (error) {

        console.error(
            "GET SALES UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load sales."
        });

    }

};


/* =========================================================
   GET SALE BY ID
   GET /api/sales/:id
========================================================= */

const getSaleById = async (req, res) => {

    try {

        const applicationUser =
            await resolveApplicationUser(req);


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user could not be identified."
            });

        }


        const organizationId =
            applicationUser.organization_id ||
            getOrganizationId(req);


        const userRole =
            String(
                applicationUser.role ||
                getUserRole(req)
            )
                .toLowerCase()
                .trim();


        const userStationId =
            applicationUser.station_id ||
            getUserStationId(req);


        const saleId =
            req.params.id;


        if (!saleId) {

            return res.status(400).json({
                success: false,
                message:
                    "Sale ID is required."
            });

        }


        /* =====================================================
           GET SALE

           IMPORTANT:
           Database column is "litres".
        ===================================================== */

        const {
            data: sale,
            error: saleError
        } = await supabaseAdmin
            .from("sales")
            .select(`
                id,
                station_id,
                pump_id,
                nozzle_id,
                shift_id,
                recorded_by,
                litres,
                price_per_litre,
                amount,
                payment_method,
                created_at
            `)
            .eq(
                "id",
                saleId
            )
            .maybeSingle();


        if (saleError) {

            console.error(
                "GET SALE ERROR:",
                saleError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load sale."
            });

        }


        if (!sale) {

            return res.status(404).json({
                success: false,
                message:
                    "Sale not found."
            });

        }


        /* =====================================================
           VERIFY STATION BELONGS TO ORGANIZATION
        ===================================================== */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("*")
            .eq(
                "id",
                sale.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "GET SALE STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify sale station."
            });

        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Sale does not belong to your organization."
            });

        }


        /* =====================================================
           STATION ACCESS
        ===================================================== */

        if (
            userRole === "manager" ||
            userRole === "attendant" ||
            userRole === "staff"
        ) {

            if (
                !userStationId ||
                String(userStationId) !==
                String(sale.station_id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to view this sale."
                });

            }

        }


        /* =====================================================
           LOAD PUMP
        ===================================================== */

        const {
            data: pump
        } = await supabaseAdmin
            .from("pumps")
            .select("*")
            .eq(
                "id",
                sale.pump_id
            )
            .maybeSingle();


        /* =====================================================
           LOAD NOZZLE
        ===================================================== */

        const {
            data: nozzle
        } = await supabaseAdmin
            .from("nozzles")
            .select("*")
            .eq(
                "id",
                sale.nozzle_id
            )
            .maybeSingle();


        /* =====================================================
           LOAD SHIFT
        ===================================================== */

        const {
            data: shift
        } = await supabaseAdmin
            .from("shifts")
            .select("*")
            .eq(
                "id",
                sale.shift_id
            )
            .maybeSingle();


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.json({

            success: true,

            data: {

                sale: {

                    ...sale,

                    /*
                        Compatibility alias for
                        frontend code using liters.
                    */

                    liters:
                        sale.litres,

                    station,

                    pump,

                    nozzle,

                    shift

                }

            }

        });


    } catch (error) {

        console.error(
            "GET SALE UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load sale."
        });

    }

};


/* =========================================================
   DELETE SALE
   DELETE /api/sales/:id
========================================================= */

const deleteSale = async (req, res) => {

    try {

        const applicationUser =
            await resolveApplicationUser(req);


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated application user could not be identified."
            });

        }


        const organizationId =
            applicationUser.organization_id ||
            getOrganizationId(req);


        const userRole =
            String(
                applicationUser.role ||
                getUserRole(req)
            )
                .toLowerCase()
                .trim();


        /*
            Only owner/admin should be able
            to permanently delete sales.
        */

        if (
            userRole !== "owner" &&
            userRole !== "admin"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Only owners and administrators can delete sales."
            });

        }


        const saleId =
            req.params.id;


        if (!saleId) {

            return res.status(400).json({
                success: false,
                message:
                    "Sale ID is required."
            });

        }


        /* =====================================================
           GET SALE
        ===================================================== */

        const {
            data: sale,
            error: saleError
        } = await supabaseAdmin
            .from("sales")
            .select(`
                id,
                station_id
            `)
            .eq(
                "id",
                saleId
            )
            .maybeSingle();


        if (saleError) {

            console.error(
                "DELETE SALE LOOKUP ERROR:",
                saleError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify sale."
            });

        }


        if (!sale) {

            return res.status(404).json({
                success: false,
                message:
                    "Sale not found."
            });

        }


        /* =====================================================
           VERIFY ORGANIZATION
        ===================================================== */

        const {
            data: station,
            error: stationError
        } = await supabaseAdmin
            .from("stations")
            .select("id")
            .eq(
                "id",
                sale.station_id
            )
            .eq(
                "organization_id",
                organizationId
            )
            .maybeSingle();


        if (stationError) {

            console.error(
                "DELETE SALE STATION ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify sale organization."
            });

        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Sale does not belong to your organization."
            });

        }


        /* =====================================================
           DELETE
        ===================================================== */

        const {
            error: deleteError
        } = await supabaseAdmin
            .from("sales")
            .delete()
            .eq(
                "id",
                saleId
            );


        if (deleteError) {

            console.error(
                "DELETE SALE ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    deleteError.message ||
                    "Unable to delete sale."
            });

        }


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.json({

            success: true,

            message:
                "Sale deleted successfully."

        });


    } catch (error) {

        console.error(
            "DELETE SALE UNEXPECTED ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to delete sale."
        });

    }

};


/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {

    createSale,

    getSales,

    getSaleById,

    deleteSale

};