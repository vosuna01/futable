-- Separate League/Cup contexts using the existing season FK, wallets and honours.
-- Legacy data is preserved. Activation/reset is an explicit guarded admin operation.
begin;
DO $$ begin if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.live_session_command(uuid,text,jsonb)'::regprocedure) <> 'b1a562984efa69e95692b8b4cc8f0669' then raise exception 'La RPC de directo ha cambiado. Revisa la migración antes de continuar'; end if; end $$;

alter table public.leagues add column competitions_enabled boolean not null default false;
alter table public.seasons add column competition_kind text not null default 'league' check(competition_kind in ('league','cup'));
alter table public.seasons add column parent_season_id uuid references public.seasons(id);
alter table public.seasons add column rating_epoch uuid;
alter table public.seasons add column minimum_days int not null default 0 check(minimum_days between 0 and 30);
alter table public.seasons add column cup_result jsonb;
drop index public.one_active_season;
create unique index one_active_season on public.seasons(league_id) where status='active' and competition_kind='league';
alter table public.live_sessions add column context_version int not null default 1;
alter table public.live_sessions add constraint live_context_unique unique(league_id,season_id,id);
create table public.competition_series(
 id uuid primary key,league_id uuid not null,season_id uuid not null,session_id uuid not null,
 best_of int not null check(best_of in (3,5,7)),court jsonb not null,wins jsonb not null default '{"red":0,"blue":0}',
 status text not null default 'active' check(status in ('active','finished','void')),winner text check(winner in ('red','blue')),
 is_final boolean not null default false,created_at timestamptz not null default now(),unique(league_id,season_id,id),
 foreign key(league_id,season_id,session_id) references public.live_sessions(league_id,season_id,id));
