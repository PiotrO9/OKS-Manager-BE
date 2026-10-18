-- CreateTable
CREATE TABLE "_VehicleSupportedCourseTypes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_VehicleSupportedCourseTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_VehicleSupportedCourseTypes_B_index" ON "_VehicleSupportedCourseTypes"("B");

-- AddForeignKey
ALTER TABLE "_VehicleSupportedCourseTypes" ADD CONSTRAINT "_VehicleSupportedCourseTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "course_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VehicleSupportedCourseTypes" ADD CONSTRAINT "_VehicleSupportedCourseTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Access follows Express/Prisma; do not expose the junction through the Data API.
ALTER TABLE "_VehicleSupportedCourseTypes" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "_VehicleSupportedCourseTypes" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "_VehicleSupportedCourseTypes" FROM authenticated;
  END IF;
END;
$$;
