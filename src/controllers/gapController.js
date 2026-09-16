/* =========================================================
   FUELGAP - GAP / RECONCILIATION CONTROLLER
   SUPABASE + EXPRESS
   HTTPONLY COOKIE SESSION

   PRODUCTION VERSION

   AUTOMATIC RECONCILIATION:

   STATION
      ↓
   PUMP
      ↓
   NOZZLE
      ↓
   SHIFT
      ↓
   OPENING METER
      ↓
   CLOSING / PERIODIC METER
      ↓
   SALES
      ↓
   RECONCILIATION
      ↓
   GAP / VARIANCE
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
   GET USER ORGANIZATION
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
   ROUND MONEY
========================================================= */

const roundMoney = (value) => {

    return Math.round(
        (Number(value) + Number.EPSILON) * 100
    ) / 100;
};


/* =========================================================
   ROUND LITRES
========================================================= */

const roundLitres = (value) => {

    return Math.round(
        (Number(value) + Number.EPSILON) * 1000
    ) / 1000;
};


/* =========================================================
   VALID ID
========================================================= */

const isValidId = (value) => {

    return (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
    );
};


/* =========================================================
   CREATE GAP
   POST /api/gaps
========================================================= */

const createGap = async (req, res) => {

    try {

        /* =====================================================
           AUTHENTICATION
        ===================================================== */

        if (!req.user || !req.user.id) {

            return res.status(401).json({
                success: false,
                message: "Authenticated user not found"
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
                message: "Application user profile not found"
            });
        }


        if (applicationUser.is_active === false) {

            return res.status(403).json({
                success: false,
                message: "Your account is inactive"
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
                message: "Organization could not be determined"
            });
        }


        /* =====================================================
           REQUEST BODY
        ===================================================== */

        const {
            station_id,
            pump_id,
            nozzle_id,
            shift_id,
            notes
        } = req.body;


        /* =====================================================
           DEBUG REQUEST
        ===================================================== */

        console.log("==============================================");
        console.log("CREATE GAP REQUEST");
        console.log("Station ID:", station_id);
        console.log("Pump ID:", pump_id);
        console.log("Nozzle ID:", nozzle_id);
        console.log("Shift ID:", shift_id);
        console.log("Organization ID:", organizationId);
        console.log("User ID:", applicationUser.id);
        console.log("==============================================");


        /* =====================================================
           BASIC VALIDATION
        ===================================================== */

        if (!isValidId(station_id)) {

            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });
        }


        if (!isValidId(pump_id)) {

            return res.status(400).json({
                success: false,
                message: "Pump ID is required"
            });
        }


        if (!isValidId(nozzle_id)) {

            return res.status(400).json({
                success: false,
                message: "Nozzle ID is required"
            });
        }


        if (!isValidId(shift_id)) {

            return res.status(400).json({
                success: false,
                message: "Shift ID is required"
            });
        }


        /* =====================================================
           VERIFY STATION
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
            .eq("id", station_id)
            .eq("organization_id", organizationId)
            .maybeSingle();


        if (stationError) {

            console.error(
                "GAP STATION LOOKUP ERROR:",
                stationError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify station",
                error: stationError.message,
                code: stationError.code || null,
                details: stationError.details || null,
                hint: stationError.hint || null
            });
        }


        if (!station) {

            return res.status(404).json({
                success: false,
                message:
                    "Station not found or does not belong to your organization"
            });
        }


        if (station.is_active === false) {

            return res.status(400).json({
                success: false,
                message: "Selected station is inactive"
            });
        }


        /* =====================================================
           VERIFY STATION ACCESS
        ===================================================== */

        const role =
            String(applicationUser.role || "")
                .toLowerCase()
                .trim();


        const unrestrictedRoles = [
            "owner",
            "admin"
        ];


        if (
            !unrestrictedRoles.includes(role) &&
            applicationUser.station_id &&
            String(applicationUser.station_id) !== String(station_id)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You do not have access to this station"
            });
        }


        /* =====================================================
           VERIFY PUMP
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
            .eq("id", pump_id)
            .eq("station_id", station_id)
            .maybeSingle();


        if (pumpError) {

            console.error(
                "GAP PUMP LOOKUP ERROR:",
                pumpError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify pump",
                error: pumpError.message,
                code: pumpError.code || null,
                details: pumpError.details || null,
                hint: pumpError.hint || null
            });
        }


        if (!pump) {

            return res.status(404).json({
                success: false,
                message:
                    "Pump not found or does not belong to the selected station"
            });
        }


        if (pump.is_active === false) {

            return res.status(400).json({
                success: false,
                message: "Selected pump is inactive"
            });
        }


        /* =====================================================
           VERIFY NOZZLE
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
            .eq("id", nozzle_id)
            .eq("pump_id", pump_id)
            .maybeSingle();


        if (nozzleError) {

            console.error(
                "GAP NOZZLE LOOKUP ERROR:",
                nozzleError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify nozzle",
                error: nozzleError.message,
                code: nozzleError.code || null,
                details: nozzleError.details || null,
                hint: nozzleError.hint || null
            });
        }


        if (!nozzle) {

            return res.status(404).json({
                success: false,
                message:
                    "Nozzle not found or does not belong to the selected pump"
            });
        }


        if (nozzle.is_active === false) {

            return res.status(400).json({
                success: false,
                message: "Selected nozzle is inactive"
            });
        }


        /* =====================================================
           PRICE PER LITRE
        ===================================================== */

        const pricePerLitre =
            Number(nozzle.price_per_litre);


        if (
            !Number.isFinite(pricePerLitre) ||
            pricePerLitre < 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Nozzle price per litre is invalid"
            });
        }


        /* =====================================================
           VERIFY SHIFT
        ===================================================== */

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
            .eq("id", shift_id)
            .eq("station_id", station_id)
            .maybeSingle();


        if (shiftError) {

            console.error(
                "GAP SHIFT LOOKUP ERROR:",
                shiftError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to verify shift",
                error: shiftError.message,
                code: shiftError.code || null,
                details: shiftError.details || null,
                hint: shiftError.hint || null
            });
        }


        if (!shift) {

            return res.status(404).json({
                success: false,
                message:
                    "Shift not found or does not belong to the selected station"
            });
        }


        const shiftStatus =
            String(shift.status || "")
                .toLowerCase()
                .trim();


        if (
            shiftStatus !== "open" &&
            shiftStatus !== "closed"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    `Selected shift cannot be reconciled because its status is "${shift.status}"`
            });
        }


        /* =====================================================
           =====================================================
           GET ALL METER READINGS FOR THIS COMBINATION
           =====================================================

           IMPORTANT:

           We first retrieve ALL readings for:

           station
           pump
           nozzle
           shift

           Then we select the correct reading in JavaScript.

           This gives us much better debugging than relying on
           one very strict Supabase query.
        ===================================================== */

        console.log("");
        console.log("==============================================");
        console.log("SEARCHING METER READINGS");
        console.log("Station:", station_id);
        console.log("Pump:", pump_id);
        console.log("Nozzle:", nozzle_id);
        console.log("Shift:", shift_id);
        console.log("==============================================");


        const {
            data: meterReadings,
            error: meterReadingsError
        } = await supabaseAdmin
            .from("meter_readings")
            .select(`
                id,
                station_id,
                pump_id,
                nozzle_id,
                shift_id,
                reading_type,
                reading,
                recorded_by,
                photo_url,
                captured_at,
                created_at
            `)
            .eq("station_id", station_id)
            .eq("pump_id", pump_id)
            .eq("nozzle_id", nozzle_id)
            .order("created_at", {
                ascending: true
            });


        if (meterReadingsError) {

            console.error(
                "GAP METER READINGS LOOKUP ERROR:",
                meterReadingsError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to retrieve meter readings",
                error:
                    meterReadingsError.message,
                code:
                    meterReadingsError.code || null,
                details:
                    meterReadingsError.details || null,
                hint:
                    meterReadingsError.hint || null
            });
        }


        const allMeterReadings =
            Array.isArray(meterReadings)
                ? meterReadings
                : [];


        console.log(
            "TOTAL METER READINGS FOR STATION/PUMP/NOZZLE:",
            allMeterReadings.length
        );


        if (allMeterReadings.length) {

            console.table(
                allMeterReadings.map((item) => ({
                    id: item.id,
                    station_id: item.station_id,
                    pump_id: item.pump_id,
                    nozzle_id: item.nozzle_id,
                    shift_id: item.shift_id,
                    reading_type: item.reading_type,
                    reading: item.reading,
                    created_at: item.created_at
                }))
            );
        }


        /* =====================================================
           FILTER READINGS FOR SELECTED SHIFT
        ===================================================== */

        const shiftMeterReadings =
            allMeterReadings.filter((item) => {

                return String(item.shift_id || "") ===
                    String(shift_id);
            });


        console.log(
            "METER READINGS FOR SELECTED SHIFT:",
            shiftMeterReadings.length
        );


        if (shiftMeterReadings.length) {

            console.table(
                shiftMeterReadings.map((item) => ({
                    id: item.id,
                    shift_id: item.shift_id,
                    reading_type: item.reading_type,
                    reading: item.reading,
                    created_at: item.created_at
                }))
            );
        }


        /* =====================================================
           GET OPENING READING
        ===================================================== */

        let openingMeterRecord = null;


        /* -----------------------------------------------------
           FIRST PRIORITY:
           opening + selected shift
        ----------------------------------------------------- */

        openingMeterRecord =
            shiftMeterReadings
                .filter((item) => {

                    return String(item.reading_type || "")
                        .toLowerCase()
                        .trim() === "opening";
                })
                .sort((a, b) => {

                    return new Date(a.created_at) -
                        new Date(b.created_at);
                })[0] || null;


        /* -----------------------------------------------------
           SECOND PRIORITY:
           periodic + selected shift
        ----------------------------------------------------- */

        if (!openingMeterRecord) {

            openingMeterRecord =
                shiftMeterReadings
                    .filter((item) => {

                        return String(item.reading_type || "")
                            .toLowerCase()
                            .trim() === "periodic";
                    })
                    .sort((a, b) => {

                        return new Date(a.created_at) -
                            new Date(b.created_at);
                    })[0] || null;
        }


        /* -----------------------------------------------------
           THIRD PRIORITY:
           opening without shift

           This handles older meter records that were created
           before shift_id was properly saved.
        ----------------------------------------------------- */

        if (!openingMeterRecord) {

            const noShiftOpening =
                allMeterReadings
                    .filter((item) => {

                        const type =
                            String(item.reading_type || "")
                                .toLowerCase()
                                .trim();

                        const itemShift =
                            item.shift_id;

                        return (
                            type === "opening" &&
                            !itemShift
                        );
                    })
                    .sort((a, b) => {

                        return new Date(a.created_at) -
                            new Date(b.created_at);
                    })[0] || null;


            if (noShiftOpening) {

                console.warn(
                    "WARNING: Opening meter reading found WITHOUT shift_id.",
                    noShiftOpening
                );

                openingMeterRecord =
                    noShiftOpening;
            }
        }


        /* =====================================================
           OPENING READING NOT FOUND
        ===================================================== */

        if (!openingMeterRecord) {

            console.error("");
            console.error(
                "=============================================="
            );
            console.error(
                "OPENING METER READING NOT FOUND"
            );
            console.error(
                "Requested station:",
                station_id
            );
            console.error(
                "Requested pump:",
                pump_id
            );
            console.error(
                "Requested nozzle:",
                nozzle_id
            );
            console.error(
                "Requested shift:",
                shift_id
            );
            console.error(
                "Total matching meter records:",
                allMeterReadings.length
            );
            console.error(
                "Matching shift records:",
                shiftMeterReadings.length
            );
            console.error(
                "=============================================="
            );


            return res.status(400).json({
                success: false,
                message:
                    "No opening meter reading found for the selected nozzle and shift. Please record an opening meter reading first.",
                debug: {
                    requested: {
                        station_id,
                        pump_id,
                        nozzle_id,
                        shift_id
                    },
                    total_meter_readings:
                        allMeterReadings.length,
                    shift_meter_readings:
                        shiftMeterReadings.length
                }
            });
        }


        console.log(
            "SELECTED OPENING METER:",
            openingMeterRecord
        );


        const openingReading =
            Number(openingMeterRecord.reading);


        if (
            !Number.isFinite(openingReading) ||
            openingReading < 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Opening meter reading is invalid"
            });
        }


        /* =====================================================
           GET CLOSING READING
        ===================================================== */

        let closingMeterRecord = null;


        /* -----------------------------------------------------
           CLOSING READING
        ----------------------------------------------------- */

        closingMeterRecord =
            shiftMeterReadings
                .filter((item) => {

                    return String(item.reading_type || "")
                        .toLowerCase()
                        .trim() === "closing";
                })
                .sort((a, b) => {

                    return new Date(b.created_at) -
                        new Date(a.created_at);
                })[0] || null;


        /* -----------------------------------------------------
           PERIODIC READING
        ----------------------------------------------------- */

        if (!closingMeterRecord) {

            closingMeterRecord =
                shiftMeterReadings
                    .filter((item) => {

                        return String(item.reading_type || "")
                            .toLowerCase()
                            .trim() === "periodic";
                    })
                    .sort((a, b) => {

                        return new Date(b.created_at) -
                            new Date(a.created_at);
                    })[0] || null;
        }


        /* -----------------------------------------------------
           ANY LATEST READING
        ----------------------------------------------------- */

        if (!closingMeterRecord) {

            closingMeterRecord =
                shiftMeterReadings
                    .slice()
                    .sort((a, b) => {

                        return new Date(b.created_at) -
                            new Date(a.created_at);
                    })[0] || null;
        }


        if (!closingMeterRecord) {

            return res.status(400).json({
                success: false,
                message:
                    "No closing meter reading found for the selected nozzle and shift. Please record a closing or periodic meter reading first."
            });
        }


        console.log(
            "SELECTED CLOSING METER:",
            closingMeterRecord
        );


        const closingReading =
            Number(closingMeterRecord.reading);


        if (
            !Number.isFinite(closingReading) ||
            closingReading < 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Closing meter reading is invalid"
            });
        }


        /* =====================================================
           VALIDATE METER MOVEMENT
        ===================================================== */

        if (closingReading < openingReading) {

            return res.status(400).json({
                success: false,
                message:
                    "Closing meter reading cannot be less than opening meter reading"
            });
        }


        /* =====================================================
           CALCULATE LITRES SOLD
        ===================================================== */

        const litresSold =
            roundLitres(
                closingReading - openingReading
            );


        /* =====================================================
           EXPECTED SALES
        ===================================================== */

        const expectedSales =
            roundMoney(
                litresSold * pricePerLitre
            );


        /* =====================================================
           GET SALES
        ===================================================== */

        const {
            data: sales,
            error: salesError
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
            .eq("station_id", station_id)
            .eq("pump_id", pump_id)
            .eq("nozzle_id", nozzle_id)
            .eq("shift_id", shift_id)
            .order("created_at", {
                ascending: true
            });


        if (salesError) {

            console.error(
                "GAP SALES LOOKUP ERROR:",
                salesError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to retrieve sales records",
                error:
                    salesError.message,
                code:
                    salesError.code || null,
                details:
                    salesError.details || null,
                hint:
                    salesError.hint || null
            });
        }


        const salesRecords =
            Array.isArray(sales)
                ? sales
                : [];


        /* =====================================================
           CALCULATE ACTUAL SALES
        ===================================================== */

        let actualSales = 0;
        let actualLitres = 0;


        for (const sale of salesRecords) {

            const saleLitres =
                Number(sale.litres || 0);

            const saleAmount =
                Number(sale.amount || 0);


            if (
                Number.isFinite(saleLitres) &&
                saleLitres >= 0
            ) {

                actualLitres += saleLitres;
            }


            if (
                Number.isFinite(saleAmount) &&
                saleAmount >= 0
            ) {

                actualSales += saleAmount;
            }
        }


        actualLitres =
            roundLitres(actualLitres);


        actualSales =
            roundMoney(actualSales);


        /* =====================================================
           LITRES VARIANCE
        ===================================================== */

        const litresVariance =
            roundLitres(
                litresSold - actualLitres
            );


        /* =====================================================
           GAP AMOUNT
        ===================================================== */

        const gapAmount =
            roundMoney(
                expectedSales - actualSales
            );


        /* =====================================================
           STATUS
        ===================================================== */

        const tolerance = 0.01;

        const status =
            Math.abs(gapAmount) <= tolerance
                ? "normal"
                : "variance";


        /* =====================================================
           CHECK EXISTING GAP
        ===================================================== */

        const {
            data: existingGaps,
            error: existingGapError
        } = await supabaseAdmin
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
            .eq("station_id", station_id)
            .eq("pump_id", pump_id)
            .eq("nozzle_id", nozzle_id)
            .eq("shift_id", shift_id)
            .order("created_at", {
                ascending: false
            })
            .limit(1);


        if (existingGapError) {

            console.error(
                "CHECK EXISTING GAP ERROR:",
                existingGapError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to check existing reconciliation",
                error:
                    existingGapError.message,
                code:
                    existingGapError.code || null,
                details:
                    existingGapError.details || null,
                hint:
                    existingGapError.hint || null
            });
        }


        const existingGap =
            existingGaps &&
            existingGaps.length
                ? existingGaps[0]
                : null;


        if (existingGap) {

            return res.status(409).json({
                success: false,
                message:
                    "A gap reconciliation already exists for this nozzle and shift",
                data: {
                    gap: existingGap
                }
            });
        }


        /* =====================================================
           CREATE GAP
        ===================================================== */

        const {
            data: gap,
            error: gapError
        } = await supabaseAdmin
            .from("gaps")
            .insert([
                {
                    station_id,
                    pump_id,
                    nozzle_id,
                    shift_id,
                    opening_reading: openingReading,
                    closing_reading: closingReading,
                    litres_sold: litresSold,
                    expected_sales: expectedSales,
                    actual_sales: actualSales,
                    gap_amount: gapAmount,
                    status,
                    notes: notes || null
                }
            ])
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
            .single();


        if (gapError) {

            console.error(
                "CREATE GAP ERROR:",
                gapError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to create gap record",
                error:
                    gapError.message,
                code:
                    gapError.code || null,
                details:
                    gapError.details || null,
                hint:
                    gapError.hint || null
            });
        }


        /* =====================================================
           SUCCESS RESPONSE
        ===================================================== */

        return res.status(201).json({

            success: true,

            message:
                status === "normal"
                    ? "Gap reconciliation completed successfully"
                    : "Gap reconciliation completed with variance",

            data: {

                gap,

                reconciliation: {

                    station_id,

                    pump_id,

                    nozzle_id,

                    shift_id,

                    opening_reading:
                        openingReading,

                    closing_reading:
                        closingReading,

                    meter_litres_sold:
                        litresSold,

                    actual_litres:
                        actualLitres,

                    litres_variance:
                        litresVariance,

                    price_per_litre:
                        pricePerLitre,

                    expected_sales:
                        expectedSales,

                    actual_sales:
                        actualSales,

                    gap_amount:
                        gapAmount,

                    status,

                    sales_count:
                        salesRecords.length
                }
            }
        });

    } catch (error) {

        console.error(
            "CREATE GAP EXCEPTION:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while creating gap",
            error:
                error?.message || "Unknown server error",
            code:
                error?.code || null,
            details:
                error?.details || null,
            hint:
                error?.hint || null
        });
    }
};


