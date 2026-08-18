import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getCampaign,
  getCampaignLaunchReadiness,
  getCampaignLeads,
  launchCampaign,
  saveCampaignSteps,
  setCampaignStatus,
  updateCampaign,
} from "@/lib/campaigns.functions";
import { listLeadLists } from "@/lib/leads.functions";
import { listMySendingAccounts } from "@/lib/sending.functions";
import type {
  CampaignStep,
  CustomVariable,
  InboxRotationStrategy,
  StepConfig,
  StepType,
} from "@/lib/campaign-model";

export type VariantDraft = { label: string; subject: string; body: string; weight: number };

export type StepDraft = {
  key: string;
  name: string;
  stepType: StepType;
  subject: string;
  body: string;
  waitDays: number;
  waitHours: number;
  delayMinutes: number;
  sameThread: boolean;
  config: StepConfig;
  variants: VariantDraft[];
};

export type CampaignSettings = {
  name: string;
  description: string;
  listId: string | null;
  sendingAccountIds: string[];
  timezone: string;
  sendDays: number[];
  sendStartHour: number;
  sendEndHour: number;
  dailyCap: number;
  stopOnReply: boolean;
  tags: string[];
  startAt: string | null;
  endAt: string | null;
  minDelayMinutes: number;
  randomDelayMinutes: number;
  maxPerHour: number;
  businessDaysOnly: boolean;
  openTracking: boolean;
  clickTracking: boolean;
  textOnly: boolean;
  stopOnCompanyReply: boolean;
  maxContactsPerCompany: number;
  unsubscribeEnabled: boolean;
  inboxRotationEnabled: boolean;
  inboxRotationStrategy: InboxRotationStrategy;
  rotationDailyCapPerInbox: number;
  customVariables: CustomVariable[];
};

let keySeed = 0;
export function newStepKey() {
  keySeed += 1;
  return `step-${Date.now()}-${keySeed}`;
}

export function emptyStep(index: number, type: StepType = "email"): StepDraft {
  return {
    key: newStepKey(),
    name: type === "email" ? (index === 0 ? "Initial email" : `Follow-up #${index}`) : "",
    stepType: type,
    subject: "",
    body: "",
    waitDays: index === 0 ? 0 : 3,
    waitHours: 0,
    delayMinutes: 0,
    sameThread: index !== 0,
    config: {},
    variants: [],
  };
}

function toDraft(step: CampaignStep, index: number): StepDraft {
  return {
    key: step.id,
    name: step.name || (index === 0 ? "Initial email" : `Follow-up #${index}`),
    stepType: step.step_type,
    subject: step.subject,
    body: step.body,
    waitDays: step.wait_days,
    waitHours: step.wait_hours,
    delayMinutes: step.delay_minutes ?? 0,
    sameThread: step.same_thread,
    config: (step.config ?? {}) as StepConfig,
    variants: (step.variants ?? []).map((v) => ({
      label: v.label,
      subject: v.subject,
      body: v.body,
      weight: v.weight,
    })),
  };
}

