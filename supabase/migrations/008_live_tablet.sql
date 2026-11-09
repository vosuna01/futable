-- Wall tablet for the live match:
--  * goals credited to the player who scored (state.goal_log), stored with the match;
--  * waiting players agree their post before stepping in (queue[].post, action 'prefer');
--  * a 'scoreboard' membership role for the tablet's own account, which runs the
--    live court without being a league admin.
-- The 'goal', 'result' and 'start' inputs stay exactly as before: the scoreboard
-- firmware and older clients keep working, their goals are simply not credited.
begin;

-- 1. A role for the tablet. It reads the league like any member and may run the
--    live court; it has no player card and no administration rights.
alter table public.league_memberships drop constraint league_memberships_role_check;
alter table public.league_memberships add constraint league_memberships_role_check
 check(role in ('admin','player','scoreboard'));

-- 2. Scorers of each saved live match. Read like the matches they belong to;
--    a voided match keeps its rows, so readers filter by the match status.
create table public.match_scorers(
 match_id uuid not null,
 league_id uuid not null,
 player_id uuid not null,
 team text not null check(team in ('blue','red')),
 goals int not null check(goals between 1 and 99),
 primary key(match_id,player_id),
 foreign key(league_id,match_id) references public.matches(league_id,id),
 foreign key(league_id,player_id) references public.players(league_id,id)
);
alter table public.match_scorers enable row level security;
grant select on public.match_scorers to authenticated;
revoke insert,update,delete on public.match_scorers from anon,authenticated;
create policy scorer_read on public.match_scorers for select to authenticated using(public.member_role(league_id) is not null);

-- The goal log of the running match; a session written before this migration
-- only has the board, so its goals are rebuilt without a scorer.
create function public.live_goal_log(st jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when jsonb_typeof(st->'goal_log')='array' then st->'goal_log' else
  coalesce((select jsonb_agg(jsonb_build_object('team',t,'player',null) order by o,n) from (
   select 'blue' t,1 o,n from generate_series(1,coalesce((st->'goals'->>'blue')::int,0)) n
   union all select 'red',2,n from generate_series(1,coalesce((st->'goals'->>'red')::int,0)) n) g),'[]'::jsonb) end$$;
revoke all on function public.live_goal_log(jsonb) from public,anon,authenticated;

-- Validation of 006 plus the goal log and the agreed posts.
create or replace function public.check_live(p_league uuid,st jsonb) returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[]:='{}'; x jsonb; t text; post text;
begin
 if jsonb_typeof(st) is distinct from 'object' or jsonb_typeof(st->'queue') is distinct from 'array'
 or jsonb_typeof(st->'round') is distinct from 'number' or not(st ? 'court')
 or jsonb_array_length(st->'queue')>100 then raise exception 'Estado de sesión inválido';end if;
 if jsonb_typeof(st->'goals') is distinct from 'object'
 or jsonb_typeof(st->'goals'->'blue') is distinct from 'number'
 or jsonb_typeof(st->'goals'->'red') is distinct from 'number'
 or (st->'goals'->>'blue')::int not between 0 and 99
 or (st->'goals'->>'red')::int not between 0 and 99 then raise exception 'Marcador en vivo inválido';end if;
 if st ? 'goal_log' then
  if jsonb_typeof(st->'goal_log') is distinct from 'array' then raise exception 'Goles en vivo inválidos';end if;
  for x in select value from jsonb_array_elements(st->'goal_log') loop
   if jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'team','') not in ('blue','red')
   or jsonb_typeof(x->'player') not in ('null','string') then raise exception 'Goles en vivo inválidos';end if;
   if x->>'player' is not null and (jsonb_typeof(st->'court') is distinct from 'object'
    or x->>'player' not in (st->'court'->(x->>'team')->'defender'->>'id',st->'court'->(x->>'team')->'forward'->>'id'))
   then raise exception 'Goleador fuera de su equipo';end if;
  end loop;
  foreach t in array array['blue','red'] loop
   if (select count(*) from jsonb_array_elements(st->'goal_log') y where y->>'team'=t)<>(st->'goals'->>t)::int
   then raise exception 'Goles en vivo inválidos';end if;
  end loop;
 end if;
 if jsonb_typeof(coalesce(st->'played','{}'::jsonb)) is distinct from 'object' then raise exception 'Historial de la sesión inválido';end if;
 if jsonb_typeof(st->'court')='object' then
  foreach t in array array['blue','red'] loop
   if jsonb_typeof(st->'court'->t) is distinct from 'object' then raise exception 'Pista inválida';end if;
   foreach post in array array['defender','forward'] loop
    x:=st->'court'->t->post;
    if jsonb_typeof(x) is distinct from 'object' or nullif(x->>'id','') is null
    or jsonb_typeof(x->'waited') is distinct from 'number' then raise exception 'Pista inválida';end if;
    ids:=ids||array[(x->>'id')::uuid];
   end loop;
  end loop;
 elsif jsonb_typeof(st->'court') is distinct from 'null' then raise exception 'Pista inválida';
 end if;
 for x in select value from jsonb_array_elements(st->'queue') loop
  if jsonb_typeof(x) is distinct from 'object' or nullif(x->>'id','') is null
  or jsonb_typeof(x->'since') is distinct from 'number'
  or (x ? 'post' and coalesce(x->>'post','') not in ('defender','forward')) then raise exception 'Cola inválida';end if;
  ids:=ids||array[(x->>'id')::uuid];
 end loop;
 if (select count(distinct u) from unnest(ids) u)<>cardinality(ids) then raise exception 'Un jugador no puede estar dos veces en la sesión';end if;
 if cardinality(ids)>0 then
  perform 1 from public.players where league_id=p_league and id=any(ids) order by id for share;
  if (select count(*) from public.players where league_id=p_league and active and id=any(ids))<>cardinality(ids) then raise exception 'Jugador inactivo o de otra liga';end if;
 end if;
