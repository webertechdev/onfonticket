ALTER TABLE public.profiles
  ADD COLUMN phone_number text,
  ADD COLUMN staff_number text;

CREATE UNIQUE INDEX profiles_staff_number_unique
  ON public.profiles (lower(btrim(staff_number)))
  WHERE staff_number IS NOT NULL AND btrim(staff_number) <> '';

COMMENT ON COLUMN public.profiles.phone_number IS 'Optional ONFON staff contact number.';
COMMENT ON COLUMN public.profiles.staff_number IS 'Optional unique ONFON employee/staff identifier.';
