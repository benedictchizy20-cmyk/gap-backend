/* =========================================================
   FUELGAP - AUTHENTICATION MIDDLEWARE
   SUPABASE AUTH
   HTTPONLY COOKIE SESSION

   ROLES:
   super_admin = FuelGap platform owner
   owner       = Organization owner
   admin       = Organization administrator
   manager     = Station/operations manager
   attendant   = Station attendant
========================================================= */

const supabaseAdmin = require("../config/supabaseAdmin");

const AUTH_COOKIE_NAME =
    "fuelgap_access_token";


/* =========================================================
   REQUIRE AUTHENTICATION
========================================================= */

const requireAuth = async (req, res, next) => {

    try {

        let token = null;


        /* =====================================================
           CHECK HTTPONLY COOKIE
        ===================================================== */

        if (
            req.cookies &&
            req.cookies[AUTH_COOKIE_NAME]
        ) {

            token =
                req.cookies[AUTH_COOKIE_NAME];

        }


        /* =====================================================
           FALLBACK TO AUTHORIZATION HEADER
        ===================================================== */

        if (!token) {

            const authHeader =
                req.headers.authorization;

            if (
                authHeader &&
                authHeader.startsWith("Bearer ")
            ) {

                token =
                    authHeader
                        .substring(7)
                        .trim();

            }

        }


        /* =====================================================
           NO TOKEN
        ===================================================== */

        if (!token) {

            console.warn(
                "AUTH: No authentication token found."
            );

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });

        }


        console.log(
            "AUTH: Token received:",
            Boolean(token)
        );

        console.log(
            "AUTH: Token length:",
            token.length
        );


        /* =====================================================
           VERIFY TOKEN WITH SUPABASE
        ===================================================== */

        const {
            data,
            error
        } =
            await supabaseAdmin.auth.getUser(
                token
            );


        /* =====================================================
           INVALID TOKEN
        ===================================================== */

        if (error) {

            console.error(
                "SUPABASE TOKEN VERIFICATION ERROR:",
                {
                    message:
                        error.message,

                    status:
                        error.status,

                    name:
                        error.name
                }
            );

            return res.status(401).json({

                success: false,

                message:
                    "Invalid or expired session"

            });

        }


        /* =====================================================
           USER NOT FOUND
        ===================================================== */

        if (
            !data ||
            !data.user
        ) {

            console.error(
                "AUTH: Supabase returned no user."
            );

            return res.status(401).json({

                success: false,

                message:
                    "Invalid or expired session"

            });

        }


        /* =====================================================
           STORE SUPABASE AUTH USER
        ===================================================== */

        req.user =
            data.user;


        req.accessToken =
            token;


        console.log(
            "AUTHENTICATED USER:",
            data.user.id
        );


        /* =====================================================
           CONTINUE
        ===================================================== */

        return next();


    } catch (error) {

        console.error(
            "AUTH MIDDLEWARE ERROR:",
            error
        );

        return res.status(401).json({

            success: false,

            message:
                "Authentication failed"

        });

    }

};


/* =========================================================
   REQUIRE ROLE
========================================================= */