export function useCampaignBuilder(campaignId: string) {
  const queryClient = useQueryClient();

  const fetchCampaign = useServerFn(getCampaign);
  const fetchLeads = useServerFn(getCampaignLeads);
  const fetchLists = useServerFn(listLeadLists);
  const fetchReadiness = useServerFn(getCampaignLaunchReadiness);
  const fetchAccounts = useServerFn(listMySendingAccounts);
  const updateFn = useServerFn(updateCampaign);
  const saveStepsFn = useServerFn(saveCampaignSteps);
  const launchFn = useServerFn(launchCampaign);
  const statusFn = useServerFn(setCampaignStatus);

  const campaignQuery = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => fetchCampaign({ data: { id: campaignId } }),
  });
  const leadsQuery = useQuery({
    queryKey: ["campaign-leads", campaignId],
    queryFn: () => fetchLeads({ data: { campaignId } }),
  });
  const listsQuery = useQuery({ queryKey: ["lead-lists"], queryFn: () => fetchLists() });
  // Launch validation always comes from the saved campaign in the database.
  const readinessQuery = useQuery({
    queryKey: ["campaign-readiness", campaignId],
    queryFn: () => fetchReadiness({ data: { id: campaignId } }),
  });
  const accountsQuery = useQuery({
    queryKey: ["sending-accounts"],
    queryFn: () => fetchAccounts(),
  });

  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [settings, setSettingsState] = useState<CampaignSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    const data = campaignQuery.data;
    if (!data) return;
    const signature = `${campaignId}:${data.campaign.created_at}`;
    if (hydratedFor.current === signature) return;
    hydratedFor.current = signature;
    const c = data.campaign;
    setSteps(data.steps.map(toDraft));
    setSettingsState({
      name: c.name,
      description: c.description ?? "",
      listId: c.list_id,
      sendingAccountIds: c.sending_account_ids ?? [],
      timezone: c.timezone,
      sendDays: c.send_days ?? [1, 2, 3, 4, 5],
      sendStartHour: c.send_start_hour,
      sendEndHour: c.send_end_hour,
      dailyCap: c.daily_cap,
      stopOnReply: c.stop_on_reply,
      tags: c.tags ?? [],
      startAt: c.start_at,
      endAt: c.end_at,
      minDelayMinutes: c.min_delay_minutes,
      randomDelayMinutes: c.random_delay_minutes,
      maxPerHour: c.max_per_hour,
      businessDaysOnly: c.business_days_only,
      openTracking: c.open_tracking,
      clickTracking: c.click_tracking,
      textOnly: c.text_only,
      stopOnCompanyReply: c.stop_on_company_reply,
      maxContactsPerCompany: c.max_contacts_per_company,
      unsubscribeEnabled: c.unsubscribe_enabled,
      inboxRotationEnabled: c.inbox_rotation_enabled ?? true,
      inboxRotationStrategy: c.inbox_rotation_strategy ?? "round_robin",
      rotationDailyCapPerInbox: c.rotation_daily_cap_per_inbox ?? 0,
      customVariables: (c.custom_variables ?? []) as CustomVariable[],
    });
    setDirty(false);
  }, [campaignQuery.data, campaignId]);

  const patchSettings = useCallback((patch: Partial<CampaignSettings>) => {
    setSettingsState((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }, []);

  const updateSteps = useCallback((updater: (prev: StepDraft[]) => StepDraft[]) => {
    setSteps((prev) => updater(prev));
    setDirty(true);
  }, []);

  const campaign = campaignQuery.data?.campaign;

  const save = useMutation({
    mutationFn: async () => {
      if (!campaign || !settings) throw new Error("Campaign is still loading");
      if (settings.sendEndHour <= settings.sendStartHour)
        throw new Error("The sending window end must be after the start.");
      await saveStepsFn({
        data: {
          campaignId,
          workspaceId: campaign.workspace_id,
          steps: steps.map((s) => ({
            name: s.name,
            stepType: s.stepType,
            subject: s.subject,
            body: s.body,
            waitDays: s.waitDays,
            waitHours: s.waitHours,
            delayMinutes: s.delayMinutes,
            sameThread: s.sameThread,
            config: s.config,
            variants: s.variants,
          })),
        },
      });
      await updateFn({
        data: {
          id: campaignId,
          name: settings.name,
          description: settings.description,
          listId: settings.listId,
          sendingAccountIds: settings.sendingAccountIds,
          timezone: settings.timezone,
          sendDays: settings.sendDays,
          sendStartHour: settings.sendStartHour,
          sendEndHour: settings.sendEndHour,
          dailyCap: settings.dailyCap,
          stopOnReply: settings.stopOnReply,
          tags: settings.tags,
          startAt: settings.startAt,
          endAt: settings.endAt,
          minDelayMinutes: settings.minDelayMinutes,
          randomDelayMinutes: settings.randomDelayMinutes,
          maxPerHour: settings.maxPerHour,
          businessDaysOnly: settings.businessDaysOnly,
          openTracking: settings.openTracking,
          clickTracking: settings.clickTracking,
          textOnly: settings.textOnly,
          stopOnCompanyReply: settings.stopOnCompanyReply,
          maxContactsPerCompany: settings.maxContactsPerCompany,
          unsubscribeEnabled: settings.unsubscribeEnabled,
          inboxRotationEnabled: settings.inboxRotationEnabled,
          inboxRotationStrategy: settings.inboxRotationStrategy,
          rotationDailyCapPerInbox: settings.rotationDailyCapPerInbox,
          customVariables: settings.customVariables,
        },
      });
    },
    onSuccess: async () => {
      setDirty(false);
      setSavedAt(new Date());
      hydratedFor.current = null;
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-readiness", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Autosave a few seconds after the last edit.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      if (!saveRef.current.isPending) saveRef.current.mutate();
    }, 4000);
    return () => clearTimeout(timer);
  }, [dirty, steps, settings]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const launch = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return launchFn({ data: { id: campaignId } });
    },
    onSuccess: async (result) => {
      toast.success(
        `Queued ${result.queued} leads. First send ${new Date(result.firstSendAt).toLocaleString()}.`,
      );
      hydratedFor.current = null;
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-readiness", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-launch-events", campaignId] });
    },
    onError: async (e: Error) => {
      toast.error(e.message);
      // A blocked attempt is recorded server-side; refresh the trail.
      await queryClient.invalidateQueries({ queryKey: ["campaign-launch-events", campaignId] });
    },

  });

  const toggleStatus = useMutation({
    mutationFn: (status: "active" | "paused" | "archived" | "draft") =>
      statusFn({ data: { id: campaignId, status } }),
    onSuccess: async () => {
      hydratedFor.current = null;
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = useMemo(
    () => (accountsQuery.data?.accounts ?? []).filter((a) => a.customer_enabled),
    [accountsQuery.data],
  );

  return {
    campaignId,
    campaign,
    queue: campaignQuery.data?.queue,
    isLoading: campaignQuery.isLoading,
    steps,
    updateSteps,
    settings,
    patchSettings,
    dirty,
    savedAt,
    save,
    launch,
    toggleStatus,
    accounts,
    lists: listsQuery.data ?? [],
    readiness: readinessQuery.data ?? null,
    readinessLoading: readinessQuery.isLoading,
    refetchReadiness: () =>
      queryClient.invalidateQueries({ queryKey: ["campaign-readiness", campaignId] }),
    leads: leadsQuery.data ?? [],
    leadsLoading: leadsQuery.isLoading,
    refetchLeads: () => queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] }),
  };
}

export type CampaignBuilder = ReturnType<typeof useCampaignBuilder>;
