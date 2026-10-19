-- =====================================================================
-- CHECK: will these errors land in Bounced for future customers?
-- =====================================================================
-- READ-ONLY. Every statement below is a SELECT. Nothing here writes,
-- updates, deletes or creates anything.
--
-- IMPORTANT: the real decision is made by application code
-- (src/lib/email-outcome.ts), not by the database. This file mirrors
-- those rules in SQL so you can (a) prove the rules fire, (b) preview
-- how today's stored failures would be labelled, and (c) watch the
-- live counts after the code is published.
--
-- Postgres quirk: word boundary is \y (in Postgres \b means backspace),
-- so the patterns below use \y where the app code uses \b.
--
-- Run one statement at a time in the SQL Editor.
-- =====================================================================


-- ---------------------------------------------------------------------
-- QUERY 1 - Rule self-test. Feed known server replies through the rules
-- and see the label each one gets. Expected:
--   bounced : 554 READ, 550 permanent, 550 No mailbox, 550 5.1.1 user
--             unknown, 550 5.2.2 mailbox full
--   failed  : 554 5.7.1 Outbound sending is disabled,
--             550 5.7.1 [CS] Message blocked, 451 4.7.1 try again later,
--             bare "Undelivered Mail Returned to Sender" subject,
--             554 READ combined with a spam block
-- ---------------------------------------------------------------------
with p as (
  select
    $r$(send_outcome_unknown_after_interrupt|outcome[\s_-]*unknown|timed?\s*out\s+after\s+(data|submission|message)|connection\s+(lost|closed|reset|interrupted)\s+(during|after)\s+(data|submission|message|send)|no\s+provider\s+confirmation|missing\s+provider\s+confirmation)$r$::text as unknown_r,
    $r$(?i)(\y550\s+5\.7\.1_etr\y|this\s+message\s+could\s+not\s+be\s+delivered\.?\s*please\s+contact\s+support|\y554\s+read\y|\y550\s+permanent\y)$r$::text as forced_r,
    $r$(\ydkim\y|\yspf\y|\ydmarc\y|\ytls\y|starttls|authenticat|auth(entication)?\s+required|credential|invalid\s+(login|password|username)|login\s+(failed|denied)|username\s+and\s+password|sender\s+(reputation|address\s+rejected|domain|not\s+allowed|policy|blocked|verify)|reputation|spam|junk\s+mail|blacklist|blocklist|\yrbl\y|spamhaus|message\s+(blocked|rejected\s+(due|because|for))|content\s+(rejected|policy)|security\s+(policy|reasons)|policy\s+(block|rejection|violation|reasons)|rejected\s+(by|due\s+to)\s+policy|relay\s+(denied|not\s+permitted|access)|relaying\s+denied|access\s+denied|not\s+authori[sz]ed|unauthenticated|dns\s+(error|failure|lookup)|reverse\s+dns|ptr\s+record|helo|ehlo|rate\s+limit|too\s+many\s+(messages|connections)|configuration|not\s+configured|usersubmission)$r$::text as sender_r,
    $r$(user\s+unknown|no\s+mailbox\y|unknown\s+(user|recipient|mailbox|address)|no\s+such\s+(user|recipient|mailbox|address|account)|(mailbox|recipient|user|address|account)\s+(does\s+not|doesn'?t)\s+exist|doesn'?t\s+have\s+an?\s+\S+\s+account|mailbox\s+(not\s+found|unavailable|is\s+disabled|disabled|inactive)|requested\s+action\s+not\s+taken:?\s*mailbox\s+unavailable|recipient\s+(not\s+found|unavailable|invalid|unknown|rejected[^\r\n]{0,40}(unknown|invalid|not\s+found|does\s+not\s+exist))|invalid\s+(recipient|address|mailbox|destination\s+mailbox)|address\s+(not\s+found|invalid|does\s+not\s+exist)|undeliverable\s+address|account\s+(has\s+been\s+)?disabled|mailbox\s+(is\s+)?full|over\s+quota|quota\s+exceeded|mailbox\s+full)$r$::text as recip_r,
    $r$(will\s+(be\s+)?retr(y|ied)|still\s+trying|delivery\s+(is\s+)?delayed|temporar(y|ily)|deferred|greylist|try\s+again\s+later|not\s+yet\s+been\s+delivered|connection\s+(refused|timed?\s*out|reset)|service\s+(temporarily\s+)?unavailable)$r$::text as temp_r,
    $r$recipient\s+address\s+rejected\s*:?\s*access\s+denied[\s\S]{0,80}\yAS\(201806281\)$r$::text as dbeb_r,
    $r$(?:^|[^0-9.])(5\.1\.(?:10|0|1|2|3|6)|5\.2\.(?:1|2))(?:[^0-9.]|$)$r$::text as recip_code_r,
    $r$(?:^|[^0-9.])([45]\.7\.[0-9]{1,3})(?:[^0-9.]|$)$r$::text as sender_code_r,
    $r$(?:^|[^0-9.])(4\.[0-9]{1,3}\.[0-9]{1,3})(?:[^0-9.]|$)$r$::text as code4_r,
    $r$(?:^|[^0-9.])(5\.[0-9]{1,3}\.[0-9]{1,3})(?:[^0-9.]|$)$r$::text as code5_r,
    $r$(?:^|[^0-9.])([245][0-9]{2})(?:[^0-9.]|$)$r$::text as smtp_r
),
base as (
  select s.rn, s.txt, trim(regexp_replace(s.txt, '\s+', ' ', 'g')) as txt_norm
  from (values
    (1,  '554 READ'),
    (2,  '550 permanent'),
    (3,  '550 No mailbox by that name'),
    (4,  '554 5.7.1 Outbound sending is disabled for this account'),
    (5,  '550 5.7.1 [CS] Message blocked'),
    (6,  '550 5.1.1 user unknown'),
    (7,  '550 5.2.2 mailbox full'),
    (8,  '451 4.7.1 try again later'),
    (9,  'Undelivered Mail Returned to Sender'),
    (10, '554 READ 5.7.1 spam detected')
  ) as s(rn, txt)
),
l1 as (
  select b.rn, b.txt, b.txt_norm,
         (b.txt_norm ~* p.unknown_r) as is_unknown,
         (b.txt_norm ~* p.forced_r) as is_forced,
         regexp_replace(b.txt_norm, p.forced_r, ' ', 'g') as txt_no_forced,
         p.sender_r, p.recip_r, p.temp_r, p.dbeb_r, p.recip_code_r,
         p.sender_code_r, p.code4_r, p.code5_r, p.smtp_r
  from base b cross join p
),
l2 as (
  select l1.*, substring(l1.txt_norm from l1.smtp_r) as smtp,
         (l1.txt_no_forced ~* l1.sender_r) as sender_on_rest,
         (l1.txt_norm ~* l1.sender_r) as sender_any,
         (l1.txt_norm ~* l1.sender_code_r) as has_sender_code,
         (l1.txt_norm ~* l1.code4_r) as has_code4,
         (l1.txt_norm ~* l1.code5_r) as has_code5,
         (l1.txt_norm ~* l1.recip_code_r) as has_recip_code,
         (l1.txt_norm ~* l1.recip_r) as has_recip_hint,
         (l1.txt_norm ~* l1.temp_r) as has_temp_hint,
         (l1.txt_norm ~* l1.dbeb_r) as is_dbeb,
         (l1.txt_norm ~* '(?:^|[^0-9.])(5\.4\.1)(?:[^0-9.]|$)') as has_541
  from l1
)
select rn, txt,
  case
    when is_unknown then 'unknown'
    when txt_norm = '' then 'failed'
    when is_forced and not sender_on_rest then 'bounced'
    when is_forced and sender_on_rest then 'failed'
    when is_dbeb and has_541 and smtp like '5%' then 'bounced'
    when has_sender_code or (smtp in ('530','534','535','538')) or sender_any then 'failed'
    when smtp like '4%' or has_code4 then 'delayed'
    when has_recip_code then 'bounced'
    when has_recip_hint then 'bounced'
    when not (smtp like '5%' or has_code5) and has_temp_hint then 'delayed'
    else 'failed'
  end as predicted
from l2
order by rn;


-- ---------------------------------------------------------------------
-- QUERY 2 - Dry run over today's stored failures.
-- Shows, for the messages currently sitting in Failed, what label the
-- current rules would give them. Rows listed as "would flip to bounced"
-- are the ones that would be counted as Bounced going forward.
-- (Already-relabelled rows are bounced and so are not in this set.)
-- ---------------------------------------------------------------------
with p as (
  select
    $r$(send_outcome_unknown_after_interrupt|outcome[\s_-]*unknown|timed?\s*out\s+after\s+(data|submission|message)|connection\s+(lost|closed|reset|interrupted)\s+(during|after)\s+(data|submission|message|send)|no\s+provider\s+confirmation|missing\s+provider\s+confirmation)$r$::text as unknown_r,
    $r$(?i)(\y550\s+5\.7\.1_etr\y|this\s+message\s+could\s+not\s+be\s+delivered\.?\s*please\s+contact\s+support|\y554\s+read\y|\y550\s+permanent\y)$r$::text as forced_r,
    $r$(\ydkim\y|\yspf\y|\ydmarc\y|\ytls\y|starttls|authenticat|auth(entication)?\s+required|credential|invalid\s+(login|password|username)|login\s+(failed|denied)|username\s+and\s+password|sender\s+(reputation|address\s+rejected|domain|not\s+allowed|policy|blocked|verify)|reputation|spam|junk\s+mail|blacklist|blocklist|\yrbl\y|spamhaus|message\s+(blocked|rejected\s+(due|because|for))|content\s+(rejected|policy)|security\s+(policy|reasons)|policy\s+(block|rejection|violation|reasons)|rejected\s+(by|due\s+to)\s+policy|relay\s+(denied|not\s+permitted|access)|relaying\s+denied|access\s+denied|not\s+authori[sz]ed|unauthenticated|dns\s+(error|failure|lookup)|reverse\s+dns|ptr\s+record|helo|ehlo|rate\s+limit|too\s+many\s+(messages|connections)|configuration|not\s+configured|usersubmission)$r$::text as sender_r,
    $r$(user\s+unknown|no\s+mailbox\y|unknown\s+(user|recipient|mailbox|address)|no\s+such\s+(user|recipient|mailbox|address|account)|(mailbox|recipient|user|address|account)\s+(does\s+not|doesn'?t)\s+exist|doesn'?t\s+have\s+an?\s+\S+\s+account|mailbox\s+(not\s+found|unavailable|is\s+disabled|disabled|inactive)|requested\s+action\s+not\s+taken:?\s*mailbox\s+unavailable|recipient\s+(not\s+found|unavailable|invalid|unknown|rejected[^\r\n]{0,40}(unknown|invalid|not\s+found|does\s+not\s+exist))|invalid\s+(recipient|address|mailbox|destination\s+mailbox)|address\s+(not\s+found|invalid|does\s+not\s+exist)|undeliverable\s+address|account\s+(has\s+been\s+)?disabled|mailbox\s+(is\s+)?full|over\s+quota|quota\s+exceeded|mailbox\s+full)$r$::text as recip_r,
    $r$(will\s+(be\s+)?retr(y|ied)|still\s+trying|delivery\s+(is\s+)?delayed|temporar(y|ily)|deferred|greylist|try\s+again\s+later|not\s+yet\s+been\s+delivered|connection\s+(refused|timed?\s*out|reset)|service\s+(temporarily\s+)?unavailable)$r$::text as temp_r,
    $r$recipient\s+address\s+rejected\s*:?\s*access\s+denied[\s\S]{0,80}\yAS\(201806281\)$r$::text as dbeb_r,
    $r$(?:^|[^0-9.])(5\.1\.(?:10|0|1|2|3|6)|5\.2\.(?:1|2))(?:[^0-9.]|$)$r$::text as recip_code_r,
    $r$(?:^|[^0-9.])([45]\.7\.[0-9]{1,3})(?:[^0-9.]|$)$r$::text as sender_code_r,
    $r$(?:^|[^0-9.])(4\.[0-9]{1,3}\.[0-9]{1,3})(?:[^0-9.]|$)$r$::text as code4_r,
    $r$(?:^|[^0-9.])(5\.[0-9]{1,3}\.[0-9]{1,3})(?:[^0-9.]|$)$r$::text as code5_r,
    $r$(?:^|[^0-9.])([245][0-9]{2})(?:[^0-9.]|$)$r$::text as smtp_r
),
base as (
  select m.id, m.to_email, m.delivery_status, m.updated_at,
         trim(regexp_replace(
           coalesce(nullif(btrim(m.last_error),''),
                    nullif(btrim(m.bounce_reason),''),
                    nullif(btrim(m.delivery_detail),''), ''),
           '\s+', ' ', 'g')) as txt
  from public.campaign_messages m
  where coalesce(m.delivery_status,'') = 'failed'
),
l1 as (
  select b.*,
         (b.txt ~* p.unknown_r) as is_unknown,
         (b.txt ~* p.forced_r) as is_forced,
         regexp_replace(b.txt, p.forced_r, ' ', 'g') as txt_no_forced,
         p.sender_r, p.recip_r, p.temp_r, p.dbeb_r, p.recip_code_r,
         p.sender_code_r, p.code4_r, p.code5_r, p.smtp_r
  from base b cross join p
),
l2 as (
  select l1.*, substring(l1.txt from l1.smtp_r) as smtp,
         (l1.txt_no_forced ~* l1.sender_r) as sender_on_rest,
         (l1.txt ~* l1.sender_r) as sender_any,
         (l1.txt ~* l1.sender_code_r) as has_sender_code,
         (l1.txt ~* l1.code4_r) as has_code4,
         (l1.txt ~* l1.code5_r) as has_code5,
         (l1.txt ~* l1.recip_code_r) as has_recip_code,
         (l1.txt ~* l1.recip_r) as has_recip_hint,
         (l1.txt ~* l1.temp_r) as has_temp_hint,
         (l1.txt ~* l1.dbeb_r) as is_dbeb,
         (l1.txt ~* '(?:^|[^0-9.])(5\.4\.1)(?:[^0-9.]|$)') as has_541
  from l1
),
l3 as (
  select l2.*,
    case
      when is_unknown then 'unknown'
      when txt = '' then 'failed'
      when is_forced and not sender_on_rest then 'bounced'
      when is_forced and sender_on_rest then 'failed'
      when is_dbeb and has_541 and smtp like '5%' then 'bounced'
      when has_sender_code or (smtp in ('530','534','535','538')) or sender_any then 'failed'
      when smtp like '4%' or has_code4 then 'delayed'
      when has_recip_code then 'bounced'
      when has_recip_hint then 'bounced'
      when not (smtp like '5%' or has_code5) and has_temp_hint then 'delayed'
      else 'failed'
    end as predicted
  from l2
)
select id, to_email, delivery_status,
       predicted,
       case when predicted = 'bounced' then 'would flip to bounced'
            else 'stays ' || predicted end as verdict,
       left(txt, 160) as server_reply
from l3
where predicted = 'bounced'
order by updated_at desc
limit 200;


-- ---------------------------------------------------------------------
-- QUERY 3 - Proof for future customers, run AFTER the new code is
-- published. Counts messages that were actually recorded as Bounced
-- because of these server replies, newest first. Any row here means a
-- future send with that reply was counted as Bounced automatically.
-- Adjust the interval to the window since you published.
-- ---------------------------------------------------------------------
select
  date_trunc('day', coalesce(bounced_at, updated_at))::date as day,
  count(*) as bounced_total,
  count(*) filter (where coalesce(bounce_reason, last_error, '') ~* '\y554\s+read\y')                as "554 READ",
  count(*) filter (where coalesce(bounce_reason, last_error, '') ~* '\y550\s+permanent\y')            as "550 permanent",
  count(*) filter (where coalesce(bounce_reason, last_error, '') ~* 'no\s+mailbox')                   as "no mailbox",
  count(*) filter (where coalesce(bounce_reason, last_error, '') ~* '\y550\s+5\.7\.1_etr\y')          as "550 5.7.1 ETR",
  count(*) filter (where coalesce(bounce_reason, last_error, '') ~* 'user\s+unknown|invalid\s+(recipient|address)|does\s+not\s+exist') as "invalid address wording"
from public.campaign_messages
where coalesce(delivery_status,'') = 'bounced'
  and coalesce(bounced_at, updated_at) >= now() - interval '14 days'
group by 1
order by 1 desc;


-- ---------------------------------------------------------------------
-- QUERY 4 - Same thing as a per-message list (newest first), so you can
-- see exactly which addresses were recorded as Bounced and why.
-- ---------------------------------------------------------------------
select bounced_at, to_email, delivery_status, left(coalesce(bounce_reason, last_error, ''), 120) as recorded_reason
from public.campaign_messages
where coalesce(delivery_status,'') = 'bounced'
  and coalesce(bounced_at, updated_at) >= now() - interval '14 days'
order by bounced_at desc nulls last
limit 100;
