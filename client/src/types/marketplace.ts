export interface MarketplaceListing {
    id: string;
    agent_id: string;
    user_id: string;
    title: string;
    summary: string;
    category: string;
    price_cents: number;
    status: 'draft' | 'active' | 'archived';
    featured: boolean;
    cover_image_url?: string;
    download_count: number;
    created_at: string;
    updated_at: string;
    agent_name?: string;
    agent_description?: string;
    agent_icon_name?: string;
    agent_skill_ids?: string[];
    publisher_name?: string;
    publisher_avatar_url?: string;
    downloaded: boolean;
}

export interface CreateListingPayload {
    agent_id: string;
    title: string;
    summary?: string;
    category?: string;
    price_cents?: number;
    status?: 'draft' | 'active' | 'archived';
}

export interface UpdateListingPayload {
    title?: string;
    summary?: string;
    category?: string;
    price_cents?: number;
    status?: 'draft' | 'active' | 'archived';
}

export interface MarketplaceDownloadResponse {
    already_downloaded: boolean;
    agent?: any; // We can use the Agent type here if imported
}
