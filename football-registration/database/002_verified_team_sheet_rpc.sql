-- Apply after 001_schema.sql on a dedicated football Supabase project.
-- A single transaction checks every player and competition rule before submission.
create or replace function football.submit_team_sheet(
 p_fixture uuid, p_club uuid, p_starters uuid[], p_substitutes uuid[]
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_league uuid; v_home uuid; v_away uuid; v_limit integer;
 v_sheet uuid; v_all uuid[]; v_valid integer;
begin
 select f.league_id,f.home_club_id,f.away_club_id,f.max_named_subs
 into v_league,v_home,v_away,v_limit
 from football.fixtures f where f.id=p_fixture for update;
 if not found then raise exception 'Fixture not found'; end if;
 if p_club is distinct from v_home and p_club is distinct from v_away then
  raise exception 'Club is not in this fixture';
 end if;
 if not (football.is_admin(v_league) or football.has_role(v_league,'club_manager',p_club)) then
  raise exception 'Not authorised to submit this club team sheet';
 end if;
 if p_starters is null or cardinality(p_starters)<>11 then
  raise exception 'Exactly eleven starters are required';
 end if;
 if p_substitutes is null then p_substitutes:=array[]::uuid[]; end if;
 if cardinality(p_substitutes)>v_limit then
  raise exception 'Too many substitutes for this competition';
 end if;
 v_all:=p_starters||p_substitutes;
 if (select count(distinct x) from unnest(v_all) as x)<>cardinality(v_all) then
  raise exception 'Duplicate player selected';
 end if;
 select count(*) into v_valid from football.players p
 where p.id=any(v_all) and p.club_id=p_club
 and p.registered=true and p.suspended=false
 and p.registration_source<>'manual_unverified';
 if v_valid<>cardinality(v_all) then
  raise exception 'One or more players are not verified, not registered, suspended, or belong to another club';
 end if;
 insert into football.team_sheets(fixture_id,club_id,submitted_by)
 values(p_fixture,p_club,(select auth.uid()))
 on conflict(fixture_id,club_id) do update
 set submitted_by=excluded.submitted_by,submitted_at=now()
 returning id into v_sheet;
 delete from football.team_sheet_players where sheet_id=v_sheet;
 insert into football.team_sheet_players(sheet_id,player_id,selection)
 select v_sheet,x,'starter' from unnest(p_starters) as x;
 insert into football.team_sheet_players(sheet_id,player_id,selection)
 select v_sheet,x,'substitute' from unnest(p_substitutes) as x;
 return v_sheet;
end;
$$;
revoke all on function football.submit_team_sheet(uuid,uuid,uuid[],uuid[]) from public,anon;
grant execute on function football.submit_team_sheet(uuid,uuid,uuid[],uuid[]) to authenticated;
-- Restrict table writes so browser clients cannot bypass the server-side validator.
revoke insert,update,delete on football.team_sheets,football.team_sheet_players from authenticated;
-- The SECURITY DEFINER RPC runs as its owner and enforces authorization above.
-- An actual FA integration must write registration_source from a trusted backend only.
revoke update(registered,suspended,registration_source) on football.players from authenticated;
