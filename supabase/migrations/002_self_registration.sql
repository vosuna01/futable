-- Self-service accounts join the configured office league after email verification.
-- Configuration is private: it cannot be read or changed through the browser.
create table public.registration_settings (
  singleton boolean primary key default true check(singleton),
  league_id uuid not null references public.leagues(id)
);
alter table public.registration_settings enable row level security;
revoke all on public.registration_settings from public,anon,authenticated;

-- Existing single-league installations opt into the registration requested by the owner.
-- Multiple-league installations must explicitly select a target in SQL Editor.
insert into public.registration_settings(singleton,league_id)
select true,id from public.leagues where (select count(*) from public.leagues)=1;

alter table public.players add column account_id uuid references auth.users(id);
create unique index one_player_per_account on public.players(league_id,account_id) where account_id is not null;

create function public.join_open_league() returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); lid uuid; nick text; confirmed timestamptz; pid uuid; membership public.league_memberships;
begin
 if uid is null then raise exception 'Inicia sesión para entrar en la liga' using errcode='42501';end if;
 -- The identity and confirmation come from Auth, never user-supplied roles or IDs.
 select email_confirmed_at,left(trim(coalesce(raw_user_meta_data->>'display_name','Jugador')),60)
 into confirmed,nick from auth.users where id=uid;
 if confirmed is null then raise exception 'Confirma tu correo antes de entrar en la liga' using errcode='42501';end if;
 select league_id into lid from public.registration_settings where singleton;
 if lid is null then raise exception 'La liga todavía no está preparada para nuevas cuentas. Contacta con el administrador.';end if;
 -- Serializes registration with administration; unique constraints backstop retries.
 perform 1 from public.leagues where id=lid for update;
 select * into membership from public.league_memberships where league_id=lid and user_id=uid;
 if found then
  if not membership.active then raise exception 'Tu acceso a la liga está revocado. Contacta con el administrador.' using errcode='42501';end if;
  return lid;
 end if;
 nick:=coalesce(nullif(nick,''),'Jugador');
 insert into public.user_profiles(user_id,display_name) values(uid,nick) on conflict(user_id) do nothing;
 insert into public.league_memberships(league_id,user_id,role,active) values(lid,uid,'player',true);
 insert into public.players(league_id,name,account_id) values(lid,nick,uid) returning id into pid;
 insert into public.audit_log(league_id,actor_id,action,entity_id,after_data)
 values(lid,uid,'account.join',pid,jsonb_build_object('user_id',uid,'player_id',pid,'role','player'));
 return lid;
end $$;
revoke all on function public.join_open_league() from public,anon;
grant execute on function public.join_open_league() to authenticated;
