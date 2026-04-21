-- Migration: Fix permissions for refresh_fact_inventory_planning
GRANT EXECUTE ON FUNCTION refresh_fact_inventory_planning() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
