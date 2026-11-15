-- Farmer Community core schema. Run in Supabase SQL Editor or via Supabase CLI migrations.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create sequence if not exists public.farmer_code_seq start 100000;

create table if not exists public.interests (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name_en text not null, name_te text not null, name_kn text not null, name_hi text not null,
  description_en text, description_te text, description_kn text, description_hi text,
  active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.farmers (
  id uuid primary key default gen_random_uuid(),
  farmer_code text unique not null default ('FCM' || lpad(nextval('public.farmer_code_seq')::text, 8, '0')),
  name text not null check (char_length(name) between 2 and 80),
  mobile text not null unique check (mobile ~ '^\+91[6-9][0-9]{9}$'),
  pincode char(6) not null check (pincode ~ '^[1-9][0-9]{5}$'),
  state text not null default 'Telangana', district text, mandal text, village text,
  language text not null check (language in ('en','te','kn','hi')),
  consent boolean not null default false, consent_at timestamptz, consent_text_version text,
  source text not null default 'website', latest_whatsapp_status text not null default 'pending' check (latest_whatsapp_status in ('pending','sent','delivered','read','failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists farmers_created_at_idx on public.farmers(created_at desc);
create index if not exists farmers_pincode_idx on public.farmers(pincode);
create index if not exists farmers_district_idx on public.farmers(district);
create index if not exists farmers_language_idx on public.farmers(language);
create index if not exists farmers_status_idx on public.farmers(latest_whatsapp_status);
create index if not exists farmers_name_trgm_idx on public.farmers using gin(name gin_trgm_ops);

create table if not exists public.farmer_interests (
  farmer_id uuid not null references public.farmers(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete restrict,
  created_at timestamptz not null default now(), primary key(farmer_id,interest_id)
);
create index if not exists farmer_interests_interest_idx on public.farmer_interests(interest_id);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(), interest_id uuid not null references public.interests(id) on delete cascade,
  name text not null, description text, invite_url text not null check (invite_url like 'https://chat.whatsapp.com/%'),
  active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists communities_interest_idx on public.communities(interest_id,active,sort_order);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(), farmer_id uuid not null references public.farmers(id) on delete cascade,
  phone text not null, template_name text not null, language text not null check(language in ('en','te','kn','hi')),
  status text not null default 'pending' check(status in ('pending','sent','delivered','read','failed')),
  message_id text unique, error_message text, metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz default now(), delivered_at timestamptz, read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_farmer_idx on public.whatsapp_messages(farmer_id,created_at desc);
create index if not exists whatsapp_status_idx on public.whatsapp_messages(status,created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid,
  action text not null, actor text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_at_idx on public.audit_logs(created_at desc);

create table if not exists public.pincode_directory (
  pincode char(6) primary key check(pincode ~ '^[1-9][0-9]{5}$'), office_name text,
  district text, state text, division text, region text, circle text, latitude numeric(9,6), longitude numeric(9,6),
  source text, verified_at timestamptz, created_at timestamptz not null default now()
);

create or replace view public.farmer_locations_view as
select coalesce(state,'Unknown') as state,coalesce(district,'Unknown') as district,
       coalesce(mandal,'Unknown') as mandal,pincode,count(*)::bigint as farmer_count
from public.farmers group by state,district,mandal,pincode;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists farmers_updated_at on public.farmers;
create trigger farmers_updated_at before update on public.farmers for each row execute function public.set_updated_at();
drop trigger if exists interests_updated_at on public.interests;
create trigger interests_updated_at before update on public.interests for each row execute function public.set_updated_at();
drop trigger if exists communities_updated_at on public.communities;
create trigger communities_updated_at before update on public.communities for each row execute function public.set_updated_at();

-- Keep the farmer's latest invitation state in sync with Meta webhook callbacks.
create or replace function public.sync_farmer_whatsapp_status() returns trigger language plpgsql as $$
begin
 update public.farmers set latest_whatsapp_status=new.status where id=new.farmer_id;
 return new;
end; $$;
drop trigger if exists whatsapp_status_to_farmer on public.whatsapp_messages;
create trigger whatsapp_status_to_farmer after insert or update of status on public.whatsapp_messages for each row execute function public.sync_farmer_whatsapp_status();

-- Seed interest categories. IDs are stable slugs in the app; fetch UUIDs from /api/public/interests.
insert into public.interests(slug,name_en,name_te,name_kn,name_hi,description_en,sort_order) values
('crops','Crops & Agriculture','పంటలు & వ్యవసాయం','ಬೆಳೆಗಳು ಮತ್ತು ಕೃಷಿ','फसल और कृषि','Crop guidance, cultivation and farming techniques',1),
('dairy','Dairy Farming','పాడి పశుపోషణ','ಹೈನುಗಾರಿಕೆ','डेयरी फार्मिंग','Dairy cattle care and milk production',2),
('livestock','Livestock','పశుసంవర్ధక','ಜಾನುವಾರು ಸಾಕಣೆ','पशुपालन','Animal husbandry and livestock care',3),
('poultry','Poultry Farming','కోళ్ల పెంపకం','ಕೋಳಿ ಸಾಕಣೆ','मुर्गी पालन','Poultry farming and management',4),
('fisheries','Fisheries','మత్స్య పరిశ్రమ','ಮೀನುಗಾರಿಕೆ','मत्स्य पालन','Fish farming and aquaculture',5),
('agri-schemes','Agriculture Schemes','వ్యవసాయ పథకాలు','ಕೃಷಿ ಯೋಜನೆಗಳು','कृषि योजनाएँ','Government schemes and farmer benefits',6)
on conflict(slug) do nothing;

-- Supabase: keep tables inaccessible to anon/authenticated clients. Backend uses service-role key.
alter table public.interests enable row level security;
alter table public.farmers enable row level security;
alter table public.farmer_interests enable row level security;
alter table public.communities enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.pincode_directory enable row level security;
