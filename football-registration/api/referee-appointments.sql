create table if not exists football.referee_appointments (
 fixture_id uuid primary key references football.fixtures(id) on delete cascade,
 referee_name text not null check (length(trim(referee_name)) between 2 and 150),
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
 updated_at timestamptz not null default now()
);
create index if not exists referee_appointments_status_idx on football.referee_appointments(status);

comment on table football.referee_appointments is 'League-controlled referee appointments; club accounts have read-only visibility.';

create index if not exists referee_appointments_updated_idx on football.referee_appointments(updated_at desc);

alter table football.referee_appointments add column if not exists appointment_notes text;

alter table football.referee_appointments add column if not exists referee_email text;
alter table football.referee_appointments add column if not exists response_token_hash text;
alter table football.referee_appointments add column if not exists response_token_expires_at timestamptz;

create unique index if not exists referee_appointments_response_token_idx on football.referee_appointments(response_token_hash) where response_token_hash is not null;
