import type { InfoPageId } from "./routes";
export interface InfoSection { id: string; heading: string; paragraphs: string[]; bullets?: string[]; questions?: { question: string; answer: string }[] }
export interface InfoPageContent { status: "preview" | "published"; title: string; description: string; sections: InfoSection[] }
export interface InfoContent {
  pages: Record<InfoPageId, InfoPageContent>;
  labels: {
    preview: string; closed: string; contactHeading: string; legalOnThisPage: string; legalEffective: string; contactPartners: string; contactSupport: string; subscribeClosed: string; legalPending: string; invalidConfirmation: string; invalidUnsubscribe: string;
    name: string; business: string; phone: string; email: string; message: string; topic: string; shortCode: string; send: string; subscribe: string; consent: string;
    supportEmail: string; partnerEmail: string; supportHours: string; related: string; gift: string; giftDescription: string; giftPreview: string; teamPhoto: string; restaurantPhoto: string; privacy: string;
  };
  topics: string[];
}
