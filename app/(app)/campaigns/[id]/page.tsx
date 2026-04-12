import { getCampaign } from '@/lib/db/campaigns';
import CampaignDetailClientPage from './campaign-detail-client';
import type { CampaignRecord } from './campaign-detail-client';

interface CampaignDetailPageProps {
  params: {
    id: string;
  };
}

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const campaign = await getCampaign(params.id);
  const initialCampaign = campaign
    ? (JSON.parse(JSON.stringify(campaign)) as CampaignRecord)
    : null;

  return (
    <CampaignDetailClientPage
      campaignId={params.id}
      initialCampaign={initialCampaign}
    />
  );
}
