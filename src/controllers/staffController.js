/* =========================================================
   FUELGAP - STAFF CONTROLLER
   REAL BACKEND VERSION
   SUPABASE AUTH + USERS TABLE
   HTTPONLY COOKIE SESSION
   STATION ASSIGNMENT ENABLED
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");


/* =========================================================
   ALLOWED STAFF ROLES
========================================================= */

const ALLOWED_ROLES = [
    "admin",
    "manager",
    "attendant"
];


/* =========================================================
   HELPER - VALIDATE UUID
========================================================= */

const isValidUUID = (value) => {

    if (!value || typeof value !== "string") {
        return false;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
};


/* =========================================================
   HELPER - VALIDATE PASSWORD
========================================================= */

const isValidPassword = (password) => {

    return (
        typeof password === "string" &&
        password.length >= 6
    );
};


/* =========================================================
   HELPER - VERIFY STATION
   STATION MUST BELONG TO CURRENT ORGANIZATION
========================================================= */

const verifyStation = async (
    stationId,
    organizationId
) => {

    if (!stationId) {
        return {
            valid: true,
            station: null
        };
    }

    if (!isValidUUID(stationId)) {
        return {
            valid: false,
            message: "Invalid station ID"
        };
    }

    const {
        data: station,
        error
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
        .eq("id", stationId)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (error) {

        console.error(
            "VERIFY STATION ERROR:",
            error
        );

        return {
            valid: false,
            serverError: true,
            message: "Unable to verify station"
        };
    }

    if (!station) {

        return {
            valid: false,
            message:
                "Station not found or does not belong to your organization"
        };
    }

    if (!station.is_active) {

        return {
            valid: false,
            message:
                "Cannot assign staff to an inactive station"
        };
    }

    return {
        valid: true,
        station
    };
};


/* =========================================================
   CREATE STAFF
   POST /api/staff
========================================================= */

const createStaff = async (req, res) => {

    let createdAuthUserId = null;

    try {

        const {
            full_name,
            email,
            phone,
            role,
            password,
            station_id
        } = req.body;

        const organizationId =
            req.organizationId;


        /* ---------------------------------------------
           REQUIRED FIELDS
        --------------------------------------------- */

        if (
            !full_name ||
            !email ||
            !role ||
            !password
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "full_name, email, role and password are required"
            });
        }


        if (!organizationId) {

            return res.status(403).json({
                success: false,
                message:
                    "Organization not found"
            });
        }


        /* ---------------------------------------------
           CLEAN INPUT
        --------------------------------------------- */

        const cleanName =
            String(full_name).trim();

        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();

        const cleanPhone =
            phone
                ? String(phone).trim()
                : null;

        const cleanRole =
            String(role).trim().toLowerCase();

        const cleanStationId =
            station_id
                ? String(station_id).trim()
                : null;


        /* ---------------------------------------------
           VALIDATE NAME
        --------------------------------------------- */

        if (cleanName.length < 2) {

            return res.status(400).json({
                success: false,
                message:
                    "Full name must be at least 2 characters"
            });
        }


        /* ---------------------------------------------
           VALIDATE EMAIL
        --------------------------------------------- */

        if (
            cleanEmail.length < 5 ||
            !cleanEmail.includes("@")
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "A valid email address is required"
            });
        }


        /* ---------------------------------------------
           VALIDATE PASSWORD
        --------------------------------------------- */

        if (!isValidPassword(password)) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 6 characters"
            });
        }


        /* ---------------------------------------------
           VALIDATE ROLE
        --------------------------------------------- */

        if (!ALLOWED_ROLES.includes(cleanRole)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid role. Allowed roles are admin, manager and attendant"
            });
        }


        /* ---------------------------------------------
           OWNER CANNOT BE CREATED
        --------------------------------------------- */

        if (cleanRole === "owner") {

            return res.status(403).json({
                success: false,
                message:
                    "Owner accounts cannot be created through staff management"
            });
        }


        /* ---------------------------------------------
           MANAGER CANNOT CREATE ADMIN
        --------------------------------------------- */

        if (
            req.userRole === "manager" &&
            cleanRole === "admin"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Managers cannot create administrator accounts"
            });
        }


        /* ---------------------------------------------
           VERIFY STATION
        --------------------------------------------- */

        const stationCheck =
            await verifyStation(
                cleanStationId,
                organizationId
            );

        if (!stationCheck.valid) {

            return res.status(
                stationCheck.serverError
                    ? 500
                    : 400
            ).json({
                success: false,
                message:
                    stationCheck.message
            });
        }


        /* ---------------------------------------------
           CHECK EXISTING USER
        --------------------------------------------- */

        const {
            data: existingUser,
            error: existingUserError
        } = await supabaseAdmin
            .from("users")
            .select(`
                id,
                organization_id,
                auth_user_id,
                full_name,
                email,
                role,
                is_active
            `)
            .eq("email", cleanEmail)
            .maybeSingle();


        if (existingUserError) {

            console.error(
                "CHECK EXISTING STAFF ERROR:",
                existingUserError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to check staff email"
            });
        }


        if (existingUser) {

            return res.status(409).json({
                success: false,
                message:
                    "A user with this email already exists"
            });
        }


        /* ---------------------------------------------
           CREATE SUPABASE AUTH ACCOUNT
        --------------------------------------------- */

        const {
            data: authData,
            error: authError
        } =
            await supabaseAdmin.auth.admin.createUser({

                email: cleanEmail,

                password,

                email_confirm: true,

                user_metadata: {

                    full_name:
                        cleanName,

                    role:
                        cleanRole,

                    organization_id:
                        organizationId,

                    station_id:
                        cleanStationId
                }
            });


        if (authError) {

            console.error(
                "CREATE STAFF AUTH USER ERROR:",
                authError
            );

            return res.status(400).json({
                success: false,
                message:
                    authError.message ||
                    "Unable to create staff login account"
            });
        }


        if (
            !authData ||
            !authData.user
        ) {

            return res.status(500).json({
                success: false,
                message:
                    "Staff authentication account could not be created"
            });
        }


        createdAuthUserId =
            authData.user.id;


        /* ---------------------------------------------
           CREATE STAFF PROFILE
        --------------------------------------------- */

        const {
            data: staff,
            error: profileError
        } =
            await supabaseAdmin
                .from("users")
                .insert([
                    {
                        auth_user_id:
                            createdAuthUserId,

                        organization_id:
                            organizationId,

                        station_id:
                            cleanStationId,

                        full_name:
                            cleanName,

                        email:
                            cleanEmail,

                        phone:
                            cleanPhone,

                        role:
                            cleanRole,

                        is_active:
                            true
                    }
                ])
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    full_name,
                    email,
                    phone,
                    role,
                    is_active,
                    created_at,
                    updated_at
                `)
                .single();


        /* ---------------------------------------------
           PROFILE CREATION FAILED
        --------------------------------------------- */

        if (profileError) {

            console.error(
                "CREATE STAFF PROFILE ERROR:",
                profileError
            );

            try {

                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        createdAuthUserId
                    );

            } catch (rollbackError) {

                console.error(
                    "STAFF AUTH ROLLBACK ERROR:",
                    rollbackError
                );
            }


            if (
                profileError.code ===
                "23505"
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "A user with this email already exists"
                });
            }


            return res.status(500).json({
                success: false,
                message:
                    "Unable to create staff profile"
            });
        }


        /* ---------------------------------------------
           SUCCESS
        --------------------------------------------- */

        return res.status(201).json({

            success: true,

            message:
                "Staff account created successfully",

            data: {

                staff,

                station:
                    stationCheck.station,

                login: {

                    email:
                        cleanEmail,

                    message:
                        "Staff can now login using the email and password provided"
                }
            }
        });

    } catch (error) {

        console.error(
            "CREATE STAFF CONTROLLER ERROR:",
            error
        );


        /* ---------------------------------------------
           ROLLBACK AUTH ACCOUNT
        --------------------------------------------- */

        if (createdAuthUserId) {

            try {

                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        createdAuthUserId
                    );

            } catch (rollbackError) {

                console.error(
                    "AUTH USER ROLLBACK ERROR:",
                    rollbackError
                );
            }
        }


        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });
    }
};


/* =========================================================
   CREATE LOGIN FOR EXISTING STAFF
   POST /api/staff/:id/create-login
========================================================= */

const createStaffLogin = async (req, res) => {

    let createdAuthUserId = null;

    try {

        const { id } =
            req.params;

        const { password } =
            req.body;

        const organizationId =
            req.organizationId;


        if (!isValidUUID(id)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid staff ID"
            });
        }


        if (!isValidPassword(password)) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 6 characters"
            });
        }


        if (!organizationId) {

            return res.status(403).json({
                success: false,
                message:
                    "Organization not found"
            });
        }


        /* ---------------------------------------------
           GET STAFF
        --------------------------------------------- */

        const {
            data: staff,
            error: staffError
        } =
            await supabaseAdmin
                .from("users")
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    full_name,
                    email,
                    role,
                    is_active
                `)
                .eq("id", id)
                .eq("organization_id", organizationId)
                .maybeSingle();


        if (staffError) {

            console.error(
                "GET STAFF LOGIN ERROR:",
                staffError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve staff"
            });
        }


        if (!staff) {

            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found"
            });
        }


        if (staff.role === "owner") {

            return res.status(403).json({
                success: false,
                message:
                    "Owner login cannot be created through staff management"
            });
        }


        if (!staff.is_active) {

            return res.status(403).json({
                success: false,
                message:
                    "Cannot create login for an inactive staff member"
            });
        }


        if (staff.auth_user_id) {

            return res.status(409).json({
                success: false,
                message:
                    "This staff member already has a login account"
            });
        }


        /* ---------------------------------------------
           VERIFY STATION IF ASSIGNED
        --------------------------------------------- */

        const stationCheck =
            await verifyStation(
                staff.station_id,
                organizationId
            );

        if (!stationCheck.valid) {

            return res.status(
                stationCheck.serverError
                    ? 500
                    : 400
            ).json({
                success: false,
                message:
                    stationCheck.message
            });
        }


        /* ---------------------------------------------
           CREATE AUTH USER
        --------------------------------------------- */

        const {
            data: authData,
            error: authError
        } =
            await supabaseAdmin
                .auth
                .admin
                .createUser({

                    email:
                        staff.email,

                    password,

                    email_confirm:
                        true,

                    user_metadata: {

                        full_name:
                            staff.full_name,

                        role:
                            staff.role,

                        organization_id:
                            staff.organization_id,

                        station_id:
                            staff.station_id
                    }
                });


        if (authError) {

            console.error(
                "CREATE STAFF LOGIN AUTH ERROR:",
                authError
            );

            return res.status(400).json({
                success: false,
                message:
                    authError.message ||
                    "Unable to create staff login"
            });
        }


        if (
            !authData ||
            !authData.user
        ) {

            return res.status(500).json({
                success: false,
                message:
                    "Authentication account was not created"
            });
        }


        createdAuthUserId =
            authData.user.id;


        /* ---------------------------------------------
           LINK AUTH USER
        --------------------------------------------- */

        const {
            data: updatedStaff,
            error: updateError
        } =
            await supabaseAdmin
                .from("users")
                .update({

                    auth_user_id:
                        createdAuthUserId,

                    updated_at:
                        new Date().toISOString()
                })
                .eq("id", id)
                .eq(
                    "organization_id",
                    organizationId
                )
                .is(
                    "auth_user_id",
                    null
                )
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    full_name,
                    email,
                    phone,
                    role,
                    is_active,
                    created_at,
                    updated_at
                `)
                .single();


        if (updateError) {

            console.error(
                "LINK STAFF AUTH ERROR:",
                updateError
            );

            try {

                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        createdAuthUserId
                    );

            } catch (rollbackError) {

                console.error(
                    "STAFF LOGIN ROLLBACK ERROR:",
                    rollbackError
                );
            }

            createdAuthUserId =
                null;


            return res.status(500).json({
                success: false,
                message:
                    "Unable to link staff login account"
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Staff login created successfully",

            data: {

                staff:
                    updatedStaff,

                station:
                    stationCheck.station,

                login: {

                    email:
                        staff.email,

                    message:
                        "Staff can now login with the provided password"
                }
            }
        });

    } catch (error) {

        console.error(
            "CREATE STAFF LOGIN ERROR:",
            error
        );


        if (createdAuthUserId) {

            try {

                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        createdAuthUserId
                    );

            } catch (rollbackError) {

                console.error(
                    "LOGIN ROLLBACK ERROR:",
                    rollbackError
                );
            }
        }


        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });
    }
};


/* =========================================================
   GET ALL STAFF
   GET /api/staff
========================================================= */

const getStaff = async (req, res) => {

    try {

        const organizationId =
            req.organizationId;


        if (!organizationId) {

            return res.status(403).json({
                success: false,
                message:
                    "Organization not found"
            });
        }


        const {
            data: staff,
            error
        } =
            await supabaseAdmin
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
                    is_active,
                    created_at,
                    updated_at,
                    stations:station_id (
                        id,
                        name,
                        address,
                        city,
                        state,
                        is_active
                    )
                `)
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


        if (error) {

            console.error(
                "GET STAFF ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve staff"
            });
        }


        return res.status(200).json({

            success: true,

            data: {

                staff,

                count:
                    staff.length
            }
        });

    } catch (error) {

        console.error(
            "GET STAFF CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });
    }
};