/* =========================================================
   GET ALL GAPS
   GET /api/gaps
========================================================= */

const getGaps = async (req, res) => {

    try {

        const {
            station_id,
            pump_id,
            nozzle_id,
            shift_id,
            status,
            date
        } = req.query;


        let query = supabaseAdmin
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
            .order("created_at", {
                ascending: false
            });


        if (station_id) {

            query = query.eq(
                "station_id",
                station_id
            );
        }


        if (pump_id) {

            query = query.eq(
                "pump_id",
                pump_id
            );
        }


        if (nozzle_id) {

            query = query.eq(
                "nozzle_id",
                nozzle_id
            );
        }


        if (shift_id) {

            query = query.eq(
                "shift_id",
                shift_id
            );
        }


        if (status) {

            query = query.eq(
                "status",
                status
            );
        }


        if (date) {

            query = query
                .gte(
                    "created_at",
                    `${date}T00:00:00`
                )
                .lte(
                    "created_at",
                    `${date}T23:59:59.999`
                );
        }


        const {
            data: gaps,
            error
        } = await query;


        if (error) {

            console.error(
                "GET GAPS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch gap records",
                error:
                    error.message
            });
        }


        return res.status(200).json({

            success: true,

            data: {

                gaps:
                    gaps || []
            }
        });

    } catch (error) {

        console.error(
            "GET GAPS EXCEPTION:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while fetching gaps",
            error:
                error?.message || "Unknown server error"
        });
    }
};


