export type EmailTemplate = {
  name: string;
  subject: string;
  body: string;
};

export type TemplateGroup = {
  category: string;
  items: EmailTemplate[];
};

export const TEMPLATE_LIBRARY: TemplateGroup[] = [
  {
    category: "First touch",
    items: [
      {
        name: "Problem / solution",
        subject: "{Quick question|Idea} about {{company | your team}}",
        body: `Hi {{first_name | there}},

I noticed {{company | your team}} is growing the outbound side of the business. Most teams at that stage lose replies because sending is spread across mailboxes nobody is warming.

We handle the sending infrastructure so your team only writes the copy and picks the list.

Worth a short look?

{Best|Thanks},
{{sender_name | The team}}`,
      },
      {
        name: "Referral angle",
        subject: "Are you the right person at {{company | your company}}?",
        body: `Hi {{first_name | there}},

I'm trying to reach whoever owns outbound at {{company | your company}}. If that isn't you, could you point me the right way?

We help teams like yours land cold email in the primary inbox without managing mailboxes.

{Thanks|Appreciate it},
{{sender_name | The team}}`,
      },
    ],
  },
  {
    category: "Follow-up",
    items: [
      {
        name: "Short bump",
        subject: "Re: {{company | quick question}}",
        body: `Hi {{first_name | there}},

Floating this back to the top of your inbox — worth a quick chat?

{Best|Thanks},
{{sender_name | The team}}`,
      },
      {
        name: "Value add",
        subject: "One number worth seeing",
        body: `Hi {{first_name | there}},

Teams that move sending onto managed infrastructure typically see reply rates climb within the first month, mostly because inbox placement stops fluctuating.

Happy to share how that maps to {{company | your setup}}.

{Best|Cheers},
{{sender_name | The team}}`,
      },
    ],
  },
  {
    category: "Break-up",
    items: [
      {
        name: "Polite close",
        subject: "Closing the loop",
        body: `Hi {{first_name | there}},

I haven't heard back, so I'll assume the timing isn't right. If outbound moves up the list at {{company | your company}}, just reply here and I'll pick it up.

{Best|Thanks},
{{sender_name | The team}}`,
      },
    ],
  },
];
