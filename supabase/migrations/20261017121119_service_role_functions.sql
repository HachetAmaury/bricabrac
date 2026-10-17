-- The service role (Edge Function, admin script) runs the profile/event
-- triggers, which call the RLS helper functions. Those were granted to
-- `authenticated` only.
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;
