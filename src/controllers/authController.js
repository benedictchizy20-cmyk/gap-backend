/* =========================================================
   FUELGAP - AUTHENTICATION CONTROLLER
   SUPABASE AUTHENTICATION
   HTTPONLY COOKIE SESSION

   IMPORTANT:
   - Registration uses a fresh Supabase client
   - Login uses a fresh Supabase client
   - No localStorage authentication
   - Authentication stored in HttpOnly cookie
   - organizations table does NOT use owner_id
========================================================= */

const {
    createClient
} = require("@supabase/supabase-js");

const supabaseAdmin =
    require("../config/supabaseAdmin");

const {
    AUTH_COOKIE_NAME
} = require("../middleware/authMiddleware");


/* =========================================================
   COOKIE OPTIONS
========================================================= */

const getCookieOptions = () => {

    const isProduction =
        process.env.NODE_ENV === "production";

    return {

        httpOnly: true,

        secure: isProduction,

        sameSite:
            isProduction
                ? "none"
                : "lax",

        maxAge:
            7 * 24 * 60 * 60 * 1000,

        path: "/"

    };

};


/* =========================================================
   CREATE FRESH SUPABASE AUTH CLIENT
========================================================= */

const createFreshAuthClient = () => {

    return createClient(

        process.env.SUPABASE_URL,

        process.env.SUPABASE_PUBLISHABLE_KEY,

        {
            auth: {

                persistSession: false,

                autoRefreshToken: false,

                detectSessionInUrl: false

            }

        }

    );

};


/* =========================================================
   LOAD USER PROFILE
   WITH RETRY

   This is used by /auth/me.

   Supabase can occasionally return temporary
   Gateway Timeout errors. We retry the profile
   request before returning an error to the frontend.
========================================================= */

const loadUserProfile = async (
    authUserId,
    attempts = 3
) => {

    let lastError = null;


    for (
        let attempt = 1;
        attempt <= attempts;
        attempt++
    ) {

        try {

            console.log(
                `LOAD USER PROFILE ATTEMPT ${attempt}/${attempts}:`,
                authUserId
            );


            const {
                data: profile,
                error
            } =
                await supabaseAdmin

                    .from("users")

                    .select(`
                        id,
                        auth_user_id,
                        full_name,
                        email,
                        organization_id,
                        role,
                        is_active
                    `)

                    .eq(
                        "auth_user_id",
                        authUserId
                    )

                    .maybeSingle();


            /* =========================================
               SUCCESS
            ========================================= */

            if (!error) {

                console.log(
                    "USER PROFILE LOADED SUCCESSFULLY"
                );

                return {

                    profile,

                    error: null

                };

            }


            /* =========================================
               STORE ERROR
            ========================================= */

            lastError =
                error;


            console.error(
                `USER PROFILE QUERY ERROR ATTEMPT ${attempt}:`,
                {
                    message:
                        error.message,

                    code:
                        error.code,

                    details:
                        error.details,

                    hint:
                        error.hint
                }
            );


            /* =========================================
               RETRY ONLY TEMPORARY ERRORS
            ========================================= */

            const errorMessage =
                String(
                    error.message || ""
                ).toLowerCase();


            const isTemporaryError =
                errorMessage.includes(
                    "gateway timeout"
                ) ||
                errorMessage.includes(
                    "timeout"
                ) ||
                errorMessage.includes(
                    "timed out"
                ) ||
                errorMessage.includes(
                    "fetch failed"
                ) ||
                errorMessage.includes(
                    "network"
                );


            if (
                !isTemporaryError ||
                attempt === attempts
            ) {

                break;

            }


            /* =========================================
               WAIT BEFORE RETRY
            ========================================= */

            const delay =
                attempt * 1000;


            console.log(
                `RETRYING USER PROFILE IN ${delay}ms...`
            );


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        delay
                    )
            );

        } catch (error) {

            lastError =
                error;


            console.error(
                `USER PROFILE EXCEPTION ATTEMPT ${attempt}:`,
                error
            );


            if (
                attempt === attempts
            ) {

                break;

            }


            const delay =
                attempt * 1000;


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        delay
                    )
            );

        }

    }


    return {

        profile: null,

        error:
            lastError

    };

};


/* =========================================================
   REGISTER
========================================================= */

