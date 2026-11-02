create table if not exists football.referee_appointments (
 fixture_id uuid primary key references football.fixtures(id) on delete cascade,
 referee_name text not null check (length(trim(referee_name)) between 2 and 150),
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
 updated_at timestamptz not null default now()
);
create index if not exists referee_appointments_status_idx on football.referee_appointments(status);

comment on table football.referee_appointments is 'League-controlled referee appointments; club accounts have read-only visibility.';

create index if not exists referee_appointments_updated_idx on football.referee_appointments(updated_at desc);
