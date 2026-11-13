-- League snapshot: each match also lists its credited scorers (match_scorers,
-- migration 008), so the standings can show the goals of every player.
-- Built from the 001 league_snapshot, adding only the 'scorers' key per match.
-- No tables or data change. Requires 008 (match_scorers).
begin;

-- Refuse to overwrite a different snapshot than the one reviewed.
do $$ begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc
     where oid='public.league_snapshot(uuid)'::regprocedure)
    is distinct from '3ba09a3088d3991c183d9d6fdcd33cef' then
  raise exception 'league_snapshot no coincide con la de la migración 001 revisada. Revisa los cambios antes de aplicar la 014.';
 end if;
 if to_regclass('public.match_scorers') is null then
  raise exception 'Falta la tabla match_scorers: aplica antes la 008.';
 end if;
end $$;

create or replace function public.league_snapshot(p_league uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.member_role(p_league); result jsonb;
begin
 if r is null then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select jsonb_build_object('league',(select to_jsonb(l) from public.leagues l where id=p_league),
 'role',r,'players',coalesce((select jsonb_agg(p order by name) from public.players p where league_id=p_league),'[]'::jsonb),
 'seasons',coalesce((select jsonb_agg(s order by starts_at desc,id) from public.seasons s where league_id=p_league),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(jsonb_build_object('player_id',player_id,'team',team,'position',position) order by team,position) from public.match_participants where match_id=m.id),
  'scorers',coalesce((select jsonb_agg(jsonb_build_object('player_id',player_id,'goals',goals) order by player_id) from public.match_scorers where match_id=m.id),'[]'::jsonb)) order by played_at desc,created_at desc,id) from public.matches m where league_id=p_league),'[]'::jsonb),
 'memberships',case when r='admin' then coalesce((select jsonb_agg(jsonb_build_object('user_id',lm.user_id,'role',lm.role,'active',lm.active,'display_name',coalesce(up.display_name,'Miembro'))) from public.league_memberships lm left join public.user_profiles up using(user_id) where league_id=p_league),'[]'::jsonb) else '[]'::jsonb end,
 'audit',case when r='admin' then coalesce((select jsonb_agg(a) from (select * from public.audit_log where league_id=p_league order by created_at desc limit 200) a),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end $$;

commit;
