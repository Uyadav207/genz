export type { SourceItem, PlaceItem, ImageItem, GeneratedImageItem, ResearchMeta } from '@/services/api';
import type { SourceItem, PlaceItem, ImageItem, GeneratedImageItem, ResearchMeta } from '@/services/api';

export type MessageRole = 'user' | 'assistant';

/** Attachment shown in a message (e.g. PDF) */
export interface MessageAttachment {
    file_name: string;
}

export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    fullContent?: string;
    timestamp: Date;
    /** PDF/file attachments sent with this message */
    attachments?: MessageAttachment[];
    /** Web search / research sources */
    sources?: SourceItem[];
    /** Places (restaurants, businesses) */
    places?: PlaceItem[];
    /** Images from web search */
    images?: ImageItem[];
    /** AI-generated images (from Imagen) */
    generated_images?: GeneratedImageItem[];
    /** Research-only metadata (partial, confidence, sub_queries) */
    researchMeta?: ResearchMeta;
}

/** Pending PDF attachment before send */
export interface PendingPDFAttachment {
    id: string; // attachment_id from upload
    file_name: string;
    extracted_text: string;
}