end $$;
revoke all on function public.check_live(uuid,jsonb) from public,anon,authenticated;

-- 007 plus: 'scoreboard' runs the court, goals may name the scorer, 'prefer'
-- agrees a waiting player's post, and the two stepping in honour it.
create or replace function public.live_session_command(p_league uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k public.live_sessions; s public.seasons; r text; op public.operations; me uuid; created boolean:=false;
 oid uuid; payload jsonb; st jsonb; previous jsonb; win text; loser text; mid uuid; members jsonb; a int; b int;
 t text; x jsonb; picked text[]; rnd int; q jsonb; first_out jsonb; second_out jsonb; incoming jsonb; pl jsonb; post text; pid text;
 nextd jsonb; nextf jsonb; side jsonb; newd text; newf text; runner boolean; lg jsonb; d int; at int; i int;
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
 if p_action in ('start','result','assign','undo','goal','prefer') and not runner then raise exception 'Fíchate para llevar la partida en directo';end if;
 if p_action='close' and k.owner_id<>auth.uid() and r<>'admin' then raise exception 'Solo quien abrió la sesión o un administrador puede cerrarla';end if;
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
  if jsonb_array_length(st->'queue')<4 or (select count(distinct y->>'id') from jsonb_array_elements(st->'queue') with ordinality z(y,ord) where ord<=4 and y->>'id'=any(picked))<>4 then raise exception 'Deben jugar los cuatro primeros fichados en la cola';end if;
  st:=jsonb_set(st,'{court}',jsonb_build_object(
   'blue',jsonb_build_object('defender',jsonb_build_object('id',picked[1],'waited',public.live_wait(st,picked[1])),
                             'forward',jsonb_build_object('id',picked[2],'waited',public.live_wait(st,picked[2]))),
   'red',jsonb_build_object('defender',jsonb_build_object('id',picked[3],'waited',public.live_wait(st,picked[3])),
                            'forward',jsonb_build_object('id',picked[4],'waited',public.live_wait(st,picked[4])))));
  st:=jsonb_set(st,'{queue}',coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(k.state->'queue') with ordinality z(y,ord) where not(y->>'id'=any(picked))),'[]'::jsonb));
  if jsonb_array_length(k.state->'queue')-jsonb_array_length(st->'queue')<>4 then raise exception 'Los cuatro jugadores deben estar fichados en la cola';end if;
  st:=jsonb_set(st,'{goals}',jsonb_build_object('blue',0,'red',0));
  st:=jsonb_set(st,'{goal_log}','[]'::jsonb,true);
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
  mid:=public.save_match(p_league,jsonb_build_object('operation_id',gen_random_uuid(),'season_id',s.id,
   'blue_score',a,'red_score',b,'winner',win,'participants',members));
  -- Credited goals go with the match; goals without a scorer only count on the board.
  insert into public.match_scorers(match_id,league_id,player_id,team,goals)
  select mid,p_league,(y->>'player')::uuid,y->>'team',count(*) from jsonb_array_elements(public.live_goal_log(st)) y
  where y->>'player' is not null group by y->>'player',y->>'team';
  loser:=case when win='blue' then 'red' else 'blue' end;
  rnd:=rnd+1;
  if (st->'court'->loser->'defender'->>'waited')::int>(st->'court'->loser->'forward'->>'waited')::int
  or ((st->'court'->loser->'defender'->>'waited')::int=(st->'court'->loser->'forward'->>'waited')::int and random()<0.5) then
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
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st,last_match=mid,last_before=previous where id=k.id;
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
 elsif p_action='undo' then
  if k.last_match is null or k.last_before is null then raise exception 'No hay resultado para deshacer';end if;
  perform 1 from public.matches where id=k.last_match and status='valid' and revision=1 for update;
  if not found then raise exception 'La partida ya se ha corregido o anulado';end if;
  update public.matches set status='void',revision=revision+1 where id=k.last_match;
  insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data)
  values(p_league,auth.uid(),'match.void',k.last_match,jsonb_build_object('status','valid'),
   jsonb_build_object('status','void','reason','Deshacer último resultado de la partida en directo'));
  update public.live_sessions set state=k.last_before,last_match=null,last_before=null where id=k.id;
 elsif p_action='close' then
  update public.live_sessions set status='closed',last_match=null,last_before=null where id=k.id;
 else raise exception 'Acción desconocida';end if;
 if p_action in ('join','leave') then update public.live_sessions set last_match=null,last_before=null where id=k.id;end if;
 if not created then update public.live_sessions set revision=revision+1 where id=k.id;end if;
 update public.live_sessions set updated_at=now() where id=k.id returning * into k;
 insert into public.operations values(oid,p_league,auth.uid(),payload,k.id,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data)
 values(p_league,auth.uid(),'live.'||p_action,k.id,previous,to_jsonb(k));
 return to_jsonb(k);
end $$;

commit;
