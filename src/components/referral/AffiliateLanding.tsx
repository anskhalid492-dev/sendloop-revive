import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, ShieldCheck, Link2, Wallet, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarketingLayout, Section, StepList, FaqBlock, BulletList } from '@/components/site/MarketingPage';
import { affiliateRules, affiliateEarnings } from '@/lib/affiliate-rules';
import { formatMoney, type ReferralProgram } from '@/lib/referral-model';
import dashboardAsset from '@/assets/munchreach-dashboard-overview.jpg.asset.json';

export function AffiliateLanding({ program, agency = false }: { program: ReferralProgram | null; agency?: boolean }) {
  const rules = affiliateRules(program);
  const [clients, setClients] = useState(10);
  const [price, setPrice] = useState(49);
  const [months, setMonths] = useState(12);
  const available = Boolean(program);
  const live = Boolean(program?.enabled);
  const monthly = affiliateEarnings('monthly', Math.round(price * 100), 0, rules);
  const faqs = [
    { q: 'Who can apply?', a: program?.eligibility || 'Agencies, consultants and creators with a MunchReach account may apply. Approval is required where configured; only genuinely new customers qualify.' },
    { q: 'How much do monthly subscriptions earn?', a: available ? `${rules.monthly_commission_percent}% of eligible paid revenue for the first ${rules.monthly_paid_periods} successful monthly billing periods per referred customer. Failed periods do not count; subscription changes do not reset the count.` : 'Commission settings are awaiting production configuration.' },
    { q: 'How do lifetime purchases work?', a: available ? `Earn ${rules.lifetime_commission_percent}% of the first eligible one-time lifetime purchase. No recurring lifetime commissions.` : 'Lifetime earnings will appear when settings are configured.' },
    { q: 'Are annual subscriptions eligible?', a: available ? `Earn ${rules.annual_commission_percent}% on the first eligible annual payment only. Annual renewals do not earn commission.` : 'Annual earnings will appear when settings are configured.' },
    { q: 'What is an eligible payment?', a: 'A successfully paid MunchReach plan payment attributed to your approved affiliate profile. Taxes, refunds, chargebacks, free trials and failed or pending payments are excluded.' },
    { q: 'How long does attribution last?', a: available ? `The first-party cookie lasts ${rules.cookie_duration_days} days. New-account attribution is captured during signup; the first eligible payment must fall within ${program?.attribution_window_days} days of signup. Attribution is retained for eligible renewals after conversion.` : 'Attribution windows will appear when configured.' },
    { q: 'What happens after cancellation or a refund?', a: 'Cancellation stops future earnings but does not erase successful past payments. Refunds proportionally reduce their matching commission; chargebacks put the affected earnings on hold. Adjustments after a payout reduce future available earnings.' },
    { q: 'When can I request a payout?', a: 'Once approved earnings have cleared any applicable hold, you can request at least $100 USD with a valid saved wallet. The MunchReach team manually processes eligible requests within 60 days. Payouts are not automatic.' },
    { q: 'Which payout methods are supported?', a: 'Crypto only: USDC on Ethereum or USDT on Tron (TRC20). Save your wallet and verify both the address and network. No bank transfers, PayPal, Wise or automatic crypto payments.' },
    { q: 'Can I track my payment?', a: 'Your dashboard shows available balance, reserved requests and payout history. Paid payouts show the actual amount, transaction ID, payment date and any payment proof attached by the team. Rejected requests release their reserved balance.' },
    { q: 'Can I refer my own workspace?', a: 'No. Self-referrals, referrals to workspaces you own or belong to, fraudulent accounts and duplicate rewards are prohibited.' },
    { q: agency ? 'Can I recommend MunchReach to several clients?' : 'Where can I find promotional resources?', a: agency ? 'Yes. Share your unique link with genuinely new, independently owned client workspaces. Each eligible customer uses the same tracking and commission rules.' : 'The Affiliate Dashboard includes approved product links and disclosure-ready promotional copy. Always disclose your affiliate relationship.' },
  ];
  return <MarketingLayout>
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div className={agency ? "mx-auto max-w-6xl px-4 py-12 text-left sm:px-6 sm:py-16" : "mx-auto max-w-5xl px-4 py-12 text-center sm:px-6 sm:py-16"}>
        {!agency && <BrandLogo className="mx-auto h-9 max-w-56" />}
        <p className="mt-7 text-sm font-medium uppercase text-primary">{agency ? 'Agency partners' : 'Affiliate program'}</p>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">MunchReach {agency ? 'Agency Partners' : 'Affiliate Program'}</h1>
        <p className={agency ? "mt-5 max-w-3xl text-lg text-muted-foreground" : "mx-auto mt-5 max-w-2xl text-lg text-muted-foreground"}>{agency ? 'Recommend an outbound workspace you can stand behind. Help clients connect mailboxes, follow up and manage replies — with transparent affiliate earnings.' : 'Introduce teams to better outbound workflows. Earn on eligible paid subscriptions and lifetime purchases, with transparent tracking and manual crypto payouts.'}</p>
        <div className={agency ? "mt-7 flex flex-wrap gap-3" : "mt-7 flex flex-wrap justify-center gap-3"}>
          <Button size="lg" asChild><Link to="/referrals">{agency ? 'Apply as an Agency Partner' : 'Apply to Join'}<ArrowRight className="ml-2 size-4" /></Link></Button>
          <Button size="lg" variant="outline" asChild><Link to={agency ? '/referral' : '/referral/agencies'}>{agency ? 'Affiliate Program' : 'Agency Partners'}</Link></Button>
        </div>
      </div>
    </section>
    {agency && <Section title="Your expertise. Their next outbound workspace." description="A partnership for marketing agencies, SaaS consultants, freelancers and business advisors."><div className="grid gap-8 md:grid-cols-3">{[['Recommend, don’t resell','Introduce independently owned client accounts. Your consulting fees stay separate from referral earnings.'],['Multiple clients, one partner portal','Use your unique link for each genuinely new client and follow conversion status and payment-backed earnings in one place.'],['A transparent payout path','Save a supported crypto wallet, reach $100 in available earnings and request a manually processed payout.']].map(([title,text]) => <div key={title} className="border-t-2 border-primary pt-5"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 text-muted-foreground">{text}</p></div>)}</div></Section>}
    <Section title="One program. Three ways to earn." description={live ? 'Current commission settings' : 'Configured terms — subject to program activation'}>
      <div className="grid gap-5 md:grid-cols-3">{[
        ['Monthly subscriptions', rules.monthly_commission_percent, `First ${rules.monthly_paid_periods} successfully paid monthly periods`],
        ['Lifetime purchases', rules.lifetime_commission_percent, 'First successful one-time lifetime payment'],
        ['Annual subscriptions', rules.annual_commission_percent, 'First successful annual payment — no renewal commission'],
      ].map(([title, rate, text]) => <article key={title} className="rounded-lg border border-border bg-card p-6"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-4 text-4xl font-bold text-primary">{available ? `${rate}%` : '—'}</p><p className="mt-4 text-sm text-muted-foreground">{text}</p><p className="mt-3 text-xs text-muted-foreground">Eligible paid revenue only; tax and payment adjustments excluded.</p></article>)}</div>
    </Section>
    <Section title={agency ? 'Make every client introduction count' : 'How the program works'} muted>
      <StepList steps={[
        { title: 'Apply and get approved', text: rules.affiliate_approval_required ? 'Submit your application in your account. MunchReach reviews it before your referrals earn commissions.' : 'Create your profile in your account and receive your unique link.' },
        { title: 'Share your unique link', text: agency ? 'Introduce MunchReach to new clients using your affiliate link. Keep client ownership independent and disclose your partnership.' : 'Share your link with new customers and disclose your affiliate relationship.' },
        { title: 'Your referral becomes a customer', text: 'Attribution is saved securely through signup and login. Payment confirmation, not a checkout return page, creates earnings.' },
        { title: 'Review earnings and request payout', text: 'Track pending and approved earnings. Save your verified crypto wallet and request at least $100 once approved earnings are available. The team processes eligible requests within 60 days.' },
      ]} />
    </Section>
    <Section title="Estimate your earnings" description="Illustration only — not a guarantee. Every customer must make an eligible payment.">
      <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <div><Label htmlFor="affiliate-clients">{agency ? 'Client referrals' : 'Paying referrals'}</Label><Input id="affiliate-clients" type="number" min={0} max={10000} value={clients} onChange={(e) => setClients(Math.max(0, Math.min(10000, Number(e.target.value))))} /></div>
          <div><Label htmlFor="affiliate-price">Eligible monthly payment (USD)</Label><Input id="affiliate-price" type="number" min={0} max={100000} value={price} onChange={(e) => setPrice(Math.max(0, Math.min(100000, Number(e.target.value))))} /></div>
          <div><Label htmlFor="affiliate-periods">Successful monthly payments per customer</Label><Input id="affiliate-periods" type="number" min={1} max={rules.monthly_paid_periods} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(rules.monthly_paid_periods, Number(e.target.value))))} /></div>
        </div>
        <div className="border-l border-border pl-6"><p className="text-sm text-muted-foreground">Estimated commission per paid period</p><p className="mt-3 text-4xl font-bold">{available ? formatMoney(clients * monthly) : '—'}</p><p className="mt-6 text-sm text-muted-foreground">Across {Math.min(months, rules.monthly_paid_periods)} paid periods</p><p className="mt-2 text-2xl font-semibold">{available ? formatMoney(clients * monthly * Math.min(months, rules.monthly_paid_periods)) : '—'}</p><p className="mt-6 text-sm text-muted-foreground">Lifetime example: an eligible $29 purchase earns {available ? formatMoney(affiliateEarnings('lifetime', 2900, 0, rules)) : '—'}. Actual discounts, refunds and chargebacks change earnings.</p></div>
      </div>
    </Section>
    <Section title={agency ? 'Built for the teams you advise' : 'Who should promote MunchReach'} muted><BulletList items={agency ? ['Cold email and lead generation agencies', 'SaaS consultants, freelancers and business consultants', 'Agencies referring multiple independently owned clients', 'Recommend a workspace for connected mailboxes, campaigns, follow-ups, CRM and replies. Your service fees are separate from affiliate earnings.'] : ['Agencies helping clients run responsible outbound campaigns', 'Consultants recommending practical sales workflows', 'Creators and educators covering prospecting and sales automation', 'Partners with an audience of genuinely new MunchReach customers']} /></Section>
    <Section title="A clear view of your partnership" description="Product preview — example account, not affiliate earnings."><img src={dashboardAsset.url} alt="MunchReach workspace product preview" className="mx-auto w-full max-w-5xl rounded-lg border border-border" loading="lazy" /><div className="mt-8 grid gap-6 sm:grid-cols-3">{[[Users, 'Private referrals', 'See conversion status without customer identities or billing details.'], [Wallet, 'Earnings and payouts', 'Separate pending, approved and paid commission, with monthly history.'], [ShieldCheck, 'Payment-backed tracking', 'Verified payments, duplicate protection and auditable refund adjustments.']].map(([Icon, title, text]) => { const Mark = Icon as typeof Users; return <div key={String(title)}><Mark className="size-5 text-primary" /><h3 className="mt-3 font-semibold">{String(title)}</h3><p className="mt-2 text-sm text-muted-foreground">{String(text)}</p></div>; })}</div></Section>
    <Section title="Crypto payouts. Clear expectations." muted><div className="grid gap-8 sm:grid-cols-3">{[['$100 minimum','Request from your available USD earnings once approval and any applicable hold are complete.'],['Two supported networks','USDC on Ethereum or USDT on Tron (TRC20). Verify your saved wallet before submitting.'],['Within 60 days','Eligible requests with a valid wallet are manually processed by the MunchReach team. No automatic payments.']].map(([title,text]) => <div key={title}><Wallet className="size-5 text-primary" /><h3 className="mt-3 text-xl font-semibold">{title}</h3><p className="mt-3 text-muted-foreground">{text}</p></div>)}</div></Section>
    <Section title="Tracking, eligibility and payouts"><div className="grid gap-8 md:grid-cols-2"><div><Link2 className="size-6 text-primary" /><h3 className="mt-3 text-xl font-semibold">Attribution that follows the customer</h3><p className="mt-3 text-muted-foreground">First-party referral capture survives signup and login. The saved attribution follows eligible monthly, annual and lifetime payments, including paid plan changes. Failed payments earn nothing; cancellation stops future earnings without undoing previous successful payments.</p></div><div><CheckCircle2 className="size-6 text-primary" /><h3 className="mt-3 text-xl font-semibold">Reviewed, not instant</h3><p className="mt-3 text-muted-foreground">Commissions are subject to approval and the applicable hold. Request at least $100 USD using USDC on Ethereum or USDT on Tron (TRC20). MunchReach manually processes eligible requests with a valid wallet within 60 days. Refunds and chargebacks adjust the matching earnings, including after payout.</p></div></div></Section>
    <Section title={agency ? 'Agency partner questions' : 'Affiliate questions'} muted><FaqBlock faqs={faqs} /></Section>
    <Section title={agency ? 'Become a MunchReach agency partner' : 'Grow with MunchReach'}><div className="text-center"><Button size="lg" asChild><Link to="/referrals">{agency ? 'Apply as an Agency Partner' : 'Join Affiliate Program'}<ArrowRight className="ml-2 size-4" /></Link></Button></div></Section>
  </MarketingLayout>;
}