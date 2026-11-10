-- Replace the players of a running side from the wall tablet.
-- Keeps the 008 permissions, locking, revisions, idempotency and match-saving path.
-- Only the 'replace' branch is new. Existing matches and player records are untouched.
begin;

-- Refuse to overwrite a concurrently changed RPC or a different server version.
do $$ begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc
     where oid='public.live_session_command(uuid,text,jsonb)'::regprocedure)
    is distinct from '79c077b83227b54349f3bc76718ba2d2' then
  raise exception 'La RPC no coincide con la migración 008 revisada. Revisa los cambios antes de aplicar la 009.';
 end if;
end $$;

-- A replacement changes only the running session, never recorded matches.
create function public.live_replace_pair_state(st jsonb,t text,newd text,newf text)
returns jsonb language plpgsql set search_path='' as $$
declare side jsonb; other_side jsonb; q jsonb; old_slot jsonb; slot jsonb; next_side jsonb:='{}'::jsonb;
 pid text; post text; rnd int;
begin
 if t is null or t not in ('blue','red') then raise exception 'Equipo inválido';end if;
 if jsonb_typeof(st->'court') is distinct from 'object' then raise exception 'No hay ninguna partida en juego';end if;
 if nullif(newd,'') is null or nullif(newf,'') is null or newd=newf then raise exception 'Elige dos jugadores distintos';end if;
 side:=st->'court'->t;
 other_side:=st->'court'->(case when t='blue' then 'red' else 'blue' end);
 if newd in (other_side->'defender'->>'id',other_side->'forward'->>'id')
 or newf in (other_side->'defender'->>'id',other_side->'forward'->>'id')
 then raise exception 'No puedes elegir jugadores del equipo contrario';end if;
 rnd:=(st->>'round')::int;
 foreach post in array array['defender','forward'] loop
  pid:=case when post='defender' then newd else newf end;
  if side->'defender'->>'id'=pid then slot:=side->'defender';
  elsif side->'forward'->>'id'=pid then slot:=side->'forward';
  else
   slot:=jsonb_build_object('id',pid,'waited',coalesce((select rnd-(y->>'since')::int
    from jsonb_array_elements(st->'queue') y where y->>'id'=pid),0));
  end if;
  next_side:=jsonb_set(next_side,array[post],slot,true);
 end loop;
 -- A pure position swap keeps its goals, just like 'assign'.
 if (side->'defender'->>'id') in (newd,newf) and (side->'forward'->>'id') in (newd,newf) then
  return jsonb_set(st,array['court',t],next_side);
 end if;
 q:=coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(st->'queue')
  with ordinality z(y,ord) where y->>'id' not in (newd,newf)),'[]'::jsonb);
 foreach post in array array['defender','forward'] loop
  old_slot:=side->post;
  if (old_slot->>'id') not in (newd,newf) then
   q:=q||jsonb_build_array(jsonb_build_object('id',old_slot->>'id','since',rnd));
  end if;
 end loop;
 st:=jsonb_set(st,array['court',t],next_side);
 st:=jsonb_set(st,'{queue}',public.live_order(st,q));
 st:=jsonb_set(st,'{goals}',jsonb_build_object('blue',0,'red',0));
 return jsonb_set(st,'{goal_log}','[]'::jsonb,true);
end $$;
revoke all on function public.live_replace_pair_state(jsonb,text,text,text) from public,anon,authenticated;


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
 if p_action in ('start','result','assign','undo','goal','prefer','replace') and not runner then raise exception 'Fíchate para llevar la partida en directo';end if;
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
