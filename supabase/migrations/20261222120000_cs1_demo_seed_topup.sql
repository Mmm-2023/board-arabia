-- CS-1 demo content top-up.
-- Data only. Safe to run twice: on conflict do nothing, so a second run inserts nothing and changes nothing.
-- Directory mail uses the non-deliverable boardarabia.test host because the live check requires it.
-- Mandate contacts use example.com. Partner rows have no mail column.
-- These partner rows are samples. They are not linked to a partner seat.
-- Category slugs already exist, so a later Home fix can match them:
-- transaction-counsel for the law firm,
-- financial-due-diligence-and-tax for accounting and audit,
-- investment-banking for the bank,
-- placement-and-capital-introduction for executive search,
-- corporate-finance-advisory for the insurer and advisory firm.
-- This file does not change tables, functions, policies, or grants.

insert into public.directory_entries (
  id, is_demo, email, full_name, headline, company, location, sector, seat,
  portrait_asset, include_in_public_aggregates, sort_order, availability, vision_themes
) values
  (
    'c5100001-0000-4000-8000-000000000001',
    true,
    'rana.muzn@boardarabia.test',
    'Rana Al-Muzn',
    'Independent director',
    'Muzn Advisory',
    'Riyadh',
    'Financial services',
    'ksa',
    '/demo/portraits/muzn.svg',
    false,
    9,
    'open',
    array['Financial sector development']::text[]
  ),
  (
    'c5100001-0000-4000-8000-000000000002',
    true,
    'huda.sadir@boardarabia.test',
    'Huda Al-Sadir',
    'Non-executive director',
    'Sadir Care Seat',
    'Jeddah',
    'Health',
    'ksa',
    '/demo/portraits/sadir.svg',
    false,
    10,
    'selective',
    array['Health transformation']::text[]
  ),
  (
    'c5100001-0000-4000-8000-000000000003',
    true,
    'karim.shatt@boardarabia.test',
    'Karim Al-Shatt',
    'Chair advisor',
    'Shatt Board Practice',
    'London',
    'Digital infrastructure',
    'intl',
    '/demo/portraits/shatt.svg',
    false,
    11,
    'open',
    array['Localization']::text[]
  ),
  (
    'c5100001-0000-4000-8000-000000000004',
    true,
    'lama.wadi@boardarabia.test',
    'Lama Al-Wadi',
    'Board member',
    'Wadi Freight Seat',
    'Dammam',
    'Logistics',
    'ksa',
    '/demo/portraits/wadi.svg',
    false,
    12,
    'at_capacity',
    array['Industrial development and logistics']::text[]
  )
on conflict (id) do nothing;

insert into public.mandates (
  id, is_demo, published, sector, deal_type, ticket_band, geography, stage, one_liner,
  company_name, exact_amount, terms, contact_name, contact_email, contact_phone,
  deck_url, narrative, sort_order, sector_tags, vision_themes
) values
  (
    'c5200001-0000-4000-8000-000000000001',
    true,
    true,
    'Financial services',
    'Growth equity',
    '$10-25m',
    'KSA',
    'Diligence',
    'Growth capital for a private payments platform serving local merchants.',
    'Qitar Payments House',
    'Example figure, released after intro',
    'Minority stake and one board seat.',
    'Amal Q.',
    'amal.qitar@example.com',
    'Example line',
    null,
    'The named company is raising growth capital. The shareholder table and the data room stay locked until an admin releases the intro.',
    7,
    array['Financial services']::text[],
    array['Financial sector development']::text[]
  ),
  (
    'c5200001-0000-4000-8000-000000000002',
    true,
    true,
    'Digital infrastructure',
    'Project finance',
    '$25-50m',
    'KSA',
    'Sourcing',
    'Project capital for a regional data hall and fibre link.',
    'Sahl Data Halls',
    'Example figure, released after intro',
    'Senior facility and one observer seat.',
    'Noura S.',
    'noura.sahl@example.com',
    'Example line',
    null,
    'The named company is the project in this brief. The site list and the lender list stay locked until an admin releases the intro.',
    8,
    array['Digital infrastructure']::text[],
    array['Localization']::text[]
  ),
  (
    'c5200001-0000-4000-8000-000000000003',
    true,
    true,
    'Health',
    'Acquisition',
    '$25-50m',
    'GCC',
    'Diligence',
    'A control stake in a private diagnostics network.',
    'Example Lab House',
    'Example figure, released after intro',
    'Control stake and two board seats.',
    'Huda L.',
    'huda.lab@example.com',
    'Example line',
    null,
    'The named company is the target. The clinic list and the seller contacts stay locked until an admin releases the intro.',
    9,
    array['Health']::text[],
    array['Health transformation']::text[]
  ),
  (
    'c5200001-0000-4000-8000-000000000004',
    true,
    true,
    'Logistics',
    'Growth equity',
    '$10-25m',
    'KSA',
    'Sourcing',
    'Growth equity for a cold-chain warehouse operator.',
    'Thuluth Cold Chain',
    'Example figure, released after intro',
    'Minority stake and information rights each quarter.',
    'Tariq T.',
    'tariq.thuluth@example.com',
    'Example line',
    null,
    'The named company is the operator in this brief. The route map and the term sheet stay locked until an admin releases the intro.',
    10,
    array['Logistics']::text[],
    array['Industrial development and logistics']::text[]
  )
