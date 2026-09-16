/* =========================================================
   FUELGAP - ORGANIZATION CONTROLLER
   SUPABASE + EXPRESS
   HTTPONLY COOKIE SESSION

   ADMIN ONLY

   ORGANIZATION TABLE:
   id
   name
   email
   phone
   created_at
   updated_at
========================================================= */

const supabase = require("../config/supabase");


/* =========================================================
   GET APPLICATION USER
========================================================= */

const getApplicationUser = async (authUserId) => {

    if (!authUserId) {
        return {
            user: null,
            error: {
                message: "Authenticated user ID is missing"
            }
        };
    }


    const {
        data: user,
        error
    } = await supabase
        .from("users")
        .select(`
            id,
            organization_id,
            auth_user_id,
            full_name,
            email,
            role
        `)
        .eq("auth_user_id", authUserId)
        .maybeSingle();


    return {
        user,
        error
    };
};


/* =========================================================
   GET AUTH USER ID
========================================================= */

const getAuthUserId = (req) => {

    if (!req.user) {
        return null;
    }


    return (
        req.user.id ||
        req.user.auth_user_id ||
        req.user.user_id ||
        null
    );
};


/* =========================================================
   CHECK ADMIN
========================================================= */

const requireAdminUser = (user, res) => {

    if (!user) {

        res.status(404).json({
            success: false,
            message: "Application user not found"
        });

        return false;
    }


    const role = String(user.role || "")
        .trim()
        .toLowerCase();


    if (role !== "admin") {

        res.status(403).json({
            success: false,
            message: "Administrator access required"
        });

        return false;
    }


    return true;
};


/* =========================================================
   GET CURRENT ORGANIZATION
   GET /api/organization
========================================================= */

const getOrganization = async (req, res) => {

    try {

        /* -------------------------------------------------
           AUTH CHECK
        ------------------------------------------------- */

        if (!req.user) {

            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });

        }


        /* -------------------------------------------------
           GET AUTH USER ID
        ------------------------------------------------- */

        const authUserId = getAuthUserId(req);


        console.log(
            "ORGANIZATION AUTH USER ID:",
            authUserId
        );


        if (!authUserId) {

            return res.status(401).json({
                success: false,
                message: "Invalid authenticated user"
            });

        }


        /* -------------------------------------------------
           FIND APPLICATION USER
        ------------------------------------------------- */

        const {
            user,
            error: userError
        } = await getApplicationUser(authUserId);


        if (userError) {

            console.error(
                "Get application user error:",
                userError
            );

            return res.status(404).json({
                success: false,
                message: "Application user not found"
            });

        }


        if (!user) {

            console.error(
                "APPLICATION USER NOT FOUND FOR AUTH USER:",
                authUserId
            );

            return res.status(404).json({
                success: false,
                message: "Application user not found"
            });

        }


        console.log(
            "ORGANIZATION APPLICATION USER:",
            {
                id: user.id,
                auth_user_id: user.auth_user_id,
                organization_id: user.organization_id,
                role: user.role
            }
        );


        /* -------------------------------------------------
           ADMIN ONLY
        ------------------------------------------------- */

        if (!requireAdminUser(user, res)) {
            return;
        }


        /* -------------------------------------------------
           CHECK ORGANIZATION ID
        ------------------------------------------------- */

        if (!user.organization_id) {

            return res.status(404).json({
                success: false,
                message: "Organization not assigned to this user"
            });

        }


        /* -------------------------------------------------
           GET ORGANIZATION
        ------------------------------------------------- */

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
            .eq("id", user.organization_id)
            .maybeSingle();


        if (organizationError) {

            console.error(
                "Get organization error:",
                organizationError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load organization",
                error: organizationError.message
            });

        }


        if (!organization) {

            return res.status(404).json({
                success: false,
                message: "Organization not found"
            });

        }


        /* -------------------------------------------------
           SUCCESS
        ------------------------------------------------- */

        return res.status(200).json({
            success: true,
            message: "Organization retrieved successfully",
            data: organization
        });

    } catch (error) {

        console.error(
            "Get organization controller error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });

    }

};


/* =========================================================
   UPDATE CURRENT ORGANIZATION
   PUT /api/organization
========================================================= */

