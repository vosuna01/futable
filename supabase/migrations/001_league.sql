-- Supabase PostgreSQL 15+. All private writes go through checked RPCs.
create table public.leagues(id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80), created_at timestamptz not null default now());
create table public.user_profiles(user_id uuid primary key references auth.users(id), display_name text not null default 'Miembro');
create table public.league_memberships(league_id uuid references public.leagues not null, user_id uuid references auth.users not null, role text not null check(role in ('admin','player')), active boolean not null default true, primary key(league_id,user_id));
create table public.players(id uuid primary key default gen_random_uuid(),league_id uuid not null references public.leagues,name text not null check(length(trim(name)) between 1 and 60),avatar_url text check(avatar_url is null or avatar_url ~ '^https://'),active boolean not null default true,unique(league_id,id));
create table public.seasons(id uuid primary key default gen_random_uuid(),league_id uuid not null references public.leagues,name text not null check(length(trim(name)) between 1 and 80),starts_at date not null default current_date,ends_at date,status text not null default 'active' check(status in ('active','closed')),minimum int not null default 10 check(minimum>=1),prior_wins numeric not null default 10 check(prior_wins>=0),prior_games numeric not null default 20 check(prior_games>0 and prior_wins<=prior_games),pair_minimum int not null default 10 check(pair_minimum>=1),target int not null default 5 check(target between 1 and 99),final_results jsonb,unique(league_id,id),check(ends_at is null or ends_at>=starts_at));
create unique index one_active_season on public.seasons(league_id) where status='active';
create table public.matches(id uuid primary key default gen_random_uuid(),league_id uuid not null references public.leagues,season_id uuid not null,blue_score int not null check(blue_score>=0),red_score int not null check(red_score>=0),winner text generated always as (case when blue_score>red_score then 'blue' else 'red' end) stored,status text not null default 'valid' check(status in ('valid','void')),played_at timestamptz not null default now(),created_at timestamptz not null default now(),created_by uuid not null references auth.users,operation_id uuid not null unique,revision int not null default 1,check(blue_score<>red_score),foreign key(league_id,season_id) references public.seasons(league_id,id),unique(league_id,id));
create table public.match_participants(match_id uuid not null,league_id uuid not null,player_id uuid not null,team text not null check(team in ('blue','red')),position text not null check(position in ('defender','forward')),primary key(match_id,player_id),unique(match_id,team,position),foreign key(league_id,match_id) references public.matches(league_id,id),foreign key(league_id,player_id) references public.players(league_id,id));
create table public.audit_log(id uuid primary key default gen_random_uuid(),league_id uuid not null references public.leagues,actor_id uuid not null references auth.users,action text not null,entity_id uuid not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
create table public.operations(id uuid primary key,league_id uuid not null references public.leagues,actor_id uuid not null references auth.users,payload jsonb not null,result_id uuid not null,created_at timestamptz not null default now());
-- No display_devices, display role or display endpoints in this release.
create index membership_user on public.league_memberships(user_id) where active;
create index matches_season_date on public.matches(league_id,season_id,played_at desc);
create index participants_player on public.match_participants(player_id,match_id);
create index audit_league_date on public.audit_log(league_id,created_at desc);
create index players_league on public.players(league_id);

create function public.member_role(p_league uuid) returns text language sql stable security definer set search_path='' as $$select role from public.league_memberships where league_id=p_league and user_id=auth.uid() and active$$;
revoke all on function public.member_role(uuid) from public,anon;
grant execute on function public.member_role(uuid) to authenticated;

alter table public.leagues enable row level security;
alter table public.user_profiles enable row level security;
alter table public.league_memberships enable row level security;
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.audit_log enable row level security;
alter table public.operations enable row level security;
create policy league_read on public.leagues for select to authenticated using(public.member_role(id) is not null);
create policy profile_read on public.user_profiles for select to authenticated using(user_id=auth.uid());
create policy membership_read on public.league_memberships for select to authenticated using(user_id=auth.uid() or public.member_role(league_id)='admin');
create policy player_read on public.players for select to authenticated using(public.member_role(league_id) is not null);
create policy season_read on public.seasons for select to authenticated using(public.member_role(league_id) is not null);
create policy match_read on public.matches for select to authenticated using(public.member_role(league_id) is not null);
create policy participant_read on public.match_participants for select to authenticated using(public.member_role(league_id) is not null);
create policy audit_read on public.audit_log for select to authenticated using(public.member_role(league_id)='admin');
grant select on public.leagues,public.user_profiles,public.league_memberships,public.players,public.seasons,public.matches,public.match_participants,public.audit_log to authenticated;
revoke all on public.operations from anon,authenticated;
revoke insert,update,delete on public.leagues,public.user_profiles,public.league_memberships,public.players,public.seasons,public.matches,public.match_participants,public.audit_log from anon,authenticated;

-- One RPC statement gives the client a consistent snapshot, including all participants.
create function public.league_snapshot(p_league uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.member_role(p_league); result jsonb;
begin
 if r is null then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select jsonb_build_object('league',(select to_jsonb(l) from public.leagues l where id=p_league),
 'role',r,'players',coalesce((select jsonb_agg(p order by name) from public.players p where league_id=p_league),'[]'::jsonb),
 'seasons',coalesce((select jsonb_agg(s order by starts_at desc,id) from public.seasons s where league_id=p_league),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(jsonb_build_object('player_id',player_id,'team',team,'position',position) order by team,position) from public.match_participants where match_id=m.id)) order by played_at desc,created_at desc,id) from public.matches m where league_id=p_league),'[]'::jsonb),
 'memberships',case when r='admin' then coalesce((select jsonb_agg(jsonb_build_object('user_id',lm.user_id,'role',lm.role,'active',lm.active,'display_name',coalesce(up.display_name,'Miembro'))) from public.league_memberships lm left join public.user_profiles up using(user_id) where league_id=p_league),'[]'::jsonb) else '[]'::jsonb end,
 'audit',case when r='admin' then coalesce((select jsonb_agg(a) from (select * from public.audit_log where league_id=p_league order by created_at desc limit 200) a),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end $$;

create function public.save_match(p_league uuid,p_input jsonb,p_match uuid default null,p_revision int default null,p_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
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
 if a is null or b is null or a<0 or b<0 or a=b or greatest(a,b)<>s.target or least(a,b)>=s.target then raise exception 'Marcador inválido';end if;
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

create function public.admin_command(p_league uuid,p_action text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; prior jsonb; after_value jsonb; s public.seasons; m public.matches; n text;
begin
 -- Serialize all administration, including last-admin protection and season closure.
 perform 1 from public.leagues where id=p_league for update;
 if public.member_role(p_league) is distinct from 'admin' then raise exception 'Solo administradores' using errcode='42501';end if;
 case p_action
 when 'player.save' then
  n:=trim(p_data->>'name');
  if p_data->>'id' is null then insert into public.players(league_id,name,avatar_url) values(p_league,n,nullif(p_data->>'avatar_url','')) returning id into result;
  else
   result:=(p_data->>'id')::uuid;
   select to_jsonb(p) into prior from public.players p where league_id=p_league and id=result for update;
   if prior is null then raise exception 'Jugador inexistente';end if;
   update public.players set name=n,avatar_url=nullif(p_data->>'avatar_url',''),active=coalesce((p_data->>'active')::boolean,true) where id=result;
  end if;
  select to_jsonb(p) into after_value from public.players p where id=result;
 when 'membership.save' then
  result:=(p_data->>'user_id')::uuid;
  select to_jsonb(lm) into prior from public.league_memberships lm where league_id=p_league and user_id=result;
  if exists(select 1 from public.league_memberships where league_id=p_league and user_id=result and role='admin' and active) and (p_data->>'role'<>'admin' or not (p_data->>'active')::boolean) and (select count(*) from public.league_memberships where league_id=p_league and role='admin' and active)<=1 then raise exception 'La liga necesita al menos un administrador';end if;
  insert into public.league_memberships(league_id,user_id,role,active) values(p_league,result,p_data->>'role',(p_data->>'active')::boolean) on conflict(league_id,user_id) do update set role=excluded.role,active=excluded.active;
  insert into public.user_profiles(user_id,display_name) values(result,coalesce(nullif(p_data->>'display_name',''),'Miembro')) on conflict(user_id) do update set display_name=excluded.display_name;
  after_value:=p_data;
 when 'season.create' then
  insert into public.seasons(league_id,name,starts_at) values(p_league,trim(p_data->>'name'),coalesce((p_data->>'starts_at')::date,current_date)) returning id into result;after_value:=p_data;
 when 'season.configure' then
  result:=(p_data->>'id')::uuid;
  select * into s from public.seasons where league_id=p_league and id=result for update;
  if s.id is null or s.status<>'active' then raise exception 'Solo se configura la temporada activa';end if;
  prior:=to_jsonb(s);
  update public.seasons set minimum=(p_data->>'minimum')::int,prior_wins=(p_data->>'prior_wins')::numeric,prior_games=(p_data->>'prior_games')::numeric,pair_minimum=(p_data->>'pair_minimum')::int,target=(p_data->>'target')::int where id=result;
  select to_jsonb(x) into after_value from public.seasons x where id=result;
 when 'season.close' then
  result:=(p_data->>'id')::uuid;
  select * into s from public.seasons where id=result and league_id=p_league for update;
  if s.id is null or s.status<>'active' then raise exception 'Temporada ya cerrada';end if;
  prior:=to_jsonb(s);
  -- Freeze a reconstructible season record: rules + all valid results with positions.
  after_value:=jsonb_build_object('rules',to_jsonb(s),'matches',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('participants',(select jsonb_agg(p) from public.match_participants p where match_id=x.id))),'[]'::jsonb) from public.matches x where season_id=result and status='valid'));
  update public.seasons set status='closed',ends_at=greatest(current_date,starts_at),final_results=after_value where id=result;
 when 'match.void' then
  result:=(p_data->>'id')::uuid;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Indica un motivo';end if;
  -- Same lock order as save_match: season, then match.
  select s2.* into s from public.seasons s2 join public.matches m2 on m2.season_id=s2.id where m2.id=result and m2.league_id=p_league for share of s2;
  select * into m from public.matches where id=result and league_id=p_league for update;
  if m.id is null or s.status<>'active' or m.revision is distinct from (p_data->>'revision')::int or m.status<>'valid' then raise exception 'Partida modificada o temporada cerrada';end if;
  prior:=to_jsonb(m);
  update public.matches set status='void',revision=revision+1 where id=result;
  after_value:=p_data;
 else raise exception 'Operación desconocida';
 end case;
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data) values(p_league,auth.uid(),p_action,result,prior,after_value);
 return result;
end $$;
revoke all on function public.league_snapshot(uuid),public.save_match(uuid,jsonb,uuid,int,text),public.admin_command(uuid,text,jsonb) from public,anon;
grant execute on function public.league_snapshot(uuid),public.save_match(uuid,jsonb,uuid,int,text),public.admin_command(uuid,text,jsonb) to authenticated;

-- A commit emits changes only after all participants and the audit have been written.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.matches,public.players,public.seasons,public.league_memberships;
 end if;
end$$;
