-- Football Registration & Team Sheet: isolated Supabase schema (not yet applied)
-- Supabase Auth provides email sign-in. Only approved league administrators should
-- grant memberships; do not expose service-role keys to browsers.
create extension if not exists pgcrypto;
create schema if not exists football;
grant usage on schema football to authenticated;
create table if not exists football.leagues (
 id uuid primary key default gen_random_uuid(), name text not null,
 created_at timestamptz not null default now()
);
create table if not exists football.clubs (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references football.leagues(id) on delete cascade,
 name text not null, unique(league_id,name)
);
create table if not exists football.memberships (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 league_id uuid not null references football.leagues(id) on delete cascade,
 club_id uuid references football.clubs(id) on delete cascade,
 role text not null check(role in ('league_admin','club_manager','referee')),
 approved boolean not null default false,
 unique(user_id,league_id,role,club_id)
);
create table if not exists football.players (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references football.clubs(id) on delete cascade,
 name text not null, squad_number integer not null check(squad_number between 1 and 99),
 registered boolean not null default false,
 suspended boolean not null default false,
 registration_source text not null default 'manual_unverified',
 updated_at timestamptz not null default now(),
 unique(club_id,squad_number)
);
create table if not exists football.fixtures (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references football.leagues(id) on delete cascade,
 home_club_id uuid not null references football.clubs(id),
 away_club_id uuid not null references football.clubs(id),
 kickoff timestamptz not null, ground text,
 max_named_subs integer not null default 7 check(max_named_subs between 0 and 30),
 max_used_subs integer not null default 5 check(max_used_subs between 0 and 30),
 check(home_club_id <> away_club_id)
);
create table if not exists football.team_sheets (
 id uuid primary key default gen_random_uuid(),
 fixture_id uuid not null references football.fixtures(id) on delete cascade,
 club_id uuid not null references football.clubs(id),
 submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now(),
 unique(fixture_id,club_id)
);
create table if not exists football.team_sheet_players (
 sheet_id uuid not null references football.team_sheets(id) on delete cascade,
 player_id uuid not null references football.players(id),
 selection text not null check(selection in ('starter','substitute')),
 primary key(sheet_id,player_id)
);
create table if not exists football.referee_appointments (
 fixture_id uuid primary key references football.fixtures(id) on delete cascade,
 referee_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 responded_at timestamptz
);
create table if not exists football.match_reports (
 fixture_id uuid primary key references football.fixtures(id) on delete cascade,
 submitted_by uuid not null references auth.users(id),
 home_goals integer not null check(home_goals>=0),
 away_goals integer not null check(away_goals>=0),
 incidents text not null default '',
 submitted_at timestamptz not null default now()
);
create table if not exists football.identity_checks (
 id uuid primary key default gen_random_uuid(),
 fixture_id uuid not null references football.fixtures(id) on delete cascade,
 player_id uuid not null references football.players(id),
 referee_id uuid not null references auth.users(id),
 result text not null check(result in ('seen','query')),
 checked_at timestamptz not null default now(),
 unique(fixture_id,player_id)
);
create or replace function football.has_role(p_league uuid,p_role text,p_club uuid default null)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from football.memberships m
where m.user_id=(select auth.uid()) and m.league_id=p_league
and m.role=p_role and m.approved
and (p_club is null or m.club_id=p_club)); $$;
create or replace function football.is_referee(p_fixture uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from football.referee_appointments a
where a.fixture_id=p_fixture and a.referee_id=(select auth.uid())
and a.status='accepted'); $$;
create or replace function football.is_admin(p_league uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select football.has_role(p_league,'league_admin',null); $$;
alter table football.leagues enable row level security;
alter table football.clubs enable row level security;
alter table football.memberships enable row level security;
alter table football.players enable row level security;
alter table football.fixtures enable row level security;
alter table football.team_sheets enable row level security;
alter table football.team_sheet_players enable row level security;
alter table football.referee_appointments enable row level security;
alter table football.match_reports enable row level security;
alter table football.identity_checks enable row level security;
create policy league_read on football.leagues for select to authenticated using
 (exists(select 1 from football.memberships m where m.league_id=id and m.user_id=(select auth.uid()) and m.approved));
create policy clubs_read on football.clubs for select to authenticated using
 (football.is_admin(league_id) or exists(select 1 from football.memberships m where m.league_id=clubs.league_id and m.user_id=(select auth.uid()) and m.approved));
create policy memberships_self on football.memberships for select to authenticated using (user_id=(select auth.uid()) or football.is_admin(league_id));
create policy memberships_admin_insert on football.memberships for insert to authenticated with check (football.is_admin(league_id));
create policy memberships_admin_update on football.memberships for update to authenticated using (football.is_admin(league_id)) with check (football.is_admin(league_id));
create policy players_read on football.players for select to authenticated using
 (exists(select 1 from football.clubs c join football.memberships m on m.league_id=c.league_id where c.id=players.club_id and m.user_id=(select auth.uid()) and m.approved));
create policy players_manager_write on football.players for all to authenticated using
 (exists(select 1 from football.clubs c where c.id=players.club_id and (football.is_admin(c.league_id) or football.has_role(c.league_id,'club_manager',c.id))))
 with check (exists(select 1 from football.clubs c where c.id=players.club_id and (football.is_admin(c.league_id) or football.has_role(c.league_id,'club_manager',c.id))));
create policy fixtures_read on football.fixtures for select to authenticated using
 (exists(select 1 from football.memberships m where m.league_id=fixtures.league_id and m.user_id=(select auth.uid()) and m.approved));
create policy fixtures_admin_write on football.fixtures for all to authenticated using (football.is_admin(league_id)) with check (football.is_admin(league_id));
create policy sheets_read on football.team_sheets for select to authenticated using
 (exists(select 1 from football.fixtures f join football.memberships m on m.league_id=f.league_id where f.id=team_sheets.fixture_id and m.user_id=(select auth.uid()) and m.approved));
create policy sheets_write on football.team_sheets for all to authenticated using
 (exists(select 1 from football.fixtures f where f.id=team_sheets.fixture_id and (football.is_admin(f.league_id) or football.has_role(f.league_id,'club_manager',team_sheets.club_id))))
 with check (submitted_by=(select auth.uid()) and exists(select 1 from football.fixtures f where f.id=team_sheets.fixture_id and (football.is_admin(f.league_id) or football.has_role(f.league_id,'club_manager',team_sheets.club_id))));
create policy sheet_players_read on football.team_sheet_players for select to authenticated using
 (exists(select 1 from football.team_sheets s join football.fixtures f on f.id=s.fixture_id join football.memberships m on m.league_id=f.league_id where s.id=team_sheet_players.sheet_id and m.user_id=(select auth.uid()) and m.approved));
create policy sheet_players_write on football.team_sheet_players for all to authenticated using
 (exists(select 1 from football.team_sheets s join football.fixtures f on f.id=s.fixture_id where s.id=team_sheet_players.sheet_id and (football.is_admin(f.league_id) or football.has_role(f.league_id,'club_manager',s.club_id))))
 with check (exists(select 1 from football.team_sheets s join football.fixtures f on f.id=s.fixture_id where s.id=team_sheet_players.sheet_id and (football.is_admin(f.league_id) or football.has_role(f.league_id,'club_manager',s.club_id))));
create policy appointments_read on football.referee_appointments for select to authenticated using
 (referee_id=(select auth.uid()) or exists(select 1 from football.fixtures f where f.id=fixture_id and football.is_admin(f.league_id)));
create policy appointments_admin_insert on football.referee_appointments for insert to authenticated with check
 (exists(select 1 from football.fixtures f where f.id=fixture_id and football.is_admin(f.league_id)));
create policy appointments_admin_update on football.referee_appointments for update to authenticated using
 (referee_id=(select auth.uid()) or exists(select 1 from football.fixtures f where f.id=fixture_id and football.is_admin(f.league_id)))
 with check (referee_id=(select auth.uid()) or exists(select 1 from football.fixtures f where f.id=fixture_id and football.is_admin(f.league_id)));
create policy reports_read on football.match_reports for select to authenticated using
 (football.is_referee(fixture_id) or exists(select 1 from football.fixtures f where f.id=fixture_id and football.is_admin(f.league_id)));
create policy reports_referee_write on football.match_reports for all to authenticated using
 (football.is_referee(fixture_id)) with check (football.is_referee(fixture_id) and submitted_by=(select auth.uid()));
create policy checks_referee_read on football.identity_checks for select to authenticated using
 (football.is_referee(fixture_id) or exists(select 1 from football.fixtures f where f.id=fixture_id and football.is_admin(f.league_id)));
create policy checks_referee_write on football.identity_checks for all to authenticated using
 (football.is_referee(fixture_id)) with check (football.is_referee(fixture_id) and referee_id=(select auth.uid()));
grant select on football.leagues,football.clubs,football.memberships,football.players,football.fixtures,football.team_sheets,football.team_sheet_players,football.referee_appointments,football.match_reports,football.identity_checks to authenticated;
grant insert,update,delete on football.memberships,football.players,football.fixtures,football.team_sheets,football.team_sheet_players,football.referee_appointments,football.match_reports,football.identity_checks to authenticated;
-- Before production: use server-side RPC to atomically validate team sheets and
-- check roster size, registration status, suspensions and competition rules.
-- Browser-side checks alone are not sufficient.