const requireRole = (...allowedRoles) => {

    return async (req, res, next) => {

        try {

            /* =================================================
               AUTH CHECK
            ================================================= */

            if (!req.user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Authentication required"

                });

            }


            /* =================================================
               LOAD FUELGAP USER PROFILE
            ================================================= */

            const {
                data: profile,
                error
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
                        "auth_user_id",
                        req.user.id
                    )
                    .maybeSingle();


            /* =================================================
               DATABASE ERROR
            ================================================= */

            if (error) {

                console.error(
                    "ROLE LOOKUP ERROR:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to verify user role"

                });

            }


            /* =================================================
               PROFILE NOT FOUND
            ================================================= */

            if (!profile) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User profile not found"

                });

            }


            /* =================================================
               INACTIVE ACCOUNT
            ================================================= */

            if (profile.is_active === false) {

                return res.status(403).json({

                    success: false,

                    message:
                        "User account is inactive"

                });

            }


            /* =================================================
               NORMALIZE ROLE
            ================================================= */

            const userRole =
                String(
                    profile.role || ""
                )
                    .toLowerCase()
                    .trim();


            const normalizedAllowedRoles =
                allowedRoles.map(
                    role =>
                        String(role)
                            .toLowerCase()
                            .trim()
                );


            /* =================================================
               SUPER ADMIN DETECTION
            ================================================= */

            const isSuperAdmin =
                userRole === "super_admin";


            /* =================================================
               ROLE PERMISSION CHECK
            ================================================= */

            if (
                !normalizedAllowedRoles.includes(
                    userRole
                )
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You do not have permission to access this resource"

                });

            }


            /* =================================================
               ATTACH PROFILE TO REQUEST
            ================================================= */

            req.profile =
                profile;


            /* =================================================
               ATTACH ROLE
            ================================================= */

            req.userRole =
                userRole;


            /* =================================================
               SUPER ADMIN FLAG
            ================================================= */

            req.isSuperAdmin =
                isSuperAdmin;


            /* =================================================
               ORGANIZATION ID
               
               IMPORTANT:
               Super Admin can have an organization_id,
               but platform-level routes should NOT use
               it to restrict Super Admin visibility.
            ================================================= */

            req.organizationId =
                profile.organization_id || null;


            /* =================================================
               STATION ID
            ================================================= */

            req.stationId =
                profile.station_id || null;


            /* =================================================
               PLATFORM ACCESS FLAG
            ================================================= */

            req.hasPlatformAccess =
                isSuperAdmin;


            /* =================================================
               ORGANIZATION ACCESS FLAG
            ================================================= */

            req.hasOrganizationAccess =
                [
                    "owner",
                    "admin",
                    "manager",
                    "attendant"
                ].includes(
                    userRole
                );


            /* =================================================
               LOG ROLE
            ================================================= */

            console.log(
                "AUTHORIZED USER:",
                {
                    userId:
                        profile.id,

                    authUserId:
                        profile.auth_user_id,

                    role:
                        userRole,

                    isSuperAdmin:
                        req.isSuperAdmin,

                    organizationId:
                        req.organizationId,

                    stationId:
                        req.stationId
                }
            );


            /* =================================================
               CONTINUE
            ================================================= */

            return next();


        } catch (error) {

            console.error(
                "ROLE MIDDLEWARE ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify permissions"

            });

        }

    };

};


/* =========================================================
   REQUIRE SUPER ADMIN
   PLATFORM OWNER ONLY
========================================================= */

const requireSuperAdmin = async (
    req,
    res,
    next
) => {

    try {

        /* =====================================================
           AUTH CHECK
        ===================================================== */

        if (!req.user) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });

        }


        /* =====================================================
           PROFILE CHECK
        ===================================================== */

        if (!req.profile) {

            const {
                data: profile,
                error
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
                        "auth_user_id",
                        req.user.id
                    )
                    .maybeSingle();


            if (error) {

                console.error(
                    "SUPER ADMIN PROFILE ERROR:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to verify platform access"

                });

            }


            if (!profile) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User profile not found"

                });

            }


            req.profile =
                profile;

        }


        /* =====================================================
           CHECK ACTIVE ACCOUNT
        ===================================================== */

        if (
            req.profile.is_active === false
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "User account is inactive"

            });

        }


        /* =====================================================
           CHECK SUPER ADMIN
        ===================================================== */

        const role =
            String(
                req.profile.role || ""
            )
                .toLowerCase()
                .trim();


        if (
            role !== "super_admin"
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "FuelGap platform administrator access required"

            });

        }


        /* =====================================================
           ATTACH PLATFORM FLAGS
        ===================================================== */

        req.userRole =
            "super_admin";


        req.isSuperAdmin =
            true;


        req.hasPlatformAccess =
            true;


        req.organizationId =
            req.profile.organization_id || null;


        req.stationId =
            req.profile.station_id || null;


        /* =====================================================
           LOG PLATFORM ACCESS
        ===================================================== */

        console.log(
            "FUELGAP SUPER ADMIN ACCESS:",
            {
                userId:
                    req.profile.id,

                authUserId:
                    req.profile.auth_user_id,

                role:
                    req.profile.role
            }
        );


        /* =====================================================
           CONTINUE
        ===================================================== */

        return next();


    } catch (error) {

        console.error(
            "SUPER ADMIN MIDDLEWARE ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to verify platform administrator access"

        });

    }

};


/* =========================================================
   REQUIRE ORGANIZATION ROLE
========================================================= */

const requireOrganizationRole = (
    ...allowedRoles
) => {

    return requireRole(
        ...allowedRoles
    );

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

    requireAuth,

    requireRole,

    requireSuperAdmin,

    requireOrganizationRole,

    AUTH_COOKIE_NAME

};