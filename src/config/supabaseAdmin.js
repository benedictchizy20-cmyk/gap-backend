/* =========================================================
   FUELGAP - SUPABASE ADMIN CLIENT
   BACKEND ONLY
   SERVICE ROLE ACCESS
========================================================= */

const {
    createClient
} = require("@supabase/supabase-js");

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const supabaseUrl =
    process.env.SUPABASE_URL;

const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

if (!supabaseUrl) {
    throw new Error(
        "SUPABASE_URL is missing from .env"
    );
}

if (!supabaseServiceRoleKey) {
    throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is missing from .env"
    );
}

/* =========================================================
   CREATE ADMIN SUPABASE CLIENT
========================================================= */

const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = supabaseAdmin;