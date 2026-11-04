-- Variable final scores; target is a suggested starting score only.
begin;
alter table public.seasons alter column target set default 3;
update public.seasons set target=3 where status='active' and target=5;
create or replace function public.save_match(p_league uuid,p_input jsonb,p_match uuid default null,p_revision int default null,p_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r text; s public.seasons; old public.matches; op public.operations; item jsonb; mid uuid; a int; b int; oid uuid; payload jsonb; prior jsonb;
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
 if a is null or b is null or a<0 or b<0 or a=b or a>99 or b>99 then raise exception 'Marcador inválido';end if;
 if jsonb_typeof(p_input->'participants') is distinct from 'array' then raise exception 'Participantes inválidos';end if;
 if (select count(*) from jsonb_array_elements(p_input->'participants'))<>4 or (select count(distinct x->>'player_id') from jsonb_array_elements(p_input->'participants') x)<>4 then raise exception 'Se requieren cuatro jugadores distintos';end if;
 if (select count(distinct (x->>'team',x->>'position')) from jsonb_array_elements(p_input->'participants') x where x->>'team' in ('blue','red') and x->>'position' in ('defender','forward'))<>4 then raise exception 'Posiciones inválidas';end if;
 -- Player locks serialize deactivation against a registration.
 perform 1 from public.players where league_id=p_league and id in (select (x->>'player_id')::uuid from jsonb_array_elements(p_input->'participants') x) order by id for share;
 if (select count(*) from public.players where league_id=p_league and active and id in (select (x->>'player_id')::uuid from jsonb_array_elements(p_input->'participants') x))<>4 then raise exception 'Jugador inactivo o de otra liga';end if;
 if p_match is null then
  insert into public.matches(league_id,season_id,blue_score,red_score,created_by,operation_id) values(p_league,s.id,a,b,auth.uid(),oid) returning id into mid;
 else
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de corrección';end if;
  select * into old from public.matches where id=p_match and league_id=p_league for update;
  if old.id is null or old.revision is distinct from p_revision or old.status<>'valid' or old.season_id<>s.id then raise exception 'La partida ha cambiado. Actualiza antes de corregir.';end if;
  select to_jsonb(old)||jsonb_build_object('participants',(select jsonb_agg(p) from public.match_participants p where match_id=p_match)) into prior;
  mid:=old.id;
  update public.matches set blue_score=a,red_score=b,revision=revision+1 where id=mid;
  delete from public.match_participants where match_id=mid;
 end if;
 for item in select * from jsonb_array_elements(p_input->'participants') loop
  insert into public.match_participants(match_id,league_id,player_id,team,position) values(mid,p_league,(item->>'player_id')::uuid,item->>'team',item->>'position');
 end loop;
 insert into public.operations values(oid,p_league,auth.uid(),payload,mid,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data) values(p_league,auth.uid(),case when p_match is null then 'match.create' else 'match.correct' end,mid,prior,jsonb_build_object('input',p_input,'reason',p_reason));
 return mid;
end $$;


commit;
