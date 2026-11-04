-- Execute as project owner AFTER migrations 001 and 002.
-- First register and confirm your email (or invite it). Replace YOUR_INVITED_EMAIL below.
-- This is deliberately NOT a migration: there are no default production accounts.
do $$
declare owner_id uuid; lid uuid;
begin
 select id into owner_id from auth.users where lower(email)=lower('YOUR_INVITED_EMAIL');
 if owner_id is null then raise exception 'Registra primero tu cuenta y sustituye YOUR_INVITED_EMAIL';end if;
 if exists(select 1 from public.league_memberships where user_id=owner_id) then raise exception 'La cuenta ya pertenece a una liga. No se ha creado nada.';end if;
 insert into public.leagues(name) values('Liga FutABLE') returning id into lid;
 insert into public.registration_settings(singleton,league_id) values(true,lid);
 insert into public.user_profiles(user_id,display_name) values(owner_id,'Administrador') on conflict(user_id) do nothing;
 insert into public.league_memberships(league_id,user_id,role) values(lid,owner_id,'admin');
 insert into public.seasons(league_id,name) values(lid,'Primera temporada');
end $$;
