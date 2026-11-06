-- Guard queue order and permissions; preserve later attendance when undoing.
begin;

create or replace function public.live_session_command(p_league uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k public.live_sessions; s public.seasons; r text; op public.operations; me uuid; created boolean:=false;
 oid uuid; payload jsonb; st jsonb; previous jsonb; win text; loser text; mid uuid; members jsonb; a int; b int;
 t text; x jsonb; picked text[]; rnd int; q jsonb; first_out jsonb; second_out jsonb; incoming jsonb; pl jsonb; post text; pid text;
 nextd jsonb; nextf jsonb; side jsonb; newd text; newf text;
begin
 -- Serialize commands for this league; revision guards reject stale or double taps.
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
  -- The first sign-up of the day opens the session.
  if p_action<>'join' then raise exception 'No hay ninguna sesión en directo abierta';end if;
  insert into public.live_sessions(league_id,season_id,owner_id,state)
  values(p_league,s.id,auth.uid(),jsonb_build_object('round',0,'court',null,
   'goals',jsonb_build_object('blue',0,'red',0),'played','{}'::jsonb,'queue','[]'::jsonb)) returning * into k;
  created:=true;
 else
  if k.id is distinct from (p_input->>'session_id')::uuid or k.revision is distinct from (p_input->>'revision')::int then raise exception 'La sesión ha cambiado. Actualiza antes de continuar.';end if;
  -- Old-season sessions can be closed, but never used to register into a new season.
  if k.season_id<>s.id and p_action<>'close' then raise exception 'Esta sesión pertenece a otra temporada. Ciérrala y empieza otra.';end if;
  previous:=k.state;
 end if;
 me:=public.live_player(p_league);
 if p_action in ('start','result','assign','undo','goal') and r<>'admin'
 and (me is null or not public.live_signed_up(k.state,me)) then raise exception 'Fíchate para llevar la partida en directo';end if;
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
  if r<>'admin' and me is distinct from (p_input->>'player')::uuid
  and (me is null or not public.live_signed_up(st,me)) then raise exception 'Fíchate para quitar a otra persona de la cola';end if;
  if not exists(select 1 from jsonb_array_elements(st->'queue') y where y->>'id'=p_input->>'player') then raise exception 'Esa persona no está esperando en la cola';end if;
  st:=jsonb_set(st,'{queue}',coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(st->'queue') with ordinality z(y,ord) where y->>'id'<>p_input->>'player'),'[]'::jsonb));
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
  perform public.check_live(p_league,st);
  update public.live_sessions set state=st where id=k.id;
 elsif p_action='goal' then
  t:=p_input->>'team';
  if t is null or t not in ('blue','red') then raise exception 'Equipo inválido';end if;
  if jsonb_typeof(st->'court') is distinct from 'object' then raise exception 'No hay ninguna partida en juego';end if;
  st:=jsonb_set(st,array['goals',t],to_jsonb(greatest(0,least(99,
   (st->'goals'->>t)::int+coalesce((p_input->>'delta')::int,0)))));
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
  -- The running board is the score; left at 0-0 it saves the win without one.
  a:=(st->'goals'->>'blue')::int; b:=(st->'goals'->>'red')::int;
  if a=0 and b=0 then a:=null; b:=null;
  else
   if a=b then raise exception 'El marcador está empatado. Ajusta los goles.';end if;
   if (case when a>b then 'blue' else 'red' end)<>win then raise exception 'El marcador no coincide con el ganador. Ajusta los goles.';end if;
  end if;
  mid:=public.save_match(p_league,jsonb_build_object('operation_id',gen_random_uuid(),'season_id',s.id,
   'blue_score',a,'red_score',b,'winner',win,'participants',members));
  loser:=case when win='blue' then 'red' else 'blue' end;
  rnd:=rnd+1;
  -- Both losers leave together: the longer wait before entering goes first, a tie is drawn.
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
  incoming:=q->0; nextd:=jsonb_build_object('id',incoming->>'id','waited',rnd-(incoming->>'since')::int);
  incoming:=q->1; nextf:=jsonb_build_object('id',incoming->>'id','waited',rnd-(incoming->>'since')::int);
  st:=jsonb_set(st,'{round}',to_jsonb(rnd));
  st:=jsonb_set(st,array['court',loser],jsonb_build_object('defender',nextd,'forward',nextf));
  st:=jsonb_set(st,'{queue}',coalesce((select jsonb_agg(y order by ord) from jsonb_array_elements(q) with ordinality z(y,ord) where ord>2),'[]'::jsonb));
  st:=jsonb_set(st,'{goals}',jsonb_build_object('blue',0,'red',0));
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
 -- A later sign-up or departure must never be lost by restoring an old queue.
 if p_action in ('join','leave') then update public.live_sessions set last_match=null,last_before=null where id=k.id;end if;
 if not created then update public.live_sessions set revision=revision+1 where id=k.id;end if;
 update public.live_sessions set updated_at=now() where id=k.id returning * into k;
 insert into public.operations values(oid,p_league,auth.uid(),payload,k.id,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data)
 values(p_league,auth.uid(),'live.'||p_action,k.id,previous,to_jsonb(k));
 return to_jsonb(k);
end $$;

commit;

