-- Each participating club can rate the appointed referee once after a match.
create table if not exists football.referee_ratings (
 id uuid primary key default gen_random_uuid(),
 fixture_id uuid not null references football.fixtures(id) on delete cascade,
 club_id uuid not null references football.clubs(id) on delete cascade,
 rating smallint not null check (rating between 1 and 5),
 comments varchar(1000),
 submitted_at timestamptz not null default now(),
 unique(fixture_id,club_id)
);
create index if not exists referee_ratings_fixture_idx on football.referee_ratings(fixture_id);