/* =========================================================
   GET STAFF BY ID
   GET /api/staff/:id
========================================================= */

const getStaffById = async (req, res) => {

    try {

        const { id } =
            req.params;

        const organizationId =
            req.organizationId;


        if (!isValidUUID(id)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid staff ID"
            });
        }


        if (!organizationId) {

            return res.status(403).json({
                success: false,
                message:
                    "Organization not found"
            });
        }


        const {
            data: staff,
            error
        } =
            await supabaseAdmin
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
                    is_active,
                    created_at,
                    updated_at,
                    stations:station_id (
                        id,
                        name,
                        address,
                        city,
                        state,
                        is_active
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

            console.error(
                "GET STAFF BY ID ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve staff"
            });
        }


        if (!staff) {

            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found"
            });
        }


        return res.status(200).json({

            success: true,

            data: {

                staff
            }
        });

    } catch (error) {

        console.error(
            "GET STAFF BY ID CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });
    }
};


/* =========================================================
   UPDATE STAFF
   PATCH /api/staff/:id
========================================================= */

const updateStaff = async (req, res) => {

    try {

        const { id } =
            req.params;

        const {
            full_name,
            email,
            phone,
            role,
            is_active,
            station_id
        } = req.body;

        const organizationId =
            req.organizationId;


        /* ---------------------------------------------
           VALIDATE ID
        --------------------------------------------- */

        if (!isValidUUID(id)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid staff ID"
            });
        }


        if (!organizationId) {

            return res.status(403).json({
                success: false,
                message:
                    "Organization not found"
            });
        }


        /* ---------------------------------------------
           GET EXISTING STAFF
        --------------------------------------------- */

        const {
            data: existingStaff,
            error: existingError
        } =
            await supabaseAdmin
                .from("users")
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    role,
                    is_active
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


        if (existingError) {

            console.error(
                "CHECK STAFF UPDATE ERROR:",
                existingError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify staff"
            });
        }


        if (!existingStaff) {

            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found"
            });
        }


        /* ---------------------------------------------
           OWNER PROTECTION
        --------------------------------------------- */

        if (
            existingStaff.role ===
            "owner"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Owner account cannot be modified through staff management"
            });
        }


        const updates = {};


        /* ---------------------------------------------
           FULL NAME
        --------------------------------------------- */

        if (
            full_name !== undefined
        ) {

            const cleanName =
                String(full_name).trim();


            if (cleanName.length < 2) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Full name must be at least 2 characters"
                });
            }


            updates.full_name =
                cleanName;
        }


        /* ---------------------------------------------
           EMAIL
        --------------------------------------------- */

        if (
            email !== undefined
        ) {

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();


            if (
                cleanEmail.length < 5 ||
                !cleanEmail.includes("@")
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "A valid email address is required"
                });
            }


            const {
                data: emailUser,
                error: emailError
            } =
                await supabaseAdmin
                    .from("users")
                    .select("id")
                    .eq(
                        "email",
                        cleanEmail
                    )
                    .neq(
                        "id",
                        id
                    )
                    .maybeSingle();


            if (emailError) {

                console.error(
                    "CHECK STAFF EMAIL ERROR:",
                    emailError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to verify email address"
                });
            }


            if (emailUser) {

                return res.status(409).json({
                    success: false,
                    message:
                        "Another user already uses this email"
                });
            }


            updates.email =
                cleanEmail;


            /* -----------------------------------------
               UPDATE SUPABASE AUTH EMAIL
            ----------------------------------------- */

            if (
                existingStaff.auth_user_id
            ) {

                const {
                    error:
                        authUpdateError
                } =
                    await supabaseAdmin
                        .auth
                        .admin
                        .updateUserById(

                            existingStaff.auth_user_id,

                            {
                                email:
                                    cleanEmail,

                                email_confirm:
                                    true
                            }
                        );


                if (authUpdateError) {

                    console.error(
                        "UPDATE AUTH EMAIL ERROR:",
                        authUpdateError
                    );

                    return res.status(400).json({
                        success: false,
                        message:
                            "Unable to update staff login email"
                    });
                }
            }
        }


        /* ---------------------------------------------
           PHONE
        --------------------------------------------- */

        if (
            phone !== undefined
        ) {

            updates.phone =
                phone
                    ? String(phone).trim()
                    : null;
        }


        /* ---------------------------------------------
           ROLE
        --------------------------------------------- */

        if (
            role !== undefined
        ) {

            const cleanRole =
                String(role)
                    .trim()
                    .toLowerCase();


            if (
                !ALLOWED_ROLES.includes(
                    cleanRole
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid role. Allowed roles are admin, manager and attendant"
                });
            }


            if (
                cleanRole ===
                "owner"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Staff cannot be assigned the owner role"
                });
            }


            if (
                req.userRole ===
                    "manager" &&
                cleanRole ===
                    "admin"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Managers cannot assign administrator role"
                });
            }


            updates.role =
                cleanRole;
        }


        /* ---------------------------------------------
           STATION ASSIGNMENT
        --------------------------------------------- */

        if (
            station_id !== undefined
        ) {

            const cleanStationId =
                station_id
                    ? String(
                        station_id
                    ).trim()
                    : null;


            if (cleanStationId) {

                const stationCheck =
                    await verifyStation(
                        cleanStationId,
                        organizationId
                    );


                if (
                    !stationCheck.valid
                ) {

                    return res.status(
                        stationCheck.serverError
                            ? 500
                            : 400
                    ).json({
                        success: false,
                        message:
                            stationCheck.message
                    });
                }
            }


            updates.station_id =
                cleanStationId;
        }


        /* ---------------------------------------------
           ACTIVE STATUS
        --------------------------------------------- */

        if (
            is_active !== undefined
        ) {

            if (
                typeof is_active !==
                "boolean"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "is_active must be true or false"
                });
            }


            updates.is_active =
                is_active;


            /* -----------------------------------------
               BAN / UNBAN AUTH ACCOUNT
            ----------------------------------------- */

            if (
                existingStaff.auth_user_id
            ) {

                const {
                    error: authError
                } =
                    await supabaseAdmin
                        .auth
                        .admin
                        .updateUserById(

                            existingStaff.auth_user_id,

                            {
                                ban_duration:
                                    is_active
                                        ? "none"
                                        : "876000h"
                            }
                        );


                if (authError) {

                    console.error(
                        "UPDATE AUTH STATUS ERROR:",
                        authError
                    );

                    return res.status(400).json({
                        success: false,
                        message:
                            "Unable to update staff login status"
                    });
                }
            }
        }


        /* ---------------------------------------------
           CHECK UPDATE FIELDS
        --------------------------------------------- */

        if (
            Object.keys(updates).length ===
            0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "No valid fields provided for update"
            });
        }


        updates.updated_at =
            new Date().toISOString();


        /* ---------------------------------------------
           UPDATE DATABASE
        --------------------------------------------- */

        const {
            data: staff,
            error
        } =
            await supabaseAdmin
                .from("users")
                .update(updates)
                .eq(
                    "id",
                    id
                )
                .eq(
                    "organization_id",
                    organizationId
                )
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    full_name,
                    email,
                    phone,
                    role,
                    is_active,
                    created_at,
                    updated_at,
                    stations:station_id (
                        id,
                        name,
                        address,
                        city,
                        state,
                        is_active
                    )
                `)
                .single();


        if (error) {

            console.error(
                "UPDATE STAFF ERROR:",
                error
            );


            if (
                error.code ===
                "23505"
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "A user with this email already exists"
                });
            }


            return res.status(500).json({
                success: false,
                message:
                    "Unable to update staff"
            });
        }


        return res.status(200).json({

            success: true,

            message:
                "Staff updated successfully",

            data: {

                staff
            }
        });

    } catch (error) {

        console.error(
            "UPDATE STAFF CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });
    }
};


/* =========================================================
   DEACTIVATE STAFF
   DELETE /api/staff/:id
========================================================= */

const deleteStaff = async (req, res) => {

    try {

        const { id } =
            req.params;

        const organizationId =
            req.organizationId;


        if (!isValidUUID(id)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid staff ID"
            });
        }


        if (!organizationId) {

            return res.status(403).json({
                success: false,
                message:
                    "Organization not found"
            });
        }


        /* ---------------------------------------------
           FIND STAFF
        --------------------------------------------- */

        const {
            data: staff,
            error: findError
        } =
            await supabaseAdmin
                .from("users")
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    role,
                    is_active
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


        if (findError) {

            console.error(
                "FIND STAFF DELETE ERROR:",
                findError
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to find staff"
            });
        }


        if (!staff) {

            return res.status(404).json({
                success: false,
                message:
                    "Staff member not found"
            });
        }


        /* ---------------------------------------------
           OWNER PROTECTION
        --------------------------------------------- */

        if (
            staff.role ===
            "owner"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Owner account cannot be deactivated through staff management"
            });
        }


        /* ---------------------------------------------
           DEACTIVATE DATABASE PROFILE
        --------------------------------------------- */

        const {
            data: updatedStaff,
            error
        } =
            await supabaseAdmin
                .from("users")
                .update({

                    is_active:
                        false,

                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    id
                )
                .eq(
                    "organization_id",
                    organizationId
                )
                .select(`
                    id,
                    auth_user_id,
                    organization_id,
                    station_id,
                    full_name,
                    email,
                    phone,
                    role,
                    is_active,
                    created_at,
                    updated_at,
                    stations:station_id (
                        id,
                        name,
                        address,
                        city,
                        state,
                        is_active
                    )
                `)
                .single();


        if (error) {

            console.error(
                "DEACTIVATE STAFF ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to deactivate staff"
            });
        }


        /* ---------------------------------------------
           BAN AUTH LOGIN
        --------------------------------------------- */

        if (
            staff.auth_user_id
        ) {

            const {
                error: authError
            } =
                await supabaseAdmin
                    .auth
                    .admin
                    .updateUserById(

                        staff.auth_user_id,

                        {
                            ban_duration:
                                "876000h"
                        }
                    );


            if (authError) {

                console.error(
                    "DISABLE STAFF AUTH ERROR:",
                    authError
                );
            }
        }


        return res.status(200).json({

            success: true,

            message:
                "Staff deactivated successfully",

            data: {

                staff:
                    updatedStaff
            }
        });

    } catch (error) {

        console.error(
            "DELETE STAFF CONTROLLER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Internal server error"
        });
    }
};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

    createStaff,

    createStaffLogin,

    getStaff,

    getStaffById,

    updateStaff,

    deleteStaff

};