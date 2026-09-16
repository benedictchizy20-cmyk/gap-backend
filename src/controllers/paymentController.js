/* =========================================================
   FUELGAP - PAYMENT CONTROLLER
   SUPABASE BACKEND
   HTTPONLY COOKIE SESSION
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   CREATE PAYMENT
   POST /api/payments
========================================================= */

const createPayment = async (req, res) => {
    try {
        const {
            sale_id,
            station_id,
            shift_id,
            amount,
            payment_method,
            reference,
            notes
        } = req.body;


        /* =====================================================
           VALIDATION
        ===================================================== */

        if (!sale_id) {
            return res.status(400).json({
                success: false,
                message: "Sale ID is required"
            });
        }

        if (!station_id) {
            return res.status(400).json({
                success: false,
                message: "Station ID is required"
            });
        }

        if (!shift_id) {
            return res.status(400).json({
                success: false,
                message: "Shift ID is required"
            });
        }

        if (amount === undefined || amount === null || amount === "") {
            return res.status(400).json({
                success: false,
                message: "Payment amount is required"
            });
        }

        const numericAmount = Number(amount);

        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Payment amount must be greater than zero"
            });
        }

        if (!payment_method) {
            return res.status(400).json({
                success: false,
                message: "Payment method is required"
            });
        }


        /* =====================================================
           AUTHENTICATED USER
        ===================================================== */

        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user not found"
            });
        }

        const recordedBy = req.user.id;


        /* =====================================================
           VERIFY SALE
        ===================================================== */

        const {
            data: sale,
            error: saleError
        } = await supabaseAdmin
            .from("sales")
            .select(`
                id,
                station_id,
                shift_id,
                amount
            `)
            .eq("id", sale_id)
            .single();

        if (saleError || !sale) {
            console.error("PAYMENT SALE LOOKUP ERROR:", saleError);

            return res.status(404).json({
                success: false,
                message: "Sale not found"
            });
        }


        /* =====================================================
           VERIFY STATION
        ===================================================== */

        if (String(sale.station_id) !== String(station_id)) {
            return res.status(400).json({
                success: false,
                message: "Payment station does not match the selected sale"
            });
        }


        /* =====================================================
           VERIFY SHIFT
        ===================================================== */

        if (String(sale.shift_id) !== String(shift_id)) {
            return res.status(400).json({
                success: false,
                message: "Payment shift does not match the selected sale"
            });
        }


        /* =====================================================
           CREATE PAYMENT
        ===================================================== */

        const {
            data: payment,
            error
        } = await supabaseAdmin
            .from("payments")
            .insert([
                {
                    sale_id: sale_id,
                    station_id: station_id,
                    shift_id: shift_id,
                    recorded_by: recordedBy,
                    amount: numericAmount,
                    payment_method: payment_method,
                    reference: reference || null,
                    notes: notes || null
                }
            ])
            .select(`
                id,
                sale_id,
                station_id,
                shift_id,
                recorded_by,
                amount,
                payment_method,
                reference,
                notes,
                created_at
            `)
            .single();


        if (error) {
            console.error("CREATE PAYMENT ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to create payment",
                error: error.message
            });
        }


        /* =====================================================
           SUCCESS
        ===================================================== */

        return res.status(201).json({
            success: true,
            message: "Payment recorded successfully",
            data: {
                payment
            }
        });

    } catch (error) {

        console.error("CREATE PAYMENT EXCEPTION:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while creating payment"
        });
    }
};


/* =========================================================
   GET PAYMENTS
   GET /api/payments
========================================================= */

const getPayments = async (req, res) => {
    try {

        const {
            station_id,
            shift_id,
            sale_id,
            payment_method,
            date
        } = req.query;


        let query = supabaseAdmin
            .from("payments")
            .select(`
                id,
                sale_id,
                station_id,
                shift_id,
                recorded_by,
                amount,
                payment_method,
                reference,
                notes,
                created_at
            `)
            .order("created_at", {
                ascending: false
            });


        /* =====================================================
           FILTERS
        ===================================================== */

        if (station_id) {
            query = query.eq("station_id", station_id);
        }

        if (shift_id) {
            query = query.eq("shift_id", shift_id);
        }

        if (sale_id) {
            query = query.eq("sale_id", sale_id);
        }

        if (payment_method) {
            query = query.eq("payment_method", payment_method);
        }

        if (date) {

            const startDate = `${date}T00:00:00`;
            const endDate = `${date}T23:59:59.999`;

            query = query
                .gte("created_at", startDate)
                .lte("created_at", endDate);
        }


        /* =====================================================
           EXECUTE QUERY
        ===================================================== */

        const {
            data: payments,
            error
        } = await query;


        if (error) {
            console.error("GET PAYMENTS ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch payments",
                error: error.message
            });
        }


        return res.status(200).json({
            success: true,
            data: {
                payments: payments || []
            }
        });

    } catch (error) {

        console.error("GET PAYMENTS EXCEPTION:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching payments"
        });
    }
};


/* =========================================================
   GET PAYMENT BY ID
   GET /api/payments/:id
========================================================= */

const getPaymentById = async (req, res) => {
    try {

        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Payment ID is required"
            });
        }


        const {
            data: payment,
            error
        } = await supabaseAdmin
            .from("payments")
            .select(`
                id,
                sale_id,
                station_id,
                shift_id,
                recorded_by,
                amount,
                payment_method,
                reference,
                notes,
                created_at
            `)
            .eq("id", id)
            .single();


        if (error || !payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }


        return res.status(200).json({
            success: true,
            data: {
                payment
            }
        });

    } catch (error) {

        console.error("GET PAYMENT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching payment"
        });
    }
};


/* =========================================================
   DELETE PAYMENT
   DELETE /api/payments/:id
========================================================= */

const deletePayment = async (req, res) => {
    try {

        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Payment ID is required"
            });
        }


        /* =====================================================
           CHECK PAYMENT EXISTS
        ===================================================== */

        const {
            data: existingPayment,
            error: findError
        } = await supabaseAdmin
            .from("payments")
            .select("id")
            .eq("id", id)
            .single();


        if (findError || !existingPayment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }


        /* =====================================================
           DELETE
        ===================================================== */

        const {
            error
        } = await supabaseAdmin
            .from("payments")
            .delete()
            .eq("id", id);


        if (error) {
            console.error("DELETE PAYMENT ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to delete payment",
                error: error.message
            });
        }


        return res.status(200).json({
            success: true,
            message: "Payment deleted successfully"
        });

    } catch (error) {

        console.error("DELETE PAYMENT EXCEPTION:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while deleting payment"
        });
    }
};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    createPayment,
    getPayments,
    getPaymentById,
    deletePayment
};