on conflict (id) do nothing;

insert into public.rooms (
  id, is_demo, status, opened_by, name, summary, sector, stage, member_count,
  host_directory_id, host_name, mandate_id, sort_order
) values
  (
    'c5300001-0000-4000-8000-000000000001',
    true,
    'open',
    'admin',
    'Payments platform room',
    'A working room for a growth brief in payments. Opened by admin.',
    'Financial services',
    'Diligence',
    4,
    'c5100001-0000-4000-8000-000000000001',
    'Rana Al-Muzn',
    'c5200001-0000-4000-8000-000000000001',
    5
  ),
  (
    'c5300001-0000-4000-8000-000000000002',
    true,
    'open',
    'admin',
    'Data hall room',
    'A working room for a project brief in digital infrastructure. Opened by admin.',
    'Digital infrastructure',
    'Sourcing',
    3,
    'c5100001-0000-4000-8000-000000000003',
    'Karim Al-Shatt',
    'c5200001-0000-4000-8000-000000000002',
    6
  )
on conflict (id) do nothing;

insert into public.trusted_partners (
  id, is_demo, published, name, blurb, monogram, sort_order, category_slug
) values
  (
    'c5400001-0000-4000-8000-000000000001',
    true,
    true,
    'Bayt Counsel',
    'Example law firm for transaction work beside a closing.',
    'BC',
    4,
    'transaction-counsel'
  ),
  (
    'c5400001-0000-4000-8000-000000000002',
    true,
    true,
    'Mizaan Audit House',
    'Example accounting and audit firm for a private brief.',
    'MH',
    5,
    'financial-due-diligence-and-tax'
  ),
  (
    'c5400001-0000-4000-8000-000000000003',
    true,
    true,
    'Nahr Ledger Bank',
    'Example bank for private transaction work.',
    'NB',
    6,
    'investment-banking'
  ),
  (
    'c5400001-0000-4000-8000-000000000004',
    true,
    true,
    'Example Search House',
    'Example executive search firm for board seats.',
    'ES',
    7,
    'placement-and-capital-introduction'
  ),
  (
    'c5400001-0000-4000-8000-000000000005',
    true,
    true,
    'Wifaq Cover House',
    'Example insurer and advisory firm for a closing.',
    'WC',
    8,
    'corporate-finance-advisory'
  )
on conflict (id) do nothing;

-- Remove CS-1 demo content (one statement):
-- with r as (delete from public.rooms where is_demo and id::text like 'c53%' returning 1),
--      m as (delete from public.mandates where is_demo and id::text like 'c52%' returning 1),
--      d as (delete from public.directory_entries where is_demo and id::text like 'c51%' returning 1)
-- delete from public.trusted_partners where is_demo and id::text like 'c54%';
