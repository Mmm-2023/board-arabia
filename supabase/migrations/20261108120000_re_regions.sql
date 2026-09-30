-- Widen the real estate city check so the 13 administrative regions can be saved.
-- city is text with a check constraint, not an enum and not free text.
-- Legacy values stay allowed. Existing rows are not rewritten.
-- The member filter maps those legacy values onto a region.
-- Idempotent: drop the check if it exists, then add it again.

alter table public.re_opportunities
  drop constraint if exists re_opportunities_city;

alter table public.re_opportunities
  add constraint re_opportunities_city check (city in (
    'Riyadh',
    'Makkah',
    'Madinah',
    'Eastern Province',
    'Asir',
    'Tabuk',
    'Qassim',
    'Ha''il',
    'Northern Borders',
    'Jazan',
    'Najran',
    'Al Bahah',
    'Al Jawf',
    'Jeddah',
    'NEOM',
    'Red Sea',
    'Qiddiya',
    'Diriyah',
    'ROSHN',
    'other'
  ));

alter table public.re_partners
  drop constraint if exists re_partners_city;

alter table public.re_partners
  add constraint re_partners_city check (city in (
    'Riyadh',
    'Makkah',
    'Madinah',
    'Eastern Province',
    'Asir',
    'Tabuk',
    'Qassim',
    'Ha''il',
    'Northern Borders',
    'Jazan',
    'Najran',
    'Al Bahah',
    'Al Jawf',
    'Jeddah',
    'NEOM',
    'Red Sea',
    'Qiddiya',
    'Diriyah',
    'ROSHN',
    'other'
  ));
