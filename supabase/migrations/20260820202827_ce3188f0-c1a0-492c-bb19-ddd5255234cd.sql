update public.site_pages set path = replace(replace(path,'sendloop-vs','munchreach-vs'),'sendloop-alternatives','munchreach-alternatives'), updated_at = now() where path ilike '%sendloop%';

update public.site_nav_items set href = replace(replace(replace(href,'sendloop-vs','munchreach-vs'),'sendloop-alternatives','munchreach-alternatives'),'/why-sendloop','/why-munchreach') where href ilike '%sendloop%';

insert into public.site_redirects (source_path, destination_path, status_code, is_active, note)
values
 ('/why-sendloop','/why-munchreach',301,true,'Rebrand slug change'),
 ('/compare/sendloop-vs-instantly','/compare/munchreach-vs-instantly',301,true,'Rebrand slug change'),
 ('/compare/sendloop-vs-smartlead','/compare/munchreach-vs-smartlead',301,true,'Rebrand slug change'),
 ('/compare/sendloop-vs-lemlist','/compare/munchreach-vs-lemlist',301,true,'Rebrand slug change'),
 ('/compare/sendloop-vs-apollo','/compare/munchreach-vs-apollo',301,true,'Rebrand slug change'),
 ('/compare/sendloop-vs-saleshandy','/compare/munchreach-vs-saleshandy',301,true,'Rebrand slug change'),
 ('/compare/sendloop-alternatives','/compare/munchreach-alternatives',301,true,'Rebrand slug change')
on conflict do nothing;