/* =========================================================
   GET GAP BY ID
   GET /api/gaps/:id
========================================================= */

const getGapById = async (req, res) => {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({
                success: false,
                message:
                    "Gap ID is required"
            });
        }


        const {
            data: gap,
            error
        } = await supabaseAdmin
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
            .eq("id", id)
            .maybeSingle();


        if (error) {

            console.error(
                "GET GAP BY ID ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch gap record",
                error:
                    error.message
            });
        }


        if (!gap) {

            return res.status(404).json({
                success: false,
                message:
                    "Gap record not found"
            });
        }


        return res.status(200).json({

            success: true,

            data: {

                gap
            }
        });

    } catch (error) {

        console.error(
            "GET GAP EXCEPTION:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while fetching gap",
            error:
                error?.message || "Unknown server error"
        });
    }
};


/* =========================================================
   DELETE GAP
   DELETE /api/gaps/:id
========================================================= */

const deleteGap = async (req, res) => {

    try {

        const {
            id
        } = req.params;


        if (!id) {

            return res.status(400).json({
                success: false,
                message:
                    "Gap ID is required"
            });
        }


        const {
            data: existingGap,
            error: findError
        } = await supabaseAdmin
            .from("gaps")
            .select("id")
            .eq("id", id)
            .maybeSingle();


        if (findError) {

            console.error(
                "FIND GAP ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to find gap record",
                error:
                    findError.message
            });
        }


        if (!existingGap) {

            return res.status(404).json({
                success: false,
                message:
                    "Gap record not found"
            });
        }


        const {
            error: deleteError
        } = await supabaseAdmin
            .from("gaps")
            .delete()
            .eq("id", id);


        if (deleteError) {

            console.error(
                "DELETE GAP ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete gap record",
                error:
                    deleteError.message
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Gap record deleted successfully"
        });

    } catch (error) {

        console.error(
            "DELETE GAP EXCEPTION:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while deleting gap",
            error:
                error?.message || "Unknown server error"
        });
    }
};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

    createGap,

    getGaps,

    getGapById,

    deleteGap

};