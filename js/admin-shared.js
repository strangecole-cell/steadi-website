/* ============================================
   STEADI — Admin: shared Supabase client
   ============================================ */

(function () {
  'use strict';

  // Same anon key used on /testerteam — it's Supabase's public key, safe
  // to embed. Real authorization is enforced server-side by the Edge
  // Functions, which check the logged-in user's email against ADMIN_EMAIL.
  var SUPABASE_URL = 'https://oojzxtjmxqutnsobndso.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vanp4dGpteHF1dG5zb2JuZHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzQ2OTIsImV4cCI6MjA5OTI1MDY5Mn0.bTc9fV5PBrxCy1SJK10kfInDtYLHYxestjVKEGavo1Q';

  window.steadiAdmin = {
    supabaseClient: window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    ANON_KEY: SUPABASE_ANON_KEY,
    FUNCTIONS_URL: SUPABASE_URL + '/functions/v1',
  };
})();
