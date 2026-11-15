ALTER TABLE public.farmers
ADD COLUMN IF NOT EXISTS community_status TEXT NOT NULL DEFAULT 'not_joined';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'farmers_community_status_check'
      AND conrelid = 'public.farmers'::regclass
  ) THEN
    ALTER TABLE public.farmers
    ADD CONSTRAINT farmers_community_status_check
    CHECK (community_status IN ('joined', 'not_joined'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS farmers_community_status_idx
ON public.farmers (community_status);
