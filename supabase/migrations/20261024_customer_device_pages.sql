-- SmartPrint V2 customer device identity + selected-page support.
-- Run once in Supabase SQL Editor for the existing V2 project.
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS original_pages integer;
UPDATE public.print_jobs SET original_pages = pages WHERE original_pages IS NULL;
ALTER TABLE public.print_jobs ALTER COLUMN original_pages SET NOT NULL;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS selected_pages text NOT NULL DEFAULT 'all';
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS device_id uuid;
CREATE INDEX IF NOT EXISTS print_jobs_customer_device_idx ON public.print_jobs(shop_id, device_id, created_at DESC);
-- Existing jobs remain visible to the owner but are not assigned to a customer device history.
