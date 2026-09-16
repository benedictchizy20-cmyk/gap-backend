/* =========================================================
   FUELGAP - REPORT CONTROLLER
   SUPABASE + EXPRESS
   HTTPONLY COOKIE SESSION

   PRODUCTION REPORTING VERSION

   DATA SOURCES:
   - stations
   - shifts
   - sales
   - meter_readings
   - gaps

   REPORT FEATURES:
   - Organization scoped
   - Station scoped
   - Date filtering
   - Sales summary
   - Meter reading summary
   - Gap / variance summary
   - Shift summary
   - Detailed records
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   GET APPLICATION USER
========================================================= */

const getApplicationUser = async (authUserId) => {

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
        .eq("auth_user_id", authUserId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data || null;
};


/* =========================================================
   GET ORGANIZATION ID
========================================================= */

const getUserOrganizationId = async (req) => {

    if (req.organizationId) {
        return req.organizationId;
    }

    if (req.profile?.organization_id) {
        return req.profile.organization_id;
    }

    if (req.user?.organization_id) {
        return req.user.organization_id;
    }

    if (req.user?.id) {

        const applicationUser =
            await getApplicationUser(req.user.id);

        if (applicationUser) {
            return applicationUser.organization_id;
        }
    }

    return null;
};


/* =========================================================
   GET USER ROLE
========================================================= */

const getUserRole = (applicationUser) => {

    return String(applicationUser?.role || "")
        .toLowerCase()
        .trim();
};


/* =========================================================
   ROUND MONEY
========================================================= */

const roundMoney = (value) => {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.round(
        (number + Number.EPSILON) * 100
    ) / 100;
};


/* =========================================================
   ROUND LITRES
========================================================= */

const roundLitres = (value) => {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.round(
        (number + Number.EPSILON) * 1000
    ) / 1000;
};


/* =========================================================
   NUMBER HELPER
========================================================= */

const safeNumber = (value) => {

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
};


/* =========================================================
   DATE VALIDATION
========================================================= */

const isValidDateString = (value) => {

    if (!value) {
        return false;
    }

    const date = new Date(value);

    return !Number.isNaN(date.getTime());
};


/* =========================================================
   GET DATE RANGE
========================================================= */

const getDateRange = (req) => {

    const {
        start_date,
        end_date
    } = req.query;

    let startDate = null;
    let endDate = null;


    /* -----------------------------------------------------
       START DATE
    ----------------------------------------------------- */

    if (start_date) {

        if (!isValidDateString(start_date)) {

            throw new Error(
                "start_date must be a valid date"
            );
        }

        startDate =
            `${start_date}T00:00:00.000Z`;
    }


    /* -----------------------------------------------------
       END DATE
    ----------------------------------------------------- */

    if (end_date) {

        if (!isValidDateString(end_date)) {

            throw new Error(
                "end_date must be a valid date"
            );
        }

        endDate =
            `${end_date}T23:59:59.999Z`;
    }


    /* -----------------------------------------------------
       ONLY START DATE
    ----------------------------------------------------- */

    if (startDate && !endDate) {

        endDate =
            `${start_date}T23:59:59.999Z`;
    }


    /* -----------------------------------------------------
       ONLY END DATE
    ----------------------------------------------------- */

    if (!startDate && endDate) {

        startDate =
            `${end_date}T00:00:00.000Z`;
    }


    /* -----------------------------------------------------
       DATE ORDER VALIDATION
    ----------------------------------------------------- */

    if (
        startDate &&
        endDate &&
        new Date(startDate) > new Date(endDate)
    ) {

        throw new Error(
            "start_date cannot be later than end_date"
        );
    }


    return {
        startDate,
        endDate
    };
};


/* =========================================================
   APPLY DATE FILTER
========================================================= */

const applyDateFilter = (
    query,
    column,
    startDate,
    endDate
) => {

    let filteredQuery = query;


    if (startDate) {

        filteredQuery =
            filteredQuery.gte(
                column,
                startDate
            );
    }


    if (endDate) {

        filteredQuery =
            filteredQuery.lte(
                column,
                endDate
            );
    }


    return filteredQuery;
};


/* =========================================================
   GET REPORT
   GET /api/reports
========================================================= */

const getReport = async (req, res) => {

    try {

        /* =====================================================
           AUTHENTICATION
        ===================================================== */

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message:
                    "Authenticated user not found"
            });
        }


        /* =====================================================
           APPLICATION USER
        ===================================================== */

        const applicationUser =
            await getApplicationUser(req.user.id);


        if (!applicationUser) {

            return res.status(401).json({
                success: false,
                message:
                    "Application user profile not found"
            });
        }


        /* =====================================================
           ACCOUNT STATUS
        ===================================================== */

        if (applicationUser.is_active === false) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive"
            });
        }


        /* =====================================================
           ORGANIZATION
        ===================================================== */

        const organizationId =
            await getUserOrganizationId(req);


        if (!organizationId) {

            return res.status(400).json({
                success: false,
                message:
                    "Organization could not be determined"
            });
        }


        /* =====================================================
           USER ROLE
        ===================================================== */

        const role =
            getUserRole(applicationUser);


        const unrestrictedRoles = [
            "owner",
            "admin"
        ];


        const isRestrictedUser =
            !unrestrictedRoles.includes(role);


        /* =====================================================
           REQUEST FILTERS
           
           IMPORTANT:
           Keep these names exactly the same as the
           frontend/API query parameters.
        ===================================================== */

        const {
            station_id = "",
            shift_id = "",
            status = "",
            payment_method = "",
            start_date = "",
            end_date = ""
        } = req.query;


        /* =====================================================
           DATE RANGE
        ===================================================== */

        const {
            startDate,
            endDate
        } = getDateRange(req);


        /* =====================================================
           REPORT LOGGING
        ===================================================== */

        console.log("==============================================");
        console.log("GENERATING FUELGAP REPORT");
        console.log("Organization:", organizationId);
        console.log("User:", applicationUser.id);
        console.log("Role:", role);
        console.log("Station:", station_id || "ALL");
        console.log("Shift:", shift_id || "ALL");
        console.log("Start:", startDate || "ALL");
        console.log("End:", endDate || "ALL");
        console.log("==============================================");


        /* =====================================================
           STATION ACCESS
        ===================================================== */

        let stationQuery =
            supabaseAdmin
                .from("stations")
                .select(`
                    id,
                    organization_id,
                    name,
                    address,
                    city,
                    state,
                    is_active,
                    created_at
                `)
                .eq(
                    "organization_id",
                    organizationId
                );


        /* -----------------------------------------------------
           RESTRICTED USER STATION
        ----------------------------------------------------- */

        if (
            isRestrictedUser &&
            applicationUser.station_id
        ) {

            stationQuery =
                stationQuery.eq(
                    "id",
                    applicationUser.station_id
                );
        }


        /* -----------------------------------------------------
           REQUESTED STATION
        ----------------------------------------------------- */

        if (station_id) {

            stationQuery =
                stationQuery.eq(
                    "id",
                    station_id
                );
        }


        /* -----------------------------------------------------
           GET STATIONS
        ----------------------------------------------------- */

        const {
            data: stations,
            error: stationsError
        } = await stationQuery;


        if (stationsError) {

            console.error(
                "REPORT STATIONS ERROR:",
                stationsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to retrieve report stations",
                error:
                    stationsError.message
            });
        }


        const stationRecords =
            Array.isArray(stations)
                ? stations
                : [];


        /* -----------------------------------------------------
           STATION ACCESS VALIDATION
        ----------------------------------------------------- */

        if (
            station_id &&
            stationRecords.length === 0
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to the selected station"
            });
        }


        const stationIds =
            stationRecords.map(
                station => station.id
            );


        /* =====================================================
           GET SHIFTS
        ===================================================== */

        let shifts = [];


        if (stationIds.length) {

            let shiftQuery =
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
                    .in(
                        "station_id",
                        stationIds
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    );


            /* -------------------------------------------------
               SHIFT FILTER
            ------------------------------------------------- */

            if (shift_id) {

                shiftQuery =
                    shiftQuery.eq(
                        "id",
                        shift_id
                    );
            }


            /* -------------------------------------------------
               SHIFT DATE FILTER
            ------------------------------------------------- */

            if (startDate) {

                shiftQuery =
                    shiftQuery.gte(
                        "created_at",
                        startDate
                    );
            }


            if (endDate) {

                shiftQuery =
                    shiftQuery.lte(
                        "created_at",
                        endDate
                    );
            }


            /* -------------------------------------------------
               EXECUTE SHIFT QUERY
            ------------------------------------------------- */

            const {
                data,
                error
            } = await shiftQuery;


            if (error) {

                console.error(
                    "REPORT SHIFTS ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Failed to retrieve shift report data",
                    error:
                        error.message
                });
            }


            shifts =
                Array.isArray(data)
                    ? data
                    : [];
        }


        /* =====================================================
           GET SALES
        ===================================================== */

        let sales = [];


        if (stationIds.length) {

            let salesQuery =
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
                            ascending: false
                        }
                    );


            /* -------------------------------------------------
               SHIFT FILTER
            ------------------------------------------------- */

            if (shift_id) {

                salesQuery =
                    salesQuery.eq(
                        "shift_id",
                        shift_id
                    );
            }


            /* -------------------------------------------------
               PAYMENT METHOD FILTER
            ------------------------------------------------- */

            if (payment_method) {

                salesQuery =
                    salesQuery.eq(
                        "payment_method",
                        payment_method
                    );
            }


            /* -------------------------------------------------
               DATE FILTER
            ------------------------------------------------- */

            salesQuery =
                applyDateFilter(
                    salesQuery,
                    "created_at",
                    startDate,
                    endDate
                );


            /* -------------------------------------------------
               EXECUTE SALES QUERY
            ------------------------------------------------- */

            const {
                data,
                error
            } = await salesQuery;


            if (error) {

                console.error(
                    "REPORT SALES ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Failed to retrieve sales report data",
                    error:
                        error.message
                });
            }


            sales =
                Array.isArray(data)
                    ? data
                    : [];
        }


        /* =====================================================
           GET METER READINGS
        ===================================================== */

        let meterReadings = [];


        if (stationIds.length) {

            let meterQuery =
                supabaseAdmin
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
                        stationIds
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    );


            /* -------------------------------------------------
               SHIFT FILTER
            ------------------------------------------------- */

            if (shift_id) {

                meterQuery =
                    meterQuery.eq(
                        "shift_id",
                        shift_id
                    );
            }


            /* -------------------------------------------------
               DATE FILTER
            ------------------------------------------------- */

            meterQuery =
                applyDateFilter(
                    meterQuery,
                    "created_at",
                    startDate,
                    endDate
                );


            /* -------------------------------------------------
               EXECUTE METER QUERY
            ------------------------------------------------- */

            const {
                data,
                error
            } = await meterQuery;


            if (error) {

                console.error(
                    "REPORT METER ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Failed to retrieve meter reading report data",
                    error:
                        error.message
                });
            }


            meterReadings =
                Array.isArray(data)
                    ? data
                    : [];
        }


        /* =====================================================
           GET GAPS
        ===================================================== */

        let gaps = [];


        if (stationIds.length) {

            let gapsQuery =
                supabaseAdmin
                    .from("gaps")
                    .select(`
                        id,
                        station_id,
                        pump_id,
                        nozzle_id,
                        shift_id,
                        opening_reading,
                        closing_reading,
                        litres_sold,
                        expected_sales,
                        actual_sales,
                        gap_amount,
                        status,
                        notes,
                        created_at
                    `)
                    .in(
                        "station_id",
                        stationIds
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    );


            /* -------------------------------------------------
               SHIFT FILTER
            ------------------------------------------------- */

            if (shift_id) {

                gapsQuery =
                    gapsQuery.eq(
                        "shift_id",
                        shift_id
                    );
            }


            /* -------------------------------------------------
               STATUS FILTER
            ------------------------------------------------- */

            if (status) {

                gapsQuery =
                    gapsQuery.eq(
                        "status",
                        status
                    );
            }


            /* -------------------------------------------------
               DATE FILTER
            ------------------------------------------------- */

            gapsQuery =
                applyDateFilter(
                    gapsQuery,
                    "created_at",
                    startDate,
                    endDate
                );


            /* -------------------------------------------------
               EXECUTE GAP QUERY
            ------------------------------------------------- */

            const {
                data,
                error
            } = await gapsQuery;


            if (error) {

                console.error(
                    "REPORT GAPS ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Failed to retrieve gap report data",
                    error:
                        error.message
                });
            }


            gaps =
                Array.isArray(data)
                    ? data
                    : [];
        }


        /* =====================================================
           BUILD STATION MAP
        ===================================================== */

        const stationMap =
            new Map();


        for (const station of stationRecords) {

            stationMap.set(
                String(station.id),
                station
            );
        }


        /* =====================================================
           BUILD SHIFT MAP
        ===================================================== */

        const shiftMap =
            new Map();


        for (const shift of shifts) {

            shiftMap.set(
                String(shift.id),
                shift
            );
        }


        /* =====================================================
           SALES SUMMARY
        ===================================================== */

        let totalSales = 0;
        let totalLitresSold = 0;
        let totalTransactions = 0;


        const paymentSummary = {};


        for (const sale of sales) {

            const litres =
                safeNumber(
                    sale.litres
                );


            const amount =
                safeNumber(
                    sale.amount
                );


            totalLitresSold += litres;

            totalSales += amount;

            totalTransactions += 1;


            const method =
                String(
                    sale.payment_method ||
                    "other"
                )
                    .toLowerCase()
                    .trim();


            if (!paymentSummary[method]) {

                paymentSummary[method] = {

                    payment_method:
                        method,

                    transactions:
                        0,

                    litres:
                        0,

                    amount:
                        0
                };
            }


            paymentSummary[method].transactions += 1;

            paymentSummary[method].litres +=
                litres;

            paymentSummary[method].amount +=
                amount;
        }


        totalLitresSold =
            roundLitres(
                totalLitresSold
            );


        totalSales =
            roundMoney(
                totalSales
            );


        const paymentSummaryRecords =
            Object.values(
                paymentSummary
            )
                .map(item => ({

                    payment_method:
                        item.payment_method,

                    transactions:
                        item.transactions,

                    litres:
                        roundLitres(
                            item.litres
                        ),

                    amount:
                        roundMoney(
                            item.amount
                        )
                }))
                .sort(
                    (a, b) =>
                        b.amount - a.amount
                );


        /* =====================================================
           GAP SUMMARY
        ===================================================== */

        let totalGapAmount = 0;

        let totalExpectedSales = 0;

        let totalActualSales = 0;

        let totalMeterLitres = 0;

        let normalCount = 0;

        let varianceCount = 0;


        for (const gap of gaps) {

            const gapAmount =
                safeNumber(
                    gap.gap_amount
                );


            const expectedSales =
                safeNumber(
                    gap.expected_sales
                );


            const actualSales =
                safeNumber(
                    gap.actual_sales
                );


            const litresSold =
                safeNumber(
                    gap.litres_sold
                );


            totalGapAmount +=
                gapAmount;


            totalExpectedSales +=
                expectedSales;


            totalActualSales +=
                actualSales;


            totalMeterLitres +=
                litresSold;


            const gapStatus =
                String(
                    gap.status || ""
                )
                    .toLowerCase()
                    .trim();


            if (gapStatus === "normal") {

                normalCount++;

            } else if (
                gapStatus === "variance"
            ) {

                varianceCount++;
            }
        }


        totalGapAmount =
            roundMoney(
                totalGapAmount
            );


        totalExpectedSales =
            roundMoney(
                totalExpectedSales
            );


        totalActualSales =
            roundMoney(
                totalActualSales
            );


        totalMeterLitres =
            roundLitres(
                totalMeterLitres
            );


        /* =====================================================
           METER SUMMARY
        ===================================================== */

        let openingCount = 0;

        let periodicCount = 0;

        let closingCount = 0;

        let correctionCount = 0;

        let evidenceCount = 0;


        for (
            const reading
            of meterReadings
        ) {

            const type =
                String(
                    reading.reading_type || ""
                )
                    .toLowerCase()
                    .trim();


            if (type === "opening") {
                openingCount++;
            }


            if (type === "periodic") {
                periodicCount++;
            }


            if (type === "closing") {
                closingCount++;
            }


            if (type === "correction") {
                correctionCount++;
            }


            if (
                reading.photo_url &&
                String(
                    reading.photo_url
                ).trim()
            ) {

                evidenceCount++;
            }
        }


        /* =====================================================
           SHIFT SUMMARY
        ===================================================== */

        let scheduledShifts = 0;

        let openShifts = 0;

        let closedShifts = 0;

        let cancelledShifts = 0;


        for (
            const shift
            of shifts
        ) {

            const shiftStatus =
                String(
                    shift.status || ""
                )
                    .toLowerCase()
                    .trim();


            if (shiftStatus === "scheduled") {
                scheduledShifts++;
            }


            if (shiftStatus === "open") {
                openShifts++;
            }


            if (shiftStatus === "closed") {
                closedShifts++;
            }


            if (shiftStatus === "cancelled") {
                cancelledShifts++;
            }
        }


        /* =====================================================
           DETAILED SALES
        ===================================================== */

        const detailedSales =
            sales.map(
                sale => {

                    const station =
                        stationMap.get(
                            String(
                                sale.station_id
                            )
                        );


                    const shift =
                        shiftMap.get(
                            String(
                                sale.shift_id
                            )
                        );


                    return {

                        id:
                            sale.id,

                        station_id:
                            sale.station_id,

                        station_name:
                            station?.name ||
                            "Unknown Station",

                        pump_id:
                            sale.pump_id,

                        nozzle_id:
                            sale.nozzle_id,

                        shift_id:
                            sale.shift_id,

                        shift_name:
                            shift?.shift_name ||
                            "Unknown Shift",

                        litres:
                            roundLitres(
                                sale.litres
                            ),

                        price_per_litre:
                            roundMoney(
                                sale.price_per_litre
                            ),

                        amount:
                            roundMoney(
                                sale.amount
                            ),

                        payment_method:
                            sale.payment_method,

                        recorded_by:
                            sale.recorded_by,

                        created_at:
                            sale.created_at
                    };
                }
            );


        /* =====================================================
           DETAILED METER READINGS
        ===================================================== */

        const detailedMeterReadings =
            meterReadings.map(
                reading => {

                    const station =
                        stationMap.get(
                            String(
                                reading.station_id
                            )
                        );


                    const shift =
                        shiftMap.get(
                            String(
                                reading.shift_id
                            )
                        );


                    return {

                        id:
                            reading.id,

                        station_id:
                            reading.station_id,

                        station_name:
                            station?.name ||
                            "Unknown Station",

                        pump_id:
                            reading.pump_id,

                        nozzle_id:
                            reading.nozzle_id,

                        shift_id:
                            reading.shift_id,

                        shift_name:
                            shift?.shift_name ||
                            "Unknown Shift",

                        reading_type:
                            reading.reading_type,

                        reading:
                            safeNumber(
                                reading.reading
                            ),

                        photo_url:
                            reading.photo_url,

                        captured_at:
                            reading.captured_at,

                        recorded_by:
                            reading.recorded_by,

                        created_at:
                            reading.created_at
                    };
                }
            );


        /* =====================================================
           DETAILED GAPS
        ===================================================== */

        const detailedGaps =
            gaps.map(
                gap => {

                    const station =
                        stationMap.get(
                            String(
                                gap.station_id
                            )
                        );


                    const shift =
                        shiftMap.get(
                            String(
                                gap.shift_id
                            )
                        );


                    const opening =
                        safeNumber(
                            gap.opening_reading
                        );


                    const closing =
                        safeNumber(
                            gap.closing_reading
                        );


                    const litresSold =
                        safeNumber(
                            gap.litres_sold
                        );


                    const expectedSales =
                        safeNumber(
                            gap.expected_sales
                        );


                    const actualSales =
                        safeNumber(
                            gap.actual_sales
                        );


                    const gapAmount =
                        safeNumber(
                            gap.gap_amount
                        );


                    return {

                        id:
                            gap.id,

                        station_id:
                            gap.station_id,

                        station_name:
                            station?.name ||
                            "Unknown Station",

                        pump_id:
                            gap.pump_id,

                        nozzle_id:
                            gap.nozzle_id,

                        shift_id:
                            gap.shift_id,

                        shift_name:
                            shift?.shift_name ||
                            "Unknown Shift",

                        opening_reading:
                            opening,

                        closing_reading:
                            closing,

                        litres_sold:
                            roundLitres(
                                litresSold
                            ),

                        expected_sales:
                            roundMoney(
                                expectedSales
                            ),

                        actual_sales:
                            roundMoney(
                                actualSales
                            ),

                        gap_amount:
                            roundMoney(
                                gapAmount
                            ),

                        status:
                            gap.status,

                        notes:
                            gap.notes,

                        created_at:
                            gap.created_at
                    };
                }
            );


        /* =====================================================
           STATION SUMMARY
        ===================================================== */

        const stationSummaryMap =
            new Map();


        for (
            const station
            of stationRecords
        ) {

            stationSummaryMap.set(
                String(
                    station.id
                ),
                {

                    station_id:
                        station.id,

                    station_name:
                        station.name,

                    city:
                        station.city,

                    state:
                        station.state,

                    sales:
                        0,

                    litres:
                        0,

                    transactions:
                        0,

                    gap_amount:
                        0,

                    variance_count:
                        0,

                    normal_count:
                        0
                }
            );
        }


        /* -----------------------------------------------------
           STATION SALES
        ----------------------------------------------------- */

        for (
            const sale
            of sales
        ) {

            const key =
                String(
                    sale.station_id
                );


            if (
                !stationSummaryMap.has(key)
            ) {
                continue;
            }


            const item =
                stationSummaryMap.get(
                    key
                );


            item.sales +=
                safeNumber(
                    sale.amount
                );


            item.litres +=
                safeNumber(
                    sale.litres
                );


            item.transactions += 1;
        }


        /* -----------------------------------------------------
           STATION GAPS
        ----------------------------------------------------- */

        for (
            const gap
            of gaps
        ) {

            const key =
                String(
                    gap.station_id
                );


            if (
                !stationSummaryMap.has(key)
            ) {
                continue;
            }


            const item =
                stationSummaryMap.get(
                    key
                );


            item.gap_amount +=
                safeNumber(
                    gap.gap_amount
                );


            const gapStatus =
                String(
                    gap.status || ""
                )
                    .toLowerCase()
                    .trim();


            if (
                gapStatus === "variance"
            ) {

                item.variance_count++;

            } else if (
                gapStatus === "normal"
            ) {

                item.normal_count++;
            }
        }


        /* -----------------------------------------------------
           FINAL STATION SUMMARY
        ----------------------------------------------------- */

        const stationSummary =
            Array.from(
                stationSummaryMap.values()
            )
                .map(
                    item => ({

                        station_id:
                            item.station_id,

                        station_name:
                            item.station_name,

                        city:
                            item.city,

                        state:
                            item.state,

                        sales:
                            roundMoney(
                                item.sales
                            ),

                        litres:
                            roundLitres(
                                item.litres
                            ),

                        transactions:
                            item.transactions,

                        gap_amount:
                            roundMoney(
                                item.gap_amount
                            ),

                        variance_count:
                            item.variance_count,

                        normal_count:
                            item.normal_count
                    })
                )
                .sort(
                    (a, b) =>
                        b.sales - a.sales
                );


        /* =====================================================
           FINAL RESPONSE
        ===================================================== */

        return res.status(200).json({

            success: true,

            message:
                "FuelGap report generated successfully",

            data: {

                /* -------------------------------------------------
                   FILTERS
                ------------------------------------------------- */

                filters: {

                    station_id:
                        station_id || null,

                    shift_id:
                        shift_id || null,

                    status:
                        status || null,

                    payment_method:
                        payment_method || null,

                    start_date:
                        start_date || null,

                    end_date:
                        end_date || null
                },


                /* -------------------------------------------------
                   SUMMARY
                ------------------------------------------------- */

                summary: {

                    stations:
                        stationRecords.length,

                    shifts:
                        shifts.length,

                    sales_transactions:
                        totalTransactions,

                    total_litres_sold:
                        totalLitresSold,

                    total_sales:
                        totalSales,

                    total_expected_sales:
                        totalExpectedSales,

                    total_actual_sales:
                        totalActualSales,

                    total_gap_amount:
                        totalGapAmount,

                    total_meter_litres:
                        totalMeterLitres,

                    normal_count:
                        normalCount,

                    variance_count:
                        varianceCount,

                    opening_readings:
                        openingCount,

                    periodic_readings:
                        periodicCount,

                    closing_readings:
                        closingCount,

                    correction_readings:
                        correctionCount,

                    evidence_count:
                        evidenceCount
                },


                /* -------------------------------------------------
                   PAYMENT SUMMARY
                ------------------------------------------------- */

                payment_summary:
                    paymentSummaryRecords,


                /* -------------------------------------------------
                   SHIFT SUMMARY
                ------------------------------------------------- */

                shift_summary: {

                    scheduled:
                        scheduledShifts,

                    open:
                        openShifts,

                    closed:
                        closedShifts,

                    cancelled:
                        cancelledShifts
                },


                /* -------------------------------------------------
                   STATION SUMMARY
                ------------------------------------------------- */

                station_summary:
                    stationSummary,


                /* -------------------------------------------------
                   SALES
                ------------------------------------------------- */

                sales:
                    detailedSales,


                /* -------------------------------------------------
                   METER READINGS
                ------------------------------------------------- */

                meter_readings:
                    detailedMeterReadings,


                /* -------------------------------------------------
                   GAPS
                ------------------------------------------------- */

                gaps:
                    detailedGaps
            }
        });

    } catch (error) {

        console.error(
            "GET REPORT EXCEPTION:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error?.message ||
                "Server error while generating report",

            error:
                error?.message ||
                "Unknown server error"
        });
    }
};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
    getReport
};