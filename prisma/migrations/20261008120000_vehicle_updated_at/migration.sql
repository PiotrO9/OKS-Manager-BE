ALTER TABLE "vehicles" ADD COLUMN "updated_at" TIMESTAMPTZ(3);

CREATE FUNCTION set_vehicle_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_updated_at
BEFORE INSERT OR UPDATE ON "vehicles"
FOR EACH ROW EXECUTE FUNCTION set_vehicle_updated_at();