const register = async (req, res) => {

    try {

        const {
            full_name,
            email,
            password,
            confirm_password,
            organization_name
        } = req.body;


        /* ==========================================
           VALIDATION
        ========================================== */

        if (
            !full_name ||
            !email ||
            !password ||
            !confirm_password ||
            !organization_name
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "All required fields must be provided"

            });

        }


        if (
            typeof full_name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            typeof confirm_password !== "string" ||
            typeof organization_name !== "string"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid registration data"

            });

        }


        if (
            password !==
            confirm_password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Passwords do not match"

            });

        }


        if (
            password.length < 6
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must be at least 6 characters"

            });

        }


        const normalizedEmail =
            email
                .trim()
                .toLowerCase();


        const normalizedFullName =
            full_name.trim();


        const normalizedOrganization =
            organization_name.trim();


        if (
            !normalizedFullName ||
            !normalizedEmail ||
            !normalizedOrganization
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "All required fields must be provided"

            });

        }


        console.log(
            "REGISTRATION ATTEMPT:",
            normalizedEmail
        );


        /* ==========================================
           CREATE FRESH AUTH CLIENT
        ========================================== */

        const authClient =
            createFreshAuthClient();


        /* ==========================================
           CREATE SUPABASE AUTH USER
        ========================================== */

        const {
            data: authData,
            error: authError
        } =
            await authClient.auth.signUp({

                email:
                    normalizedEmail,

                password,

                options: {

                    data: {

                        full_name:
                            normalizedFullName

                    }

                }

            });


        /* ==========================================
           AUTH ERROR
        ========================================== */

        if (authError) {

            console.error(
                "SUPABASE REGISTER ERROR:",
                {
                    message:
                        authError.message,

                    status:
                        authError.status,

                    name:
                        authError.name
                }
            );


            let statusCode =
                500;


            if (
                authError.status === 400 ||
                authError.status === 422
            ) {

                statusCode =
                    400;

            }


            return res.status(
                statusCode
            ).json({

                success: false,

                message:
                    authError.status === 400 ||
                    authError.status === 422
                        ? authError.message
                        : "Unable to create account"

            });

        }


        /* ==========================================
           VERIFY SUPABASE USER
        ========================================== */

        if (
            !authData ||
            !authData.user
        ) {

            console.error(
                "SUPABASE REGISTER RESPONSE:",
                authData
            );


            return res.status(500).json({

                success: false,

                message:
                    "Supabase did not return a user"

            });

        }


        const authUser =
            authData.user;


        console.log(
            "SUPABASE USER CREATED:",
            authUser.id
        );


        /* ==========================================
           CREATE ORGANIZATION
        ========================================== */

        const {
            data: organization,
            error: organizationError
        } =
            await supabaseAdmin

                .from("organizations")

                .insert({

                    name:
                        normalizedOrganization

                })

                .select()

                .single();


        if (organizationError) {

            console.error(
                "ORGANIZATION CREATION ERROR:",
                organizationError
            );


            try {

                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        authUser.id
                    );

            } catch (cleanupError) {

                console.error(
                    "AUTH USER CLEANUP ERROR:",
                    cleanupError
                );

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to create organization"

            });

        }


        console.log(
            "ORGANIZATION CREATED:",
            organization.id
        );


        /* ==========================================
           CREATE USER PROFILE
        ========================================== */

        const {
            data: profile,
            error: profileError
        } =
            await supabaseAdmin

                .from("users")

                .insert({

                    auth_user_id:
                        authUser.id,

                    full_name:
                        normalizedFullName,

                    email:
                        normalizedEmail,

                    organization_id:
                        organization.id,

                    role:
                        "owner",

                    is_active:
                        true

                })

                .select(`
                    id,
                    auth_user_id,
                    full_name,
                    email,
                    organization_id,
                    role,
                    is_active
                `)

                .single();


        if (profileError) {

            console.error(
                "USER PROFILE CREATION ERROR:",
                profileError
            );


            try {

                await supabaseAdmin
                    .from("organizations")
                    .delete()
                    .eq(
                        "id",
                        organization.id
                    );

            } catch (cleanupError) {

                console.error(
                    "ORGANIZATION CLEANUP ERROR:",
                    cleanupError
                );

            }


            try {

                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
                        authUser.id
                    );

            } catch (cleanupError) {

                console.error(
                    "AUTH USER CLEANUP ERROR:",
                    cleanupError
                );

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to create user profile"

            });

        }


        console.log(
            "USER PROFILE CREATED:",
            profile.id
        );


        /* ==========================================
           SET SESSION COOKIE
        ========================================== */

        if (
            authData.session &&
            authData.session.access_token
        ) {

            res.cookie(

                AUTH_COOKIE_NAME,

                authData.session.access_token,

                getCookieOptions()

            );


            console.log(
                "REGISTRATION AUTH COOKIE SET"
            );

        } else {

            console.log(
                "NO AUTH SESSION RETURNED DURING REGISTRATION"
            );

        }


        /* ==========================================
           RESPONSE
        ========================================== */

        return res.status(201).json({

            success: true,

            message:
                "Account created successfully",

            data: {

                user:
                    profile,

                organization:
                    organization

            }

        });


    } catch (error) {

        console.error(
            "REGISTER CONTROLLER ERROR:",
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
   LOGIN
========================================================= */

const login = async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        /* ==========================================
           VALIDATION
        ========================================== */

        if (
            !email ||
            !password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Email and password are required"

            });

        }


        const normalizedEmail =
            email
                .trim()
                .toLowerCase();


        console.log(
            "LOGIN ATTEMPT:",
            normalizedEmail
        );


        /* ==========================================
           CREATE FRESH AUTH CLIENT
        ========================================== */

        const authClient =
            createFreshAuthClient();


        /* ==========================================
           SIGN IN
        ========================================== */

        const {
            data: authData,
            error: authError
        } =
            await authClient.auth
                .signInWithPassword({

                    email:
                        normalizedEmail,

                    password

                });


        /* ==========================================
           LOGIN ERROR
        ========================================== */

        if (authError) {

            console.error(
                "SUPABASE LOGIN ERROR:",
                {
                    message:
                        authError.message,

                    status:
                        authError.status,

                    name:
                        authError.name
                }
            );


            return res.status(

                authError.status === 400
                    ? 401
                    : 500

            ).json({

                success: false,

                message:
                    authError.status === 400
                        ? "Invalid email or password"
                        : "Unable to authenticate with Supabase"

            });

        }


        /* ==========================================
           VERIFY AUTH RESPONSE
        ========================================== */

        if (
            !authData ||
            !authData.user ||
            !authData.session
        ) {

            console.error(
                "SUPABASE LOGIN RESPONSE INVALID"
            );


            return res.status(401).json({

                success: false,

                message:
                    "Unable to create login session"

            });

        }


        const authUser =
            authData.user;


        const accessToken =
            authData.session.access_token;


        console.log(
            "SUPABASE LOGIN SUCCESS:",
            authUser.id
        );


        console.log(
            "ACCESS TOKEN RECEIVED:",
            Boolean(accessToken)
        );


        /* ==========================================
           GET USER PROFILE
        ========================================== */

        const {
            data: profile,
            error: profileError
        } =
            await supabaseAdmin

                .from("users")

                .select(`
                    id,
                    auth_user_id,
                    full_name,
                    email,
                    organization_id,
                    role,
                    is_active
                `)

                .eq(
                    "auth_user_id",
                    authUser.id
                )

                .maybeSingle();


        if (profileError) {

            console.error(
                "LOGIN PROFILE ERROR:",
                profileError
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load user profile"

            });

        }


        if (!profile) {

            console.error(
                "LOGIN PROFILE NOT FOUND:",
                authUser.id
            );


            return res.status(404).json({

                success: false,

                message:
                    "User profile not found"

            });

        }


        /* ==========================================
           CHECK ACCOUNT STATUS
        ========================================== */

        if (
            !profile.is_active
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Your account is inactive"

            });

        }


        /* ==========================================
           SET HTTPONLY COOKIE
        ========================================== */

        res.cookie(

            AUTH_COOKIE_NAME,

            accessToken,

            getCookieOptions()

        );


        console.log(
            "AUTH COOKIE SET SUCCESSFULLY"
        );


        /* ==========================================
           RESPONSE
        ========================================== */

        return res.status(200).json({

            success: true,

            message:
                "Login successful",

            data: {

                user:
                    profile

            }

        });


    } catch (error) {

        console.error(
            "LOGIN CONTROLLER ERROR:",
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
   GET CURRENT USER
========================================================= */

const getCurrentUser = async (
    req,
    res
) => {

    try {

        /* ==========================================
           REQUIRE AUTHENTICATED USER
        ========================================== */

        if (
            !req.user ||
            !req.user.id
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required"

            });

        }


        const authUserId =
            req.user.id;


        console.log(
            "GET CURRENT USER:",
            authUserId
        );


        /* ==========================================
           LOAD PROFILE WITH RETRIES
        ========================================== */

        const {
            profile,
            error: profileError
        } =
            await loadUserProfile(
                authUserId,
                3
            );


        /* ==========================================
           PROFILE DATABASE ERROR
        ========================================== */

        if (profileError) {

            console.error(
                "GET CURRENT USER PROFILE ERROR:",
                {
                    message:
                        profileError.message,

                    code:
                        profileError.code,

                    details:
                        profileError.details,

                    hint:
                        profileError.hint
                }
            );


            return res.status(503).json({

                success: false,

                message:
                    "Unable to connect to the user profile service. Please try again."

            });

        }


        /* ==========================================
           PROFILE NOT FOUND
        ========================================== */

        if (!profile) {

            console.error(
                "GET CURRENT USER PROFILE NOT FOUND:",
                authUserId
            );


            return res.status(404).json({

                success: false,

                message:
                    "User profile not found"

            });

        }


        /* ==========================================
           CHECK ACTIVE STATUS
        ========================================== */

        if (
            !profile.is_active
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Your account is inactive"

            });

        }


        /* ==========================================
           RESPONSE
        ========================================== */

        return res.status(200).json({

            success: true,

            data: {

                user:
                    profile

            }

        });


    } catch (error) {

        console.error(
            "GET CURRENT USER ERROR:",
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
   LOGOUT
========================================================= */

const logout = async (
    req,
    res
) => {

    try {

        /* ==========================================
           CLEAR HTTPONLY COOKIE
        ========================================== */

        res.clearCookie(

            AUTH_COOKIE_NAME,

            getCookieOptions()

        );


        console.log(
            "USER LOGGED OUT"
        );


        return res.status(200).json({

            success: true,

            message:
                "Logout successful"

        });


    } catch (error) {

        console.error(
            "LOGOUT ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to logout"

        });

    }

};


/* =========================================================
   EXPORT CONTROLLERS
========================================================= */

module.exports = {

    register,

    login,

    getCurrentUser,

    logout

};