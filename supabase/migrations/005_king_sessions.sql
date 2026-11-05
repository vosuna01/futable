-- Continuous king-of-court sessions. Existing results retain their scores and winner.
begin;
alter table public.matches alter column winner drop expression;
alter table public.matches alter column winner set not null;
alter table public.matches alter column blue_score drop not null;
alter table public.matches alter column red_score drop not null;
alter table public.matches add constraint matches_result_consistent check (
 winner in ('blue','red') and (
 (blue_score is null and red_score is null) or
 (blue_score is not null and red_score is not null and blue_score between 0 and 99 and red_score between 0 and 99
 and blue_score<>red_score and winner=case when blue_score>red_score then 'blue' else 'red' end)));
create or replace function public.save_match(p_league uuid,p_input jsonb,p_match uuid default null,p_revision int default null,p_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r text; s public.seasons; old public.matches; op public.operations; item jsonb; mid uuid; a int; b int; oid uuid; payload jsonb; prior jsonb; win text;
begin
 -- Share lock prevents a concurrent revocation while this transaction writes.
 select role into r from public.league_memberships where league_id=p_league and user_id=auth.uid() and active for share;
 if r is null or (p_match is not null and r<>'admin') then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 oid:=(p_input->>'operation_id')::uuid;
 if oid is null then raise exception 'Falta identificador de operación';end if;
 payload:=jsonb_build_object('input',p_input,'match',p_match,'revision',p_revision,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 select * into op from public.operations where id=oid;
 if found then
  if op.actor_id<>auth.uid() or op.league_id<>p_league or op.payload<>payload then raise exception 'Operación reutilizada con datos distintos';end if;
  return op.result_id;
 end if;
 select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league for share;
 if s.id is null or s.status<>'active' then raise exception 'Temporada inactiva';end if;
 a:=(p_input->>'blue_score')::int;b:=(p_input->>'red_score')::int;
 if a is null and b is null then
  win:=p_input->>'winner';
  if win is null or win not in ('blue','red') then raise exception 'Indica el ganador'; end if;
 else
  if a is null or b is null or a<0 or b<0 or a=b or a>99 or b>99 then raise exception 'Marcador inválido';end if;
  win:=case when a>b then 'blue' else 'red' end;
  if p_input ? 'winner' and p_input->>'winner' is distinct from win then raise exception 'Ganador y marcador no coinciden';end if;
 end if;
 if jsonb_typeof(p_input->'participants') is distinct from 'array' then raise exception 'Participantes inválidos';end if;
 if (select count(*) from jsonb_array_elements(p_input->'participants'))<>4 or (select count(distinct x->>'player_id') from jsonb_array_elements(p_input->'participants') x)<>4 then raise exception 'Se requieren cuatro jugadores distintos';end if;
 if (select count(distinct (x->>'team',x->>'position')) from jsonb_array_elements(p_input->'participants') x where x->>'team' in ('blue','red') and x->>'position' in ('defender','forward'))<>4 then raise exception 'Posiciones inválidas';end if;
 -- Player locks serialize deactivation against a registration.
 perform 1 from public.players where league_id=p_league and id in (select (x->>'player_id')::uuid from jsonb_array_elements(p_input->'participants') x) order by id for share;
 if (select count(*) from public.players where league_id=p_league and active and id in (select (x->>'player_id')::uuid from jsonb_array_elements(p_input->'participants') x))<>4 then raise exception 'Jugador inactivo o de otra liga';end if;
 if p_match is null then
  insert into public.matches(league_id,season_id,blue_score,red_score,winner,created_by,operation_id) values(p_league,s.id,a,b,win,auth.uid(),oid) returning id into mid;
 else
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de corrección';end if;
  select * into old from public.matches where id=p_match and league_id=p_league for update;
  if old.id is null or old.revision is distinct from p_revision or old.status<>'valid' or old.season_id<>s.id then raise exception 'La partida ha cambiado. Actualiza antes de corregir.';end if;
  select to_jsonb(old)||jsonb_build_object('participants',(select jsonb_agg(p) from public.match_participants p where match_id=p_match)) into prior;
  mid:=old.id;
  update public.matches set blue_score=a,red_score=b,winner=win,revision=revision+1 where id=mid;
  delete from public.match_participants where match_id=mid;
 end if;
 for item in select * from jsonb_array_elements(p_input->'participants') loop
  insert into public.match_participants(match_id,league_id,player_id,team,position) values(mid,p_league,(item->>'player_id')::uuid,item->>'team',item->>'position');
 end loop;
 insert into public.operations values(oid,p_league,auth.uid(),payload,mid,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data) values(p_league,auth.uid(),case when p_match is null then 'match.create' else 'match.correct' end,mid,prior,jsonb_build_object('input',p_input,'reason',p_reason));
 return mid;
end $$;


create table public.king_sessions (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references public.leagues(id),
 season_id uuid not null references public.seasons(id),
 owner_id uuid not null references auth.users(id),
 status text not null default 'active' check(status in ('active','closed')),
 state jsonb not null, revision int not null default 1,
 last_match uuid references public.matches(id), last_before jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index king_one_active on public.king_sessions(league_id) where status='active';
alter table public.king_sessions enable row level security;
grant select on public.king_sessions to authenticated;
create policy king_read on public.king_sessions for select to authenticated using(public.member_role(league_id) is not null);

create function public.check_court(p_league uuid, st jsonb) returns void language plpgsql security definer set search_path='' as $$
declare pair jsonb; ids uuid[]:='{}'; pids text[]:='{}'; d uuid; f uuid;
begin
 if jsonb_typeof(st) is distinct from 'object' or jsonb_typeof(st->'queue') is distinct from 'array'
 or not(st ? 'blue' and st ? 'red') or jsonb_array_length(st->'queue')>100 then raise exception 'Cola inválida'; end if;
 if exists(select 1 from jsonb_array_elements(st->'queue') x where x='null'::jsonb) then raise exception 'Pareja inválida en la cola';end if;
 for pair in select x from jsonb_array_elements(jsonb_build_array(st->'blue',st->'red')||(st->'queue')) x loop
  if pair='null'::jsonb then continue;end if;
  if jsonb_typeof(pair) is distinct from 'object' or nullif(pair->>'id','') is null then raise exception 'Pareja inválida';end if;
  if pair->>'id'=any(pids) then raise exception 'Pareja repetida';end if;
  pids:=array_append(pids,pair->>'id');
  d:=(pair->>'defender')::uuid; f:=(pair->>'forward')::uuid;
  if d is null or f is null or d=f or d=any(ids) or f=any(ids) then raise exception 'Elige jugadores distintos en todas las parejas';end if;
  ids:=ids||array[d,f];
 end loop;
 if cardinality(ids)<2 then raise exception 'Añade al menos una pareja';end if;
 perform 1 from public.players where league_id=p_league and id=any(ids) order by id for share;
 if (select count(*) from public.players where league_id=p_league and active and id=any(ids))<>cardinality(ids) then raise exception 'Jugador inactivo o de otra liga';end if;
end $$;
revoke all on function public.check_court(uuid,jsonb) from public,anon,authenticated;

create function public.king_session_command(p_league uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k public.king_sessions; s public.seasons; r text; op public.operations;
 oid uuid; payload jsonb; st jsonb; previous jsonb; loser text; win text; mid uuid; members jsonb; t text; pair jsonb;
begin
 -- Serialize commands for this court; revision guards reject stale or double taps.
 perform 1 from public.leagues where id=p_league for update;
 select role into r from public.league_memberships where league_id=p_league and user_id=auth.uid() and active for share;
 if r is null then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 oid:=(p_input->>'operation_id')::uuid;
 if oid is null then raise exception 'Falta identificador de operación';end if;
 payload:=jsonb_build_object('king_action',p_action,'input',p_input);
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 select * into op from public.operations where id=oid;
 if found then
  if op.actor_id<>auth.uid() or op.league_id<>p_league or op.payload<>payload then raise exception 'Operación reutilizada con datos distintos';end if;
  select * into k from public.king_sessions where id=op.result_id;
  return to_jsonb(k);
 end if;
 select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league for share;
 if s.id is null or (s.status<>'active' and p_action<>'close') then raise exception 'Temporada inactiva';end if;
 select * into k from public.king_sessions where league_id=p_league and status='active' for update;
 if p_action='start' then
  if k.id is not null then raise exception 'Ya hay una sesión abierta. Actualiza para continuarla.';end if;
  st:=p_input->'state';perform public.check_court(p_league,st);
  if st->'blue'='null'::jsonb or st->'red'='null'::jsonb then raise exception 'Configura las dos parejas iniciales';end if;
  insert into public.king_sessions(league_id,season_id,owner_id,state) values(p_league,s.id,auth.uid(),st) returning * into k;
 else
  if k.id is null or k.id is distinct from (p_input->>'session_id')::uuid or k.revision is distinct from (p_input->>'revision')::int then raise exception 'La sesión ha cambiado. Actualiza antes de continuar.';end if;
  if k.owner_id<>auth.uid() and r<>'admin' then raise exception 'Solo quien lleva la sesión o un administrador puede apuntar resultados';end if;
  -- Old-season sessions can be closed, but never used to register into a new season.
  if k.season_id<>s.id and p_action<>'close' then raise exception 'Esta sesión pertenece a otra temporada. Ciérrala y empieza otra.';end if;
  previous:=k.state;st:=k.state;
  if p_action='configure' then
   st:=p_input->'state';perform public.check_court(p_league,st);
   update public.king_sessions set state=st,last_match=null,last_before=null where id=k.id;
  elsif p_action='result' then
   perform public.check_court(p_league,st);
   if st->'blue'='null'::jsonb or st->'red'='null'::jsonb then raise exception 'Faltan rivales en la pista';end if;
   win:=p_input->>'winner';
   if win is null or win not in ('blue','red') then raise exception 'Indica el ganador';end if;
   members:='[]'::jsonb;
   foreach t in array array['blue','red'] loop
    pair:=st->t;
    members:=members||jsonb_build_array(jsonb_build_object('player_id',pair->>'defender','team',t,'position','defender'),jsonb_build_object('player_id',pair->>'forward','team',t,'position','forward'));
   end loop;
   mid:=public.save_match(p_league,jsonb_build_object('operation_id',gen_random_uuid(),'season_id',s.id,'blue_score',p_input->'blue_score','red_score',p_input->'red_score','winner',win,'participants',members));
   loser:=case when win='blue' then 'red' else 'blue' end;
   st:=jsonb_set(st,array[loser],coalesce(st->'queue'->0,'null'::jsonb));
   st:=jsonb_set(st,'{queue}',((previous->'queue')-0)||jsonb_build_array(previous->loser));
   update public.king_sessions set state=st,last_match=mid,last_before=previous where id=k.id;
  elsif p_action='undo' then
   if k.last_match is null or k.last_before is null then raise exception 'No hay resultado para deshacer';end if;
   perform 1 from public.matches where id=k.last_match and status='valid' and revision=1 for update;
   if not found then raise exception 'La partida ya se ha corregido o anulado';end if;
   update public.matches set status='void',revision=revision+1 where id=k.last_match;
   insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data) values(p_league,auth.uid(),'match.void',k.last_match,jsonb_build_object('status','valid'),jsonb_build_object('status','void','reason','Deshacer último resultado de rey de la pista'));
   update public.king_sessions set state=k.last_before,last_match=null,last_before=null where id=k.id;
  elsif p_action='close' then
   update public.king_sessions set status='closed',last_match=null,last_before=null where id=k.id;
  else raise exception 'Acción desconocida';end if;
  update public.king_sessions set revision=revision+1,updated_at=now() where id=k.id returning * into k;
 end if;
 insert into public.operations values(oid,p_league,auth.uid(),payload,k.id,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data) values(p_league,auth.uid(),'king.'||p_action,k.id,previous,to_jsonb(k));
 return to_jsonb(k);
end $$;
revoke all on function public.king_session_command(uuid,text,jsonb) from public,anon;
grant execute on function public.king_session_command(uuid,text,jsonb) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.king_sessions;
 end if;
end $$;

commit;
