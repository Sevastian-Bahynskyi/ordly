-- Seed for supabase/tests/practice-server.mjs. Disposable local database only, never production.
-- One synthetic account with twelve reviewed words, each with a stored sense and an example.
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000001', 'practice-fixture@example.invalid');
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
insert into public.vocabulary_entries(danish, translation, example_sentence, example_translation, ai_enriched)
select word, meaning, format('Det er meget %s i dag.', word), format('It is very %s today.', meaning), true
from (values ('svær', 'difficult'), ('let', 'easy'), ('stor', 'big'), ('lille', 'small'), ('høj', 'tall'), ('lav', 'low'),
             ('varm', 'warm'), ('kold', 'cold'), ('ny', 'new'), ('gammel', 'old'), ('glad', 'happy'), ('træt', 'tired')) as words(word, meaning);
reset role;
update public.review_cards set reps = 2, stability = 2, difficulty = 5, state = 2, last_review = now() - interval '2 days', due = now();
update public.profiles set default_translation_language = 'en', current_streak = 4, longest_streak = 9, last_study_date = current_date - 1;
