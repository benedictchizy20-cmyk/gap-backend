/* =========================================================
   FUELGAP - SUPABASE CLIENT
   BACKEND AUTH CLIENT
   PUBLISHABLE KEY
========================================================= */

const {
    createClient
} = require("@supabase/supabase-js");

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const supabaseUrl =
    process.env.SUPABASE_URL;

const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY;

/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

if (!supabaseUrl) {
    throw new Error(
        "SUPABASE_URL is missing from .env"
    );
}

if (!supabasePublishableKey) {
    throw new Error(
        "SUPABASE_PUBLISHABLE_KEY is missing from .env"
    );
}

/* =========================================================
   CREATE SUPABASE CLIENT
========================================================= */

const supabase = createClient(
    supabaseUrl,
    supabasePublishableKey,
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

module.exports = supabase;