alter table public.competition_series enable row level security;
revoke all on public.competition_series from public,anon,authenticated;
grant select on public.competition_series to authenticated;
create policy series_members on public.competition_series for select to authenticated using(public.member_role(league_id) is not null);
alter table public.matches add column goal_target int check(goal_target between 1 and 99);
alter table public.matches add column live_session_id uuid;
alter table public.matches add column series_id uuid;
alter table public.matches add column series_decider boolean not null default false;
alter table public.matches add column is_cup_final boolean not null default false;
alter table public.matches add foreign key(league_id,season_id,live_session_id) references public.live_sessions(league_id,season_id,id);
alter table public.matches add foreign key(league_id,season_id,series_id) references public.competition_series(league_id,season_id,id);
create index matches_session on public.matches(live_session_id) where live_session_id is not null;
create table public.season_recap_seen(user_id uuid not null references auth.users,season_id uuid not null references public.seasons,version int not null default 1,seen_at timestamptz not null default now(),primary key(user_id,season_id,version));
alter table public.season_recap_seen enable row level security;
revoke all on public.season_recap_seen from public,anon,authenticated;
grant select,insert on public.season_recap_seen to authenticated;
create policy recap_own_read on public.season_recap_seen for select to authenticated using(user_id=(select auth.uid()));
create policy recap_own_insert on public.season_recap_seen for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.seasons s where s.id=season_id and public.member_role(s.league_id) is not null));
CREATE OR REPLACE FUNCTION public._mmr_ratings_legacy(p_league uuid)
 RETURNS TABLE(player_id uuid, mmr double precision, games integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m record;
  ids uuid[] := '{}';
  ratings double precision[] := '{}';
  played int[] := '{}';
  team_ids uuid[];
  blue_ids uuid[];
  red_ids uuid[];
  blue_level double precision;
  red_level double precision;
  e_blue double precision;
  pid uuid;
  side text;
  at int;
  next_ratings double precision[];
begin
  for m in
    select x.id, x.winner from public.matches x
    where x.league_id = p_league and x.status = 'valid'
    order by x.played_at, x.id
  loop
    select array_agg(mp.player_id order by mp.position) filter (where mp.team = 'blue'),
           array_agg(mp.player_id order by mp.position) filter (where mp.team = 'red')
      into blue_ids, red_ids
    from public.match_participants mp where mp.match_id = m.id;
    if m.winner is null or m.winner not in ('blue', 'red')
       or blue_ids is null or red_ids is null then
      raise exception 'La partida % no tiene ganador o equipos válidos', m.id;
    end if;
    -- Alta a 1000 de quien juega por primera vez.
    foreach pid in array blue_ids || red_ids loop
      if array_position(ids, pid) is null then
        ids := ids || pid;
        ratings := ratings || 1000::double precision;
        played := played || 0;
      end if;
    end loop;
    -- Media del equipo sumando en orden (defensa, delantero), como el cliente.
    blue_level := 0;
    foreach pid in array blue_ids loop
      blue_level := blue_level + ratings[array_position(ids, pid)];
    end loop;
    blue_level := blue_level / cardinality(blue_ids);
    red_level := 0;
    foreach pid in array red_ids loop
      red_level := red_level + ratings[array_position(ids, pid)];
    end loop;
    red_level := red_level / cardinality(red_ids);
    e_blue := 1 / (1 + power(10::double precision, (red_level - blue_level) / 400));
    -- Todos los Δ con los valores previos; después se aplican a la vez.
    next_ratings := ratings;
    foreach side in array array['blue', 'red'] loop
      team_ids := case when side = 'blue' then blue_ids else red_ids end;
      foreach pid in array team_ids loop
        at := array_position(ids, pid);
        next_ratings[at] := ratings[at]
          + (case when played[at] < 10 then 40 else 24 end)
            * ((case when side = m.winner then 1 else 0 end)
               - (case when side = 'blue' then e_blue else 1 - e_blue end));
        played[at] := played[at] + 1;
      end loop;
    end loop;
    ratings := next_ratings;
  end loop;
  return query
    select ids[i], ratings[i], played[i]
    from generate_subscripts(ids, 1) as g(i);
end $function$
;
CREATE OR REPLACE FUNCTION public._competition_ratings(p_league uuid, p_context uuid, p_general boolean DEFAULT false)
 RETURNS TABLE(player_id uuid, mmr double precision, games integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m record;
  ids uuid[] := '{}';
  ratings double precision[] := '{}';
  played int[] := '{}';
  team_ids uuid[];
  blue_ids uuid[];
  red_ids uuid[];
  blue_level double precision;
  red_level double precision;
  e_blue double precision;
  pid uuid;
  side text;
  at int;
  next_ratings double precision[];
begin
  for m in
    select x.id, x.winner from public.matches x
    join public.seasons sx on sx.id=x.season_id
    where x.league_id=p_league and x.status='valid' and sx.rating_epoch=(select rating_epoch from public.seasons where id=p_context and league_id=p_league)
    and (p_general or sx.competition_kind='league')
    order by x.played_at, x.id
  loop
    select array_agg(mp.player_id order by mp.position) filter (where mp.team = 'blue'),
           array_agg(mp.player_id order by mp.position) filter (where mp.team = 'red')
      into blue_ids, red_ids
    from public.match_participants mp where mp.match_id = m.id;
    if m.winner is null or m.winner not in ('blue', 'red')
       or blue_ids is null or red_ids is null then
      raise exception 'La partida % no tiene ganador o equipos válidos', m.id;
    end if;
    -- Alta a 1000 de quien juega por primera vez.
    foreach pid in array blue_ids || red_ids loop
      if array_position(ids, pid) is null then
        ids := ids || pid;
        ratings := ratings || 1000::double precision;
        played := played || 0;
      end if;
    end loop;
    -- Media del equipo sumando en orden (defensa, delantero), como el cliente.
    blue_level := 0;
    foreach pid in array blue_ids loop
      blue_level := blue_level + ratings[array_position(ids, pid)];
    end loop;
    blue_level := blue_level / cardinality(blue_ids);
    red_level := 0;
    foreach pid in array red_ids loop
      red_level := red_level + ratings[array_position(ids, pid)];
    end loop;
    red_level := red_level / cardinality(red_ids);
    e_blue := 1 / (1 + power(10::double precision, (red_level - blue_level) / 400));
    -- Todos los Δ con los valores previos; después se aplican a la vez.
    next_ratings := ratings;
    foreach side in array array['blue', 'red'] loop
      team_ids := case when side = 'blue' then blue_ids else red_ids end;
      foreach pid in array team_ids loop
        at := array_position(ids, pid);
        next_ratings[at] := ratings[at]
          + (case when played[at] < 10 then 40 else 24 end)
            * ((case when side = m.winner then 1 else 0 end)
               - (case when side = 'blue' then e_blue else 1 - e_blue end));
        played[at] := played[at] + 1;
      end loop;
    end loop;
    ratings := next_ratings;
  end loop;
  return query
    select p.id, coalesce(ratings[array_position(ids,p.id)],1000::double precision), coalesce(played[array_position(ids,p.id)],0)
    from public.players p where p.league_id=p_league;
end $function$
;

create or replace function public._mmr_ratings(p_league uuid) returns table(player_id uuid,mmr double precision,games int)
language plpgsql stable security definer set search_path='' as $$ declare sid uuid;begin
 select id into sid from public.seasons where league_id=p_league and status='active' and competition_kind='league' and rating_epoch is not null;
 if sid is null then return query select * from public._mmr_ratings_legacy(p_league);
 else return query select * from public._competition_ratings(p_league,sid,true);end if;end $$;
CREATE OR REPLACE FUNCTION public.league_snapshot(p_league uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text:=public.member_role(p_league); result jsonb;
begin
 if r is null then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select jsonb_build_object('league',(select to_jsonb(l) from public.leagues l where id=p_league),
 'role',r,'players',coalesce((select jsonb_agg(p order by name) from public.players p where league_id=p_league),'[]'::jsonb),
 'seasons',coalesce((select jsonb_agg(s order by starts_at desc,id) from public.seasons s where league_id=p_league),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(jsonb_build_object('player_id',player_id,'team',team,'position',position) order by team,position) from public.match_participants where match_id=m.id),
  'scorers',coalesce((select jsonb_agg(jsonb_build_object('player_id',player_id,'goals',goals) order by player_id) from public.match_scorers where match_id=m.id),'[]'::jsonb)) order by played_at desc,created_at desc,id) from public.matches m where league_id=p_league),'[]'::jsonb),
 'memberships',case when r='admin' then coalesce((select jsonb_agg(jsonb_build_object('user_id',lm.user_id,'role',lm.role,'active',lm.active,'display_name',coalesce(up.display_name,'Miembro'))) from public.league_memberships lm left join public.user_profiles up using(user_id) where league_id=p_league),'[]'::jsonb) else '[]'::jsonb end,
 'series',coalesce((select jsonb_agg(x order by x.created_at) from public.competition_series x where x.league_id=p_league),'[]'::jsonb),
 'audit',case when r='admin' then coalesce((select jsonb_agg(a) from (select * from public.audit_log where league_id=p_league order by created_at desc limit 200) a),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_match(p_league uuid, p_input jsonb, p_match uuid DEFAULT NULL::uuid, p_revision integer DEFAULT NULL::integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare mid uuid; ctx jsonb; s public.seasons; begin
 if public.member_role(p_league) is null then raise exception 'Sin acceso' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league for update;
 select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league;
 ctx:=nullif(current_setting('futable.competition_context',true),'')::jsonb;
 if s.rating_epoch is not null and ctx is null and public.member_role(p_league)<>'admin' then raise exception 'Registra la partida desde la sesión en directo';end if;
 perform set_config('futable.coin_defer','1',true);
 mid:=public._save_match_before_coins(p_league,p_input,p_match,p_revision,p_reason);
 if s.rating_epoch is not null then
 update public.matches set goal_target=coalesce((ctx->>'target')::int,(p_input->>'goal_target')::int,s.target),
 live_session_id=coalesce((ctx->>'session')::uuid,live_session_id),series_id=coalesce((ctx->>'series')::uuid,series_id),
 series_decider=coalesce((ctx->>'decider')::boolean,series_decider),is_cup_final=coalesce((ctx->>'final')::boolean,is_cup_final) where id=mid;
 end if;
 perform set_config('futable.coin_defer','0',true);
 perform public._coin_match(mid); return mid;
end $function$
;
CREATE OR REPLACE FUNCTION public._coin_match(mid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.matches; cfg public.coin_settings; mk public.coin_markets; r record; p record; w uuid; desired int; sig jsonb; context public.seasons; used int;
begin
 select * into m from public.matches where id=mid; select * into context from public.seasons where id=m.season_id;
 select * into cfg from public.coin_settings where league_id=m.league_id;
 -- Never backfill historic wins. The timestamp is frozen when coins are activated.
 if m.created_at<cfg.starts_at or cfg.league_id is null then return; end if;
 if cfg.enabled then
  for p in select player_id from public.match_participants where match_id=mid and team=m.winner and m.status='valid' loop
   w:=public._coin_wallet(m.league_id,m.season_id,p.player_id);
   insert into public.coin_rewards(match_id,wallet_id,rate) values(mid,w,coalesce((select max(rate) from public.coin_rewards where match_id=mid),cfg.win_bonus)) on conflict do nothing;
  end loop;
 end if;
 for r in select cr.*,cw.player_id from public.coin_rewards cr join public.coin_wallets cw on cw.id=cr.wallet_id where cr.match_id=mid loop
  desired:=case when m.status='valid' and exists(select 1 from public.match_participants where match_id=mid and player_id=r.player_id and team=m.winner) then r.rate else 0 end;
  if context.rating_epoch is not null then
    if m.series_id is not null and not m.series_decider then desired:=0;end if;
    select coalesce(sum(cr.amount),0) into used from public.coin_rewards cr join public.matches other on other.id=cr.match_id
     where cr.wallet_id=r.wallet_id and cr.match_id<>mid and other.status='valid'
     and (context.competition_kind='cup' or (other.played_at at time zone 'Europe/Madrid')::date=(m.played_at at time zone 'Europe/Madrid')::date);
    desired:=least(desired,greatest(0,10-used));
   end if;
   perform public._coin_delta(r.wallet_id,desired-r.amount,'win',mid);
  update public.coin_rewards set amount=desired where match_id=mid and wallet_id=r.wallet_id;
 end loop;
 select * into mk from public.coin_markets where match_id=mid;
 if mk.id is not null then
  select jsonb_build_object('red',jsonb_build_array(
   (select player_id from public.match_participants where match_id=mid and team='red' and position='defender'),
   (select player_id from public.match_participants where match_id=mid and team='red' and position='forward')),
   'blue',jsonb_build_array(
   (select player_id from public.match_participants where match_id=mid and team='blue' and position='defender'),
   (select player_id from public.match_participants where match_id=mid and team='blue' and position='forward')),
   'target',mk.signature->'target') into sig;
  -- A changed lineup invalidates the original wager, permanently.
  perform public._coin_return(mk.id,m.status='void' or sig<>mk.signature or mk.status='cancelled',m.winner);
 end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.live_session_command(p_league uuid, p_action text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.live_sessions; s public.seasons; r text; op public.operations; me uuid; created boolean:=false;
 oid uuid; payload jsonb; st jsonb; previous jsonb; win text; loser text; mid uuid; members jsonb; a int; b int;
 t text; x jsonb; picked text[]; rnd int; q jsonb; first_out jsonb; second_out jsonb; incoming jsonb; pl jsonb; post text; pid text;
 nextd jsonb; nextf jsonb; side jsonb; newd text; newf text; runner boolean; lg jsonb; d int; at int; i int;
 dw int; fw int; dp int; fp int;
begin
 perform 1 from public.leagues where id=p_league for update;
 select role into r from public.league_memberships where league_id=p_league and user_id=auth.uid() and active for share;
 if r is null then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 oid:=(p_input->>'operation_id')::uuid;
 if oid is null then raise exception 'Falta identificador de operación';end if;
 payload:=jsonb_build_object('live_action',p_action,'input',p_input);
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 select * into op from public.operations where id=oid;
 if found then
  if op.actor_id<>auth.uid() or op.league_id<>p_league or op.payload<>payload then raise exception 'Operación reutilizada con datos distintos';end if;
  select * into k from public.live_sessions where id=op.result_id;
  return to_jsonb(k);
 end if;
 select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league for share;
 if s.id is null or (s.status<>'active' and p_action<>'close') then raise exception 'Temporada inactiva';end if;
 select * into k from public.live_sessions where league_id=p_league and status='active' for update;
 if k.id is null then
  if p_action<>'join' then raise exception 'No hay ninguna sesión en directo abierta';end if;
  insert into public.live_sessions(league_id,season_id,owner_id,state)
  values(p_league,s.id,auth.uid(),jsonb_build_object('round',0,'court',null,
   'goals',jsonb_build_object('blue',0,'red',0),'goal_log','[]'::jsonb,'played','{}'::jsonb,'queue','[]'::jsonb)) returning * into k;
  created:=true;
 else
  if k.id is distinct from (p_input->>'session_id')::uuid or k.revision is distinct from (p_input->>'revision')::int then raise exception 'La sesión ha cambiado. Actualiza antes de continuar.';end if;
  if k.season_id<>s.id and p_action<>'close' then raise exception 'Esta sesión pertenece a otra temporada. Ciérrala y empieza otra.';end if;
  previous:=k.state;
 end if;
 me:=public.live_player(p_league);
 -- Admins and the wall tablet run the court; players only while signed up.
 runner:=r in ('admin','scoreboard') or (me is not null and public.live_signed_up(k.state,me));
 if p_action in ('start','result','assign','undo','goal','prefer','replace','target') and not runner then raise exception 'Fíchate para llevar la partida en directo';end if;
 -- Any active member of the league may close the day (migration 011); matches are kept.
 if k.season_id<>s.id then raise exception 'La mesa está en otra competición. Cierra su sesión antes de cambiar';end if;
 if s.rating_epoch is not null then
  if s.cup_result is not null and p_action not in ('undo','close') then raise exception 'La final ya ha terminado. Cierra la Copa';end if;
  if p_action='start' and s.competition_kind='league' and p_input ? 'series' then raise exception 'El modo tenis es opcional en Copa Afterwork';end if;
  if p_action='start' and coalesce((p_input->>'is_final')::boolean,false) and (s.competition_kind<>'cup' or r<>'admin') then raise exception 'Solo el organizador puede preparar una final de Copa';end if;
  if p_action='replace' and k.state ? 'series' then raise exception 'Termina la serie antes de cambiar sus jugadores';end if;
 end if;
 st:=k.state;
 rnd:=(st->>'round')::int;
 if p_action='join' then
  if jsonb_typeof(p_input->'players') is distinct from 'array' or jsonb_array_length(p_input->'players')=0 then raise exception 'Indica a quién fichas';end if;
  for x in select value from jsonb_array_elements(p_input->'players') loop
   if public.live_signed_up(st,(x#>>'{}')::uuid) then raise exception 'Esa persona ya está fichada';end if;
   st:=jsonb_set(st,'{queue}',(st->'queue')||jsonb_build_array(jsonb_build_object('id',x#>>'{}','since',rnd)));
  end loop;
  st:=jsonb_set(st,'{queue}',public.live_order(st,st->'queue'));
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='leave' then
  if not runner and me is distinct from (p_input->>'player')::uuid then raise exception 'Fíchate para quitar a otra persona de la cola';end if;
  if not exists(select 1 from jsonb_array_elements(st->'queue') y where y->>'id'=p_input->>'player') then raise exception 'Esa persona no está esperando en la cola';end if;
  st:=jsonb_set(st,'{queue}',coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(st->'queue') with ordinality z(y,ord) where y->>'id'<>p_input->>'player'),'[]'::jsonb));
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='prefer' then
  pid:=p_input->>'player'; post:=nullif(p_input->>'post','');
  if post is not null and post not in ('defender','forward') then raise exception 'Puesto inválido';end if;
  if not exists(select 1 from jsonb_array_elements(st->'queue') y where y->>'id'=pid) then raise exception 'Esa persona no está esperando en la cola';end if;
  st:=jsonb_set(st,'{queue}',(select jsonb_agg(case when y->>'id'<>pid then y when post is null then y-'post'
   else y||jsonb_build_object('post',post) end order by ord) from jsonb_array_elements(st->'queue') with ordinality z(y,ord)));
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='start' then
  if jsonb_typeof(st->'court')='object' then raise exception 'Ya hay una partida en juego';end if;
  picked:=array[p_input->'lineup'->'blue'->>'defender',p_input->'lineup'->'blue'->>'forward',
                p_input->'lineup'->'red'->>'defender',p_input->'lineup'->'red'->>'forward'];
  if array_position(picked,null) is not null then raise exception 'Completa los cuatro puestos';end if;
  if jsonb_array_length(st->'queue')<4 or (select count(distinct y->>'id') from jsonb_array_elements(st->'queue') with ordinality z(y,ord) where (ord<=4 or (s.competition_kind='cup' and r='admin' and coalesce((p_input->>'is_final')::boolean,false))) and y->>'id'=any(picked))<>4 then raise exception 'Deben jugar los cuatro primeros fichados en la cola';end if;
  st:=jsonb_set(st,'{court}',jsonb_build_object(
   'blue',jsonb_build_object('defender',jsonb_build_object('id',picked[1],'waited',public.live_wait(st,picked[1])),
                             'forward',jsonb_build_object('id',picked[2],'waited',public.live_wait(st,picked[2]))),
   'red',jsonb_build_object('defender',jsonb_build_object('id',picked[3],'waited',public.live_wait(st,picked[3])),
                            'forward',jsonb_build_object('id',picked[4],'waited',public.live_wait(st,picked[4])))));
  st:=jsonb_set(st,'{queue}',coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(k.state->'queue') with ordinality z(y,ord) where not(y->>'id'=any(picked))),'[]'::jsonb));
  if jsonb_array_length(k.state->'queue')-jsonb_array_length(st->'queue')<>4 then raise exception 'Los cuatro jugadores deben estar fichados en la cola';end if;
  st:=jsonb_set(st,'{goals}',jsonb_build_object('blue',0,'red',0));
  st:=jsonb_set(st,'{goal_log}','[]'::jsonb,true);
  -- Best-of series (017): optional; the same four play until a pair wins it.
  st:=st-'series'-'last_series'-'series_id'-'cup_final';
  if coalesce((p_input->>'is_final')::boolean,false) then st:=st||jsonb_build_object('cup_final',true);end if;
  if p_input ? 'series' then
   d:=(p_input->'series'->>'best_of')::int;
   if d is null or d not in (3,5,7) then raise exception 'Serie inválida: al mejor de 3, 5 o 7';end if;
   st:=jsonb_set(st,'{series}',jsonb_build_object('best_of',d,'wins',jsonb_build_object('blue',0,'red',0)));
  end if;
  if s.rating_epoch is not null and st ? 'series' then
   st:=st||jsonb_build_object('series_id',gen_random_uuid());
   insert into public.competition_series(id,league_id,season_id,session_id,best_of,court,is_final) values((st->>'series_id')::uuid,p_league,s.id,k.id,(st#>>'{series,best_of}')::int,st->'court',coalesce((st->>'cup_final')::boolean,false));
  end if;
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='goal' then
  t:=p_input->>'team';
  if t is null or t not in ('blue','red') then raise exception 'Equipo inválido';end if;
  if jsonb_typeof(st->'court') is distinct from 'object' then raise exception 'No hay ninguna partida en juego';end if;
  pid:=nullif(p_input->>'player','');
  if pid is not null and pid not in (st->'court'->t->'defender'->>'id',st->'court'->t->'forward'->>'id') then raise exception 'Ese jugador no está en ese equipo';end if;
  d:=coalesce((p_input->>'delta')::int,0);
  if abs(d)>99 then raise exception 'Gol inválido';end if;
  lg:=public.live_goal_log(st);
  -- Adding appends to the log; taking back removes the latest matching goal.
  for i in 1..greatest(d,0) loop
   exit when (select count(*) from jsonb_array_elements(lg) y where y->>'team'=t)>=99;
   lg:=lg||jsonb_build_array(jsonb_build_object('team',t,'player',pid));
  end loop;
  for i in 1..greatest(-d,0) loop
   select max(ord)-1 into at from jsonb_array_elements(lg) with ordinality z(y,ord)
    where y->>'team'=t and (pid is null or y->>'player'=pid);
   if at is null then
    if pid is not null then raise exception 'Ese jugador no tiene goles que quitar';end if;
    exit;
   end if;
   lg:=lg-at;
  end loop;
  st:=jsonb_set(st,'{goal_log}',lg,true);
  st:=jsonb_set(st,array['goals',t],to_jsonb((select count(*) from jsonb_array_elements(lg) y where y->>'team'=t)::int));
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='result' then
  if jsonb_typeof(st->'court') is distinct from 'object' then raise exception 'No hay ninguna partida en juego';end if;
  win:=p_input->>'winner';
  if win is null or win not in ('blue','red') then raise exception 'Indica el ganador';end if;
  members:='[]'::jsonb;
  foreach t in array array['blue','red'] loop
   members:=members||jsonb_build_array(
    jsonb_build_object('player_id',st->'court'->t->'defender'->>'id','team',t,'position','defender'),
    jsonb_build_object('player_id',st->'court'->t->'forward'->>'id','team',t,'position','forward'));
  end loop;
  a:=(st->'goals'->>'blue')::int; b:=(st->'goals'->>'red')::int;
  if a=0 and b=0 then a:=null; b:=null;
  else
   if a=b then raise exception 'El marcador está empatado. Ajusta los goles.';end if;
   if (case when a>b then 'blue' else 'red' end)<>win then raise exception 'El marcador no coincide con el ganador. Ajusta los goles.';end if;
  end if;
  if s.rating_epoch is not null then
   perform set_config('futable.competition_context',jsonb_build_object('session',k.id,'target',coalesce((st->>'target')::int,s.target),'series',st->>'series_id',
    'decider',case when st ? 'series' then coalesce((st#>>array['series','wins',win])::int,0)+1 >= (st#>>'{series,best_of}')::int/2+1 else true end,'final',coalesce((st->>'cup_final')::boolean,false))::text,true);
  end if;
  mid:=public.save_match(p_league,jsonb_build_object('operation_id',gen_random_uuid(),'season_id',s.id,
   'blue_score',a,'red_score',b,'winner',win,'participants',members));
  perform set_config('futable.competition_context','',true);
  -- Credited goals go with the match; goals without a scorer only count on the board.
  insert into public.match_scorers(match_id,league_id,player_id,team,goals)
  select mid,p_league,(y->>'player')::uuid,y->>'team',count(*) from jsonb_array_elements(public.live_goal_log(st)) y
  where y->>'player' is not null group by y->>'player',y->>'team';
  loser:=case when win='blue' then 'red' else 'blue' end;
  rnd:=rnd+1;
  -- Both losers leave together. Longer wait before entering goes first; with the
  -- same wait, whoever has played fewer matches today; only then a coin.
  dw:=(st->'court'->loser->'defender'->>'waited')::int; fw:=(st->'court'->loser->'forward'->>'waited')::int;
  dp:=coalesce((st->'played'->>(st->'court'->loser->'defender'->>'id'))::int,0);
  fp:=coalesce((st->'played'->>(st->'court'->loser->'forward'->>'id'))::int,0);
  if dw>fw or (dw=fw and (dp<fp or (dp=fp and random()<0.5))) then
   first_out:=st->'court'->loser->'defender'; second_out:=st->'court'->loser->'forward';
  else
   first_out:=st->'court'->loser->'forward'; second_out:=st->'court'->loser->'defender';
  end if;
  pl:=coalesce(st->'played','{}'::jsonb);
  foreach t in array array['blue','red'] loop
   foreach post in array array['defender','forward'] loop
    pid:=st->'court'->t->post->>'id';
    pl:=jsonb_set(pl,array[pid],to_jsonb(coalesce((pl->>pid)::int,0)+1),true);
   end loop;
  end loop;
  st:=jsonb_set(st,'{played}',pl);
  if jsonb_typeof(st->'series')='object' then
   -- Series (017): the same four stay on court; goals reset for the next game.
   d:=coalesce((st->'series'->'wins'->>win)::int,0)+1;
   st:=jsonb_set(st,array['series','wins',win],to_jsonb(d));
   st:=jsonb_set(st,'{round}',to_jsonb(rnd));
   st:=jsonb_set(st,'{goals}',jsonb_build_object('blue',0,'red',0));
   st:=jsonb_set(st,'{goal_log}','[]'::jsonb,true);
   if d>=(st->'series'->>'best_of')::int/2+1 then
    -- Series won: keep its result for the screens; the four go back to the queue.
    st:=jsonb_set(st,'{last_series}',jsonb_build_object('best_of',st->'series'->'best_of',
     'wins',st->'series'->'wins','winner',win,'court',st->'court','round',rnd));
    q:=public.live_order(st,(st->'queue')||jsonb_build_array(
     jsonb_build_object('id',st->'court'->win->'defender'->>'id','since',rnd),
     jsonb_build_object('id',st->'court'->win->'forward'->>'id','since',rnd),
     jsonb_build_object('id',st->'court'->loser->'defender'->>'id','since',rnd),
     jsonb_build_object('id',st->'court'->loser->'forward'->>'id','since',rnd)));
    st:=jsonb_set(st-'series','{queue}',q);
    st:=jsonb_set(st,'{court}','null'::jsonb);
   end if;
  else
  q:=public.live_order(st,(st->'queue')||jsonb_build_array(
   jsonb_build_object('id',first_out->>'id','since',rnd),
   jsonb_build_object('id',second_out->>'id','since',rnd)));
  -- The pair stepping in takes the posts agreed while waiting: the first in the
  -- queue keeps their choice, else the second's; with none, first defends.
  if q->0->>'post'='forward' or (q->0->>'post' is null and q->1->>'post'='defender') then
   nextd:=jsonb_build_object('id',q->1->>'id','waited',rnd-(q->1->>'since')::int);
   nextf:=jsonb_build_object('id',q->0->>'id','waited',rnd-(q->0->>'since')::int);
  else
   nextd:=jsonb_build_object('id',q->0->>'id','waited',rnd-(q->0->>'since')::int);
   nextf:=jsonb_build_object('id',q->1->>'id','waited',rnd-(q->1->>'since')::int);
  end if;
  st:=jsonb_set(st,'{round}',to_jsonb(rnd));
  st:=jsonb_set(st,array['court',loser],jsonb_build_object('defender',nextd,'forward',nextf));
  st:=jsonb_set(st,'{queue}',coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(q) with ordinality z(y,ord) where ord>2),'[]'::jsonb));
  st:=jsonb_set(st,'{goals}',jsonb_build_object('blue',0,'red',0));
  st:=jsonb_set(st,'{goal_log}','[]'::jsonb,true);
  end if;
  perform public.check_live(p_league,st);
  if s.rating_epoch is not null and previous ? 'series_id' then
   update public.competition_series set wins=coalesce(st#>'{series,wins}',st#>'{last_series,wins}'),status=case when st ? 'series' then 'active' else 'finished' end,winner=case when st ? 'series' then null else win end where id=(previous->>'series_id')::uuid;
  end if;
  if s.rating_epoch is not null and coalesce((previous->>'cup_final')::boolean,false) and (not(previous ? 'series') or not(st ? 'series')) then
   update public.seasons set cup_result=jsonb_build_object('winner',win,'players',jsonb_build_array(previous#>>array['court',win,'defender','id'],previous#>>array['court',win,'forward','id']),'match_id',mid,'series_id',previous->>'series_id','wins',coalesce(st#>'{last_series,wins}',jsonb_build_object(win,1))) where id=s.id;
   st:=jsonb_set(st,'{court}','null'::jsonb);st:=jsonb_set(st,'{queue}','[]'::jsonb);
  end if;
  update public.live_sessions set state=st,last_match=mid,last_before=previous where id=k.id;
 elsif p_action='target' then
  -- Goals to win for this session; the board and the tablet read it from state.
  d:=(p_input->>'goals')::int;
  if d is null or d not between 1 and 99 then raise exception 'Goles para ganar inválidos';end if;
  if s.rating_epoch is not null then
   if coalesce((st#>>'{goals,red}')::int,0)+coalesce((st#>>'{goals,blue}')::int,0)>0 or st ? 'series' then raise exception 'No cambies el objetivo durante una partida o serie';end if;
   if s.competition_kind='cup' and exists(select 1 from public.matches where season_id=s.id and status='valid') then raise exception 'El objetivo de esta Copa ya está fijado';end if;
   if s.competition_kind='cup' then update public.seasons set target=d where id=s.id;end if;
  end if;
  st:=jsonb_set(st,'{target}',to_jsonb(d),true);
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='assign' then
  t:=p_input->>'team';
  if t is null or t not in ('blue','red') then raise exception 'Equipo inválido';end if;
  if jsonb_typeof(st->'court') is distinct from 'object' then raise exception 'No hay ninguna partida en juego';end if;
  side:=st->'court'->t; newd:=p_input->>'defender'; newf:=p_input->>'forward';
  if newd is null or newf is null or newd=newf then raise exception 'Elige dos jugadores distintos';end if;
  if not((newd=side->'defender'->>'id' and newf=side->'forward'->>'id')
      or (newd=side->'forward'->>'id' and newf=side->'defender'->>'id')) then raise exception 'Solo puedes repartir los puestos de ese equipo';end if;
  st:=jsonb_set(st,array['court',t],jsonb_build_object(
   'defender',case when newd=side->'defender'->>'id' then side->'defender' else side->'forward' end,
   'forward',case when newf=side->'forward'->>'id' then side->'forward' else side->'defender' end));
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='replace' then
  if (p_input->>'expected_revision')::int is distinct from k.revision then
   raise exception 'La sesión ha cambiado. Vuelve a abrir el cambio de jugadores.';
  end if;
  st:=public.live_replace_pair_state(st,p_input->>'team',p_input->>'defender',p_input->>'forward');
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st,last_match=null,last_before=null where id=k.id;
 elsif p_action='undo' then
  if k.last_match is null or k.last_before is null then raise exception 'No hay resultado para deshacer';end if;
  perform 1 from public.matches where id=k.last_match and status='valid' and revision=1 for update;
  if not found then raise exception 'La partida ya se ha corregido o anulado';end if;
  update public.matches set status='void',revision=revision+1 where id=k.last_match;
  insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data)
  values(p_league,auth.uid(),'match.void',k.last_match,jsonb_build_object('status','valid'),
   jsonb_build_object('status','void','reason','Deshacer último resultado de la partida en directo'));
  if s.rating_epoch is not null then
   if s.cup_result->>'match_id'=k.last_match::text then update public.seasons set cup_result=null where id=s.id;end if;
   if k.last_before ? 'series_id' then update public.competition_series set wins=k.last_before#>'{series,wins}',status='active',winner=null where id=(k.last_before->>'series_id')::uuid;end if;
  end if;
  update public.live_sessions set state=k.last_before,last_match=null,last_before=null where id=k.id;
 elsif p_action='close' then
  update public.live_sessions set status='closed',last_match=null,last_before=null where id=k.id;
 else raise exception 'Acción desconocida';end if;
 if p_action in ('join','leave') then update public.live_sessions set last_match=null,last_before=null where id=k.id;end if;
 if not created then update public.live_sessions set revision=revision+1 where id=k.id;end if;
 update public.live_sessions set context_version=case when s.rating_epoch is not null then 2 else 1 end,updated_at=now() where id=k.id returning * into k;
 insert into public.operations values(oid,p_league,auth.uid(),payload,k.id,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data)
 values(p_league,auth.uid(),'live.'||p_action,k.id,previous,to_jsonb(k));
 return to_jsonb(k);
end $function$
;

create function public._competition_freeze(sid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.seasons s set status='closed',ends_at=greatest((now() at time zone 'Europe/Madrid')::date,s.starts_at),final_results=jsonb_build_object('rules',to_jsonb(s),'matches',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(p) from public.match_participants p where p.match_id=m.id),'scorers',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p.player_id,'goals',p.goals)),'[]'::jsonb) from public.match_scorers p where p.match_id=m.id))) from public.matches m where m.season_id=s.id and m.status='valid'),'[]'::jsonb),'closed_at',now()) where s.id=sid and s.status='active';
end $$;
create function public.competition_command(p_league uuid,p_action text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.seasons; parent public.seasons; result uuid; oid uuid:=(p_input->>'operation_id')::uuid; prior public.operations; payload jsonb:=jsonb_build_object('competition_action',p_action,'input',p_input); names jsonb; awards jsonb; maxcoins bigint;
begin
 if public.member_role(p_league) is distinct from 'admin' then raise exception 'Solo el organizador' using errcode='42501';end if;
 if oid is null then raise exception 'Falta identificador de operación';end if;
 perform 1 from public.leagues where id=p_league for update;
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 select * into prior from public.operations where id=oid;
 if found then if prior.actor_id<>auth.uid() or prior.league_id<>p_league or prior.payload<>payload then raise exception 'Operación distinta';end if;return prior.result_id;end if;
 if p_action='reset' then
  if exists(select 1 from public.live_sessions where league_id=p_league and status='active') or exists(select 1 from public.coin_markets where league_id=p_league and status in ('open','locked')) then raise exception 'Termina las sesiones y apuestas antes del reinicio';end if;
  if (select competitions_enabled from public.leagues where id=p_league) then raise exception 'La nueva etapa ya está activada';end if;
  if (p_input->>'expected_matches')::int is distinct from (select count(*)::int from public.matches where league_id=p_league) then raise exception 'Han cambiado los resultados. Revisa el cierre de nuevo';end if;
  if (p_input->>'expected_hash') is distinct from (select md5(coalesce(string_agg(id::text||':'||revision::text||':'||status,',' order by id),'')) from public.matches where league_id=p_league) then raise exception 'Han cambiado los resultados o sus revisiones. Revisa el cierre';end if;
  select * into s from public.seasons where league_id=p_league and status='active' and competition_kind='league';
  if s.id is not null then
   perform public._competition_freeze(s.id);
   if jsonb_array_length(coalesce(p_input->'awards','[]'::jsonb))>0 and not exists(select 1 from public.season_honours where season_id=s.id) then
    perform public.coins_command(p_league,'publish',jsonb_build_object('operation_id',gen_random_uuid(),'season_id',s.id,'awards',p_input->'awards'));
   end if;
  end if;
  insert into public.seasons(league_id,name,starts_at,status,target,competition_kind,rating_epoch,minimum_days)
   values(p_league,coalesce(nullif(trim(p_input->>'name'),''),'Temporada 2 · Liga Mediodía'),(now() at time zone 'Europe/Madrid')::date,'active',3,'league',gen_random_uuid(),3) returning id into result;
  update public.leagues set competitions_enabled=true where id=p_league;
 elsif p_action='cup.create' then
  select * into parent from public.seasons where league_id=p_league and status='active' and competition_kind='league' and rating_epoch is not null;
  if parent.id is null then raise exception 'No hay una Liga activa con competiciones';end if;
  insert into public.seasons(league_id,name,starts_at,status,target,competition_kind,parent_season_id,rating_epoch,minimum_days)
   values(p_league,coalesce(nullif(trim(p_input->>'name'),''),'Copa Afterwork · '||to_char(now() at time zone 'Europe/Madrid','DD/MM/YYYY')),(now() at time zone 'Europe/Madrid')::date,'active',coalesce((p_input->>'target')::int,6),'cup',parent.id,parent.rating_epoch,0) returning id into result;
 elsif p_action='cup.cancel' then
  select * into s from public.seasons where id=(p_input->>'id')::uuid and league_id=p_league and competition_kind='cup' and status='active' for update;
  if s.id is null or s.cup_result is not null then raise exception 'La Copa no se puede cancelar';end if;
  if exists(select 1 from public.live_sessions where season_id=s.id and status='active' and jsonb_typeof(state->'court')='object') then raise exception 'Cierra primero la sesión en juego';end if;
  update public.live_sessions set status='closed' where season_id=s.id and status='active';
  perform public._competition_freeze(s.id);result:=s.id;
  update public.seasons set final_results=final_results||jsonb_build_object('cancelled',true) where id=s.id;
 elsif p_action='cup.close' then
  select * into s from public.seasons where id=(p_input->>'id')::uuid and league_id=p_league and competition_kind='cup' and status='active' for update;
  if s.id is null or s.cup_result is null then raise exception 'La Copa necesita una final decidida';end if;
  if exists(select 1 from public.live_sessions where league_id=p_league and status='active' and season_id<>s.id) then raise exception 'Hay otra sesión en la mesa';end if;
  update public.live_sessions set status='closed' where season_id=s.id and status='active';
  if exists(select 1 from public.coin_markets where season_id=s.id and status in ('open','locked')) then raise exception 'Quedan apuestas pendientes';end if;
  perform public._competition_freeze(s.id);result:=s.id;
  select jsonb_agg(jsonb_build_object('id',id,'name',name)) into names from public.players where league_id=p_league and (s.cup_result->'players') ? id::text;
  awards:=jsonb_build_array(jsonb_build_object('title','Campeones de Copa','players',names));
  select max(balance) into maxcoins from public.coin_wallets where season_id=s.id;
  if maxcoins is not null then
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) into names from public.coin_wallets w join public.players p on p.id=w.player_id where w.season_id=s.id and w.balance=maxcoins;
   awards:=awards||jsonb_build_array(jsonb_build_object('title','Ludópata de Copa','players',names));
  end if;
  insert into public.season_honours(season_id,league_id,awards,published_by) values(s.id,p_league,awards,auth.uid());
 else raise exception 'Acción de competición desconocida';end if;
 insert into public.operations values(oid,p_league,auth.uid(),payload,result,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,after_data) values(p_league,auth.uid(),'competition.'||p_action,result,p_input);
 return result;
end $$;
CREATE OR REPLACE FUNCTION public.admin_command(p_league uuid, p_action text, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare result uuid; r record; begin
 if public.member_role(p_league) is distinct from 'admin' then raise exception 'Solo administradores' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league for update;
 if p_action='season.close' and exists(select 1 from public.live_sessions where league_id=p_league and status='active') then
  raise exception 'Cierra la sesión en directo antes de cerrar la temporada';
 end if;
 if p_action='season.close' and exists(select 1 from public.seasons where id=(p_data->>'id')::uuid and competition_kind='cup') then
  return public.competition_command(p_league,'cup.close',jsonb_build_object('id',p_data->>'id','operation_id',gen_random_uuid()));end if;
 if p_action='season.close' and exists(select 1 from public.seasons where league_id=p_league and competition_kind='cup' and status='active') then raise exception 'Cierra las Copas activas antes de cerrar la Liga';end if;
 perform set_config('futable.coin_defer','1',true);
 result:=public._admin_command_before_coins(p_league,p_action,p_data);
 perform set_config('futable.coin_defer','0',true);
 if p_action='match.void' then perform public._coin_match(result); end if;
 if p_action='season.configure' then
  for r in select id from public.live_sessions where league_id=p_league and status='active' loop perform public._coin_live_sync(r.id); end loop;
 end if;
 if p_action='season.create' and (select competitions_enabled from public.leagues where id=p_league) then update public.seasons set rating_epoch=gen_random_uuid(),minimum_days=3 where id=result;end if;
 return result;
end $function$
;

revoke all on function public._mmr_ratings_legacy(uuid),public._competition_ratings(uuid,uuid,boolean),public._competition_freeze(uuid) from public,anon,authenticated;
revoke all on function public.competition_command(uuid,text,jsonb) from public,anon;
grant execute on function public.competition_command(uuid,text,jsonb) to authenticated;
commit;