const updateOrganization = async (req, res) => {

    try {

        /* -------------------------------------------------
           AUTH CHECK
        ------------------------------------------------- */

        if (!req.user) {

            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });

        }


        /* -------------------------------------------------
           GET AUTH USER ID
        ------------------------------------------------- */

        const authUserId = getAuthUserId(req);


        console.log(
            "UPDATE ORGANIZATION AUTH USER ID:",
            authUserId
        );


        if (!authUserId) {

            return res.status(401).json({
                success: false,
                message: "Invalid authenticated user"
            });

        }


        /* -------------------------------------------------
           FIND APPLICATION USER
        ------------------------------------------------- */

        const {
            user,
            error: userError
        } = await getApplicationUser(authUserId);


        if (userError) {

            console.error(
                "Update organization user lookup error:",
                userError
            );

            return res.status(404).json({
                success: false,
                message: "Application user not found"
            });

        }


        if (!user) {

            console.error(
                "UPDATE APPLICATION USER NOT FOUND FOR AUTH USER:",
                authUserId
            );

            return res.status(404).json({
                success: false,
                message: "Application user not found"
            });

        }


        console.log(
            "UPDATE ORGANIZATION APPLICATION USER:",
            {
                id: user.id,
                auth_user_id: user.auth_user_id,
                organization_id: user.organization_id,
                role: user.role
            }
        );


        /* -------------------------------------------------
           ADMIN ONLY
        ------------------------------------------------- */

        if (!requireAdminUser(user, res)) {
            return;
        }


        /* -------------------------------------------------
           CHECK ORGANIZATION
        ------------------------------------------------- */

        if (!user.organization_id) {

            return res.status(404).json({
                success: false,
                message: "Organization not assigned to this user"
            });

        }


        /* -------------------------------------------------
           READ REQUEST BODY
        ------------------------------------------------- */

        const {
            name,
            email,
            phone
        } = req.body;


        /* -------------------------------------------------
           VALIDATION
        ------------------------------------------------- */

        if (
            name === undefined &&
            email === undefined &&
            phone === undefined
        ) {

            return res.status(400).json({
                success: false,
                message: "Provide at least one field to update"
            });

        }


        /* -------------------------------------------------
           BUILD UPDATE OBJECT
        ------------------------------------------------- */

        const updateData = {};


        /* -------------------------------------------------
           ORGANIZATION NAME
        ------------------------------------------------- */

        if (name !== undefined) {

            if (
                typeof name !== "string" ||
                name.trim().length < 2
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Organization name must contain at least 2 characters"
                });

            }


            updateData.name = name.trim();

        }


        /* -------------------------------------------------
           ORGANIZATION EMAIL
        ------------------------------------------------- */

        if (email !== undefined) {

            if (
                typeof email !== "string" ||
                !email.trim()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "A valid organization email is required"
                });

            }


            const emailValue =
                email.trim().toLowerCase();


            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (!emailRegex.test(emailValue)) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid email address"
                });

            }


            updateData.email = emailValue;

        }


        /* -------------------------------------------------
           ORGANIZATION PHONE
        ------------------------------------------------- */

        if (phone !== undefined) {

            if (
                phone !== null &&
                typeof phone !== "string"
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Phone number must be a string"
                });

            }


            if (phone === null) {

                updateData.phone = null;

            } else {

                updateData.phone = phone.trim();

            }

        }


        /* -------------------------------------------------
           UPDATED TIMESTAMP
        ------------------------------------------------- */

        updateData.updated_at =
            new Date().toISOString();


        /* -------------------------------------------------
           UPDATE ORGANIZATION
        ------------------------------------------------- */

        const {
            data: organization,
            error: updateError
        } = await supabase
            .from("organizations")
            .update(updateData)
            .eq("id", user.organization_id)
            .select(`
                id,
                name,
                email,
                phone,
                created_at,
                updated_at
            `)
            .maybeSingle();


        if (updateError) {

            console.error(
                "Update organization error:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message: "Failed to update organization",
                error: updateError.message
            });

        }


        if (!organization) {

            return res.status(404).json({
                success: false,
                message: "Organization not found"
            });

        }


        /* -------------------------------------------------
           SUCCESS
        ------------------------------------------------- */

        return res.status(200).json({
            success: true,
            message: "Organization updated successfully",
            data: organization
        });

    } catch (error) {

        console.error(
            "Update organization controller error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });

    }

};


/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {
    getOrganization,
    updateOrganization
};