DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'anskhalid492@gmail.com';
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'anskhalid492@gmail.com', crypt('Arab9191@@', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false
    );
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    VALUES (gen_random_uuid(), uid, uid::text, 'email',
      json_build_object('sub', uid::text, 'email', 'anskhalid492@gmail.com', 'email_verified', true)::jsonb,
      now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('Arab9191@@', gen_salt('bf')), email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now() WHERE id = uid;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
END $$;